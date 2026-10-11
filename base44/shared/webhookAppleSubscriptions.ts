// Apple App Store Explorer/Investigator subscriptions (RevenueCat webhook).
// Grants reuse the generic Base44 entitlement fields (plan, plan_expiration_date,
// subscription_status, subscription_id, energy) — the same fields the Wix
// payments-webhook writes. Google Trailblazer stays isolated in google_trailblazer_*.
import { PLANS, getNextResetDate } from './plans.js';
import {
  APPLE_STORE,
  classifyAppleSubscriptionEvent,
  getAppleSubscriptionProduct,
  latestActiveAppleSubscription,
  normalizeAppleLedgerFields,
  resolveAppUserId,
} from './revenuecat.js';
import { eventAlreadyApplied, jsonResponse, mergeEventIds } from './webhookCommon.ts';
import { computeAppleSubscriptionGrantFields } from './appleSubscriptionGrant.js';

/**
 * Locate the ledger row for an Apple subscription. Renewals, cancellations,
 * and refunds each carry their own transaction_id but share the subscription
 * lineage's original_transaction_id, so both are tried.
 */
async function findAppleLedger(base44: any, event: any) {
  const txn = event.transaction_id || '';
  const origTxn = event.original_transaction_id || '';
  if (txn) {
    const rows = await base44.asServiceRole.entities.RevenueCatPurchase.filter({
      transaction_id: txn,
    });
    if (rows?.length) return rows[0];
  }
  if (origTxn && origTxn !== txn) {
    const rows = await base44.asServiceRole.entities.RevenueCatPurchase.filter({
      original_transaction_id: origTxn,
    });
    if (rows?.length) return rows[0];
  }
  return null;
}

/** Transaction ids identifying an Apple subscription lineage. */
function appleLineageKeys(event: any, row: any): string[] {
  return [
    row?.original_transaction_id,
    row?.transaction_id,
    event?.original_transaction_id,
    event?.transaction_id,
  ].filter((k): k is string => typeof k === 'string' && k.length > 0);
}

/**
 * The generic plan fields can only represent one subscription at a time.
 * Apple lifecycle events may rewrite them only when the user's current
 * subscription_id belongs to this Apple lineage (or is unset), so an Apple
 * refund/expiry cannot wipe a Wix or newer subscription's fields.
 */
function appleEventOwnsGenericPlan(user: any, event: any, row: any): boolean {
  if (!user.subscription_id) return true;
  return appleLineageKeys(event, row).includes(user.subscription_id);
}

/**
 * Apply an Apple Explorer/Investigator grant to the generic plan fields.
 * Out-of-order deliveries for the same plan can only extend
 * plan_expiration_date (max), never shorten it, and stale events do not
 * refill energy that was already granted for a newer period.
 *
 * When a higher-rank plan is still active on the generic fields (typically
 * an unexpired Trailblazer 27-month entitlement), the recurring grant does
 * not clobber plan / expiration / monthly energy. The ledger row still
 * records the ACTIVE subscription, and subscription_status becomes
 * 'active' so the purchase is reflected under the higher plan.
 */
async function applyAppleGrant(
  base44: any,
  user: any,
  plan: any,
  expirationIso: string,
  opts: { refillEnergy: boolean; subscriptionId?: string | null },
) {
  const { fields, preservedHigherPlan, stale } = computeAppleSubscriptionGrantFields(
    user,
    plan,
    expirationIso,
    {
      refillEnergy: opts.refillEnergy,
      subscriptionId: opts.subscriptionId,
    },
  );

  // energy_reset_date is derived at write time so pure field computation stays
  // deterministic in tests (no hidden Date.now coupling beyond expiration).
  if (fields.manifestation_energy != null || fields.narration_energy != null) {
    if (!stale && opts.refillEnergy && !preservedHigherPlan) {
      fields.energy_reset_date = getNextResetDate();
    }
  }

  await base44.asServiceRole.entities.User.update(user.id, fields);
  if (preservedHigherPlan) {
    console.log(
      'Apple subscription grant preserved higher plan',
      user.plan,
      'under active recurring product',
      plan.id,
      'for',
      user.id,
    );
  }
}

/**
 * After an Apple refund or expiration, downgrade to observer unless another
 * active Apple subscription remains on the ledger. Energy is zeroed only when
 * no Apple subscription remains (mirrors the Wix cancel/expire downgrade).
 */
async function recomputeAppleAccessAfterRevoke(
  base44: any,
  user: any,
  revokeKeys: string[],
  statusWhenNone: 'canceled' | 'expired',
) {
  const ownsGenericPlan = !user.subscription_id || revokeKeys.includes(user.subscription_id);

  const rows = await base44.asServiceRole.entities.RevenueCatPurchase.filter({
    user_id: user.id,
    store: APPLE_STORE,
  });
  const remaining = latestActiveAppleSubscription(rows || [], new Date());

  if (remaining) {
    const plan = (PLANS as any)[remaining.product.plan_id];
    if (plan && ownsGenericPlan) {
      await base44.asServiceRole.entities.User.update(user.id, {
        plan: plan.id,
        plan_expiration_date: remaining.row.plan_expiration_date,
        subscription_status: 'active',
        subscription_id: remaining.row.original_transaction_id || remaining.row.transaction_id,
      });
      console.log('Apple revoke: kept remaining subscription', remaining.row.product_id, 'for', user.id);
    }
    return;
  }

  if (!ownsGenericPlan) {
    console.log('Apple revoke: generic plan belongs to another subscription, untouched:', user.id);
    return;
  }

  await base44.asServiceRole.entities.User.update(user.id, {
    plan: 'observer',
    manifestation_energy: 0,
    narration_energy: 0,
    subscription_status: statusWhenNone,
  });
  console.log('Apple subscription access revoked:', user.id, statusWhenNone);
}

/** Record a non-grant lifecycle event on the ledger row (idempotent bookkeeping). */
async function recordAppleLedgerEvent(base44: any, row: any, event: any, eventId: string) {
  if (!row) return;
  await base44.asServiceRole.entities.RevenueCatPurchase.update(row.id, {
    event_id: eventId || row.event_id,
    event_ids: mergeEventIds(row, eventId),
    event_type: event.type,
  });
}

/**
 * REFUND — store-support refund (CANCELLATION/EXPIRATION with CUSTOMER_SUPPORT,
 * or a defensive REFUND type). Revokes access immediately and marks the row
 * refunded. Prorated refunds from a same-group upgrade reference the OLD
 * product while the row already tracks the NEW one — never revoke those.
 */
async function handleAppleRefund(
  base44: any,
  user: any,
  event: any,
  existing: any,
  eventId: string,
  transactionId: string,
) {
  if (!existing) {
    console.log('Apple refund event with no ledger row:', transactionId);
    return jsonResponse({ received: true, skipped: 'no_ledger' });
  }
  if (existing.product_id !== event.product_id) {
    console.log('Apple refund for superseded product, ignoring:', event.product_id, 'row:', existing.product_id);
    return jsonResponse({ received: true, skipped: 'superseded_product' });
  }
  try {
    await base44.asServiceRole.entities.RevenueCatPurchase.update(existing.id, {
      status: 'refunded',
      event_id: eventId || existing.event_id,
      event_ids: mergeEventIds(existing, eventId),
      event_type: event.type,
    });
    await recomputeAppleAccessAfterRevoke(base44, user, appleLineageKeys(event, existing), 'canceled');
  } catch (e) {
    console.error('Apple refund persistence failed:', (e as Error).message);
    return jsonResponse({ error: 'persistence_failed' }, 500);
  }
  return jsonResponse({ received: true, refunded: true });
}

/** EXPIRATION — the paid period ended and access should be removed. */
async function handleAppleExpiration(
  base44: any,
  user: any,
  event: any,
  existing: any,
  eventId: string,
  transactionId: string,
) {
  if (!existing) {
    console.log('Apple expiration event with no ledger row:', transactionId);
    return jsonResponse({ received: true, skipped: 'no_ledger' });
  }
  if (existing.product_id !== event.product_id) {
    return jsonResponse({ received: true, skipped: 'superseded_product' });
  }
  try {
    await base44.asServiceRole.entities.RevenueCatPurchase.update(existing.id, {
      status: 'expired',
      event_id: eventId || existing.event_id,
      event_ids: mergeEventIds(existing, eventId),
      event_type: event.type,
    });
    await recomputeAppleAccessAfterRevoke(base44, user, appleLineageKeys(event, existing), 'expired');
  } catch (e) {
    console.error('Apple expiration persistence failed:', (e as Error).message);
    return jsonResponse({ error: 'persistence_failed' }, 500);
  }
  return jsonResponse({ received: true, expired: true });
}

/**
 * CANCELLATION — auto-renew turned off. Access continues until
 * plan_expiration_date (isGenericPlanActive honors the date first); the later
 * EXPIRATION event performs the actual downgrade.
 */
async function handleAppleCancel(
  base44: any,
  user: any,
  event: any,
  existing: any,
  eventId: string,
) {
  try {
    if (appleEventOwnsGenericPlan(user, event, existing)) {
      const updates: Record<string, unknown> = { subscription_status: 'canceled' };
      if (event.expiration_at_ms) {
        // Keep the furthest known expiry — never shorten access on reorder.
        const newExp = Number(event.expiration_at_ms);
        const existingExp = user.plan_expiration_date ? Date.parse(user.plan_expiration_date) : null;
        updates.plan_expiration_date =
          existingExp !== null && !Number.isNaN(existingExp) && existingExp > newExp
            ? user.plan_expiration_date
            : new Date(newExp).toISOString();
      }
      await base44.asServiceRole.entities.User.update(user.id, updates);
    }
    await recordAppleLedgerEvent(base44, existing, event, eventId);
  } catch (e) {
    console.error('Apple cancellation persistence failed:', (e as Error).message);
    return jsonResponse({ error: 'persistence_failed' }, 500);
  }
  return jsonResponse({ received: true, cancelled: true });
}

/** UNCANCELLATION — auto-renew re-enabled before expiry; restore active status. */
async function handleAppleUncancel(
  base44: any,
  user: any,
  event: any,
  existing: any,
  eventId: string,
  transactionId: string,
  product: any,
) {
  try {
    if (appleEventOwnsGenericPlan(user, event, existing)) {
      const plan = (PLANS as any)[product.plan_id];
      if (plan && event.expiration_at_ms) {
        await applyAppleGrant(base44, user, plan, new Date(Number(event.expiration_at_ms)).toISOString(), {
          refillEnergy: false,
          subscriptionId: event.original_transaction_id || transactionId,
        });
      } else {
        await base44.asServiceRole.entities.User.update(user.id, { subscription_status: 'active' });
      }
    }
    await recordAppleLedgerEvent(base44, existing, event, eventId);
  } catch (e) {
    console.error('Apple uncancellation persistence failed:', (e as Error).message);
    return jsonResponse({ error: 'persistence_failed' }, 500);
  }
  return jsonResponse({ received: true, uncancelled: true });
}

/**
 * PRODUCT_CHANGE — bookkeeping only. The paired RENEWAL carries the new
 * product + expiration (immediately for upgrades, at period end for
 * downgrades) and performs the actual plan change.
 */
async function handleAppleProductChange(base44: any, existing: any, event: any, eventId: string) {
  try {
    await recordAppleLedgerEvent(base44, existing, event, eventId);
  } catch (e) {
    console.error('Apple product_change ledger update failed:', (e as Error).message);
  }
  return jsonResponse({ received: true, product_change: true });
}

/**
 * GRANT — INITIAL_PURCHASE / RENEWAL. Grants the mapped plan on the generic
 * fields and upserts the ledger row. RENEWAL also covers resubscribe-after-
 * lapse and the new product of a same-group upgrade/downgrade.
 */
async function handleAppleGrant(
  base44: any,
  user: any,
  event: any,
  existing: any,
  eventId: string,
  transactionId: string,
  productId: string,
  product: any,
) {
  const expirationMs = event.expiration_at_ms;
  if (!expirationMs) {
    console.error('Apple grant event missing expiration_at_ms', eventId);
    return jsonResponse({ error: 'missing expiration_at_ms' }, 400);
  }
  const plan = (PLANS as any)[product.plan_id];
  if (!plan) {
    console.error('No plan mapped for Apple product', productId);
    return jsonResponse({ error: 'unmapped product' }, 400);
  }
  const expirationIso = new Date(Number(expirationMs)).toISOString();
  const purchasedAtMs = event.purchased_at_ms || event.event_timestamp_ms || Date.now();
  const purchaseDateIso = new Date(Number(purchasedAtMs)).toISOString();

  try {
    await applyAppleGrant(base44, user, plan, expirationIso, {
      refillEnergy: true,
      subscriptionId: event.original_transaction_id || transactionId,
    });

    // A stale (out-of-order) grant must not regress the ledger row's tracked
    // period — merge the event id only, keep the newer row data.
    const existingExp = existing?.plan_expiration_date ? Date.parse(existing.plan_expiration_date) : null;
    const staleForLedger =
      existingExp !== null && !Number.isNaN(existingExp) && existingExp > Number(expirationMs);

    if (existing && staleForLedger) {
      await recordAppleLedgerEvent(base44, existing, event, eventId);
    } else {
      const ledgerFields = normalizeAppleLedgerFields(event, {
        userId: user.id,
        productId,
        purchaseDateIso,
        expirationIso,
        status: 'active',
        eventIds: mergeEventIds(existing, eventId),
      });
      if (existing) {
        // Renewals / resubscribes update the subscription's existing row.
        await base44.asServiceRole.entities.RevenueCatPurchase.update(existing.id, ledgerFields);
      } else {
        await base44.asServiceRole.entities.RevenueCatPurchase.create(ledgerFields);
      }
    }
  } catch (e) {
    console.error('Apple grant persistence failed:', (e as Error).message);
    // 5xx so RevenueCat retries
    return jsonResponse({ error: 'persistence_failed' }, 500);
  }

  console.log('Apple subscription grant applied:', user.id, plan.id, event.type, 'expires', expirationIso);
  return jsonResponse({ received: true, granted: true, plan: plan.id, expires: expirationIso });
}

/**
 * Route an Apple App Store subscription lifecycle event.
 * Mirrors the Google flow: auth is verified by the caller, the Base44 user is
 * resolved from app_user_id, and event-level idempotency uses the ledger row's
 * event_ids.
 */
export async function handleAppleSubscriptionEvent(base44: any, event: any) {
  const eventId = event.id || event.event_id || '';
  const transactionId = event.transaction_id || event.original_transaction_id || '';

  if (!transactionId) {
    console.error('Apple event missing transaction_id', eventId);
    return jsonResponse({ received: true, skipped: 'no_transaction' });
  }

  const appUserId = resolveAppUserId(event);
  if (!appUserId) {
    console.error('Apple event has no mappable app_user_id', eventId);
    return jsonResponse({ received: true, skipped: 'anonymous_user' });
  }

  // Resolve Base44 user — app_user_id is the Base44 user.id set by the client.
  let user: any = null;
  try {
    user = await base44.asServiceRole.entities.User.get(appUserId);
  } catch (e) {
    console.error('User lookup failed for', appUserId, (e as Error).message);
  }

  if (!user) {
    console.error('No Base44 user for RevenueCat app_user_id', appUserId);
    // 200 so RC does not retry forever for permanently unmapped ids
    return jsonResponse({ received: true, skipped: 'user_not_found' });
  }

  const action = classifyAppleSubscriptionEvent(event);
  const productId = event.type === 'PRODUCT_CHANGE' ? event.new_product_id : event.product_id;
  const product = getAppleSubscriptionProduct(productId);
  if (!action || !product) {
    return jsonResponse({ received: true, skipped: 'unhandled_type' });
  }

  const existing = await findAppleLedger(base44, event);

  if (existing && eventAlreadyApplied(existing, eventId)) {
    console.log('Duplicate Apple event, skipping:', eventId);
    return jsonResponse({ received: true, duplicate: true });
  }

  switch (action) {
    case 'refund':
      return await handleAppleRefund(base44, user, event, existing, eventId, transactionId);
    case 'expire':
      return await handleAppleExpiration(base44, user, event, existing, eventId, transactionId);
    case 'cancel':
      return await handleAppleCancel(base44, user, event, existing, eventId);
    case 'uncancel':
      return await handleAppleUncancel(base44, user, event, existing, eventId, transactionId, product);
    case 'product_change':
      return await handleAppleProductChange(base44, existing, event, eventId);
    default:
      return await handleAppleGrant(
        base44,
        user,
        event,
        existing,
        eventId,
        transactionId,
        productId,
        product,
      );
  }
}
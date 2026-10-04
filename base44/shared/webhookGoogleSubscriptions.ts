// Google Play Explorer/Investigator subscriptions (RevenueCat webhook).
// Auto-renewable Play subscriptions bought only on native Android. Grants
// reuse the generic Base44 entitlement fields (plan, plan_expiration_date,
// subscription_status, subscription_id, energy). Google Trailblazer stays
// isolated in google_trailblazer_*. Webhook product ids carry the base plan:
// explorer:monthly, explorer:annual, investigator:monthly, investigator:annual.
import { PLANS, getNextResetDate } from './plans.js';
import {
  PLAY_STORE,
  classifyGoogleSubscriptionEvent,
  getGoogleSubscriptionProduct,
  latestActiveGoogleSubscription,
  normalizeGoogleLedgerFields,
  resolveAppUserId,
} from './revenuecat.js';
import { eventAlreadyApplied, jsonResponse, mergeEventIds } from './webhookCommon.ts';

/**
 * Locate the ledger row for a Google Play subscription. Renewals,
 * cancellations, and refunds each carry their own transaction_id but share
 * the subscription lineage's original_transaction_id, so both are tried.
 */
async function findGoogleSubscriptionLedger(base44: any, event: any) {
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

/** Transaction ids identifying a Google Play subscription lineage. */
function googleSubscriptionLineageKeys(event: any, row: any): string[] {
  return [
    row?.original_transaction_id,
    row?.transaction_id,
    event?.original_transaction_id,
    event?.transaction_id,
  ].filter((k): k is string => typeof k === 'string' && k.length > 0);
}

/**
 * The generic plan fields can only represent one subscription at a time.
 * Google Play lifecycle events may rewrite them only when the user's current
 * subscription_id belongs to this Google lineage (or is unset), so a Google
 * refund/expiry cannot wipe a Wix, Apple, or newer subscription's fields.
 */
function googleEventOwnsGenericPlan(user: any, event: any, row: any): boolean {
  if (!user.subscription_id) return true;
  return googleSubscriptionLineageKeys(event, row).includes(user.subscription_id);
}

/**
 * Apply a Google Play Explorer/Investigator grant to the generic plan fields.
 * Out-of-order deliveries for the same plan can only extend
 * plan_expiration_date (max), never shorten it, and stale events do not
 * refill energy that was already granted for a newer period.
 */
async function applyGoogleSubscriptionGrant(
  base44: any,
  user: any,
  plan: any,
  expirationIso: string,
  opts: { refillEnergy: boolean; subscriptionId?: string | null },
) {
  const newExp = Date.parse(expirationIso);
  const existingExp = user.plan_expiration_date ? Date.parse(user.plan_expiration_date) : null;
  const hasExisting = existingExp !== null && !Number.isNaN(existingExp);
  const samePlan = (user.plan || 'observer') === plan.id;

  let finalExpiration = expirationIso;
  if (samePlan && hasExisting && existingExp > newExp) {
    finalExpiration = user.plan_expiration_date;
  }
  // Event for an older period than the one already granted — keep energy as-is.
  const stale = samePlan && hasExisting && newExp < (existingExp as number);

  const fields: Record<string, unknown> = {
    plan: plan.id,
    plan_expiration_date: finalExpiration,
    subscription_status: 'active',
    subscription_id: opts.subscriptionId || user.subscription_id || null,
  };

  if (opts.refillEnergy && !stale) {
    fields.manifestation_energy = plan.manifestation_energy;
    fields.narration_energy = plan.narration_energy;
    fields.energy_reset_date = getNextResetDate();
  }

  await base44.asServiceRole.entities.User.update(user.id, fields);
}

/**
 * After a Google Play refund or expiration, downgrade to observer unless
 * another active Google Play subscription remains on the ledger. Energy is
 * zeroed only when no Google subscription remains. Never touches the
 * google_trailblazer_* fields.
 */
async function recomputeGoogleSubscriptionAccessAfterRevoke(
  base44: any,
  user: any,
  revokeKeys: string[],
  statusWhenNone: 'canceled' | 'expired',
) {
  const ownsGenericPlan = !user.subscription_id || revokeKeys.includes(user.subscription_id);

  const rows = await base44.asServiceRole.entities.RevenueCatPurchase.filter({
    user_id: user.id,
    store: PLAY_STORE,
  });
  const remaining = latestActiveGoogleSubscription(rows || [], new Date());

  if (remaining) {
    const plan = (PLANS as any)[remaining.product.plan_id];
    if (plan && ownsGenericPlan) {
      await base44.asServiceRole.entities.User.update(user.id, {
        plan: plan.id,
        plan_expiration_date: remaining.row.plan_expiration_date,
        subscription_status: 'active',
        subscription_id: remaining.row.original_transaction_id || remaining.row.transaction_id,
      });
      console.log('Google revoke: kept remaining subscription', remaining.row.product_id, 'for', user.id);
    }
    return;
  }

  if (!ownsGenericPlan) {
    console.log('Google revoke: generic plan belongs to another subscription, untouched:', user.id);
    return;
  }

  await base44.asServiceRole.entities.User.update(user.id, {
    plan: 'observer',
    manifestation_energy: 0,
    narration_energy: 0,
    subscription_status: statusWhenNone,
  });
  console.log('Google Play subscription access revoked:', user.id, statusWhenNone);
}

/** Record a non-grant lifecycle event on the ledger row (idempotent bookkeeping). */
async function recordGoogleLedgerEvent(base44: any, row: any, event: any, eventId: string) {
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
 * refunded. Prorated refunds from a base-plan change reference the OLD
 * product while the row already tracks the NEW one — never revoke those.
 */
async function handleGoogleSubscriptionRefund(
  base44: any,
  user: any,
  event: any,
  existing: any,
  eventId: string,
  transactionId: string,
) {
  if (!existing) {
    console.log('Google refund event with no ledger row:', transactionId);
    return jsonResponse({ received: true, skipped: 'no_ledger' });
  }
  if (existing.product_id !== event.product_id) {
    console.log('Google refund for superseded product, ignoring:', event.product_id, 'row:', existing.product_id);
    return jsonResponse({ received: true, skipped: 'superseded_product' });
  }
  try {
    await base44.asServiceRole.entities.RevenueCatPurchase.update(existing.id, {
      status: 'refunded',
      event_id: eventId || existing.event_id,
      event_ids: mergeEventIds(existing, eventId),
      event_type: event.type,
    });
    await recomputeGoogleSubscriptionAccessAfterRevoke(
      base44,
      user,
      googleSubscriptionLineageKeys(event, existing),
      'canceled',
    );
  } catch (e) {
    console.error('Google refund persistence failed:', (e as Error).message);
    return jsonResponse({ error: 'persistence_failed' }, 500);
  }
  return jsonResponse({ received: true, refunded: true });
}

/** EXPIRATION — the paid period ended and access should be removed. */
async function handleGoogleSubscriptionExpiration(
  base44: any,
  user: any,
  event: any,
  existing: any,
  eventId: string,
  transactionId: string,
) {
  if (!existing) {
    console.log('Google expiration event with no ledger row:', transactionId);
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
    await recomputeGoogleSubscriptionAccessAfterRevoke(
      base44,
      user,
      googleSubscriptionLineageKeys(event, existing),
      'expired',
    );
  } catch (e) {
    console.error('Google expiration persistence failed:', (e as Error).message);
    return jsonResponse({ error: 'persistence_failed' }, 500);
  }
  return jsonResponse({ received: true, expired: true });
}

/**
 * CANCELLATION — auto-renew turned off. Access continues until
 * plan_expiration_date (isGenericPlanActive honors the date first); the later
 * EXPIRATION event performs the actual downgrade.
 */
async function handleGoogleSubscriptionCancel(
  base44: any,
  user: any,
  event: any,
  existing: any,
  eventId: string,
) {
  try {
    if (googleEventOwnsGenericPlan(user, event, existing)) {
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
    await recordGoogleLedgerEvent(base44, existing, event, eventId);
  } catch (e) {
    console.error('Google cancellation persistence failed:', (e as Error).message);
    return jsonResponse({ error: 'persistence_failed' }, 500);
  }
  return jsonResponse({ received: true, cancelled: true });
}

/** UNCANCELLATION — auto-renew re-enabled before expiry; restore active status. */
async function handleGoogleSubscriptionUncancel(
  base44: any,
  user: any,
  event: any,
  existing: any,
  eventId: string,
  transactionId: string,
  product: any,
) {
  try {
    if (googleEventOwnsGenericPlan(user, event, existing)) {
      const plan = (PLANS as any)[product.plan_id];
      if (plan && event.expiration_at_ms) {
        await applyGoogleSubscriptionGrant(
          base44,
          user,
          plan,
          new Date(Number(event.expiration_at_ms)).toISOString(),
          {
            refillEnergy: false,
            subscriptionId: event.original_transaction_id || transactionId,
          },
        );
      } else {
        await base44.asServiceRole.entities.User.update(user.id, { subscription_status: 'active' });
      }
    }
    await recordGoogleLedgerEvent(base44, existing, event, eventId);
  } catch (e) {
    console.error('Google uncancellation persistence failed:', (e as Error).message);
    return jsonResponse({ error: 'persistence_failed' }, 500);
  }
  return jsonResponse({ received: true, uncancelled: true });
}

/**
 * PRODUCT_CHANGE — bookkeeping only. On Google Play the paired
 * INITIAL_PURCHASE carries the new base plan + expiration and performs the
 * actual plan change.
 */
async function handleGoogleSubscriptionProductChange(base44: any, existing: any, event: any, eventId: string) {
  try {
    await recordGoogleLedgerEvent(base44, existing, event, eventId);
  } catch (e) {
    console.error('Google product_change ledger update failed:', (e as Error).message);
  }
  return jsonResponse({ received: true, product_change: true });
}

/**
 * GRANT — INITIAL_PURCHASE / RENEWAL. Grants the mapped plan on the generic
 * fields and upserts the ledger row. On Google Play, INITIAL_PURCHASE also
 * covers resubscribe-after-expiry and the new base plan of a product change.
 */
async function handleGoogleSubscriptionGrant(
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
    console.error('Google grant event missing expiration_at_ms', eventId);
    return jsonResponse({ error: 'missing expiration_at_ms' }, 400);
  }
  const plan = (PLANS as any)[product.plan_id];
  if (!plan) {
    console.error('No plan mapped for Google product', productId);
    return jsonResponse({ error: 'unmapped product' }, 400);
  }
  const expirationIso = new Date(Number(expirationMs)).toISOString();
  const purchasedAtMs = event.purchased_at_ms || event.event_timestamp_ms || Date.now();
  const purchaseDateIso = new Date(Number(purchasedAtMs)).toISOString();

  try {
    await applyGoogleSubscriptionGrant(base44, user, plan, expirationIso, {
      refillEnergy: true,
      subscriptionId: event.original_transaction_id || transactionId,
    });

    // A stale (out-of-order) grant must not regress the ledger row's tracked
    // period — merge the event id only, keep the newer row data.
    const existingExp = existing?.plan_expiration_date ? Date.parse(existing.plan_expiration_date) : null;
    const staleForLedger =
      existingExp !== null && !Number.isNaN(existingExp) && existingExp > Number(expirationMs);

    if (existing && staleForLedger) {
      await recordGoogleLedgerEvent(base44, existing, event, eventId);
    } else {
      const ledgerFields = normalizeGoogleLedgerFields(event, {
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
    console.error('Google grant persistence failed:', (e as Error).message);
    // 5xx so RevenueCat retries
    return jsonResponse({ error: 'persistence_failed' }, 500);
  }

  console.log('Google Play subscription grant applied:', user.id, plan.id, event.type, 'expires', expirationIso);
  return jsonResponse({ received: true, granted: true, plan: plan.id, expires: expirationIso });
}

/**
 * Route a Google Play Explorer/Investigator subscription lifecycle event.
 * Mirrors the Apple subscription flow: auth is verified by the caller, the
 * Base44 user is resolved from app_user_id, and event-level idempotency uses
 * the ledger row's event_ids.
 */
export async function handleGoogleSubscriptionEvent(base44: any, event: any) {
  const eventId = event.id || event.event_id || '';
  const transactionId = event.transaction_id || event.original_transaction_id || '';

  if (!transactionId) {
    console.error('Google event missing transaction_id', eventId);
    return jsonResponse({ received: true, skipped: 'no_transaction' });
  }

  const appUserId = resolveAppUserId(event);
  if (!appUserId) {
    console.error('Google event has no mappable app_user_id', eventId);
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

  const action = classifyGoogleSubscriptionEvent(event);
  const productId = event.type === 'PRODUCT_CHANGE' ? event.new_product_id : event.product_id;
  const product = getGoogleSubscriptionProduct(productId);
  if (!action || !product) {
    return jsonResponse({ received: true, skipped: 'unhandled_type' });
  }

  const existing = await findGoogleSubscriptionLedger(base44, event);

  if (existing && eventAlreadyApplied(existing, eventId)) {
    console.log('Duplicate Google event, skipping:', eventId);
    return jsonResponse({ received: true, duplicate: true });
  }

  switch (action) {
    case 'refund':
      return await handleGoogleSubscriptionRefund(base44, user, event, existing, eventId, transactionId);
    case 'expire':
      return await handleGoogleSubscriptionExpiration(base44, user, event, existing, eventId, transactionId);
    case 'cancel':
      return await handleGoogleSubscriptionCancel(base44, user, event, existing, eventId);
    case 'uncancel':
      return await handleGoogleSubscriptionUncancel(base44, user, event, existing, eventId, transactionId, product);
    case 'product_change':
      return await handleGoogleSubscriptionProductChange(base44, existing, event, eventId);
    default:
      return await handleGoogleSubscriptionGrant(
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
// Apple App Store Trailblazer one-time purchase (RevenueCat webhook).
// Non-renewing 27-month product bought only on native iOS. The grant mirrors
// the Wix payments-webhook Trailblazer path on the EXISTING generic
// entitlement fields: plan 'trailblazer', plan_expiration_date = purchase +
// 27 calendar months UTC, energy pools, subscription_status 'none'. Android
// keeps the isolated google_trailblazer_* flow.
import { PLANS, getNextResetDate } from './plans.js';
import {
  APPLE_STORE,
  APPLE_TRAILBLAZER_GRANT_EVENT_TYPES,
  APPLE_TRAILBLAZER_PRODUCT_ID,
  computeGoogleTrailblazerExpiration,
  isAppleTrailblazerRefundEvent,
  latestActiveAppleTrailblazerRow,
  latestActiveAppleSubscription,
  normalizeAppleTrailblazerLedgerFields,
  resolveAppUserId,
} from './revenuecat.js';
import {
  eventAlreadyApplied,
  findLedgerByTransaction,
  jsonResponse,
  mergeEventIds,
} from './webhookCommon.ts';

/** Transaction ids identifying an Apple Trailblazer purchase. */
function appleTrailblazerKeys(event: any, row: any): string[] {
  return [
    row?.original_transaction_id,
    row?.transaction_id,
    event?.original_transaction_id,
    event?.transaction_id,
  ].filter((k): k is string => typeof k === 'string' && k.length > 0);
}

/** True while the generic plan fields hold an active Trailblazer grant. */
function genericTrailblazerActive(user: any, now = new Date()): boolean {
  if (!user || user.plan !== 'trailblazer') return false;
  const expMs = user.plan_expiration_date ? Date.parse(user.plan_expiration_date) : NaN;
  return !Number.isNaN(expMs) && expMs > now.getTime();
}

/**
 * Apply the Apple Trailblazer grant to the generic plan fields, mirroring the
 * Wix one-time grant. Out-of-order deliveries can only extend
 * plan_expiration_date (max), never shorten it; energy is refilled only when
 * no generic Trailblazer grant is currently active, so a webhook retry or a
 * repurchase mid-term never double-fills the pools.
 */
async function applyAppleTrailblazerGrant(base44: any, user: any, expirationIso: string) {
  const plan = (PLANS as any).trailblazer;
  if (!plan) {
    throw new Error('PLANS.trailblazer missing');
  }

  const now = new Date();
  const newExp = Date.parse(expirationIso);
  const existingExp = user.plan_expiration_date ? Date.parse(user.plan_expiration_date) : null;
  const hasExisting = existingExp !== null && !Number.isNaN(existingExp);
  const samePlan = (user.plan || 'observer') === 'trailblazer';

  let finalExpiration = expirationIso;
  if (samePlan && hasExisting && (existingExp as number) > newExp) {
    finalExpiration = user.plan_expiration_date;
  }

  // Refill energy only when there is no currently-active generic Trailblazer
  // grant (fresh purchase or re-purchase after expiry).
  const trailblazerStillActive = genericTrailblazerActive(user, now);

  const fields: Record<string, unknown> = {
    plan: plan.id,
    plan_expiration_date: finalExpiration,
    // Wix grant semantics: a one-time purchase is not an auto-renewing sub.
    subscription_status: 'none',
  };

  if (!trailblazerStillActive) {
    fields.manifestation_energy = plan.manifestation_energy;
    fields.narration_energy = plan.narration_energy;
    fields.energy_reset_date = getNextResetDate();
  }

  await base44.asServiceRole.entities.User.update(user.id, fields);
  console.log(
    'Apple Trailblazer grant applied:',
    user.id,
    'expires',
    finalExpiration,
    'energyRefill',
    !trailblazerStillActive,
  );
}

/**
 * After an Apple Trailblazer refund, recompute the generic plan fields.
 * If another still-active paid Apple Trailblazer ledger row exists, keep the
 * newer expiry instead of revoking. Otherwise revoke the generic Trailblazer
 * fields exactly like the Wix cancel/expire path (observer, energy zeroed,
 * subscription_status 'canceled') — but only when this purchase's lineage
 * owns the generic plan fields, so a Wix Trailblazer or live subscription
 * belonging to another flow is never clobbered.
 */
async function recomputeAppleTrailblazerAfterRefund(
  base44: any,
  user: any,
  revokeKeys: string[],
) {
  const rows = await base44.asServiceRole.entities.RevenueCatPurchase.filter({
    user_id: user.id,
    store: APPLE_STORE,
    product_id: APPLE_TRAILBLAZER_PRODUCT_ID,
  });
  const remaining = latestActiveAppleTrailblazerRow(rows || [], new Date());

  const ownsGenericPlan =
    !user.subscription_id || revokeKeys.includes(user.subscription_id);

  if (remaining) {
    // A newer Apple Trailblazer purchase is still active — keep it.
    if (ownsGenericPlan && user.plan === 'trailblazer') {
      await base44.asServiceRole.entities.User.update(user.id, {
        plan_expiration_date: remaining.row.plan_expiration_date,
        subscription_id:
          remaining.row.original_transaction_id || remaining.row.transaction_id,
      });
      console.log(
        'Apple Trailblazer refund: kept newer active purchase',
        remaining.row.transaction_id,
        'for',
        user.id,
      );
    }
    return;
  }

  if (!ownsGenericPlan) {
    console.log(
      'Apple Trailblazer refund: generic plan belongs to another purchase, untouched:',
      user.id,
    );
    return;
  }

  if (user.plan !== 'trailblazer') {
    // Nothing to revoke on the generic fields.
    return;
  }

  // Prefer a still-active Apple recurring subscription over a bare observer
  // downgrade so refunding Trailblazer does not discard paid subscription access
  // that coexisted on the RevenueCatPurchase ledger.
  const allAppleRows = await base44.asServiceRole.entities.RevenueCatPurchase.filter({
    user_id: user.id,
    store: APPLE_STORE,
  });
  const remainingSub = latestActiveAppleSubscription(allAppleRows || [], new Date());
  if (remainingSub) {
    const subPlan = (PLANS as any)[remainingSub.product.plan_id];
    if (subPlan) {
      await base44.asServiceRole.entities.User.update(user.id, {
        plan: subPlan.id,
        plan_expiration_date: remainingSub.row.plan_expiration_date,
        subscription_status: 'active',
        subscription_id:
          remainingSub.row.original_transaction_id || remainingSub.row.transaction_id,
        manifestation_energy: subPlan.manifestation_energy,
        narration_energy: subPlan.narration_energy,
        energy_reset_date: getNextResetDate(),
      });
      console.log(
        'Apple Trailblazer refund: restored active subscription',
        remainingSub.row.product_id,
        'for',
        user.id,
      );
      return;
    }
  }

  await base44.asServiceRole.entities.User.update(user.id, {
    plan: 'observer',
    manifestation_energy: 0,
    narration_energy: 0,
    subscription_status: 'canceled',
  });
  console.log('Apple Trailblazer access revoked after refund:', user.id);
}

/**
 * Refund / cancellation of the Apple Trailblazer one-time purchase. Marks the
 * ledger row refunded and recomputes generic access without ever revoking a
 * newer active Trailblazer purchase (lineage/transaction checked).
 */
async function handleAppleTrailblazerRefund(
  base44: any,
  user: any,
  event: any,
  existing: any,
  eventId: string,
  transactionId: string,
) {
  if (!existing) {
    console.log('Apple Trailblazer refund event with no ledger row:', transactionId);
    return jsonResponse({ received: true, skipped: 'no_ledger' });
  }

  if (eventAlreadyApplied(existing, eventId) && existing.status === 'refunded') {
    return jsonResponse({ received: true, duplicate: true });
  }

  // Defensive: never revoke if the refund's product doesn't match the row.
  if (existing.product_id !== event.product_id) {
    console.log(
      'Apple Trailblazer refund product mismatch, ignoring:',
      event.product_id,
      'row:',
      existing.product_id,
    );
    return jsonResponse({ received: true, skipped: 'product_mismatch' });
  }

  try {
    await base44.asServiceRole.entities.RevenueCatPurchase.update(existing.id, {
      status: 'refunded',
      event_id: eventId || existing.event_id,
      event_ids: mergeEventIds(existing, eventId),
      event_type: event.type,
    });

    await recomputeAppleTrailblazerAfterRefund(
      base44,
      user,
      appleTrailblazerKeys(event, existing),
    );
  } catch (e) {
    console.error('Apple Trailblazer refund persistence failed:', (e as Error).message);
    return jsonResponse({ error: 'persistence_failed' }, 500);
  }

  return jsonResponse({ received: true, refunded: true });
}

/**
 * Route an Apple App Store Trailblazer event.
 * The Base44 user is resolved from app_user_id, the ledger row is keyed by
 * transaction_id (fallback to original_transaction_id), and event-level
 * idempotency uses the ledger row's event_ids. Grants write only the generic
 * Trailblazer fields.
 */
export async function handleAppleTrailblazerEvent(base44: any, event: any) {
  const eventId = event.id || event.event_id || '';
  const transactionId = event.transaction_id || event.original_transaction_id || '';

  if (!transactionId) {
    console.error('Apple Trailblazer event missing transaction_id', eventId);
    return jsonResponse({ received: true, skipped: 'no_transaction' });
  }

  const appUserId = resolveAppUserId(event);
  if (!appUserId) {
    console.error('Apple Trailblazer event has no mappable app_user_id', eventId);
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

  const existing = await findLedgerByTransaction(base44, transactionId);

  // ── REFUND / REVOKE ──
  if (isAppleTrailblazerRefundEvent(event)) {
    return await handleAppleTrailblazerRefund(
      base44,
      user,
      event,
      existing,
      eventId,
      transactionId,
    );
  }

  // ── GRANT (NON_RENEWING_PURCHASE / INITIAL_PURCHASE) ──
  if (!APPLE_TRAILBLAZER_GRANT_EVENT_TYPES.has(event.type)) {
    return jsonResponse({ received: true, skipped: 'unhandled_type' });
  }

  if (existing && eventAlreadyApplied(existing, eventId)) {
    console.log('Duplicate Apple Trailblazer event, skipping:', eventId);
    return jsonResponse({ received: true, duplicate: true });
  }

  const purchasedAtMs = event.purchased_at_ms || event.event_timestamp_ms || Date.now();
  let expiration: Date;
  try {
    // purchase timestamp + 27 calendar months (UTC) — same window as Wix/Play.
    expiration = computeGoogleTrailblazerExpiration(purchasedAtMs);
  } catch (e) {
    console.error('Apple Trailblazer expiry calculation failed:', (e as Error).message);
    return jsonResponse({ error: 'invalid purchase date' }, 400);
  }

  const purchaseDateIso = new Date(Number(purchasedAtMs)).toISOString();
  const expirationIso = expiration.toISOString();
  const subscriptionId = event.original_transaction_id || event.transaction_id || transactionId;

  try {
    await applyAppleTrailblazerGrant(base44, user, expirationIso);

    const ledgerFields = normalizeAppleTrailblazerLedgerFields(event, {
      userId: user.id,
      purchaseDateIso,
      expirationIso,
      status: 'paid',
      eventIds: mergeEventIds(existing, eventId),
    });

    if (existing) {
      // Previously refunded transaction being re-granted, or a pending row.
      await base44.asServiceRole.entities.RevenueCatPurchase.update(existing.id, ledgerFields);
    } else {
      await base44.asServiceRole.entities.RevenueCatPurchase.create(ledgerFields);
    }

    // Record the lineage key so future refund/expiration events can prove
    // ownership of the generic plan fields.
    await base44.asServiceRole.entities.User.update(user.id, {
      subscription_id: subscriptionId,
    });
  } catch (e) {
    console.error('Apple Trailblazer grant persistence failed:', (e as Error).message);
    // 5xx so RevenueCat retries
    return jsonResponse({ error: 'persistence_failed' }, 500);
  }

  console.log('Apple Trailblazer granted:', user.id, event.type, 'expires', expirationIso);
  return jsonResponse({ received: true, granted: true, plan: 'trailblazer', expires: expirationIso });
}
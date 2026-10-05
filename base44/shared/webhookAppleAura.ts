// Apple App Store Aura Bundle consumables (RevenueCat webhook).
// The grant mirrors the Wix payments-webhook Aura path exactly: additive
// aura_narration_energy / aura_manifestation_energy computed by
// getGrantForProduct (plans.js). These events never read or write plan,
// plan_expiration_date, subscription_*, or the monthly energy fields.
import { getGrantForProduct } from './plans.js';
import {
  APPLE_AURA_GRANT_EVENT_TYPES,
  getAppleAuraProduct,
  isAppleAuraRefundEvent,
  normalizeAppleAuraLedgerFields,
  resolveAppUserId,
} from './revenuecat.js';
import {
  eventAlreadyApplied,
  findLedgerByTransaction,
  jsonResponse,
  mergeEventIds,
} from './webhookCommon.ts';

/**
 * Apply an Aura Bundle grant to the rollover aura pools only (additive).
 * Reuses the exact Wix reward mapping (80% narration / 20% manifestation).
 */
async function applyAppleAuraGrant(base44: any, user: any, bundleId: string) {
  const grant = getGrantForProduct(bundleId, { userPlan: user.plan || 'observer' });
  if (!grant || (!grant.aura_narration_add && !grant.aura_manifestation_add && !grant.aura_save_add)) {
    throw new Error(`No Aura grant mapped for bundle ${bundleId}`);
  }

  const auraNarration = (user.aura_narration_energy || 0) + (grant.aura_narration_add || 0);
  const auraManifestation = (user.aura_manifestation_energy || 0) + (grant.aura_manifestation_add || 0);
  const auraSave = (user.aura_save_energy || 0) + (grant.aura_save_add || 0);

  await base44.asServiceRole.entities.User.update(user.id, {
    aura_narration_energy: auraNarration,
    aura_manifestation_energy: auraManifestation,
    aura_save_energy: auraSave,
  });

  return { auraNarration, auraManifestation, auraSave };
}

/**
 * Refund of an Aura consumable (CANCELLATION from store support, or a
 * defensive REFUND type). Marks the ledger row refunded and removes exactly
 * the granted bundle energy, floored at 0 so partially-spent pools never go
 * negative. Never touches plan fields.
 */
async function handleAppleAuraRefund(
  base44: any,
  user: any,
  event: any,
  existing: any,
  eventId: string,
  transactionId: string,
) {
  if (!existing) {
    // No matching paid row — acknowledge (mirrors the Google refund path).
    console.log('Apple Aura refund event with no ledger row:', transactionId);
    return jsonResponse({ received: true, skipped: 'no_ledger' });
  }

  if (eventAlreadyApplied(existing, eventId) && existing.status === 'refunded') {
    return jsonResponse({ received: true, duplicate: true });
  }

  try {
    await base44.asServiceRole.entities.RevenueCatPurchase.update(existing.id, {
      status: 'refunded',
      event_id: eventId || existing.event_id,
      event_ids: mergeEventIds(existing, eventId),
      event_type: event.type,
    });

    // Claw back the EXACT energy this ledger row granted (recorded at grant time
    // in aura_*_granted). This is tier-correct even if the user's plan changed
    // between purchase and refund — Technician grants went to aura_save_energy,
    // Explorer+ grants went to the 80/20 narration/manifestation split.
    const narrationGranted = existing.aura_narration_granted || 0;
    const manifestationGranted = existing.aura_manifestation_granted || 0;
    const saveGranted = existing.aura_save_granted || 0;

    if (existing.status === 'paid' && (narrationGranted || manifestationGranted || saveGranted)) {
      const freshUser = await base44.asServiceRole.entities.User.get(user.id);
      const auraNarration = Math.max(0, (freshUser?.aura_narration_energy || 0) - narrationGranted);
      const auraManifestation = Math.max(0, (freshUser?.aura_manifestation_energy || 0) - manifestationGranted);
      const auraSave = Math.max(0, (freshUser?.aura_save_energy || 0) - saveGranted);
      await base44.asServiceRole.entities.User.update(user.id, {
        aura_narration_energy: auraNarration,
        aura_manifestation_energy: auraManifestation,
        aura_save_energy: auraSave,
      });
      console.log('Apple Aura refund clawed back energy:', user.id, event.product_id,
        'nar:', narrationGranted, 'man:', manifestationGranted, 'save:', saveGranted);
    }
  } catch (e) {
    console.error('Apple Aura refund persistence failed:', (e as Error).message);
    return jsonResponse({ error: 'persistence_failed' }, 500);
  }

  return jsonResponse({ received: true, refunded: true });
}

/**
 * Route an Apple App Store Aura Bundle consumable event.
 * The Base44 user is resolved from app_user_id, the ledger row is keyed by
 * transaction_id, and event-level idempotency uses the ledger row's
 * event_ids. Grants are additive aura energy only.
 */
export async function handleAppleAuraEvent(base44: any, event: any) {
  const eventId = event.id || event.event_id || '';
  const transactionId = event.transaction_id || event.original_transaction_id || '';

  if (!transactionId) {
    console.error('Apple Aura event missing transaction_id', eventId);
    return jsonResponse({ received: true, skipped: 'no_transaction' });
  }

  const appUserId = resolveAppUserId(event);
  if (!appUserId) {
    console.error('Apple Aura event has no mappable app_user_id', eventId);
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

  const auraProduct = getAppleAuraProduct(event.product_id);
  if (!auraProduct) {
    return jsonResponse({ received: true, skipped: 'unmapped_product' });
  }

  const existing = await findLedgerByTransaction(base44, transactionId);

  // ── REFUND / REVOKE ──
  if (isAppleAuraRefundEvent(event)) {
    return await handleAppleAuraRefund(base44, user, event, existing, eventId, transactionId);
  }

  // ── GRANT (NON_RENEWING_PURCHASE / INITIAL_PURCHASE) ──
  if (!APPLE_AURA_GRANT_EVENT_TYPES.has(event.type)) {
    return jsonResponse({ received: true, skipped: 'unhandled_type' });
  }

  if (existing && eventAlreadyApplied(existing, eventId)) {
    console.log('Duplicate Apple Aura event, skipping:', eventId);
    return jsonResponse({ received: true, duplicate: true });
  }

  // One transaction = one grant. A new event id for an already-paid
  // transaction is bookkeeping only — never re-grant energy.
  if (existing && existing.status === 'paid') {
    try {
      await base44.asServiceRole.entities.RevenueCatPurchase.update(existing.id, {
        event_id: eventId || existing.event_id,
        event_ids: mergeEventIds(existing, eventId),
        event_type: event.type,
      });
    } catch (e) {
      console.error('Apple Aura idempotent ledger update failed:', (e as Error).message);
    }
    return jsonResponse({ received: true, idempotent: true });
  }

  const purchasedAtMs = event.purchased_at_ms || event.event_timestamp_ms || Date.now();
  const purchaseDateIso = new Date(Number(purchasedAtMs)).toISOString();

  // Compute tier-aware grant amounts for the ledger row (Technician → save,
  // Explorer+ → 80/20 narration/manifestation). Recorded at grant time so
  // refunds claw back from the exact pools that received the energy.
  const auraGrant = getGrantForProduct(auraProduct.bundle_id, { userPlan: user.plan || 'observer' });

  const ledgerFields = normalizeAppleAuraLedgerFields(event, {
    userId: user.id,
    purchaseDateIso,
    status: 'paid',
    eventIds: mergeEventIds(existing, eventId),
    auraNarrationGranted: auraGrant?.aura_narration_add || 0,
    auraManifestationGranted: auraGrant?.aura_manifestation_add || 0,
    auraSaveGranted: auraGrant?.aura_save_add || 0,
  });

  try {
    if (existing) {
      // Previously refunded transaction being re-granted, or a pending row.
      await base44.asServiceRole.entities.RevenueCatPurchase.update(existing.id, ledgerFields);
    } else {
      await base44.asServiceRole.entities.RevenueCatPurchase.create(ledgerFields);
    }

    const { auraNarration, auraManifestation, auraSave } = await applyAppleAuraGrant(
      base44,
      user,
      auraProduct.bundle_id,
    );
    console.log(
      'Apple Aura grant applied:', user.id, event.product_id,
      'aura_narration:', auraNarration, 'aura_manifestation:', auraManifestation, 'aura_save:', auraSave,
    );
  } catch (e) {
    console.error('Apple Aura grant persistence failed:', (e as Error).message);
    // 5xx so RevenueCat retries
    return jsonResponse({ error: 'persistence_failed' }, 500);
  }

  return jsonResponse({ received: true, granted: true, bundle: auraProduct.bundle_id });
}
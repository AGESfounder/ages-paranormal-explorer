// RevenueCat shared helpers — product constants and grant helpers.
// - Google Play Trailblazer: unmapped one-time Play product with app-owned
//   30-month expiry, isolated in google_trailblazer_* user fields.
// - Apple App Store Explorer/Investigator: auto-renewable subscriptions that
//   reuse the generic Base44 entitlement fields (plan, plan_expiration_date,
//   subscription_status, subscription_id, energy) — the same fields the Wix
//   payments-webhook writes.

export const GOOGLE_TRAILBLAZER_PRODUCT_ID = 'trailblazer.30month';
export const APPLE_TRAILBLAZER_PRODUCT_ID = 'com.ages.explorer.trailblazer.30month';
export const TRAILBLAZER_ENTITLEMENT_ID = 'trailblazer';
export const GOOGLE_TRAILBLAZER_DURATION_MONTHS = 30;
export const GOOGLE_TRAILBLAZER_STORE = 'PLAY_STORE';
export const GOOGLE_TRAILBLAZER_PRICE = 239.99;
export const GOOGLE_TRAILBLAZER_CURRENCY = 'USD';
export const GOOGLE_TRAILBLAZER_PRODUCT_NAME =
  'AGES Trailblazer — 30-Month Elite (Google Play)';

// ── Apple App Store subscriptions via RevenueCat / StoreKit ───────────────

export const APPLE_STORE = 'APP_STORE';

/**
 * Apple product IDs (App Store Connect) → plan mapping. Must match App Store
 * Connect and the RevenueCat product catalog. iOS client purchases these via
 * the RevenueCat SDK; this webhook module reconciles the lifecycle events.
 */
export const APPLE_SUBSCRIPTION_PRODUCTS = {
  'com.ages.explorer.explorer.monthly': {
    plan_id: 'explorer',
    period: 'monthly',
    product_name: 'AGES Explorer — Monthly (App Store)',
  },
  'com.ages.explorer.explorer.annual': {
    plan_id: 'explorer',
    period: 'annual',
    product_name: 'AGES Explorer — Annual (App Store)',
  },
  'com.ages.explorer.investigator.monthly': {
    plan_id: 'investigator',
    period: 'monthly',
    product_name: 'AGES Investigator — Monthly (App Store)',
  },
  'com.ages.explorer.investigator.annual': {
    plan_id: 'investigator',
    period: 'annual',
    product_name: 'AGES Investigator — Annual (App Store)',
  },
};

export function getAppleSubscriptionProduct(productId) {
  return APPLE_SUBSCRIPTION_PRODUCTS[productId] || null;
}

export function isAppleSubscriptionProduct(productId) {
  return Boolean(getAppleSubscriptionProduct(productId));
}

export function isAppStore(store) {
  return store === APPLE_STORE;
}

/**
 * Classify an Apple subscription lifecycle event.
 * - grant: INITIAL_PURCHASE / RENEWAL — (re)grant the plan and extend
 *   plan_expiration_date. RENEWAL also covers resubscribe-after-lapse and the
 *   new product of a same-group upgrade/downgrade.
 * - product_change: PRODUCT_CHANGE — bookkeeping only. The paired RENEWAL
 *   carries the new product + expiration (immediately for upgrades, at period
 *   end for downgrades), so no plan change happens here.
 * - cancel: CANCELLATION — auto-renew turned off. Access continues until
 *   plan_expiration_date; the later EXPIRATION event ends it.
 * - uncancel: UNCANCELLATION — auto-renew re-enabled before expiry.
 * - refund: CANCELLATION/EXPIRATION with reason CUSTOMER_SUPPORT (store
 *   support refund) or a defensive REFUND type. Revokes access.
 * - expire: EXPIRATION — paid period ended; revoke access.
 */
export function classifyAppleSubscriptionEvent(event) {
  if (!event || typeof event !== 'object') return null;
  switch (event.type) {
    case 'INITIAL_PURCHASE':
    case 'RENEWAL':
      return 'grant';
    case 'PRODUCT_CHANGE':
      return 'product_change';
    case 'CANCELLATION':
      return event.cancel_reason === 'CUSTOMER_SUPPORT' ? 'refund' : 'cancel';
    case 'UNCANCELLATION':
      return 'uncancel';
    case 'EXPIRATION':
      return event.expiration_reason === 'CUSTOMER_SUPPORT' ? 'refund' : 'expire';
    case 'REFUND':
      // Not a current RevenueCat event type — kept defensively.
      return 'refund';
    default:
      return null;
  }
}

/**
 * Whether this RevenueCat event should be processed as an Apple subscription.
 * Google Play / other stores / unmapped products are ignored (200, no grant).
 * PRODUCT_CHANGE carries the new product in new_product_id.
 */
export function shouldProcessAppleSubscriptionEvent(event) {
  if (!event || typeof event !== 'object') return false;
  if (event.type === 'TEST') return false;
  if (!isAppStore(event.store)) return false;
  if (!classifyAppleSubscriptionEvent(event)) return false;
  const productId = event.type === 'PRODUCT_CHANGE' ? event.new_product_id : event.product_id;
  return isAppleSubscriptionProduct(productId);
}

/**
 * Latest still-active Apple subscription ledger row for a user, if any.
 * Used to keep access when one Apple subscription is refunded/expired while
 * another remains active.
 */
export function latestActiveAppleSubscription(ledgerRows, now = new Date()) {
  let best = null;
  for (const row of ledgerRows || []) {
    if (row.status !== 'active') continue;
    const product = getAppleSubscriptionProduct(row.product_id);
    if (!product) continue;
    if (!row.plan_expiration_date) continue;
    const expMs = new Date(row.plan_expiration_date).getTime();
    if (Number.isNaN(expMs)) continue;
    if (expMs <= now.getTime()) continue;
    if (!best || expMs > best.expMs) best = { row, product, expMs };
  }
  return best;
}

/**
 * Normalize a RevenueCat Apple subscription event into ledger fields for
 * RevenueCatPurchase. Subscription rows use status 'active' while entitled
 * ('refunded' / 'expired' once revoked), unlike the Google one-time 'paid'.
 */
export function normalizeAppleLedgerFields(event, {
  userId,
  productId,
  purchaseDateIso,
  expirationIso,
  status,
  eventIds = [],
}) {
  const product = getAppleSubscriptionProduct(productId);
  const price = typeof event.price === 'number' ? event.price : 0;

  return {
    event_id: event.id || event.event_id || '',
    event_ids: eventIds,
    user_id: userId,
    app_user_id: event.app_user_id || '',
    original_app_user_id: event.original_app_user_id || '',
    product_id: productId,
    store: event.store || APPLE_STORE,
    environment: event.environment || 'PRODUCTION',
    transaction_id: event.transaction_id || '',
    original_transaction_id: event.original_transaction_id || event.transaction_id || '',
    event_type: event.type || '',
    purchase_date: purchaseDateIso,
    plan_expiration_date: expirationIso,
    status,
    product_name: product?.product_name || productId,
    amount: Math.abs(price),
    currency: event.currency || 'USD',
  };
}

// ── Apple App Store Aura Bundle consumables via RevenueCat / StoreKit ─────
// One-time consumable energy top-ups. NOT subscriptions: they never touch
// the generic plan / plan_expiration_date / subscription_* / monthly-energy
// fields. The grant mirrors the Wix payments-webhook Aura path exactly —
// additive aura_narration_energy / aura_manifestation_energy rollover pools
// computed from AURA_BUNDLES via getGrantForProduct in shared/plans.js.

/**
 * Apple product IDs (App Store Connect) for Aura Bundle consumables → the
 * existing Dashboard/Wix bundle id. Must match App Store Connect and the
 * RevenueCat product catalog. The iOS client purchases these via the
 * RevenueCat SDK as non-subscription (consumable) products.
 */
export const APPLE_AURA_PRODUCTS = {
  'com.ages.explorer.aura.flicker': {
    bundle_id: 'flicker',
    product_name: 'Aura Bundle — Flicker (150 Energy)',
  },
  'com.ages.explorer.aura.apparition': {
    bundle_id: 'apparition',
    product_name: 'Aura Bundle — Apparition (500 Energy)',
  },
  'com.ages.explorer.aura.haunting': {
    bundle_id: 'haunting',
    product_name: 'Aura Bundle — Haunting (1500 Energy)',
  },
  'com.ages.explorer.aura.spectral': {
    bundle_id: 'spectral',
    product_name: 'Aura Bundle — Spectral (2500 Energy)',
  },
};

export function getAppleAuraProduct(productId) {
  return APPLE_AURA_PRODUCTS[productId] || null;
}

export function isAppleAuraProduct(productId) {
  return Boolean(getAppleAuraProduct(productId));
}

/**
 * Consumable purchases arrive as NON_RENEWING_PURCHASE. INITIAL_PURCHASE is
 * accepted defensively; transaction-level idempotency prevents double grants.
 */
export const APPLE_AURA_GRANT_EVENT_TYPES = new Set([
  'NON_RENEWING_PURCHASE',
  'INITIAL_PURCHASE',
]);

/**
 * A consumable has no auto-renew to cancel, so a CANCELLATION event for an
 * Aura product can only be a store-support refund/revoke. REFUND is kept
 * defensively (not a current RevenueCat event type).
 */
export function isAppleAuraRefundEvent(event) {
  if (!event || typeof event !== 'object') return false;
  return event.type === 'CANCELLATION' || event.type === 'REFUND';
}

/**
 * Whether this RevenueCat event should be processed as an Apple Aura
 * consumable. Other stores / products / event types are ignored by the
 * caller (200, no grant).
 */
export function shouldProcessAppleAuraEvent(event) {
  if (!event || typeof event !== 'object') return false;
  if (event.type === 'TEST') return false;
  if (!isAppStore(event.store)) return false;
  if (!isAppleAuraProduct(event.product_id)) return false;
  return APPLE_AURA_GRANT_EVENT_TYPES.has(event.type) || isAppleAuraRefundEvent(event);
}

/**
 * Normalize a RevenueCat Apple Aura consumable event into ledger fields for
 * RevenueCatPurchase. Consumable rows use status 'paid' (like the Google
 * one-time product) and carry no plan_expiration_date — Aura energy never
 * expires.
 */
export function normalizeAppleAuraLedgerFields(event, {
  userId,
  purchaseDateIso,
  status,
  eventIds = [],
}) {
  const product = getAppleAuraProduct(event.product_id);
  const price = typeof event.price === 'number' ? event.price : 0;

  return {
    event_id: event.id || event.event_id || '',
    event_ids: eventIds,
    user_id: userId,
    app_user_id: event.app_user_id || '',
    original_app_user_id: event.original_app_user_id || '',
    product_id: event.product_id || '',
    store: event.store || APPLE_STORE,
    environment: event.environment || 'PRODUCTION',
    transaction_id: event.transaction_id || '',
    original_transaction_id: event.original_transaction_id || event.transaction_id || '',
    event_type: event.type || '',
    purchase_date: purchaseDateIso,
    plan_expiration_date: null,
    status,
    product_name: product?.product_name || event.product_id || '',
    amount: Math.abs(price),
    currency: event.currency || 'USD',
  };
}

/** Purchase event types that grant access for a non-renewing Play product. */
export const GRANT_EVENT_TYPES = new Set([
  'NON_RENEWING_PURCHASE',
  'INITIAL_PURCHASE',
]);

/** Refund / void event types that revoke a Google Trailblazer grant. */
export const REVOKE_EVENT_TYPES = new Set([
  'CANCELLATION',
  'REFUND',
]);

/**
 * Add calendar months in UTC, clamping the day when the target month is shorter
 * (e.g. Jan 31 + 1 month → Feb 28/29). Never drifts by local timezone.
 */
export function addCalendarMonthsUTC(dateInput, months) {
  const source = dateInput instanceof Date ? dateInput : new Date(dateInput);
  if (Number.isNaN(source.getTime())) {
    throw new Error('Invalid purchase date');
  }

  const year = source.getUTCFullYear();
  const month = source.getUTCMonth();
  const day = source.getUTCDate();
  const hours = source.getUTCHours();
  const minutes = source.getUTCMinutes();
  const seconds = source.getUTCSeconds();
  const ms = source.getUTCMilliseconds();

  const totalMonths = month + months;
  const targetYear = year + Math.floor(totalMonths / 12);
  const targetMonth = ((totalMonths % 12) + 12) % 12;
  const lastDayOfTarget = new Date(Date.UTC(targetYear, targetMonth + 1, 0)).getUTCDate();
  const clampedDay = Math.min(day, lastDayOfTarget);

  return new Date(Date.UTC(
    targetYear,
    targetMonth,
    clampedDay,
    hours,
    minutes,
    seconds,
    ms,
  ));
}

/** Compute Trailblazer expiry: purchase timestamp + 30 calendar months (UTC). */
export function computeGoogleTrailblazerExpiration(purchasedAtMs) {
  const purchaseDate = new Date(Number(purchasedAtMs));
  if (Number.isNaN(purchaseDate.getTime())) {
    throw new Error('Invalid purchased_at_ms');
  }
  return addCalendarMonthsUTC(purchaseDate, GOOGLE_TRAILBLAZER_DURATION_MONTHS);
}

export function isGoogleTrailblazerProduct(productId) {
  return productId === GOOGLE_TRAILBLAZER_PRODUCT_ID;
}

export function isPlayStore(store) {
  return store === GOOGLE_TRAILBLAZER_STORE;
}

/**
 * Whether this RevenueCat event should be processed by the Google Trailblazer webhook.
 * Apple / other stores / other products are ignored (200, no grant).
 */
export function shouldProcessGoogleTrailblazerEvent(event) {
  if (!event || typeof event !== 'object') return false;
  if (event.type === 'TEST') return false;
  if (!isPlayStore(event.store)) return false;
  if (!isGoogleTrailblazerProduct(event.product_id)) return false;
  return GRANT_EVENT_TYPES.has(event.type) || REVOKE_EVENT_TYPES.has(event.type);
}

/**
 * Resolve the Base44 user id from RevenueCat app_user_id.
 * Client configures Purchases with the Base44 user.id as appUserID.
 */
export function resolveAppUserId(event) {
  const candidates = [
    event?.app_user_id,
    event?.original_app_user_id,
  ].filter((id) => typeof id === 'string' && id.trim().length > 0);

  for (const id of candidates) {
    // Skip anonymous RevenueCat IDs — they cannot be mapped to Base44 users.
    if (id.startsWith('$RCAnonymousID:')) continue;
    return id.trim();
  }
  return null;
}

/**
 * Build isolated Google Trailblazer user field updates for a fresh grant.
 * Never touches generic plan / plan_expiration_date / subscription_* fields.
 */
export function buildGoogleTrailblazerGrantFields({
  expirationIso,
  manifestationEnergy,
  narrationEnergy,
  energyResetDate,
}) {
  return {
    google_trailblazer_expiration_date: expirationIso,
    google_trailblazer_manifestation_energy: manifestationEnergy,
    google_trailblazer_narration_energy: narrationEnergy,
    google_trailblazer_energy_reset_date: energyResetDate,
  };
}

/**
 * Recompute the latest non-refunded Google expiry from ledger rows.
 * Returns null when no paid Google grant remains.
 */
export function maxActiveGoogleExpiration(ledgerRows, now = new Date()) {
  let maxMs = null;
  for (const row of ledgerRows || []) {
    if (row.status !== 'paid') continue;
    if (!row.plan_expiration_date) continue;
    const exp = new Date(row.plan_expiration_date).getTime();
    if (Number.isNaN(exp)) continue;
    if (exp <= now.getTime()) continue;
    if (maxMs === null || exp > maxMs) maxMs = exp;
  }
  return maxMs === null ? null : new Date(maxMs).toISOString();
}

/**
 * Normalize a RevenueCat event into ledger fields for RevenueCatPurchase.
 */
export function normalizeLedgerFields(event, {
  userId,
  purchaseDateIso,
  expirationIso,
  status,
  eventIds = [],
}) {
  const price = typeof event.price === 'number' ? event.price : GOOGLE_TRAILBLAZER_PRICE;
  const currency = event.currency || GOOGLE_TRAILBLAZER_CURRENCY;

  return {
    event_id: event.id || event.event_id || '',
    event_ids: eventIds,
    user_id: userId,
    app_user_id: event.app_user_id || '',
    original_app_user_id: event.original_app_user_id || '',
    product_id: event.product_id || GOOGLE_TRAILBLAZER_PRODUCT_ID,
    store: event.store || GOOGLE_TRAILBLAZER_STORE,
    environment: event.environment || 'PRODUCTION',
    transaction_id: event.transaction_id || '',
    original_transaction_id: event.original_transaction_id || event.transaction_id || '',
    event_type: event.type || '',
    purchase_date: purchaseDateIso,
    plan_expiration_date: expirationIso,
    status,
    product_name: GOOGLE_TRAILBLAZER_PRODUCT_NAME,
    amount: Math.abs(price),
    currency,
  };
}
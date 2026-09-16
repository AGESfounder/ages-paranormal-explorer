// Google Play Trailblazer via RevenueCat — product constants and grant helpers.
// Apple entitlement mapping stays untouched; this module only handles the
// unmapped Play one-time product and app-owned 30-month expiry.

export const GOOGLE_TRAILBLAZER_PRODUCT_ID = 'trailblazer.30month';
export const APPLE_TRAILBLAZER_PRODUCT_ID = 'com.ages.explorer.trailblazer.30month';
export const TRAILBLAZER_ENTITLEMENT_ID = 'trailblazer';
export const GOOGLE_TRAILBLAZER_DURATION_MONTHS = 30;
export const GOOGLE_TRAILBLAZER_STORE = 'PLAY_STORE';
export const GOOGLE_TRAILBLAZER_PRICE = 239.99;
export const GOOGLE_TRAILBLAZER_CURRENCY = 'USD';
export const GOOGLE_TRAILBLAZER_PRODUCT_NAME =
  'AGES Trailblazer — 30-Month Elite (Google Play)';

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
// RevenueCat Capacitor client for AGES Explorer.
// - Web: no-op (Wix checkout remains the web path)
// - iOS: purchase Explorer/Investigator/Seeker/Technician subscriptions and
//   Aura Bundle consumables via StoreKit (Apple product IDs below), plus the
//   one-time Trailblazer product (non-subscription). Wix remains the web
//   Trailblazer path.
// - Android: purchase Google Play Explorer/Investigator/Seeker/Technician
//   subscriptions (Play subscription products explorer / investigator /
//   seeker / technician with base plans monthly / annual), the Google Play
//   one-time product trailblazer.30month, and the Google Play one-time Aura
//   Bundle products (bare Play IDs flicker / apparition / haunting /
//   spectral). Web subscriptions and web Aura bundles stay on the Wix path.
//
// Access is NEVER granted from CustomerInfo entitlements here. Base44 webhook
// writes the generic plan fields (Apple + Google Play subscriptions) /
// aura_*_energy fields (Apple Aura consumables + Google Play Aura one-time
// products) / google_trailblazer_* fields (Google Trailblazer one-time); the
// client reloads auth.me() after purchase.

import { Capacitor } from '@capacitor/core';
import { Purchases, PRODUCT_CATEGORY, LOG_LEVEL, PURCHASES_ERROR_CODE } from '@revenuecat/purchases-capacitor';
import { hashIosDiagId, recordIosPurchaseDiagnostic } from '@/lib/iosPurchaseDiagnostics';
import { isRecurringPlanGrantReflected } from '@/lib/access';

/** Google Play product ID — must match Play Console + RevenueCat catalog. */
export const GOOGLE_TRAILBLAZER_PRODUCT_ID = 'trailblazer.30month';

/** Apple App Store one-time Trailblazer product ID, purchased only on native iOS. */
export const APPLE_TRAILBLAZER_PRODUCT_ID = 'com.ages.explorer.trailblazer.30month';

/** Existing Apple entitlement ID — do not use to grant Google access. */
export const TRAILBLAZER_ENTITLEMENT_ID = 'trailblazer';

/**
 * Apple App Store product IDs (App Store Connect) for iOS
 * Explorer/Investigator/Seeker/Technician subscriptions, keyed by the
 * Dashboard product id. Must match the RevenueCat product catalog.
 * Purchased only on native iOS.
 */
export const APPLE_SUBSCRIPTION_PRODUCT_IDS = {
  explorer_monthly: 'com.ages.explorer.explorer.monthly',
  explorer_annual: 'com.ages.explorer.explorer.annual',
  investigator_monthly: 'com.ages.explorer.investigator.monthly',
  investigator_annual: 'com.ages.explorer.investigator.annual',
  seeker_monthly: 'com.ages.explorer.seeker.monthly',
  seeker_annual: 'com.ages.explorer.seeker.annual',
  technician_monthly: 'com.ages.explorer.technician.monthly',
  technician_annual: 'com.ages.explorer.technician.annual',
};

/** Base44 plan granted by the webhook for each iOS subscription product. */
export const APPLE_SUBSCRIPTION_PLAN_IDS = {
  explorer_monthly: 'explorer',
  explorer_annual: 'explorer',
  investigator_monthly: 'investigator',
  investigator_annual: 'investigator',
  seeker_monthly: 'seeker',
  seeker_annual: 'seeker',
  technician_monthly: 'technician',
  technician_annual: 'technician',
};

/** True when a Dashboard product id is an iOS App Store subscription. */
export function isAppleSubscriptionCheckout(productId) {
  return Object.prototype.hasOwnProperty.call(APPLE_SUBSCRIPTION_PRODUCT_IDS, productId);
}

/** Plan id the Base44 webhook grants for a Dashboard subscription product id. */
export function getAppleSubscriptionPlanId(productId) {
  return APPLE_SUBSCRIPTION_PLAN_IDS[productId] || null;
}

/**
 * Google Play subscription products (Play Console) for Android
 * Explorer/Investigator/Seeker/Technician subscriptions, keyed by the
 * Dashboard product id. Each Play subscription product (explorer /
 * investigator / seeker / technician) carries two Active base plans
 * (monthly / annual); RevenueCat reports the purchased product as
 * '<product>:<basePlan>' (e.g. explorer:monthly) in webhook events.
 * Purchased only on native Android by selecting the exact base plan as a
 * SubscriptionOption. Must match Play Console and the RevenueCat catalog.
 */
export const GOOGLE_SUBSCRIPTION_PRODUCTS = {
  explorer_monthly: { playProductId: 'explorer', basePlanId: 'monthly' },
  explorer_annual: { playProductId: 'explorer', basePlanId: 'annual' },
  investigator_monthly: { playProductId: 'investigator', basePlanId: 'monthly' },
  investigator_annual: { playProductId: 'investigator', basePlanId: 'annual' },
  seeker_monthly: { playProductId: 'seeker', basePlanId: 'monthly' },
  seeker_annual: { playProductId: 'seeker', basePlanId: 'annual' },
  technician_monthly: { playProductId: 'technician', basePlanId: 'monthly' },
  technician_annual: { playProductId: 'technician', basePlanId: 'annual' },
};

/** Base44 plan granted by the webhook for each Android subscription product. */
export const GOOGLE_SUBSCRIPTION_PLAN_IDS = {
  explorer_monthly: 'explorer',
  explorer_annual: 'explorer',
  investigator_monthly: 'investigator',
  investigator_annual: 'investigator',
  seeker_monthly: 'seeker',
  seeker_annual: 'seeker',
  technician_monthly: 'technician',
  technician_annual: 'technician',
};

/** True when a Dashboard product id is an Android Google Play subscription. */
export function isGoogleSubscriptionCheckout(productId) {
  return Object.prototype.hasOwnProperty.call(GOOGLE_SUBSCRIPTION_PRODUCTS, productId);
}

/** Plan id the Base44 webhook grants for a Dashboard subscription product id. */
export function getGoogleSubscriptionPlanId(productId) {
  return GOOGLE_SUBSCRIPTION_PLAN_IDS[productId] || null;
}

/**
 * Google Play product IDs (Play Console) for Android Aura Bundle one-time
 * products, keyed by the Dashboard bundle id. These are the exact bare Play
 * product IDs — deliberately different from the Apple
 * com.ages.explorer.aura.* consumable IDs. Purchased only on native Android
 * as NON_SUBSCRIPTION products. Must match Play Console and the RevenueCat
 * product catalog. Web keeps the Wix path for these bundles; iOS uses the
 * Apple consumables below.
 */
export const GOOGLE_AURA_PRODUCT_IDS = {
  flicker: 'flicker',
  apparition: 'apparition',
  haunting: 'haunting',
  spectral: 'spectral',
};

/** True when a Dashboard product id is an Android Google Play Aura one-time product. */
export function isGoogleAuraCheckout(productId) {
  return Object.prototype.hasOwnProperty.call(GOOGLE_AURA_PRODUCT_IDS, productId);
}

/**
 * Apple App Store product IDs (App Store Connect) for iOS Aura Bundle
 * consumables, keyed by the Dashboard bundle id. Must match the RevenueCat
 * product catalog. Purchased only on native iOS as StoreKit consumables —
 * never as subscriptions. Web keeps the Wix path for these bundles; Android
 * uses the Google Play one-time products above.
 */
export const APPLE_AURA_PRODUCT_IDS = {
  flicker: 'com.ages.explorer.aura.flicker',
  apparition: 'com.ages.explorer.aura.apparition',
  haunting: 'com.ages.explorer.aura.haunting',
  spectral: 'com.ages.explorer.aura.spectral',
};

/** True when a Dashboard product id is an iOS App Store Aura consumable. */
export function isAppleAuraCheckout(productId) {
  return Object.prototype.hasOwnProperty.call(APPLE_AURA_PRODUCT_IDS, productId);
}

let configured = false;
let configuring = null;
let currentAppUserId = null;

function isNative() {
  try {
    return Capacitor.isNativePlatform();
  } catch {
    return false;
  }
}

export function getNativePlatform() {
  try {
    return Capacitor.getPlatform();
  } catch {
    return 'web';
  }
}

export function isAndroidNative() {
  return isNative() && getNativePlatform() === 'android';
}

export function isIosNative() {
  return isNative() && getNativePlatform() === 'ios';
}

/* ── iOS purchase diagnostics ──────────────────────────────────────────────
 * Structured, searchable diagnostics for the native iOS RECURRING
 * SUBSCRIPTION flow only (purchaseAppleSubscription, plus the Dashboard grant
 * poll). Search console output for the [AGES_IOS_PURCHASE_DIAG] prefix.
 *
 * Privacy: raw user ids, RevenueCat customer ids, and transaction ids are
 * NEVER logged — they pass through hashIosDiagId() first (deterministic
 * redaction for cross-line correlation). Product and plan ids are public
 * store/configuration identifiers and are logged in full. Emails, receipts,
 * tokens, API keys, and raw customerInfo objects are never written. The
 * emitter is hard-gated on isIosNative() so Android/web paths stay silent,
 * and diagnostics never alter return values, branching, or purchase behavior.
 */
const IOS_PURCHASE_DIAG_PREFIX = '[AGES_IOS_PURCHASE_DIAG]';

// NOTE: hashIosDiagId now lives in src/lib/iosPurchaseDiagnostics.js (same
// FNV-1a token, shared with the Base44 record function and the Admin
// dashboard query). It is imported above and used exactly as before —
// deterministic redaction for cross-line correlation, never a raw id.

/**
 * Emit one structured iOS purchase diagnostic line. No-ops unless running as
 * a native iOS app, so these logs can never fire on Android or web.
 *
 * Persistence handoff: after the identical console output, the event is also
 * passed to src/lib/iosPurchaseDiagnostics.js, which sanitizes it to a fixed
 * allowlist and queues it for durable, best-effort upload to the
 * record-ios-purchase-diagnostic Base44 function (survives app close;
 * reviewable in Admin → Users). The handoff is fire-and-forget and fully
 * fail-safe, so purchase results, branching, and timing are unchanged.
 *
 * @param {'info' | 'warn' | 'error'} level info = successful milestone,
 *   warn = expected cancellation/unavailable case, error = actual failure
 * @param {string} event stable, searchable event name
 * @param {Record<string, unknown>} [details] structured, pre-redacted fields
 */
export function iosPurchaseDiag(level, event, details) {
  if (!isIosNative()) return;
  const line = `${IOS_PURCHASE_DIAG_PREFIX} event=${event}`;
  const payload = details || {};
  if (level === 'error') {
    console.error(line, payload);
  } else if (level === 'warn') {
    console.warn(line, payload);
  } else {
    console.info(line, payload);
  }
  try {
    // Best-effort durable reporting — never awaited, never throws.
    recordIosPurchaseDiagnostic(level, event, payload);
  } catch {
    // diagnostics must never disturb the purchase flow
  }
}

/**
 * Log a redacted snapshot of the current RevenueCat customer — diagnostic
 * only, never used to grant or deny anything (the Base44 webhook remains the
 * entitlement authority). Uses the purchases-capacitor isAnonymous() and
 * getCustomerInfo() APIs; every call is wrapped so this helper can never
 * throw into the purchase flow (callers also .catch() defensively).
 *
 * @param {string} event diagnostic event name for this snapshot
 */
async function logIosCustomerSnapshot(event) {
  /** @type {boolean | null} */
  let anonymous = null;
  try {
    const anon = await Purchases.isAnonymous();
    anonymous = anon ? anon.isAnonymous : null;
  } catch (anonError) {
    iosPurchaseDiag('warn', `${event}.anonymous_status`, {
      ok: false,
      errorMessage: /** @type {any} */ (anonError)?.message || String(anonError),
    });
  }
  try {
    const { customerInfo } = await Purchases.getCustomerInfo();
    iosPurchaseDiag('info', event, {
      ok: true,
      anonymous,
      rcCustomerIdHash: hashIosDiagId(customerInfo?.originalAppUserId),
      activeEntitlementIds: Object.keys(customerInfo?.entitlements?.active || {}),
    });
  } catch (customerError) {
    // Customer-info refresh errors are reported, not swallowed — but only as
    // diagnostics; the purchase result is unaffected.
    iosPurchaseDiag('error', event, {
      ok: false,
      stage: 'getCustomerInfo',
      anonymous,
      errorMessage: /** @type {any} */ (customerError)?.message || String(customerError),
    });
  }
}

function getApiKey() {
  const platform = getNativePlatform();
  // Vite injects import.meta.env at build time (typed loosely for checkJs)
  const env = /** @type {{ env?: Record<string, string | undefined> }} */ (/** @type {unknown} */ (import.meta)).env || {};
  if (platform === 'ios') {
    return env.VITE_REVENUECAT_IOS_API_KEY || '';
  }
  if (platform === 'android') {
    return env.VITE_REVENUECAT_ANDROID_API_KEY || '';
  }
  return '';
}

/**
 * Configure RevenueCat once on native platforms.
 * Safe to call repeatedly; web is a no-op.
 */
export async function configureRevenueCat(appUserID) {
  if (!isNative()) return { ok: false, reason: 'web' };

  const apiKey = getApiKey();
  if (!apiKey) {
    console.warn('[revenuecat] Missing API key for platform', getNativePlatform());
    return { ok: false, reason: 'missing_key' };
  }

  if (configured && currentAppUserId && appUserID && currentAppUserId === appUserID) {
    return { ok: true, already: true };
  }

  if (configuring) return configuring;

  configuring = (async () => {
    try {
      try {
        await Purchases.setLogLevel({ level: LOG_LEVEL.WARN });
      } catch {
        // log level is optional
      }

      const config = { apiKey };
      if (appUserID) {
        config.appUserID = String(appUserID);
      }

      await Purchases.configure(config);
      configured = true;
      currentAppUserId = appUserID ? String(appUserID) : currentAppUserId;
      return { ok: true };
    } catch (e) {
      console.error('[revenuecat] configure failed:', e);
      return { ok: false, reason: 'configure_failed', error: e };
    } finally {
      configuring = null;
    }
  })();

  return configuring;
}

/**
 * Identify the RevenueCat customer with the Base44 user id.
 * Call after auth; required so webhooks can map app_user_id → User.
 */
export async function identifyRevenueCatUser(userId) {
  if (!isNative() || !userId) return { ok: false, reason: 'skip' };

  const ready = await configureRevenueCat(userId);
  if (!ready.ok && ready.reason !== 'missing_key') {
    // Still try logIn if configure partially succeeded
  }
  if (!configured && !ready.ok) return ready;

  try {
    if (currentAppUserId === String(userId)) {
      return { ok: true, already: true };
    }
    const result = await Purchases.logIn({ appUserID: String(userId) });
    currentAppUserId = String(userId);
    return { ok: true, result };
  } catch (e) {
    console.error('[revenuecat] logIn failed:', e);
    return { ok: false, reason: 'login_failed', error: e };
  }
}

/** Clear RevenueCat identity on logout (native only). */
export async function resetRevenueCatUser() {
  if (!isNative() || !configured) {
    currentAppUserId = null;
    return { ok: true };
  }
  try {
    await Purchases.logOut();
  } catch (e) {
    // logOut fails when already anonymous — ignore
    console.warn('[revenuecat] logOut:', e?.message || e);
  }
  currentAppUserId = null;
  return { ok: true };
}

function isUserCancelled(error) {
  if (!error) return false;
  if (error.userCancelled === true) return true;
  const code = error.code ?? error.errorCode;
  if (code === PURCHASES_ERROR_CODE.PURCHASE_CANCELLED_ERROR) return true;
  if (code === '1' || code === 1) return true;
  const msg = String(error.message || '').toLowerCase();
  return msg.includes('cancelled') || msg.includes('canceled');
}

/**
 * Purchase Google Play Trailblazer one-time product via RevenueCat.
 * Android only. Does NOT grant access locally — caller must poll base44.auth.me().
 *
 * @returns {Promise<{ ok: boolean, cancelled?: boolean, error?: any, reason?: string, purchase?: any, product?: any }>}
 */
export async function purchaseGoogleTrailblazer(userId) {
  if (!isAndroidNative()) {
    return { ok: false, reason: 'not_android' };
  }

  if (userId) {
    await identifyRevenueCatUser(userId);
  } else {
    const ready = await configureRevenueCat();
    if (!ready.ok) return { ok: false, reason: ready.reason || 'not_configured' };
  }

  if (!configured) {
    return { ok: false, reason: 'not_configured' };
  }

  try {
    const { products } = await Purchases.getProducts({
      productIdentifiers: [GOOGLE_TRAILBLAZER_PRODUCT_ID],
      type: PRODUCT_CATEGORY.NON_SUBSCRIPTION,
    });

    const product = (products || []).find((p) => p.identifier === GOOGLE_TRAILBLAZER_PRODUCT_ID)
      || (products || [])[0];

    if (!product) {
      return {
        ok: false,
        reason: 'product_unavailable',
        error: new Error(
          `Product ${GOOGLE_TRAILBLAZER_PRODUCT_ID} is not available. Check Google Play and RevenueCat configuration.`,
        ),
      };
    }

    const result = await Purchases.purchaseStoreProduct({ product });
    // Intentionally ignore result.customerInfo.entitlements — Google product is
    // unmapped from the trailblazer entitlement; server webhook is authoritative.
    return { ok: true, purchase: result, product };
  } catch (e) {
    if (isUserCancelled(e)) {
      return { ok: false, cancelled: true };
    }
    console.error('[revenuecat] purchase failed:', e);
    return { ok: false, reason: 'purchase_failed', error: e };
  }
}

/**
 * Purchase an Android Explorer/Investigator/Seeker/Technician subscription
 * via RevenueCat / Google Play Billing. Native Android only. Fetches the
 * Play subscription product, selects the exact base plan (monthly / annual)
 * as a SubscriptionOption, and purchases it with purchaseSubscriptionOption —
 * purchaseStoreProduct would buy Google's default base plan instead of the
 * one the user chose. Does NOT grant access locally: the Base44 webhook
 * writes the generic plan fields; the caller must poll base44.auth.me()
 * afterwards.
 *
 * @param {string} productId Dashboard product id (explorer_monthly, explorer_annual, investigator_monthly, investigator_annual, seeker_monthly, seeker_annual, technician_monthly, technician_annual)
 * @param {string} [userId] Base44 user id used as the RevenueCat appUserID
 * @returns {Promise<{ ok: boolean, cancelled?: boolean, error?: any, reason?: string, purchase?: any, product?: any, subscriptionOption?: any }>}
 */
export async function purchaseGoogleSubscription(productId, userId) {
  if (!isAndroidNative()) {
    return { ok: false, reason: 'not_android' };
  }

  const mapping = GOOGLE_SUBSCRIPTION_PRODUCTS[productId];
  if (!mapping) {
    return { ok: false, reason: 'unknown_product' };
  }
  const { playProductId, basePlanId } = mapping;

  if (userId) {
    await identifyRevenueCatUser(userId);
  } else {
    const ready = await configureRevenueCat();
    if (!ready.ok) return { ok: false, reason: ready.reason || 'not_configured' };
  }

  if (!configured) {
    return { ok: false, reason: 'not_configured' };
  }

  try {
    const { products } = await Purchases.getProducts({
      productIdentifiers: [`${playProductId}:${basePlanId}`],
      type: PRODUCT_CATEGORY.SUBSCRIPTION,
    });

    const requestedProductId = `${playProductId}:${basePlanId}`;
    const product = (products || []).find((p) => p.identifier === requestedProductId);

    if (!product) {
      return {
        ok: false,
        reason: 'product_unavailable',
        error: new Error(
          `Product ${playProductId} is not available. Check Google Play and RevenueCat configuration.`,
        ),
      };
    }

    // Google Play subscriptions expose their base plans as
    // subscriptionOptions: a base plan option has isBasePlan true and
    // id === basePlanId (paid offers use 'basePlanId:offerId'). Select the
    // exact base plan — never fall back to the product's default option.
    const options = product.subscriptionOptions || [];
    const subscriptionOption =
      options.find((o) => o && o.isBasePlan && o.id === basePlanId)
      || options.find((o) => o && o.storeProductId === `${playProductId}:${basePlanId}`);

    if (!subscriptionOption) {
      return {
        ok: false,
        reason: 'product_unavailable',
        error: new Error(
          `Base plan ${playProductId}:${basePlanId} is not available. Check Google Play and RevenueCat configuration.`,
        ),
      };
    }

    const result = await Purchases.purchaseSubscriptionOption({ subscriptionOption });
    // Intentionally ignore result.customerInfo.entitlements — the Base44
    // webhook is authoritative for plan grants.
    return { ok: true, purchase: result, product, subscriptionOption };
  } catch (e) {
    if (isUserCancelled(e)) {
      return { ok: false, cancelled: true };
    }
    console.error('[revenuecat] Google subscription purchase failed:', e);
    return { ok: false, reason: 'purchase_failed', error: e };
  }
}

/**
 * Purchase an Android Aura Bundle one-time product via RevenueCat / Google
 * Play Billing. Native Android only. Uses the NON_SUBSCRIPTION product
 * category — Aura bundles are consumable-style one-time products, never
 * subscriptions. Selects the exact returned product by its bare Play
 * identifier and fails closed when the store does not return it (no fallback
 * to a different product). Does NOT grant energy locally: the Base44 webhook
 * adds aura_*_energy; the caller must poll base44.auth.me() afterwards.
 *
 * @param {string} productId Dashboard bundle id (flicker, apparition, haunting, spectral)
 * @param {string} [userId] Base44 user id used as the RevenueCat appUserID
 * @returns {Promise<{ ok: boolean, cancelled?: boolean, error?: any, reason?: string, purchase?: any, product?: any }>}
 */
export async function purchaseGoogleAuraBundle(productId, userId) {
  if (!isAndroidNative()) {
    return { ok: false, reason: 'not_android' };
  }

  const playProductId = GOOGLE_AURA_PRODUCT_IDS[productId];
  if (!playProductId) {
    return { ok: false, reason: 'unknown_product' };
  }

  if (userId) {
    await identifyRevenueCatUser(userId);
  } else {
    const ready = await configureRevenueCat();
    if (!ready.ok) return { ok: false, reason: ready.reason || 'not_configured' };
  }

  if (!configured) {
    return { ok: false, reason: 'not_configured' };
  }

  try {
    // One-time product → NON_SUBSCRIPTION product category (never SUBSCRIPTION).
    const { products } = await Purchases.getProducts({
      productIdentifiers: [playProductId],
      type: PRODUCT_CATEGORY.NON_SUBSCRIPTION,
    });

    // Exact identifier match only — never fall back to a different product.
    const product = (products || []).find((p) => p.identifier === playProductId);

    if (!product) {
      return {
        ok: false,
        reason: 'product_unavailable',
        error: new Error(
          `Product ${playProductId} is not available. Check Google Play and RevenueCat configuration.`,
        ),
      };
    }

    const result = await Purchases.purchaseStoreProduct({ product });
    // Intentionally ignore result.customerInfo.entitlements — Aura one-time
    // products map to no entitlement; the Base44 webhook is authoritative.
    return { ok: true, purchase: result, product };
  } catch (e) {
    if (isUserCancelled(e)) {
      return { ok: false, cancelled: true };
    }
    console.error('[revenuecat] Google Aura purchase failed:', e);
    return { ok: false, reason: 'purchase_failed', error: e };
  }
}

/**
 * Poll base44.auth.me until Google Trailblazer grant appears (or timeout).
 * Used after a successful SDK purchase while waiting for the webhook.
 */
export async function waitForGoogleTrailblazerGrant(fetchUser, {
  timeoutMs = 30000,
  intervalMs = 1500,
} = {}) {
  const started = Date.now();
  let lastUser = null;

  while (Date.now() - started < timeoutMs) {
    try {
      lastUser = await fetchUser();
      const exp = lastUser?.google_trailblazer_expiration_date;
      if (exp && new Date(exp).getTime() > Date.now()) {
        return { ok: true, user: lastUser };
      }
    } catch (e) {
      console.warn('[revenuecat] grant poll error:', e);
    }
    await new Promise((r) => setTimeout(r, intervalMs));
  }

  return { ok: false, reason: 'timeout', user: lastUser };
}

/**
 * Purchase an iOS Explorer/Investigator/Seeker/Technician subscription via
 * RevenueCat/StoreKit. Native iOS only. Does NOT grant access locally — the
 * Base44 webhook writes the plan fields; the caller must poll
 * base44.auth.me() afterwards.
 *
 * @param {string} productId Dashboard product id (explorer_monthly, explorer_annual, investigator_monthly, investigator_annual, seeker_monthly, seeker_annual, technician_monthly, technician_annual)
 * @param {string} [userId] Base44 user id used as the RevenueCat appUserID
 * @returns {Promise<{ ok: boolean, cancelled?: boolean, error?: any, reason?: string, purchase?: any, product?: any }>}
 */
export async function purchaseAppleSubscription(productId, userId) {
  if (!isIosNative()) {
    return { ok: false, reason: 'not_ios' };
  }

  const appleProductId = APPLE_SUBSCRIPTION_PRODUCT_IDS[productId];
  if (!appleProductId) {
    return { ok: false, reason: 'unknown_product' };
  }

  // [DIAG] Before the store product request: which native iOS subscription
  // path, the logical Dashboard product/plan id, and the exact Apple product
  // id that will be passed to RevenueCat. (Diagnostic points 1.)
  iosPurchaseDiag('info', 'subscription.begin', {
    path: 'ios_native_subscription',
    dashboardProductId: productId,
    planId: getAppleSubscriptionPlanId(productId),
    appleProductId,
  });

  if (userId) {
    // Behavior preserved: the identify result does not gate the flow; it is
    // only observed for diagnostics. (Diagnostic point 3.)
    const identity = /** @type {{ ok?: boolean, already?: boolean, reason?: string } | undefined} */ (
      await identifyRevenueCatUser(userId)
    );
    iosPurchaseDiag(identity && identity.ok ? 'info' : 'error', 'identity.result', {
      ok: Boolean(identity && identity.ok),
      alreadyIdentified: Boolean(identity && identity.already),
      reason: (identity && identity.reason) || null,
      userIdHash: hashIosDiagId(userId),
    });
    // Safe anonymous / current-customer status via the purchases-capacitor
    // isAnonymous() + getCustomerInfo() APIs (ids redacted). Defensive
    // .catch() — diagnostics must never disturb the flow.
    await logIosCustomerSnapshot('identity.customer').catch(() => {});
  } else {
    const ready = await configureRevenueCat();
    if (!ready.ok) {
      iosPurchaseDiag('error', 'identity.result', {
        ok: false,
        identified: false,
        reason: ready.reason || 'not_configured',
      });
      return { ok: false, reason: ready.reason || 'not_configured' };
    }
  }

  if (!configured) {
    iosPurchaseDiag('error', 'identity.result', {
      ok: false,
      identified: Boolean(userId),
      reason: 'not_configured',
    });
    return { ok: false, reason: 'not_configured' };
  }

  try {
    // Diagnostics-only stage wrappers: each inner catch logs at the actual
    // failure point and rethrows the SAME error, so the outer catch and every
    // return value/branch behave exactly as before.
    let products;
    try {
      ({ products } = await Purchases.getProducts({
        productIdentifiers: [appleProductId],
        type: PRODUCT_CATEGORY.SUBSCRIPTION,
      }));
    } catch (getProductsError) {
      // getProducts failed — actual failure logged at its origin. (Point 2.)
      iosPurchaseDiag('error', 'products.result', {
        ok: false,
        outcome: 'get_failed',
        appleProductId,
        errorCode: /** @type {any} */ (getProductsError)?.code ?? null,
        errorMessage: /** @type {any} */ (getProductsError)?.message || String(getProductsError),
      });
      throw getProductsError;
    }

    // Exact identifier match only — never fall back to a different product.
    const product = (products || []).find((p) => p.identifier === appleProductId);
    const returnedProductIds = (products || []).map((p) => p?.identifier).filter(Boolean);

    if (!product) {
      // Existing product_unavailable outcome, unchanged — the exact-match
      // contract above is preserved (no products[0] fallback). (Point 2.)
      iosPurchaseDiag('warn', 'products.result', {
        ok: true,
        outcome: 'product_unavailable',
        appleProductId,
        returnedCount: returnedProductIds.length,
        returnedProductIds,
        exactMatch: false,
      });
      return {
        ok: false,
        reason: 'product_unavailable',
        error: new Error(
          `Product ${appleProductId} is not available. Check App Store Connect and RevenueCat configuration.`,
        ),
      };
    }

    iosPurchaseDiag('info', 'products.result', {
      ok: true,
      outcome: 'matched',
      appleProductId,
      returnedCount: returnedProductIds.length,
      returnedProductIds,
      exactMatch: true,
    });

    // [DIAG] StoreKit purchase about to start via RevenueCat
    // purchaseStoreProduct(). (Diagnostic point 4.)
    iosPurchaseDiag('info', 'purchase.start', {
      appleProductId,
      via: 'purchaseStoreProduct',
    });
    let result;
    try {
      result = await Purchases.purchaseStoreProduct({ product });
    } catch (purchaseError) {
      const cancelled = isUserCancelled(purchaseError);
      // User cancellation = expected case (warn); anything else = actual
      // failure (error). The error is rethrown unchanged below.
      iosPurchaseDiag(cancelled ? 'warn' : 'error', 'purchase.result', {
        ok: false,
        outcome: cancelled ? 'cancelled' : 'error',
        appleProductId,
        errorCode: /** @type {any} */ (purchaseError)?.code ?? null,
        errorMessage: /** @type {any} */ (purchaseError)?.message || String(purchaseError),
      });
      throw purchaseError;
    }

    const purchaseActiveEntitlementIds = Object.keys(result?.customerInfo?.entitlements?.active || {});
    // Success — product identifier in full (public), transaction identifier
    // redacted, and whether the returned customerInfo carries any active
    // entitlements (identifiers only; customerInfo itself is never logged).
    iosPurchaseDiag('info', 'purchase.result', {
      ok: true,
      outcome: 'success',
      appleProductId,
      returnedProductIdentifier: result?.productIdentifier || null,
      transactionIdHash: hashIosDiagId(result?.transaction?.transactionIdentifier),
      customerInfoAvailable: Boolean(result?.customerInfo),
      activeEntitlementIds: purchaseActiveEntitlementIds,
      hasActiveEntitlement: purchaseActiveEntitlementIds.length > 0,
    });

    // [DIAG] Post-purchase customer-info refresh — redacted current customer
    // id + active entitlement identifiers; refresh errors are logged, never
    // thrown. Entitlement authority stays with the Base44 webhook. (Point 5.)
    await logIosCustomerSnapshot('customer.post_purchase').catch(() => {});

    // Intentionally ignore result.customerInfo.entitlements — the Base44
    // webhook is authoritative for plan grants.
    return { ok: true, purchase: result, product };
  } catch (e) {
    if (isUserCancelled(e)) {
      return { ok: false, cancelled: true };
    }
    console.error('[revenuecat] Apple purchase failed:', e);
    return { ok: false, reason: 'purchase_failed', error: e };
  }
}

/**
 * Purchase an iOS Aura Bundle consumable via RevenueCat/StoreKit.
 * Native iOS only. Uses the non-subscription StoreKit product category —
 * consumables are never purchased through the subscription path. Does NOT
 * grant energy locally: the Base44 webhook adds aura_*_energy; the caller
 * must poll base44.auth.me() afterwards.
 *
 * @param {string} productId Dashboard bundle id (flicker, apparition, haunting, spectral)
 * @param {string} [userId] Base44 user id used as the RevenueCat appUserID
 * @returns {Promise<{ ok: boolean, cancelled?: boolean, error?: any, reason?: string, purchase?: any, product?: any }>}
 */
export async function purchaseAppleAuraBundle(productId, userId) {
  if (!isIosNative()) {
    return { ok: false, reason: 'not_ios' };
  }

  const appleProductId = APPLE_AURA_PRODUCT_IDS[productId];
  if (!appleProductId) {
    return { ok: false, reason: 'unknown_product' };
  }

  if (userId) {
    await identifyRevenueCatUser(userId);
  } else {
    const ready = await configureRevenueCat();
    if (!ready.ok) return { ok: false, reason: ready.reason || 'not_configured' };
  }

  if (!configured) {
    return { ok: false, reason: 'not_configured' };
  }

  try {
    // Consumable → NON_SUBSCRIPTION product category (never SUBSCRIPTION).
    const { products } = await Purchases.getProducts({
      productIdentifiers: [appleProductId],
      type: PRODUCT_CATEGORY.NON_SUBSCRIPTION,
    });

    const product = (products || []).find((p) => p.identifier === appleProductId)
      || (products || [])[0];

    if (!product) {
      return {
        ok: false,
        reason: 'product_unavailable',
        error: new Error(
          `Product ${appleProductId} is not available. Check App Store Connect and RevenueCat configuration.`,
        ),
      };
    }

    const result = await Purchases.purchaseStoreProduct({ product });
    // Intentionally ignore result.customerInfo.entitlements — Aura
    // consumables map to no entitlement; the Base44 webhook is authoritative.
    return { ok: true, purchase: result, product };
  } catch (e) {
    if (isUserCancelled(e)) {
      return { ok: false, cancelled: true };
    }
    console.error('[revenuecat] Apple Aura purchase failed:', e);
    return { ok: false, reason: 'purchase_failed', error: e };
  }
}

/**
 * Restore purchases on iOS (required by App Store review). RevenueCat syncs
 * the App Store receipt; transactions not seen before fire webhook events
 * that update Base44. Already-known transactions produce no new webhook, so
 * callers should reload the user regardless of the poll outcome.
 *
 * @param {string} [userId] Base44 user id used as the RevenueCat appUserID
 * @returns {Promise<{ ok: boolean, error?: any, reason?: string, restore?: any }>}
 */
export async function restoreApplePurchases(userId) {
  if (!isIosNative()) {
    return { ok: false, reason: 'not_ios' };
  }

  if (userId) {
    await identifyRevenueCatUser(userId);
  } else {
    const ready = await configureRevenueCat();
    if (!ready.ok) return { ok: false, reason: ready.reason || 'not_configured' };
  }

  if (!configured) {
    return { ok: false, reason: 'not_configured' };
  }

  try {
    const result = await Purchases.restorePurchases();
    return { ok: true, restore: result };
  } catch (e) {
    console.error('[revenuecat] restore failed:', e);
    return { ok: false, reason: 'restore_failed', error: e };
  }
}

/**
 * Poll base44.auth.me until the Apple subscription grant appears (or timeout).
 * The webhook sets plan plus a future plan_expiration_date; requiring both
 * avoids matching a pre-existing Wix grant (which has no expiration date).
 *
 * @param {() => Promise<any>} fetchUser
 * @param {{ expectedPlanId?: string | null, timeoutMs?: number, intervalMs?: number }} [options]
 * @returns {Promise<{ ok: boolean, reason?: string, user?: any }>}
 */
export async function waitForApplePlanGrant(fetchUser, {
  expectedPlanId,
  timeoutMs = 30000,
  intervalMs = 1500,
} = {}) {
  return pollForPlanGrant(fetchUser, {
    expectedPlanId,
    timeoutMs,
    intervalMs,
    logLabel: 'Apple',
  });
}

/**
 * Poll base44.auth.me until the Google Play subscription grant appears (or
 * timeout). The webhook writes the same generic plan fields as Apple (plan
 * plus a future plan_expiration_date), so the poll semantics are identical.
 *
 * @param {() => Promise<any>} fetchUser
 * @param {{ expectedPlanId?: string | null, timeoutMs?: number, intervalMs?: number }} [options]
 * @returns {Promise<{ ok: boolean, reason?: string, user?: any }>}
 */
export async function waitForGooglePlanGrant(fetchUser, {
  expectedPlanId,
  timeoutMs = 30000,
  intervalMs = 1500,
} = {}) {
  return pollForPlanGrant(fetchUser, {
    expectedPlanId,
    timeoutMs,
    intervalMs,
    logLabel: 'Google',
  });
}

/**
 * Shared plan-grant poll. Waits until base44.auth.me shows the expected plan
 * (explorer / investigator / seeker / technician) with a future
 * plan_expiration_date; requiring both avoids matching a pre-existing Wix
 * grant (which has no expiration date). Used by both the Apple and Google
 * Play subscription flows — the Base44 webhook is authoritative in both
 * cases.
 *
 * @param {() => Promise<any>} fetchUser
 * @param {{ expectedPlanId?: string | null, timeoutMs?: number, intervalMs?: number, logLabel: string }} options
 * @returns {Promise<{ ok: boolean, reason?: string, user?: any }>}
 */
async function pollForPlanGrant(fetchUser, {
  expectedPlanId,
  timeoutMs = 30000,
  intervalMs = 1500,
  logLabel,
}) {
  const started = Date.now();
  let lastUser = null;

  while (Date.now() - started < timeoutMs) {
    try {
      lastUser = await fetchUser();
      // Exact plan match, or higher-rank active plan (Trailblazer) with
      // subscription_status active after a preserved recurring grant.
      if (isRecurringPlanGrantReflected(lastUser, expectedPlanId)) {
        return { ok: true, user: lastUser };
      }
    } catch (e) {
      console.warn(`[revenuecat] ${logLabel} grant poll error:`, e);
    }
    await new Promise((r) => setTimeout(r, intervalMs));
  }

  return { ok: false, reason: 'timeout', user: lastUser };
}

/**
 * Poll base44.auth.me until the Apple Aura consumable grant appears (or
 * timeout). The webhook adds to the rollover aura pools, so success means
 * either pool grew past its pre-purchase baseline. This deliberately never
 * inspects plan / plan_expiration_date — AURA is a consumable top-up, not a
 * subscription.
 *
 * @param {() => Promise<any>} fetchUser
 * @param {{ baselineNarration?: number, baselineManifestation?: number, timeoutMs?: number, intervalMs?: number }} [options]
 * @returns {Promise<{ ok: boolean, reason?: string, user?: any }>}
 */
export async function waitForAppleAuraGrant(fetchUser, {
  baselineNarration = 0,
  baselineManifestation = 0,
  timeoutMs = 30000,
  intervalMs = 1500,
} = {}) {
  const started = Date.now();
  let lastUser = null;

  while (Date.now() - started < timeoutMs) {
    try {
      lastUser = await fetchUser();
      const narration = lastUser?.aura_narration_energy || 0;
      const manifestation = lastUser?.aura_manifestation_energy || 0;
      if (narration > baselineNarration || manifestation > baselineManifestation) {
        return { ok: true, user: lastUser };
      }
    } catch (e) {
      console.warn('[revenuecat] Aura grant poll error:', e);
    }
    await new Promise((r) => setTimeout(r, intervalMs));
  }

  return { ok: false, reason: 'timeout', user: lastUser };
}

/**
 * Poll base44.auth.me until the Google Play Aura grant appears (or timeout).
 * The webhook adds to the rollover aura pools, so success means either pool
 * grew past its pre-purchase baseline. Identical semantics to the Apple Aura
 * poll — the Base44 webhook writes the same aura_*_energy fields for both
 * stores. Deliberately never inspects plan / plan_expiration_date — AURA is
 * a consumable top-up, not a subscription.
 *
 * @param {() => Promise<any>} fetchUser
 * @param {{ baselineNarration?: number, baselineManifestation?: number, timeoutMs?: number, intervalMs?: number }} [options]
 * @returns {Promise<{ ok: boolean, reason?: string, user?: any }>}
 */
export async function waitForGoogleAuraGrant(fetchUser, {
  baselineNarration = 0,
  baselineManifestation = 0,
  timeoutMs = 30000,
  intervalMs = 1500,
} = {}) {
  const started = Date.now();
  let lastUser = null;

  while (Date.now() - started < timeoutMs) {
    try {
      lastUser = await fetchUser();
      const narration = lastUser?.aura_narration_energy || 0;
      const manifestation = lastUser?.aura_manifestation_energy || 0;
      if (narration > baselineNarration || manifestation > baselineManifestation) {
        return { ok: true, user: lastUser };
      }
    } catch (e) {
      console.warn('[revenuecat] Google Aura grant poll error:', e);
    }
    await new Promise((r) => setTimeout(r, intervalMs));
  }

  return { ok: false, reason: 'timeout', user: lastUser };
}

/**
 * Purchase the iOS Trailblazer one-time product via RevenueCat/StoreKit.
 * Native iOS only. This is a non-renewing one-time product, so it uses the
 * NON_SUBSCRIPTION product category — never the subscription path. Does NOT
 * grant access locally: the Base44 webhook writes the generic Trailblazer
 * entitlement fields (plan, plan_expiration_date, energy); the caller must
 * poll base44.auth.me() afterwards. Android keeps the Google Play product.
 *
 * @param {string} [userId] Base44 user id used as the RevenueCat appUserID
 * @returns {Promise<{ ok: boolean, cancelled?: boolean, error?: any, reason?: string, purchase?: any, product?: any }>}
 */
export async function purchaseAppleTrailblazer(userId) {
  if (!isIosNative()) {
    return { ok: false, reason: 'not_ios' };
  }

  if (userId) {
    await identifyRevenueCatUser(userId);
  } else {
    const ready = await configureRevenueCat();
    if (!ready.ok) return { ok: false, reason: ready.reason || 'not_configured' };
  }

  if (!configured) {
    return { ok: false, reason: 'not_configured' };
  }

  try {
    // One-time non-renewing product → NON_SUBSCRIPTION category.
    const { products } = await Purchases.getProducts({
      productIdentifiers: [APPLE_TRAILBLAZER_PRODUCT_ID],
      type: PRODUCT_CATEGORY.NON_SUBSCRIPTION,
    });

    const product = (products || []).find((p) => p.identifier === APPLE_TRAILBLAZER_PRODUCT_ID)
      || (products || [])[0];

    if (!product) {
      return {
        ok: false,
        reason: 'product_unavailable',
        error: new Error(
          `Product ${APPLE_TRAILBLAZER_PRODUCT_ID} is not available. Check App Store Connect and RevenueCat configuration.`,
        ),
      };
    }

    const result = await Purchases.purchaseStoreProduct({ product });
    // Intentionally ignore result.customerInfo.entitlements — the Base44
    // webhook is authoritative for the generic Trailblazer grant.
    return { ok: true, purchase: result, product };
  } catch (e) {
    if (isUserCancelled(e)) {
      return { ok: false, cancelled: true };
    }
    console.error('[revenuecat] Apple Trailblazer purchase failed:', e);
    return { ok: false, reason: 'purchase_failed', error: e };
  }
}

/**
 * Poll base44.auth.me until the Apple Trailblazer grant appears (or timeout).
 * The webhook writes plan 'trailblazer' plus a future plan_expiration_date on
 * the generic fields; requiring both avoids matching a pre-existing Wix grant.
 *
 * @param {() => Promise<any>} fetchUser
 * @param {{ timeoutMs?: number, intervalMs?: number }} [options]
 * @returns {Promise<{ ok: boolean, reason?: string, user?: any }>}
 */
export async function waitForAppleTrailblazerGrant(fetchUser, {
  timeoutMs = 30000,
  intervalMs = 1500,
} = {}) {
  const started = Date.now();
  let lastUser = null;

  while (Date.now() - started < timeoutMs) {
    try {
      lastUser = await fetchUser();
      const plan = lastUser?.plan;
      const expMs = lastUser?.plan_expiration_date
        ? new Date(lastUser.plan_expiration_date).getTime()
        : NaN;
      if (plan === 'trailblazer' && !Number.isNaN(expMs) && expMs > Date.now()) {
        return { ok: true, user: lastUser };
      }
    } catch (e) {
      console.warn('[revenuecat] Apple Trailblazer grant poll error:', e);
    }
    await new Promise((r) => setTimeout(r, intervalMs));
  }

  return { ok: false, reason: 'timeout', user: lastUser };
}
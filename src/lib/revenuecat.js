// RevenueCat Capacitor client for AGES Explorer.
// - Web: no-op (Wix checkout remains the web path)
// - iOS: purchase Explorer/Investigator subscriptions and Aura Bundle
//   consumables via StoreKit (Apple product IDs below). Wix remains the iOS
//   path for Trailblazer.
// - Android: configure + purchase Google Play one-time product trailblazer.30month
//
// Access is NEVER granted from CustomerInfo entitlements here. Base44 webhook
// writes plan fields (Apple subscriptions) / aura_*_energy fields (Apple Aura
// consumables) / google_trailblazer_* fields (Google); the client reloads
// auth.me() after purchase.

import { Capacitor } from '@capacitor/core';
import { Purchases, PRODUCT_CATEGORY, LOG_LEVEL, PURCHASES_ERROR_CODE } from '@revenuecat/purchases-capacitor';

/** Google Play product ID — must match Play Console + RevenueCat catalog. */
export const GOOGLE_TRAILBLAZER_PRODUCT_ID = 'trailblazer.30month';

/** Apple product ID (reference only — not purchased by this module). */
export const APPLE_TRAILBLAZER_PRODUCT_ID = 'com.ages.explorer.trailblazer.30month';

/** Existing Apple entitlement ID — do not use to grant Google access. */
export const TRAILBLAZER_ENTITLEMENT_ID = 'trailblazer';

/**
 * Apple App Store product IDs (App Store Connect) for iOS Explorer/Investigator
 * subscriptions, keyed by the Dashboard product id. Must match the RevenueCat
 * product catalog. Purchased only on native iOS.
 */
export const APPLE_SUBSCRIPTION_PRODUCT_IDS = {
  explorer_monthly: 'com.ages.explorer.explorer.monthly',
  explorer_annual: 'com.ages.explorer.explorer.annual',
  investigator_monthly: 'com.ages.explorer.investigator.monthly',
  investigator_annual: 'com.ages.explorer.investigator.annual',
};

/** Base44 plan granted by the webhook for each iOS subscription product. */
export const APPLE_SUBSCRIPTION_PLAN_IDS = {
  explorer_monthly: 'explorer',
  explorer_annual: 'explorer',
  investigator_monthly: 'investigator',
  investigator_annual: 'investigator',
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
 * Apple App Store product IDs (App Store Connect) for iOS Aura Bundle
 * consumables, keyed by the Dashboard bundle id. Must match the RevenueCat
 * product catalog. Purchased only on native iOS as StoreKit consumables —
 * never as subscriptions. Web/Android keep the Wix path for these bundles.
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
 * Purchase an iOS Explorer/Investigator subscription via RevenueCat/StoreKit.
 * Native iOS only. Does NOT grant access locally — the Base44 webhook writes
 * the plan fields; the caller must poll base44.auth.me() afterwards.
 *
 * @param {string} productId Dashboard product id (explorer_monthly, explorer_annual, investigator_monthly, investigator_annual)
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
      productIdentifiers: [appleProductId],
      type: PRODUCT_CATEGORY.SUBSCRIPTION,
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
  const started = Date.now();
  let lastUser = null;

  while (Date.now() - started < timeoutMs) {
    try {
      lastUser = await fetchUser();
      const plan = lastUser?.plan;
      const planMatches = expectedPlanId
        ? plan === expectedPlanId
        : plan === 'explorer' || plan === 'investigator';
      const expMs = lastUser?.plan_expiration_date
        ? new Date(lastUser.plan_expiration_date).getTime()
        : NaN;
      if (planMatches && !Number.isNaN(expMs) && expMs > Date.now()) {
        return { ok: true, user: lastUser };
      }
    } catch (e) {
      console.warn('[revenuecat] Apple grant poll error:', e);
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
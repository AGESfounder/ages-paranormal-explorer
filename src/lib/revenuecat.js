// RevenueCat Capacitor client for AGES Explorer.
// - Web: no-op (Wix checkout remains the web path)
// - iOS: configure + identity only (Apple purchase path unchanged)
// - Android: configure + purchase Google Play one-time product trailblazer.30month
//
// Access is NEVER granted from CustomerInfo entitlements here. Base44 webhook
// writes google_trailblazer_* fields; the client reloads auth.me() after purchase.

import { Capacitor } from '@capacitor/core';
import { Purchases, PRODUCT_CATEGORY, LOG_LEVEL, PURCHASES_ERROR_CODE } from '@revenuecat/purchases-capacitor';

/** Google Play product ID — must match Play Console + RevenueCat catalog. */
export const GOOGLE_TRAILBLAZER_PRODUCT_ID = 'trailblazer.30month';

/** Apple product ID (reference only — not purchased by this module). */
export const APPLE_TRAILBLAZER_PRODUCT_ID = 'com.ages.explorer.trailblazer.30month';

/** Existing Apple entitlement ID — do not use to grant Google access. */
export const TRAILBLAZER_ENTITLEMENT_ID = 'trailblazer';

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
//
// Ad gate service for free (Observer) tier users.
//
// STRATEGY: Stop 1 is always ad-free (hook the user in). Stops 2+ show an
// interstitial ad when a free user opens the Paranormal tab. Paid tiers
// (Explorer / Investigator / Trailblazer) never see ads.
//
// Native (Capacitor iOS/Android): @capacitor-community/admob@7 with UMP consent,
// iOS ATT, production ad-unit IDs, and rewarded SSV user correlation.
// Web preview: short simulated delays so the existing UX can be tested end-to-end.
//

import { Capacitor } from '@capacitor/core';
import {
  AdMob,
  AdmobConsentStatus,
  MaxAdContentRating,
} from '@capacitor-community/admob';
import { isPaidAccess } from '@/lib/access';
import { base44 } from '@/api/base44Client';

// Production AdMob interstitial ad-unit IDs.
export const INTERSTITIAL_AD_ID_IOS = 'ca-app-pub-7999682122277742/9917700653';
export const INTERSTITIAL_AD_ID_ANDROID = 'ca-app-pub-7999682122277742/8903951557';

// Production AdMob rewarded ad-unit IDs.
export const REWARDED_AD_ID_IOS = 'ca-app-pub-7999682122277742/6074658562';
export const REWARDED_AD_ID_ANDROID = 'ca-app-pub-7999682122277742/9748657187';

/** @type {Promise<boolean> | null} */
let initPromise = null;
/** @type {boolean} */
let adsAllowed = false;
/** @type {boolean} */
let requestNonPersonalized = false;
/** @type {Promise<void> | null} */
let interstitialInFlight = null;
/** @type {Promise<{ rewarded: boolean, amount?: number }> | null} */
let rewardedInFlight = null;

function isNativePlatform() {
  try {
    return Capacitor.isNativePlatform();
  } catch {
    return false;
  }
}

function getPlatform() {
  try {
    return Capacitor.getPlatform();
  } catch {
    return 'web';
  }
}

function getInterstitialAdId() {
  return getPlatform() === 'ios' ? INTERSTITIAL_AD_ID_IOS : INTERSTITIAL_AD_ID_ANDROID;
}

function getRewardedAdId() {
  return getPlatform() === 'ios' ? REWARDED_AD_ID_IOS : REWARDED_AD_ID_ANDROID;
}

/**
 * Conservative v7 UMP gate: allow ad requests only after OBTAINED or NOT_REQUIRED.
 * Fail closed on UNKNOWN, remaining REQUIRED, or any consent error.
 * @param {{ status?: string } | null | undefined} consentInfo
 */
function canRequestAdsFromConsent(consentInfo) {
  const status = consentInfo?.status;
  return status === AdmobConsentStatus.OBTAINED || status === AdmobConsentStatus.NOT_REQUIRED;
}

/**
 * Run UMP + ATT + AdMob initialize once per native launch.
 * Web is a no-op that leaves adsAllowed false (simulation paths do not need it).
 * @returns {Promise<boolean>} true when native ads may be requested
 */
export async function initializeAdMob() {
  if (!isNativePlatform()) {
    adsAllowed = false;
    return false;
  }

  if (initPromise) return initPromise;

  initPromise = (async () => {
    try {
      await AdMob.initialize({
        initializeForTesting: false,
        maxAdContentRating: MaxAdContentRating.General,
      });

      let consentInfo = await AdMob.requestConsentInfo();
      if (
        consentInfo?.isConsentFormAvailable &&
        consentInfo?.status === AdmobConsentStatus.REQUIRED
      ) {
        consentInfo = await AdMob.showConsentForm();
      }

      if (!canRequestAdsFromConsent(consentInfo)) {
        console.warn('[admob] Consent gate closed; native ads disabled.', consentInfo?.status);
        adsAllowed = false;
        return false;
      }

      // iOS ATT: request once when undetermined; denied/restricted → NPA.
      requestNonPersonalized = false;
      if (getPlatform() === 'ios') {
        try {
          let tracking = await AdMob.trackingAuthorizationStatus();
          if (tracking?.status === 'notDetermined') {
            await AdMob.requestTrackingAuthorization();
            tracking = await AdMob.trackingAuthorizationStatus();
          }
          if (tracking?.status !== 'authorized') {
            requestNonPersonalized = true;
          }
        } catch (attError) {
          console.warn('[admob] ATT status failed; using non-personalized ads.', attError);
          requestNonPersonalized = true;
        }
      }

      adsAllowed = true;
      return true;
    } catch (error) {
      console.warn('[admob] Initialization failed; native ads disabled.', error);
      adsAllowed = false;
      return false;
    }
  })();

  return initPromise;
}

/**
 * Ensure native init finished before load/show. Never throws.
 * @returns {Promise<boolean>}
 */
async function ensureAdsReady() {
  if (!isNativePlatform()) return false;
  try {
    return await initializeAdMob();
  } catch {
    return false;
  }
}

/**
 * Determine whether an interstitial ad should be shown for this user + stop.
 * Free (Observer) users see ads on paranormal content for stops 2+.
 * Stop 1 is always ad-free. Paid users never see ads.
 */
export function shouldShowAd(user, stopNumber) {
  // Honors Apple/Wix expiry and isolated Google Trailblazer expiry
  if (isPaidAccess(user)) return false;
  if (!stopNumber || stopNumber <= 1) return false;
  return true;
}

/**
 * Show an interstitial ad via the native AdMob plugin if available.
 * Returns a Promise that resolves when the ad is dismissed.
 * In web preview mode (no native bridge) it resolves after a short delay.
 * Failures resolve without throwing so AdGate can fail-open.
 */
export async function showInterstitial() {
  if (isNativePlatform()) {
    if (interstitialInFlight) return interstitialInFlight;

    interstitialInFlight = (async () => {
      try {
        const ready = await ensureAdsReady();
        if (!ready || !adsAllowed) {
          console.warn('[admob] Interstitial skipped — consent/init not ready.');
          return;
        }

        const options = {
          adId: getInterstitialAdId(),
        };
        if (requestNonPersonalized) {
          options.npa = true;
        }

        await AdMob.prepareInterstitial(options);
        await AdMob.showInterstitial();
      } catch (e) {
        console.warn('AdMob interstitial failed:', e);
      }
    })().finally(() => {
      interstitialInFlight = null;
    });

    return interstitialInFlight;
  }

  // Cordova admob plugin (legacy wrapper)
  const cordovaAdMob =
    typeof window !== 'undefined'
      ? /** @type {{ AdMob?: { showInterstitialAd?: Function } }} */ (window).AdMob
      : null;
  if (cordovaAdMob?.showInterstitialAd) {
    return new Promise((resolve) => {
      cordovaAdMob.showInterstitialAd({ success: resolve, error: resolve });
    });
  }

  // Web preview / no native bridge — simulate ad display duration
  return new Promise((resolve) => setTimeout(resolve, 2500));
}

/**
 * Resolve a Base44 user id for SSV correlation without changing callers.
 * @param {{ userId?: string } | undefined} options
 * @returns {Promise<string | null>}
 */
async function resolveSsvUserId(options) {
  if (options?.userId) return String(options.userId);
  try {
    const user = await base44.auth.me();
    return user?.id ? String(user.id) : null;
  } catch {
    return null;
  }
}

/**
 * Show a rewarded video ad via the native AdMob plugin if available.
 * Returns a Promise that resolves with { rewarded: boolean }.
 * In web preview mode (no native bridge) it resolves after a short delay
 * so the full UX flow can be tested end-to-end.
 * Optional options.userId is forwarded to AdMob SSV; otherwise auth.me() is used.
 *
 * @param {{ userId?: string }} [options]
 * @returns {Promise<{ rewarded: boolean, amount?: number }>}
 */
export async function showRewardedAd(options) {
  if (isNativePlatform()) {
    if (rewardedInFlight) return rewardedInFlight;

    rewardedInFlight = (async () => {
      try {
        const ready = await ensureAdsReady();
        if (!ready || !adsAllowed) {
          console.warn('[admob] Rewarded ad skipped — consent/init not ready.');
          return { rewarded: false };
        }

        const userId = await resolveSsvUserId(options);
        /** @type {import('@capacitor-community/admob').RewardAdOptions} */
        const adOptions = /** @type {import('@capacitor-community/admob').RewardAdOptions} */ ({
          adId: getRewardedAdId(),
        });
        if (requestNonPersonalized) {
          adOptions.npa = true;
        }
        if (userId) {
          adOptions.ssv = {
            userId,
            customData: JSON.stringify({ userId, source: 'ages-explorer' }),
          };
        }
        if (!userId) {
          console.warn('[admob] Rewarded ad without userId — SSV audit correlation unavailable.');
        }

        await AdMob.prepareRewardVideoAd(adOptions);
        const result = await AdMob.showRewardVideoAd();
        // Only treat a resolved reward callback/promise as rewarded — not dismiss alone.
        return { rewarded: true, amount: result?.amount || 0 };
      } catch (e) {
        console.warn('AdMob rewarded ad failed:', e);
        return { rewarded: false };
      }
    })().finally(() => {
      rewardedInFlight = null;
    });

    return rewardedInFlight;
  }

  // Web preview / no native bridge — simulate a short ad (real ads are ~30s)
  return new Promise((resolve) => setTimeout(() => resolve({ rewarded: true }), 3000));
}
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
// TEMP DIAG (iOS Build 11 TestFlight) — instrumentation only; remove with src/lib/adDiagnostics.js
import {
  consentStatusPatch,
  describeAdError,
  extractConsentInfo,
  probeAdMobPlugin,
  recordAdDiag,
  setAdDiagStatus,
} from '@/lib/adDiagnostics';

// Production AdMob interstitial ad-unit IDs.
export const INTERSTITIAL_AD_ID_IOS = 'ca-app-pub-7999682122277742/8903951557';
export const INTERSTITIAL_AD_ID_ANDROID = 'ca-app-pub-7999682122277742/9917700653';

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
    // TEMP DIAG
    recordAdDiag('init', 'web-noop', {
      message: 'Not a native platform — AdMob init skipped (web simulation paths unaffected).',
    });
    return false;
  }

  if (initPromise) return initPromise;

  // TEMP DIAG — init start + selected unit IDs for this platform
  setAdDiagStatus({
    platform: getPlatform(),
    initState: 'running',
    interstitialAdId: getInterstitialAdId(),
    rewardedAdId: getRewardedAdId(),
  });
  recordAdDiag('init', 'start', {
    message: `AdMob initialization started (platform: ${getPlatform()}).`,
  });

  initPromise = (async () => {
    try {
      // TEMP DIAG — Capacitor plugin registration/availability probe (read-only)
      const probe = probeAdMobPlugin(AdMob);
      setAdDiagStatus({
        pluginAvailable: probe.available,
        pluginMissingMethods: probe.missingMethods,
      });
      recordAdDiag('plugin', 'availability', {
        ok: probe.available !== false && probe.missingMethods.length === 0,
        message:
          probe.available === false
            ? 'AdMob plugin NOT registered/available in the native shell.'
            : probe.missingMethods.length
              ? `AdMob plugin present but missing methods: ${probe.missingMethods.join(', ')}`
              : 'AdMob plugin registered and all probed methods present.',
        data: { available: probe.available, missingMethods: probe.missingMethods },
      });

      await AdMob.initialize({
        initializeForTesting: false,
        maxAdContentRating: MaxAdContentRating.General,
      });
      // TEMP DIAG
      recordAdDiag('init', 'sdk-initialized', {
        ok: true,
        message: 'AdMob.initialize() resolved.',
      });

      let consentInfo = await AdMob.requestConsentInfo();
      // TEMP DIAG — UMP consent status + canRequestAds/form availability
      setAdDiagStatus(consentStatusPatch(consentInfo));
      recordAdDiag('consent', 'info', {
        message: `UMP consent status: ${consentInfo?.status ?? 'unknown'}.`,
        data: extractConsentInfo(consentInfo),
      });
      if (
        consentInfo?.isConsentFormAvailable &&
        consentInfo?.status === AdmobConsentStatus.REQUIRED
      ) {
        // TEMP DIAG
        recordAdDiag('consent', 'form-show', {
          message: 'Consent required and form available — presenting UMP consent form.',
        });
        consentInfo = await AdMob.showConsentForm();
        // TEMP DIAG
        setAdDiagStatus(consentStatusPatch(consentInfo));
        recordAdDiag('consent', 'form-result', {
          message: `UMP form dismissed. Consent status: ${consentInfo?.status ?? 'unknown'}.`,
          data: extractConsentInfo(consentInfo),
        });
      }

      if (!canRequestAdsFromConsent(consentInfo)) {
        console.warn('[admob] Consent gate closed; native ads disabled.', consentInfo?.status);
        adsAllowed = false;
        // TEMP DIAG — existing fail-closed gate, unchanged
        setAdDiagStatus({ initState: 'blocked', adsAllowed: false });
        recordAdDiag('consent', 'gate-closed', {
          ok: false,
          message: `Consent gate closed (status: ${consentInfo?.status ?? 'unknown'}) — native ads disabled (existing fail-closed behavior).`,
          data: extractConsentInfo(consentInfo),
        });
        return false;
      }
      // TEMP DIAG
      recordAdDiag('consent', 'gate-open', {
        ok: true,
        message: 'Consent gate passed (OBTAINED or NOT_REQUIRED).',
      });

      // iOS ATT: request once when undetermined; denied/restricted → NPA.
      requestNonPersonalized = false;
      if (getPlatform() === 'ios') {
        try {
          let tracking = await AdMob.trackingAuthorizationStatus();
          // TEMP DIAG
          recordAdDiag('att', 'status', {
            message: `ATT status: ${tracking?.status ?? 'unknown'}.`,
            data: { status: tracking?.status ?? null },
          });
          if (tracking?.status === 'notDetermined') {
            await AdMob.requestTrackingAuthorization();
            tracking = await AdMob.trackingAuthorizationStatus();
            // TEMP DIAG
            recordAdDiag('att', 'request-result', {
              message: `ATT status after request: ${tracking?.status ?? 'unknown'}.`,
              data: { status: tracking?.status ?? null },
            });
          }
          if (tracking?.status !== 'authorized') {
            requestNonPersonalized = true;
          }
          // TEMP DIAG
          setAdDiagStatus({ attStatus: tracking?.status ?? null });
        } catch (attError) {
          console.warn('[admob] ATT status failed; using non-personalized ads.', attError);
          requestNonPersonalized = true;
          // TEMP DIAG
          const attDesc = describeAdError(attError);
          setAdDiagStatus({ attStatus: 'error', requestNonPersonalized: true });
          recordAdDiag('att', 'error', {
            ok: false,
            message: `ATT status failed — using non-personalized ads. ${attDesc.code ? `[${attDesc.code}] ` : ''}${attDesc.message}`,
            data: attDesc,
          });
        }
      }

      adsAllowed = true;
      // TEMP DIAG
      setAdDiagStatus({ initState: 'ready', adsAllowed: true, requestNonPersonalized });
      recordAdDiag('init', 'ready', {
        ok: true,
        message: `AdMob ready — ads allowed. Non-personalized: ${requestNonPersonalized ? 'yes' : 'no'}.`,
      });
      return true;
    } catch (error) {
      console.warn('[admob] Initialization failed; native ads disabled.', error);
      adsAllowed = false;
      // TEMP DIAG
      const initDesc = describeAdError(error);
      setAdDiagStatus({ initState: 'failed', adsAllowed: false, lastError: initDesc });
      recordAdDiag('init', 'failed', {
        ok: false,
        message: `AdMob initialization failed — native ads disabled. ${initDesc.code ? `[${initDesc.code}] ` : ''}${initDesc.message}${initDesc.missingMethod ? ' (plugin/method missing?)' : ''}`,
        data: initDesc,
      });
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
      // TEMP DIAG — capture the exact selected unit at request time
      const interstitialAdId = getInterstitialAdId();
      recordAdDiag('interstitial', 'request', {
        message: `Interstitial requested. Unit: ${interstitialAdId}`,
        data: { adId: interstitialAdId, npa: requestNonPersonalized },
      });
      try {
        const ready = await ensureAdsReady();
        if (!ready || !adsAllowed) {
          console.warn('[admob] Interstitial skipped — consent/init not ready.');
          // TEMP DIAG
          recordAdDiag('interstitial', 'skipped', {
            ok: false,
            message: 'Interstitial skipped — consent/init not ready (existing fail-open: no ad shown).',
            data: { adId: interstitialAdId },
          });
          return;
        }

        const options = {
          adId: interstitialAdId,
        };
        if (requestNonPersonalized) {
          options.npa = true;
        }

        // TEMP DIAG — inner try/catch rethrows into the existing outer catch,
        // so load vs presentation failures are attributed without changing flow.
        try {
          await AdMob.prepareInterstitial(options);
          recordAdDiag('interstitial', 'loaded', {
            ok: true,
            message: `Interstitial loaded. Unit: ${interstitialAdId}`,
            data: { adId: interstitialAdId },
          });
        } catch (loadError) {
          const loadDesc = describeAdError(loadError);
          recordAdDiag('interstitial', 'load-failed', {
            ok: false,
            message: `Interstitial load failed. ${loadDesc.code ? `[${loadDesc.code}] ` : ''}${loadDesc.message}`,
            data: { ...loadDesc, adId: interstitialAdId },
          });
          throw loadError;
        }

        try {
          await AdMob.showInterstitial();
          recordAdDiag('interstitial', 'shown', {
            ok: true,
            message: `Interstitial presented. Unit: ${interstitialAdId}`,
            data: { adId: interstitialAdId },
          });
        } catch (showError) {
          const showDesc = describeAdError(showError);
          recordAdDiag('interstitial', 'show-failed', {
            ok: false,
            message: `Interstitial presentation failed. ${showDesc.code ? `[${showDesc.code}] ` : ''}${showDesc.message}`,
            data: { ...showDesc, adId: interstitialAdId },
          });
          throw showError;
        }
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
      // TEMP DIAG — capture the exact selected unit at request time
      const rewardedAdId = getRewardedAdId();
      recordAdDiag('rewarded', 'request', {
        message: `Rewarded ad requested. Unit: ${rewardedAdId}`,
        data: { adId: rewardedAdId, npa: requestNonPersonalized },
      });
      try {
        const ready = await ensureAdsReady();
        if (!ready || !adsAllowed) {
          console.warn('[admob] Rewarded ad skipped — consent/init not ready.');
          // TEMP DIAG
          recordAdDiag('rewarded', 'skipped', {
            ok: false,
            message: 'Rewarded ad skipped — consent/init not ready (existing behavior: no reward granted).',
            data: { adId: rewardedAdId },
          });
          return { rewarded: false };
        }

        const userId = await resolveSsvUserId(options);
        /** @type {import('@capacitor-community/admob').RewardAdOptions} */
        const adOptions = /** @type {import('@capacitor-community/admob').RewardAdOptions} */ ({
          adId: rewardedAdId,
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

        // TEMP DIAG — inner try/catch rethrows into the existing outer catch,
        // so load vs presentation failures are attributed without changing flow.
        try {
          await AdMob.prepareRewardVideoAd(adOptions);
          recordAdDiag('rewarded', 'loaded', {
            ok: true,
            message: `Rewarded ad loaded. Unit: ${rewardedAdId}`,
            data: { adId: rewardedAdId, ssvUserId: Boolean(userId) },
          });
        } catch (loadError) {
          const loadDesc = describeAdError(loadError);
          recordAdDiag('rewarded', 'load-failed', {
            ok: false,
            message: `Rewarded ad load failed. ${loadDesc.code ? `[${loadDesc.code}] ` : ''}${loadDesc.message}`,
            data: { ...loadDesc, adId: rewardedAdId },
          });
          throw loadError;
        }

        try {
          const result = await AdMob.showRewardVideoAd();
          recordAdDiag('rewarded', 'shown', {
            ok: true,
            message: `Rewarded ad presented; reward earned (amount: ${result?.amount || 0}). Unit: ${rewardedAdId}`,
            data: { adId: rewardedAdId, amount: result?.amount || 0 },
          });
          // Only treat a resolved reward callback/promise as rewarded — not dismiss alone.
          return { rewarded: true, amount: result?.amount || 0 };
        } catch (showError) {
          const showDesc = describeAdError(showError);
          recordAdDiag('rewarded', 'show-failed', {
            ok: false,
            message: `Rewarded ad presentation failed. ${showDesc.code ? `[${showDesc.code}] ` : ''}${showDesc.message}`,
            data: { ...showDesc, adId: rewardedAdId },
          });
          throw showError;
        }
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
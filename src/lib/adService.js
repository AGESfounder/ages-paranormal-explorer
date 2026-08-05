//
// Ad gate service for free (Observer) tier users.
//
// STRATEGY: Stop 1 is always ad-free (hook the user in). Stops 2+ show an
// interstitial ad when a free user opens the Paranormal tab. Paid tiers
// (Explorer / Investigator / Trailblazer) never see ads.
//
// ─────────────────────────────────────────────────────────────────────
// NATIVE INTEGRATION (when you publish to Apple / Google):
// ─────────────────────────────────────────────────────────────────────
// This web app is wrapped in a native container (Capacitor) when published.
// Install the Google AdMob plugin and the showInterstitial() call below
// will auto-detect and use it:
//
//   npm install @capacitor-community/admob
//   npx cap sync
//
// Then set your real AdMob ad-unit IDs in the constants below.
// In the web preview (no native bridge) showInterstitial() resolves after a
// short delay so the full UX flow can be tested end-to-end.
//
//   iOS interstitial ad unit:  INTERSTITIAL_AD_ID_IOS
//   Android interstitial ad unit: INTERSTITIAL_AD_ID_ANDROID
// ─────────────────────────────────────────────────────────────────────

const FREE_PLAN = 'observer';

// Replace these with your real AdMob interstitial ad-unit IDs before publishing.
export const INTERSTITIAL_AD_ID_IOS = 'ca-app-pub-XXXXXXXXXXXXXXXX/XXXXXXXXXX';
export const INTERSTITIAL_AD_ID_ANDROID = 'ca-app-pub-XXXXXXXXXXXXXXXX/XXXXXXXXXX';

/**
 * Determine whether an interstitial ad should be shown for this user + stop.
 * Free (Observer) users see ads on paranormal content for stops 2+.
 * Stop 1 is always ad-free. Paid users never see ads.
 */
export function shouldShowAd(user, stopNumber) {
  const plan = user?.plan || FREE_PLAN;
  if (plan !== FREE_PLAN) return false;
  if (!stopNumber || stopNumber <= 1) return false;
  return true;
}

/**
 * Show an interstitial ad via the native AdMob plugin if available.
 * Returns a Promise that resolves when the ad is dismissed.
 * In web preview mode (no native bridge) it resolves after a short delay.
 */
export async function showInterstitial() {
  // Capacitor — @capacitor-community/admob
  if (typeof window !== 'undefined' && window.Capacitor?.Plugins?.AdMob) {
    const { AdMob } = window.Capacitor.Plugins;
    const platform = window.Capacitor.getPlatform?.();
    const adId = platform === 'ios' ? INTERSTITIAL_AD_ID_IOS : INTERSTITIAL_AD_ID_ANDROID;
    try {
      await AdMob.prepareInterstitial({ adId });
      await AdMob.showInterstitial();
    } catch (e) {
      console.warn('AdMob interstitial failed:', e);
    }
    return;
  }

  // Cordova admob plugin (legacy wrapper)
  if (typeof window !== 'undefined' && window.AdMob?.showInterstitialAd) {
    return new Promise((resolve) => {
      window.AdMob.showInterstitialAd({ success: resolve, error: resolve });
    });
  }

  // Web preview / no native bridge — simulate ad display duration
  return new Promise((resolve) => setTimeout(resolve, 2500));
}

// ─────────────────────────────────────────────────────────────────────
// REWARDED ADS (paid users earn energy by watching a 30-second ad)
// ─────────────────────────────────────────────────────────────────────
// Same native-bridge pattern as showInterstitial(). When published via
// Capacitor with @capacitor-community/admob installed, showRewardedAd()
// auto-detects and uses the real AdMob rewarded video. In web preview it
// resolves after a short delay so the full UX flow can be tested.
//
//   npm install @capacitor-community/admob
//   npx cap sync
//
// Then set your real AdMob rewarded ad-unit IDs below.
// ─────────────────────────────────────────────────────────────────────

// Replace these with your real AdMob rewarded ad-unit IDs before publishing.
export const REWARDED_AD_ID_IOS = 'ca-app-pub-XXXXXXXXXXXXXXXX/XXXXXXXXXX';
export const REWARDED_AD_ID_ANDROID = 'ca-app-pub-XXXXXXXXXXXXXXXX/XXXXXXXXXX';

/**
 * Show a rewarded video ad via the native AdMob plugin if available.
 * Returns a Promise that resolves with { rewarded: boolean }.
 * In web preview mode (no native bridge) it resolves after a short delay
 * so the full UX flow can be tested end-to-end.
 */
export async function showRewardedAd() {
  // Capacitor — @capacitor-community/admob
  if (typeof window !== 'undefined' && window.Capacitor?.Plugins?.AdMob) {
    const { AdMob } = window.Capacitor.Plugins;
    const platform = window.Capacitor.getPlatform?.();
    const adId = platform === 'ios' ? REWARDED_AD_ID_IOS : REWARDED_AD_ID_ANDROID;
    try {
      await AdMob.prepareRewardVideoAd({ adId });
      const result = await AdMob.showRewardVideoAd();
      // AdMob plugin returns reward info on completion
      return { rewarded: true, amount: result?.amount || 0 };
    } catch (e) {
      console.warn('AdMob rewarded ad failed:', e);
      return { rewarded: false };
    }
  }

  // Web preview / no native bridge — simulate a short ad (real ads are ~30s)
  return new Promise((resolve) => setTimeout(() => resolve({ rewarded: true }), 3000));
}
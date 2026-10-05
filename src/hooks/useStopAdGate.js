import { useState, useCallback, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { showRewardedAd } from '@/lib/adService';
import { isPaidAccess } from '@/lib/access';
import { STOP_AD_DAILY_CAP } from '@/lib/stopAdGate';

/**
 * Server-authoritative ad gate for paranormal stop content.
 *
 * Flow:
 *   Paid user / admin → no gate (content renders directly)
 *   Observer, stop 1  → no gate (first stop is free)
 *   Observer, stop 2+  → show rewarded-ad gate:
 *     - If daily cap reached → show UpgradePrompt
 *     - User watches rewarded ad → call grant-stop-access → server increments
 *       stop_ad_views_count (capped at 10/day) → content reveals
 *     - Ad failure (no_fill, skipped) → stay gated, show error, allow retry
 *
 * @param {number} stopNumber — the stop's stop_number (1-based)
 */
export function useStopAdGate(stopNumber) {
  const [user, setUser] = useState(null);
  const [phase, setPhase] = useState('gate'); // gate | ad | revealed
  const [adError, setAdError] = useState(null);
  const [showUpgrade, setShowUpgrade] = useState(false);

  useEffect(() => {
    base44.auth.me().then(setUser).catch(() => {});
  }, []);

  // Listen for ad reward events — refresh user state
  useEffect(() => {
    const handleAdReward = () => {
      base44.auth.me().then(setUser).catch(() => {});
    };
    window.addEventListener('ad-reward-granted', handleAdReward);
    return () => window.removeEventListener('ad-reward-granted', handleAdReward);
  }, []);

  const refreshUser = useCallback(async () => {
    const updated = await base44.auth.me().catch(() => null);
    if (updated) setUser(updated);
  }, []);

  const isPaid = user ? isPaidAccess(user) : false;
  const needsAd = user ? (!isPaid && stopNumber > 1) : false;

  const today = new Date().toISOString().split('T')[0];
  const countToday = user && user.stop_ad_views_date === today
    ? (user.stop_ad_views_count || 0)
    : 0;
  const capReached = countToday >= STOP_AD_DAILY_CAP;
  const remaining = Math.max(0, STOP_AD_DAILY_CAP - countToday);

  const watchAd = useCallback(async () => {
    setAdError(null);
    setPhase('ad');
    try {
      const result = await showRewardedAd();
      if (!result.rewarded) {
        setAdError(
          result.reason === 'no_fill'
            ? 'No ad available right now — try again later.'
            : result.reason === 'skipped'
              ? 'Ads are not ready yet. Try again in a moment.'
              : 'Ad was not completed. Try again.'
        );
        setPhase('gate');
        return false;
      }
      const response = await base44.functions.invoke('grant-stop-access', {});
      if (response.data?.success) {
        await refreshUser();
        setPhase('revealed');
        return true;
      }
      // Daily cap reached (429) or other error
      if (response.status === 429 || response.data?.error?.includes('limit')) {
        setShowUpgrade(true);
        setPhase('gate');
        return false;
      }
      setAdError(response.data?.error || 'Failed to unlock content.');
      setPhase('gate');
      return false;
    } catch (e) {
      console.error('Stop ad gate error:', e);
      setAdError(e.response?.data?.error || e.message || 'Something went wrong.');
      setPhase('gate');
      return false;
    }
  }, [refreshUser]);

  return {
    needsAd,
    phase,
    adError,
    showUpgrade,
    setShowUpgrade,
    remaining,
    capReached,
    countToday,
    cap: STOP_AD_DAILY_CAP,
    watchAd,
  };
}
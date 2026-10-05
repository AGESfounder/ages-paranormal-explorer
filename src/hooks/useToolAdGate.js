import { useState, useCallback, useRef, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { showRewardedAd } from '@/lib/adService';
import {
  needsToolAdGate,
  parseToolBanks,
  TOOL_AD_DURATION,
  TOOL_DAILY_CAP,
} from '@/lib/toolAccess';

/**
 * Manages the ad-gate lifecycle for a single Observer-tier ad-gated tool.
 *
 * Flow:
 *  1. User taps an ad-gated tool → if remaining > 0, open with countdown;
 *     if remaining = 0, show the ToolAdGate UI.
 *  2. User watches a rewarded ad → showRewardedAd → grant-tool-time →
 *     server adds 30s to tool_banks[tool].r and .e (capped at 300/day).
 *  3. Tool opens with the granted time, counting down locally.
 *  4. On close or expiry, consumed seconds are synced back to the server
 *     via base44.auth.updateMe so remaining stays accurate across sessions.
 *
 * @param {object|null} user — current Base44 user (from auth.me())
 * @param {string} toolName — the tool being gated (must be in AD_GATED_TOOLS)
 */
export function useToolAdGate(user, toolName) {
  const [remaining, setRemaining] = useState(0);
  const [earned, setEarned] = useState(0);
  const [watching, setWatching] = useState(false);
  const [granting, setGranting] = useState(false);
  const [adError, setAdError] = useState(null);
  const timerRef = useRef(null);

  // Load initial state from user record whenever user or toolName changes.
  useEffect(() => {
    if (!user || !toolName) {
      setRemaining(0);
      setEarned(0);
      return;
    }
    const banks = parseToolBanks(user);
    setRemaining(banks[toolName]?.r || 0);
    setEarned(banks[toolName]?.e || 0);
  }, [user, toolName]);

  const needsAd = user ? needsToolAdGate(user, toolName) : false;
  const canUse = !needsAd || remaining > 0;
  const capReached = earned >= TOOL_DAILY_CAP;

  // Watch a rewarded ad and call grant-tool-time to add 30s server-side.
  // Returns the server response ({ remaining, earned }) on success, null on failure.
  const watchAd = useCallback(async () => {
    if (watching || granting) return null;
    setAdError(null);
    setWatching(true);
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
        setWatching(false);
        return null;
      }
      setWatching(false);
      setGranting(true);
      const response = await base44.functions.invoke('grant-tool-time', { toolName });
      if (response.data?.success) {
        setRemaining(response.data.remaining);
        setEarned(response.data.earned);
        return response.data;
      }
      setAdError(response.data?.error || 'Failed to grant tool time.');
      return null;
    } catch (e) {
      console.error('Tool ad gate error:', e);
      setAdError(e.response?.data?.error || e.message || 'Something went wrong.');
      setWatching(false);
      return null;
    } finally {
      setGranting(false);
    }
  }, [toolName, watching, granting]);

  // Start a local countdown from `seconds`. Calls onExpire when it hits 0.
  const startCountdown = useCallback((onExpire) => {
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      setRemaining((prev) => {
        if (prev <= 1) {
          clearInterval(timerRef.current);
          timerRef.current = null;
          onExpire?.();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  }, []);

  // Stop the countdown and sync consumed seconds back to the server so
  // remaining stays accurate across sessions / page reloads.
  const stopCountdown = useCallback(async () => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    // Sync remaining back to the server (best-effort — failures just mean
    // the server's remaining is slightly higher than actual).
    if (user && toolName && needsAd) {
      try {
        const banks = parseToolBanks(user);
        const entry = banks[toolName] || { r: 0, e: 0 };
        entry.r = Math.max(0, remaining);
        banks[toolName] = entry;
        await base44.auth.updateMe({
          tool_banks: JSON.stringify(banks),
        });
      } catch (e) {
        // Non-critical — the next ad watch will re-sync from the server.
        console.error('Failed to sync tool_banks:', e);
      }
    }
  }, [user, toolName, needsAd, remaining]);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  return {
    needsAd,
    canUse,
    remaining,
    earned,
    capReached,
    watching,
    granting,
    adError,
    watchAd,
    startCountdown,
    stopCountdown,
    setRemaining,
  };
}
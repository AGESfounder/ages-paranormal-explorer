import { useState, useCallback, useRef, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { showRewardedAd } from '@/lib/adService';
import {
  needsToolAdGate,
  parseToolBanks,
  TOOL_AD_DURATION,
  TOOL_DAILY_CAP,
} from '@/lib/toolAccess';

const HEARTBEAT_INTERVAL_MS = 5000; // 5 seconds

/**
 * Manages the ad-gate lifecycle for a single Observer-tier ad-gated tool.
 *
 * Server-authoritative flow:
 *  1. User taps an ad-gated tool → if remaining > 0, open with heartbeat;
 *     if remaining = 0, show the ToolAdGate UI.
 *  2. User watches a rewarded ad → showRewardedAd → grant-tool-time →
 *     server adds 30s to tool_banks[tool].r and .e (capped at 300/day).
 *  3. Tool opens. Client calls consume-tool-time on open (sets last_heartbeat),
 *     then every 5s (heartbeat). Server deducts elapsed via wall clock.
 *  4. On close, client calls consume-tool-time with close=true (final deduction,
 *     clears last_heartbeat).
 *  5. The server's remaining value is authoritative — the client displays it
 *     and closes the tool when it reaches 0.
 *
 * The client NEVER writes tool_banks.r directly. Only grant-tool-time and
 * consume-tool-time modify r, both server-side.
 *
 * All functions accept an optional `name` parameter to override the hook's
 * toolName — this avoids React state timing issues when the caller sets
 * activeTool and immediately calls startConsumption in the same handler.
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
  const heartbeatRef = useRef(null);

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
  const capReached = earned >= TOOL_DAILY_CAP;

  // Watch a rewarded ad and call grant-tool-time to add 30s server-side.
  // Returns the server response ({ remaining, earned }) on success, null on failure.
  const watchAd = useCallback(async (name) => {
    const t = name || toolName;
    if (watching || granting || !t) return null;
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
      const response = await base44.functions.invoke('grant-tool-time', { toolName: t });
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

  // Call consume-tool-time to sync remaining from the server.
  // Sets last_heartbeat on the server (starts the clock).
  // Returns the server's authoritative remaining value.
  const startConsumption = useCallback(async (name) => {
    const t = name || toolName;
    if (!user || !t) return 0;
    try {
      const response = await base44.functions.invoke('consume-tool-time', { toolName: t });
      if (response.data) {
        setRemaining(response.data.remaining);
        setEarned(response.data.earned || 0);
        return response.data.remaining;
      }
    } catch (e) {
      console.error('Failed to start consumption:', e);
    }
    return 0;
  }, [user, toolName]);

  // Heartbeat: call consume-tool-time every 5 seconds. The server deducts
  // elapsed time via its own wall clock and returns the authoritative remaining.
  // Calls onExpire when the server says remaining <= 0.
  const startHeartbeat = useCallback((onExpire, name) => {
    const t = name || toolName;
    if (!t) return;
    if (heartbeatRef.current) clearInterval(heartbeatRef.current);
    heartbeatRef.current = setInterval(async () => {
      try {
        const response = await base44.functions.invoke('consume-tool-time', { toolName: t });
        if (response.data) {
          setRemaining(response.data.remaining);
          setEarned(response.data.earned || 0);
          if (response.data.remaining <= 0) {
            if (heartbeatRef.current) {
              clearInterval(heartbeatRef.current);
              heartbeatRef.current = null;
            }
            // Send close call to clear last_heartbeat
            try {
              await base44.functions.invoke('consume-tool-time', { toolName: t, close: true });
            } catch (e) {
              console.error('Failed to send close after expire:', e);
            }
            onExpire?.();
          }
        }
      } catch (e) {
        console.error('Heartbeat failed:', e);
      }
    }, HEARTBEAT_INTERVAL_MS);
  }, [toolName]);

  // Stop the heartbeat and send a close call to clear last_heartbeat.
  const stopConsumption = useCallback(async (name) => {
    if (heartbeatRef.current) {
      clearInterval(heartbeatRef.current);
      heartbeatRef.current = null;
    }
    const t = name || toolName;
    if (!user || !t) return;
    try {
      const response = await base44.functions.invoke('consume-tool-time', { toolName: t, close: true });
      if (response.data) {
        setRemaining(response.data.remaining);
      }
    } catch (e) {
      console.error('Failed to stop consumption:', e);
    }
  }, [user, toolName]);

  useEffect(() => {
    return () => {
      if (heartbeatRef.current) clearInterval(heartbeatRef.current);
    };
  }, []);

  return {
    needsAd,
    remaining,
    earned,
    capReached,
    watching,
    granting,
    adError,
    watchAd,
    startConsumption,
    startHeartbeat,
    stopConsumption,
    setRemaining,
  };
}
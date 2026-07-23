import { useEffect, useRef } from 'react';

// Keeps the device screen awake (no auto-lock/dim) while `active` is true,
// using the Screen Wake Lock API. Robust on mobile: re-acquires the lock on
// visibility changes and user interaction (iOS often requires a fresh
// gesture), and re-grabs it if the system releases the sentinel mid-session.
export default function useWakeLock(active) {
  const activeRef = useRef(active);
  activeRef.current = active;
  const lockRef = useRef(null);
  const lastRequestRef = useRef(0);

  useEffect(() => {
    if (!('wakeLock' in navigator)) return;

    const request = async () => {
      try {
        if (!activeRef.current) return;
        if (document.visibilityState !== 'visible') return;
        if (lockRef.current && !lockRef.current.released) return; // already held
        const now = Date.now();
        if (now - lastRequestRef.current < 1000) return; // throttle
        lastRequestRef.current = now;
        const sentinel = await navigator.wakeLock.request('screen');
        lockRef.current = sentinel;
        sentinel.addEventListener('release', () => {
          // System released it (e.g. tab briefly hidden) — re-acquire if
          // still active. Throttled to avoid loops.
          if (activeRef.current) request();
        });
      } catch {
        // unsupported / blocked — ignore
      }
    };

    const release = () => {
      try { if (lockRef.current && !lockRef.current.released) lockRef.current.release(); } catch {}
      lockRef.current = null;
    };

    const onVisibility = () => {
      if (document.visibilityState === 'visible') request();
    };
    // iOS often requires the request to happen within a user gesture
    const onInteraction = () => request();

    if (active) request();
    document.addEventListener('visibilitychange', onVisibility);
    document.addEventListener('pointerdown', onInteraction, { passive: true });

    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      document.removeEventListener('pointerdown', onInteraction);
      release();
    };
  }, [active]);
}
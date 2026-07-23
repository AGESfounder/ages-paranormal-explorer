import { useEffect, useRef } from 'react';

// Keeps the device screen awake (no auto-lock/dim) while `active` is true,
// using the Screen Wake Lock API. Re-acquires the lock when the tab becomes
// visible again (browsers release it when the page is hidden).
export default function useWakeLock(active) {
  const lockRef = useRef(null);

  useEffect(() => {
    let cancelled = false;

    const request = async () => {
      try {
        if (!('wakeLock' in navigator)) return;
        if (document.visibilityState !== 'visible') return;
        lockRef.current = await navigator.wakeLock.request('screen');
      } catch {
        // user denied or unsupported — silently ignore
      }
    };

    const release = async () => {
      try {
        if (lockRef.current) { await lockRef.current.release(); }
      } catch {}
      lockRef.current = null;
    };

    const onVisibility = () => {
      if (document.visibilityState === 'visible' && active) request();
    };

    if (active) {
      request();
      document.addEventListener('visibilitychange', onVisibility);
    } else {
      release();
    }

    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', onVisibility);
      release();
    };
  }, [active]);
}
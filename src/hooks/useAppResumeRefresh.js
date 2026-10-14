import { useEffect, useRef } from 'react';
import { App as CapacitorApp } from '@capacitor/app';

// Runs `onResume` when the app comes back to the foreground — the browser tab or
// window becoming visible again, a bfcache restore (pageshow), or the native app
// resuming from the background. Entitlement state is read from the server, and a
// plan can change while the app sits in the background: a subscription lapses,
// renews, or is refunded. A screen that was already open would otherwise keep
// deciding from the record it read at launch, so every access gate re-reads the
// record when the app comes back.
//
// Throttled to at most one call per MIN_INTERVAL_MS: flicking between apps and
// tabs must not fire a burst of reads, and a call already in flight is never
// doubled up.
const MIN_INTERVAL_MS = 60 * 1000;

export default function useAppResumeRefresh(onResume) {
  const callbackRef = useRef(onResume);
  const lastRunRef = useRef(0);
  const runningRef = useRef(false);

  // Keep the latest callback without re-subscribing the listeners.
  useEffect(() => { callbackRef.current = onResume; });

  useEffect(() => {
    let cancelled = false;
    let removeNative = null;

    const run = () => {
      if (document.visibilityState !== 'visible') return;
      const now = Date.now();
      if (runningRef.current || now - lastRunRef.current < MIN_INTERVAL_MS) return;
      lastRunRef.current = now;
      runningRef.current = true;
      Promise.resolve()
        .then(() => callbackRef.current?.())
        .catch(() => {}) // a failed re-read is handled where access is decided
        .finally(() => { runningRef.current = false; });
    };

    document.addEventListener('visibilitychange', run);
    window.addEventListener('pageshow', run);
    window.addEventListener('focus', run);

    // Native: the WebView stays "visible" while the app is backgrounded, so
    // visibilitychange alone would never fire — Capacitor's resume event does.
    CapacitorApp.addListener('appStateChange', (state) => {
      if (state?.isActive) run();
    }).then((handle) => {
      if (cancelled) {
        handle.remove().catch(() => {});
        return;
      }
      removeNative = () => handle.remove().catch(() => {});
    }).catch(() => {});

    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', run);
      window.removeEventListener('pageshow', run);
      window.removeEventListener('focus', run);
      removeNative?.();
    };
  }, []);
}
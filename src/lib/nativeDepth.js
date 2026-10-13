import { Capacitor, registerPlugin } from '@capacitor/core';

// Bridge to the native depth module (ios/App/App/AgesDepthPlugin.swift).
//
// On the web, on Android, and in any app build that predates the module, every
// call here rejects — the Anomaly Camera reads that as "no depth sensor" and
// simply does not offer the depth method, so nothing else in the tool changes.
const AgesDepth = registerPlugin('AgesDepth');

let supportPromise = null;

/**
 * Resolve once per app run whether this device can do a depth scan.
 *
 * @returns {Promise<{ supported: boolean, detail: string }>}
 */
export function depthSupport() {
  if (!supportPromise) {
    supportPromise = (async () => {
      try {
        if (!Capacitor.isNativePlatform()) return { supported: false, detail: 'Not a device build.' };
        const result = await AgesDepth.isSupported();
        return { supported: !!result?.supported, detail: result?.detail || '' };
      } catch {
        return { supported: false, detail: 'No depth module in this build.' };
      }
    })();
  }
  return supportPromise;
}

/** Start the native depth stream. Frames arrive through onDepthFrame(). */
export async function startDepthStream(fps = 8) {
  await AgesDepth.start({ fps });
}

/** Stop the native depth stream. Safe to call when nothing is running. */
export async function stopDepthStream() {
  try {
    await AgesDepth.stop();
  } catch { /* never started, or the module is absent */ }
}

/**
 * Subscribe to depth frames. Each frame carries the colourised depth image as a
 * data URL, the forms detected in it (normalised boxes), and the depth readings
 * behind them. Returns an unsubscribe function.
 */
export function onDepthFrame(handler) {
  const handle = AgesDepth.addListener('frame', handler);
  return () => {
    Promise.resolve(handle)
      .then((listener) => listener.remove())
      .catch(() => {});
  };
}
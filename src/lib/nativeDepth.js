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
/**
 * Move the detector's two gates: `protrusion` is how far a form must stand in
 * front of the background surface to count (metres), `minHeight` is the smallest
 * form counted (fraction of the frame height). They apply to the next frame, so a
 * change is visible mid-session. Callable with no session running — the module
 * simply remembers the values. Silent when the module is absent.
 */
export async function setDepthDetection(protrusion, minHeight) {
  try {
    await AgesDepth.setDetection({ protrusion, minHeight });
  } catch { /* module absent (web, or a build without the depth module) */ }
}

export function onDepthFrame(handler) {
  const handle = AgesDepth.addListener('frame', handler);
  return () => {
    Promise.resolve(handle)
      .then((listener) => listener.remove())
      .catch(() => {});
  };
}
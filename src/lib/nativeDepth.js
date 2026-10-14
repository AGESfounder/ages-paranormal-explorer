import { Capacitor, registerPlugin } from '@capacitor/core';

// Bridge to the native depth module (ios/App/App/AgesDepthPlugin.swift).
//
// The module has to be registered with the native bridge to respond at all: on
// iOS the app-local AgesBridgeViewController registers it at startup. A rejected
// isSupported() therefore means "no depth module in this build", which the
// support result reports as status 'unregistered' — distinct from a connected
// module answering that the device has no depth sensor, and from a web build
// that can never have one. The Anomaly Camera only ever offers the depth method
// on a connected, supported result.
const AgesDepth = registerPlugin('AgesDepth');

let supportPromise = null;

/**
 * Resolve once per app run whether this device can do a depth scan.
 *
 * @returns {Promise<{ supported: boolean, detail: string, status: 'web'|'unregistered'|'connected', camera: string }>}
 */
export function depthSupport() {
  if (!supportPromise) {
    supportPromise = (async () => {
      if (!Capacitor.isNativePlatform()) return { supported: false, detail: 'Not a device build.', status: 'web', camera: '' };
      try {
        const result = await AgesDepth.isSupported();
        return {
          supported: !!result?.supported,
          detail: result?.detail || '',
          status: 'connected',
          camera: result?.camera || '',
        };
      } catch {
        return { supported: false, detail: 'No depth module in this build.', status: 'unregistered', camera: '' };
      }
    })();
  }
  return supportPromise;
}

/**
 * Start the native depth stream. Frames arrive through onDepthFrame().
 *
 * On failure the thrown error carries the native code, normalised into
 * categories the UI can act on:
 *   'depth_unsupported'       — module answered; the device has no depth sensor
 *   'camera_permission_denied'— the camera permission was refused before
 *   'plugin_unavailable'      — the module did not answer this call at all
 * anything else               — a runtime start failure
 */
export async function startDepthStream(fps = 8) {
  try {
    await AgesDepth.start({ fps });
  } catch (e) {
    const code = e?.code || 'plugin_unavailable';
    const category = code === 'camera_permission_denied' ? 'permission'
      : code === 'depth_unsupported' ? 'unsupported'
        : code === 'plugin_unavailable' ? 'unavailable' : 'runtime';
    const err = new Error(e?.message || 'The depth session could not start.');
    Object.assign(err, { code, category });
    throw err;
  }
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

/**
 * Subscribe to native depth failures. Each payload is { code, category,
 * message }: category is 'permission' (camera unauthorised), 'unsupported'
 * (hardware or configuration), or 'runtime' (the ARKit session was running and
 * then failed). The frame payload and frame event are unchanged. Returns an
 * unsubscribe function.
 */
export function onDepthError(handler) {
  const handle = AgesDepth.addListener('error', handler);
  // An absent module rejects the listener promise; the support probe already
  // reported that state, so the subscription is simply inert there.
  Promise.resolve(handle).catch(() => {});
  return () => {
    Promise.resolve(handle)
      .then((listener) => listener.remove())
      .catch(() => {});
  };
}
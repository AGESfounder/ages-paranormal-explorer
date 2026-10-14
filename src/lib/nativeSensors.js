import { Capacitor, registerPlugin } from '@capacitor/core';

// Bridge to the native environment-sensor module (AgesSensors).
//
// A phone's magnetic-field sensor and barometer are not exposed to a web view at
// all — the browser motion events carry acceleration, rotation and orientation,
// never field strength or pressure. So the Environmental Anomaly Monitor reads both
// through a native module: on iOS Apple's motion framework, on Android the system
// sensor service. Both report the same reading shape, so nothing here branches per
// platform.
//
// The module has to be registered with the native bridge to respond at all: on
// iOS the app-local AgesBridgeViewController registers it at startup. The
// support probe therefore reports three distinct states — 'web' (a browser can
// never reach the sensors), 'unregistered' (a native build whose module is not
// linked — a build problem, not a device verdict), and 'connected' (the module
// answered and the booleans say what the device actually has).
const AgesSensors = registerPlugin('AgesSensors');

let supportPromise = null;

/**
 * Resolve once per app run which of the two sensors this device actually has.
 *
 * @returns {Promise<{ magnetometer: boolean, barometer: boolean, status: 'web'|'unregistered'|'connected', detail: string }>}
 */
export function sensorSupport() {
  if (!supportPromise) {
    supportPromise = (async () => {
      if (!Capacitor.isNativePlatform()) {
        return { magnetometer: false, barometer: false, status: 'web', detail: 'A web browser cannot reach the phone\'s sensors.' };
      }
      try {
        const result = await AgesSensors.isSupported();
        return {
          magnetometer: !!result?.magnetometer,
          barometer: !!result?.barometer,
          status: 'connected',
          detail: result?.altimeterAuth || '',
        };
      } catch (e) {
        // The module did not answer: it is not linked into this build (or the
        // bridge came up before registration finished). Never read this as the
        // device lacking sensors.
        return { magnetometer: false, barometer: false, status: 'unregistered', detail: e?.message || 'The native sensor module did not respond.' };
      }
    })();
  }
  return supportPromise;
}

/** Start the native sensor stream. Readings arrive through onSensorReading(). */
export async function startSensors(fps = 10) {
  await AgesSensors.start({ fps });
}

/** Stop the native sensor stream. Safe to call when nothing is running. */
export async function stopSensors() {
  try {
    await AgesSensors.stop();
  } catch { /* never started, or the module is absent */ }
}

/**
 * Subscribe to sensor readings. Each reading is
 * { magnetic: { x, y, z, total } | null, pressure: number | null, movement: number }
 * where pressure is hPa, magnetic.total is microtesla, and movement is how far the
 * phone is from rest (m/s², 0 when the device has no accelerometer). Returns an
 * unsubscribe function.
 */
export function onSensorReading(handler) {
  const handle = AgesSensors.addListener('reading', handler);
  return () => {
    Promise.resolve(handle)
      .then((listener) => listener.remove())
      .catch(() => {});
  };
}

/**
 * Subscribe to native sensor faults while a session runs. Each payload is
 * { code, category, message }: category is 'permission' (e.g. the altimeter was
 * refused) or 'runtime' (a stream fault after a successful start). Additive —
 * the reading payload and shape are unchanged. Returns an unsubscribe function.
 */
export function onSensorError(handler) {
  const handle = AgesSensors.addListener('error', handler);
  // An absent module rejects the listener promise; the support probe already
  // reported that state, so the subscription is simply inert there.
  Promise.resolve(handle).catch(() => {});
  return () => {
    Promise.resolve(handle)
      .then((listener) => listener.remove())
      .catch(() => {});
  };
}
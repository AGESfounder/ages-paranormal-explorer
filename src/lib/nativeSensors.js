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
// On the web, and in any build that predates the module, the calls reject: the tool
// reads that as "no such sensor on this device" and says so on screen, rather than
// showing a meter that is not measuring anything.
const AgesSensors = registerPlugin('AgesSensors');

let supportPromise = null;

/**
 * Resolve once per app run which of the two sensors this device actually has.
 *
 * @returns {Promise<{ magnetometer: boolean, barometer: boolean }>}
 */
export function sensorSupport() {
  if (!supportPromise) {
    supportPromise = (async () => {
      try {
        if (!Capacitor.isNativePlatform()) return { magnetometer: false, barometer: false };
        const result = await AgesSensors.isSupported();
        return { magnetometer: !!result?.magnetometer, barometer: !!result?.barometer };
      } catch {
        return { magnetometer: false, barometer: false };
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
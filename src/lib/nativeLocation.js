/**
 * Native (Capacitor) location acquisition, written as pure functions that
 * receive the Geolocation plugin as an argument so the full
 * permission -> position sequence can be exercised without a device.
 *
 * Plugin contract this relies on (@capacitor/geolocation 7.1.8, read from the
 * plugin source in node_modules, identical codes on Android and iOS):
 *   - checkPermissions() / requestPermissions() REJECT with OS-PLUG-GLOC-0007
 *     ("Location services are not enabled.") when the device-level location
 *     switch is off, before any permission state is returned.
 *   - getCurrentPosition() rejects with 0003 (permission denied), 0008
 *     (restricted), 0009 (user refused to enable location), 0010 (timeout,
 *     Android only), 0002 and others (unavailable).
 *   - iOS getCurrentPosition ignores `timeout` entirely, so the JS side must
 *     enforce its own time limit or a missing GPS fix would wait forever.
 */

export const LOCATION_MESSAGES = {
  denied:
    'Location permission is off for AGES. Allow location access in your device settings, then retry.',
  services_off:
    'Location services are turned off on this device. Turn them on in your device settings, then retry.',
  timeout: 'Location request timed out. Check GPS signal and try again.',
  unavailable: 'Could not determine your location. Check GPS signal and try again.',
  unsupported: 'Geolocation is not supported on this device or browser.',
};

const CODE_RE = /OS-PLUG-GLOC-(\d{4})/;

/**
 * Map a Capacitor Geolocation rejection to one of:
 * 'denied' | 'services_off' | 'timeout' | 'unavailable' | 'unsupported'.
 * The numeric plugin code is authoritative; message matching is only a
 * fallback for errors that carry no code.
 */
export function classifyLocationError(err) {
  const text = `${err?.code ?? ''} ${err?.message ?? err ?? ''}`;
  const match = text.match(CODE_RE);
  if (match) {
    const n = Number(match[1]);
    if (n === 3 || n === 8) return 'denied';
    if (n === 7 || n === 9) return 'services_off';
    if (n === 10) return 'timeout';
    return 'unavailable';
  }
  if (err?.code === 'UNIMPLEMENTED' || /not implemented/i.test(text)) return 'unsupported';
  if (/services (are )?(not enabled|disabled|off)|location (is )?disabled|enable location/i.test(text)) {
    return 'services_off';
  }
  if (/denied|not authori[sz]ed|permission/i.test(text)) return 'denied';
  if (/time(d)? ?out|in time/i.test(text)) return 'timeout';
  return 'unavailable';
}

const isGranted = (p) => p?.location === 'granted' || p?.coarseLocation === 'granted';
const canPrompt = (p) =>
  [p?.location, p?.coarseLocation].some((s) => s === 'prompt' || s === 'prompt-with-rationale');

function withWatchdog(promise, ms) {
  let timer;
  const guard = new Promise((_, reject) => {
    timer = setTimeout(
      () => reject({ code: 'OS-PLUG-GLOC-0010', message: 'Could not obtain location in time.' }),
      ms
    );
  });
  return Promise.race([promise, guard]).finally(() => clearTimeout(timer));
}

/**
 * One complete, self-contained attempt: fresh permission read -> (at most one)
 * OS permission prompt -> position. Never reads cached permission state and
 * never falls back to a second location stack.
 *
 * @returns {Promise<{ ok: true, coords: {lat:number,lng:number} } | { ok: false, error: string, message: string }>}
 */
export async function acquireNativePosition(
  Geolocation,
  { enableHighAccuracy = false, timeout = 10000, maximumAge = 60000 } = {}
) {
  const fail = (error) => ({
    ok: false,
    error,
    message: LOCATION_MESSAGES[error] || LOCATION_MESSAGES.unavailable,
  });

  let perm;
  try {
    perm = await Geolocation.checkPermissions();
  } catch (e) {
    return fail(classifyLocationError(e));
  }

  if (!isGranted(perm)) {
    // Permanently denied: the OS will not show a prompt, so asking again can
    // only fail. Report it so the dialog can send the user to Settings.
    if (!canPrompt(perm)) return fail('denied');
    try {
      perm = await Geolocation.requestPermissions();
    } catch (e) {
      return fail(classifyLocationError(e));
    }
    if (!isGranted(perm)) return fail('denied');
  }

  // "Approximate only" grants cannot satisfy a high-accuracy request on
  // Android 12+; asking anyway would raise a second OS permission prompt.
  const highAccuracy = enableHighAccuracy && perm.location === 'granted';

  try {
    const pos = await withWatchdog(
      Geolocation.getCurrentPosition({ enableHighAccuracy: highAccuracy, timeout, maximumAge }),
      timeout + 3000
    );
    return { ok: true, coords: { lat: pos.coords.latitude, lng: pos.coords.longitude } };
  } catch (e) {
    return fail(classifyLocationError(e));
  }
}
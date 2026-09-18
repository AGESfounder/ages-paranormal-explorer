import { Capacitor } from '@capacitor/core';

/** True when running inside a Capacitor native shell (iOS/Android). */
export function isNativeApp() {
  try {
    return Capacitor.isNativePlatform();
  } catch {
    return false;
  }
}

export function haversineMiles(lat1, lon1, lat2, lon2) {
  const R = 3959;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * Resolve current position with native Geolocation on Capacitor, browser
 * geolocation fallback on web. Always returns a structured result — never
 * throws for permission denial.
 *
 * @returns {Promise<{ ok: true, coords: { lat: number, lng: number } } | { ok: false, error: 'denied'|'unavailable'|'timeout'|'unsupported', message: string }>}
 */
export async function getDevicePosition(options = {}) {
  const {
    enableHighAccuracy = false,
    timeout = 10000,
    maximumAge = 60000,
  } = options;

  if (isNativeApp()) {
    try {
      const { Geolocation } = await import('@capacitor/geolocation');
      let perm = await Geolocation.checkPermissions();
      if (perm.location === 'prompt' || perm.location === 'prompt-with-rationale' ||
          perm.coarseLocation === 'prompt' || perm.coarseLocation === 'prompt-with-rationale') {
        perm = await Geolocation.requestPermissions();
      }
      const granted =
        perm.location === 'granted' ||
        perm.coarseLocation === 'granted';
      if (!granted) {
        return {
          ok: false,
          error: 'denied',
          message:
            'Location permission denied. Enable location access in your device settings to find nearby tours and tag evidence.',
        };
      }
      const pos = await Geolocation.getCurrentPosition({
        enableHighAccuracy,
        timeout,
        maximumAge,
      });
      return {
        ok: true,
        coords: { lat: pos.coords.latitude, lng: pos.coords.longitude },
      };
    } catch (e) {
      const msg = String(e?.message || e || '');
      if (/denied|permission/i.test(msg)) {
        return {
          ok: false,
          error: 'denied',
          message:
            'Location permission denied. Enable location access in your device settings to find nearby tours and tag evidence.',
        };
      }
      // Fall through to browser geolocation if the plugin path fails for other reasons.
    }
  }

  if (typeof navigator === 'undefined' || !navigator.geolocation) {
    return {
      ok: false,
      error: 'unsupported',
      message: 'Geolocation is not supported on this device or browser.',
    };
  }

  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        resolve({
          ok: true,
          coords: { lat: pos.coords.latitude, lng: pos.coords.longitude },
        });
      },
      (err) => {
        const code = err?.code;
        if (code === 1) {
          resolve({
            ok: false,
            error: 'denied',
            message:
              'Location access denied. Allow location permission, or enter a zip code instead.',
          });
        } else if (code === 3) {
          resolve({
            ok: false,
            error: 'timeout',
            message: 'Location request timed out. Check GPS signal and try again.',
          });
        } else {
          resolve({
            ok: false,
            error: 'unavailable',
            message: 'Could not determine your location. Try again or enter a zip code.',
          });
        }
      },
      { enableHighAccuracy, timeout, maximumAge }
    );
  });
}

/** Human-readable message for getUserMedia / MediaRecorder failures. */
export function mediaPermissionMessage(err, kind = 'microphone') {
  const name = err?.name || '';
  const msg = String(err?.message || '');
  if (name === 'NotAllowedError' || name === 'PermissionDeniedError' || /denied/i.test(msg)) {
    if (kind === 'camera') {
      return 'Camera access denied. Allow camera (and microphone) permission in your device settings, then try again.';
    }
    if (kind === 'both') {
      return 'Camera or microphone access denied. Allow both permissions in your device settings, then try again.';
    }
    return 'Microphone access denied. Allow microphone permission in your device settings, then try again.';
  }
  if (name === 'NotFoundError' || name === 'DevicesNotFoundError') {
    return kind === 'camera' || kind === 'both'
      ? 'No camera was found on this device.'
      : 'No microphone was found on this device.';
  }
  if (name === 'NotReadableError' || name === 'TrackStartError') {
    return kind === 'camera' || kind === 'both'
      ? 'Camera is in use by another app. Close other camera apps and try again.'
      : 'Microphone is in use by another app. Close other audio apps and try again.';
  }
  if (name === 'SecurityError') {
    return 'Media access blocked by the browser security policy. Use HTTPS or the native app.';
  }
  return kind === 'camera' || kind === 'both'
    ? 'Could not start the camera. Please try again.'
    : 'Could not start the microphone. Please try again.';
}

/**
 * Request mic/camera via getUserMedia with structured errors.
 * Live camera + canvas recording stays on browser MediaStream APIs
 * (a still-photo plugin cannot replace this path).
 */
export async function requestUserMedia(constraints) {
  if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
    return {
      ok: false,
      error: 'unsupported',
      message: 'Media capture is not supported in this environment.',
      stream: null,
    };
  }
  try {
    const stream = await navigator.mediaDevices.getUserMedia(constraints);
    return { ok: true, stream, error: null, message: '' };
  } catch (err) {
    const kind = constraints?.video && constraints?.audio
      ? 'both'
      : constraints?.video
        ? 'camera'
        : 'microphone';
    return {
      ok: false,
      error: err?.name || 'error',
      message: mediaPermissionMessage(err, kind),
      stream: null,
    };
  }
}
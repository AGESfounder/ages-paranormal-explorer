const KEY = 'ages_offline_tours';

function readAll() {
  try {
    return JSON.parse(localStorage.getItem(KEY)) || {};
  } catch {
    return {};
  }
}

function writeAll(map) {
  try {
    localStorage.setItem(KEY, JSON.stringify(map));
    return true;
  } catch {
    return false;
  }
}

export function isTourOffline(tourId) {
  return !!readAll()[tourId];
}

/**
 * Persist a tour + stops snapshot for offline reading after server fetch failure.
 * Scope is intentionally limited to the tour/stop JSON snapshot — not media, maps,
 * or full filesystem downloads.
 *
 * @returns {{ ok: true, savedAt: number } | { ok: false, error: string, message: string }}
 */
export function saveTourOffline(tour, stops, userId) {
  if (!tour?.id) {
    return {
      ok: false,
      error: 'invalid',
      message: 'Cannot save offline: tour is missing an id.',
    };
  }
  const map = readAll();
  const entry = {
    tour,
    stops: Array.isArray(stops) ? stops : [],
    savedAt: Date.now(),
    scope: 'tour_stop_snapshot',
    saved_by_user_id: userId || null,
  };
  map[tour.id] = entry;
  if (!writeAll(map)) {
    // Attempt recovery by dropping oldest entries once, then retry.
    const ids = Object.keys(map).sort(
      (a, b) => (map[a]?.savedAt || 0) - (map[b]?.savedAt || 0)
    );
    if (ids.length > 1) {
      delete map[ids[0]];
      map[tour.id] = entry;
      if (!writeAll(map)) {
        return {
          ok: false,
          error: 'quota',
          message:
            'Device storage is full. Remove an offline tour or free space, then try again. Offline save stores tour and stop text only — not media or maps.',
        };
      }
    } else {
      return {
        ok: false,
        error: 'quota',
        message:
          'Device storage is full. Free space and try again. Offline save stores tour and stop text only — not media or maps.',
      };
    }
  }

  // Verify read-back so silent localStorage failures cannot report success.
  const verified = readAll()[tour.id];
  if (!verified || verified.tour?.id !== tour.id) {
    return {
      ok: false,
      error: 'verify',
      message: 'Offline save could not be verified. Please try again.',
    };
  }
  return { ok: true, savedAt: entry.savedAt };
}

export function removeTourOffline(tourId) {
  const map = readAll();
  delete map[tourId];
  if (!writeAll(map)) {
    return {
      ok: false,
      error: 'quota',
      message: 'Could not update offline storage. Please try again.',
    };
  }
  if (readAll()[tourId]) {
    return {
      ok: false,
      error: 'verify',
      message: 'Offline removal could not be verified. Please try again.',
    };
  }
  return { ok: true };
}

export function getOfflineTour(tourId) {
  return readAll()[tourId] || null;
}

export function getOfflineStop(stopId) {
  const map = readAll();
  for (const id of Object.keys(map)) {
    const entry = map[id];
    const s = entry.stops?.find((st) => st.id === stopId);
    if (s) return { stop: s, tour: entry.tour, allStops: entry.stops || [] };
  }
  return null;
}

export function listOfflineTourIds() {
  return Object.keys(readAll());
}

/**
 * List all saved offline tours as full entries (for the Saved tab).
 * Returns array of { tour, stops, savedAt, level, hasAudio } sorted newest first.
 */
export function listOfflineTours() {
  const map = readAll();
  return Object.values(map)
    .filter((e) => e && e.tour)
    .sort((a, b) => (b.savedAt || 0) - (a.savedAt || 0));
}
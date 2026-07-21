const KEY = 'ages_offline_tours';

function readAll() {
  try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch { return {}; }
}
function writeAll(map) {
  try { localStorage.setItem(KEY, JSON.stringify(map)); } catch { /* quota */ }
}

export function isTourOffline(tourId) {
  return !!readAll()[tourId];
}

export function saveTourOffline(tour, stops) {
  const map = readAll();
  map[tour.id] = { tour, stops, savedAt: Date.now() };
  writeAll(map);
}

export function removeTourOffline(tourId) {
  const map = readAll();
  delete map[tourId];
  writeAll(map);
}

export function getOfflineTour(tourId) {
  return readAll()[tourId] || null;
}

export function getOfflineStop(stopId) {
  const map = readAll();
  for (const id of Object.keys(map)) {
    const entry = map[id];
    const s = entry.stops?.find(st => st.id === stopId);
    if (s) return { stop: s, tour: entry.tour, allStops: entry.stops || [] };
  }
  return null;
}

export function listOfflineTourIds() {
  return Object.keys(readAll());
}
import { base44 } from '@/api/base44Client';
import { getDevicePosition, isNativeApp, isLocationTrackingEnabled, haversineMiles } from '@/lib/deviceCapabilities';

/**
 * Captures the current device GPS coordinates.
 * Returns { latitude, longitude } or null if unavailable/denied.
 */
let lastGps = null; // { latitude, longitude, at }

/**
 * Continuously track location while the Toolkit is open so the latest fix is
 * always ready at save time. Returns a stop function.
 */
export function primeGPS() {
  let stopped = false;
  let webId = null;
  let nativeId = null;
  const onFix = (lat, lng) => { lastGps = { latitude: lat, longitude: lng, at: Date.now() }; };
  const startWeb = () => {
    if (!navigator.geolocation) return;
    webId = navigator.geolocation.watchPosition(
      (p) => onFix(p.coords.latitude, p.coords.longitude),
      () => {},
      { enableHighAccuracy: true, maximumAge: 10000, timeout: 30000 }
    );
  };
  (async () => {
    if (isNativeApp()) {
      try {
        const { Geolocation } = await import('@capacitor/geolocation');
        const perm = await Geolocation.requestPermissions();
        if (stopped) return;
        nativeId = await Geolocation.watchPosition(
          { enableHighAccuracy: true, timeout: 30000, maximumAge: 10000 },
          (pos) => { if (pos) onFix(pos.coords.latitude, pos.coords.longitude); }
        );
        if (stopped && nativeId) Geolocation.clearWatch({ id: nativeId });
        return;
      } catch { /* fall back to web */ }
    }
    if (!stopped) startWeb();
  })();
  return () => {
    stopped = true;
    if (webId != null) navigator.geolocation.clearWatch(webId);
    if (nativeId) import('@capacitor/geolocation').then(({ Geolocation }) => Geolocation.clearWatch({ id: nativeId })).catch(() => {});
  };
}

export async function captureGPS() {
  // When the AGES Location Tracking setting is OFF, return a marker so callers
  // can show the tracking-off dialog instead of a generic GPS-failure dialog.
  if (!isLocationTrackingEnabled()) return { disabled: true };
  const fresh = await captureGPSRaw();
  if (fresh?.latitude) {
    lastGps = { ...fresh, at: Date.now() };
    return fresh;
  }
  // Return the error info (e.g. { error: 'denied' }) so callers can pass it
  // to GpsLocationDialog for the "Turn On Location Services" option.
  return fresh;
}

async function captureGPSRaw() {
  // First attempt: high accuracy, 8s timeout. If that fails (weak signal,
  // indoor use, timeout), retry with low accuracy and a longer timeout so
  // we still get approximate coordinates rather than none at all.
  let result = await getDevicePosition({ enableHighAccuracy: true, timeout: 8000, maximumAge: 30000 });
  if (!result?.ok) {
    result = await getDevicePosition({ enableHighAccuracy: false, timeout: 15000, maximumAge: 60000 });
  }
  if (!result?.ok) return { error: result?.error || 'unavailable' };
  return { latitude: result.coords.lat, longitude: result.coords.lng };
}

/**
 * Gets the user's active tour/stop context from their profile.
 * StopDetail sets last_tour_id, last_stop_id, last_stop_name, last_tour_title
 * when a stop is loaded, so toolkit tools can auto-link evidence to the
 * active investigation.
 * Returns { tour_id, stop_id, location_name } — empty object if no active tour.
 */
export async function getActiveContext() {
  try {
    const me = await base44.auth.me();
    if (!me) return {};
    const ctx = {};
    if (me.last_tour_id) ctx.tour_id = me.last_tour_id;
    if (me.last_stop_id) ctx.stop_id = me.last_stop_id;
    if (me.last_stop_name) ctx.location_name = me.last_stop_name;
    else if (me.last_tour_title) ctx.location_name = me.last_tour_title;
    return ctx;
  } catch {
    return {};
  }
}

/**
 * Builds a full evidence context: GPS coordinates + active tour/stop link.
 * Call this at save time from any evidence save path and merge the result
 * into the Evidence.create payload. Existing fields on the payload (e.g.
 * a tool-specific location_name) take precedence — this only fills gaps.
 */
async function fetchWithTimeout(url, opts = {}, ms = 8000) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), ms);
  try {
    const res = await fetch(url, { ...opts, signal: controller.signal });
    return res;
  } finally {
    clearTimeout(id);
  }
}

async function reverseGeocodeBigDataCloud(lat, lon) {
  try {
    const url = `https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${lat}&longitude=${lon}&localityLanguage=en`;
    const res = await fetchWithTimeout(url);
    if (!res.ok) return null;
    const d = await res.json();
    const street = d.streetName || d.streetNumber;
    const locality = d.locality || d.city || d.principalSubdivision;
    if (street && locality) return `${street}, ${locality}`;
    if (locality) return locality;
    if (street) return street;
    return null;
  } catch {
    return null;
  }
}

async function reverseGeocodeNominatim(lat, lon) {
  try {
    const url = `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lon}&format=json&addressdetails=1&zoom=14`;
    const res = await fetchWithTimeout(url, { headers: { 'Accept-Language': 'en' } });
    if (!res.ok) return null;
    const data = await res.json();
    const addr = data.address || {};
    const road = addr.road || addr.pedestrian || addr.path;
    const area = addr.neighbourhood || addr.suburb || addr.hamlet || addr.village || addr.town || addr.city;
    if (road && area) return `${road}, ${area}`;
    if (road) return road;
    if (area) return area;
    if (data.display_name) return data.display_name.split(',').slice(0, 2).join(',').trim();
    return null;
  } catch {
    return null;
  }
}

export async function reverseGeocodePlace(lat, lon) {
  // BigDataCloud is a free, key-less, client-side-friendly reverse geocoder
  // that is far more reliable than Nominatim. Fall back to Nominatim only if
  // BigDataCloud returns nothing, so the evidence still gets a place name.
  return (await reverseGeocodeBigDataCloud(lat, lon)) || (await reverseGeocodeNominatim(lat, lon));
}

// ── GPS evidence location label ──
// When GPS coordinates are captured for an evidence save, the location label
// should show the most useful accurate written location: if the investigator
// is sufficiently close to their active AGES tour stop, the stop name plus the
// reverse-geocoded locality (e.g. "Sachs Covered Bridge — Gettysburg,
// Pennsylvania"); otherwise just the locality (e.g. "Gettysburg, Pennsylvania").
// The actual GPS coordinates are always preserved — the stop name is a label
// only, never a coordinate substitution.

// When GPS coordinates are within this distance of a known AGES tour stop's
// stored coordinates, the evidence location label includes the stop name.
// 0.3 mi (~480 m) matches the app's existing sameSpot clustering threshold
// (HauntedLocations.jsx) and comfortably covers phone GPS inaccuracy
// (10-50 m outdoors) plus moderate stop-coordinate imprecision, while
// remaining tight enough that a user at a different nearby location does
// not get mislabeled. ALL known stops are checked (across all tours), and
// the nearest match is used — so the correct stop name is attached even
// when the user is viewing a different tour.
const NEARBY_STOP_THRESHOLD_MI = 0.3;

// Bounding-box deltas for the nearby-stop query. 1° latitude ≈ 69 mi, so
// 0.3 mi ≈ 0.00435°. We use a slightly larger box (0.005° lat ≈ 0.345 mi)
// and let the exact haversine filter narrow the results to ≤ 0.3 mi.
// 1° longitude ≈ 69 × cos(lat) mi; 0.008° covers 25°–50° US latitude.
const BBOX_LAT_DELTA = 0.005;
const BBOX_LON_DELTA = 0.008;

// Neutral fallback when no locality can be reverse-geocoded AND no known
// AGES stop is within the proximity threshold. Ensures the evidence record
// always has a readable location label while never attaching an unrelated
// or stale stop name.
const NEUTRAL_FALLBACK = 'GPS location captured';

async function reverseGeocodeLocalityBigDataCloud(lat, lon) {
  try {
    const url = `https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${lat}&longitude=${lon}&localityLanguage=en`;
    const res = await fetchWithTimeout(url);
    if (!res.ok) return null;
    const d = await res.json();
    const city = d.locality || d.city;
    const state = d.principalSubdivision;
    if (city && state && city !== state) return `${city}, ${state}`;
    if (city) return city;
    if (state) return state;
    return null;
  } catch {
    return null;
  }
}

async function reverseGeocodeLocalityNominatim(lat, lon) {
  try {
    // zoom=10 gives a city-level result (city + state) rather than the
    // street-level result (zoom=14) used by reverseGeocodeNominatim above.
    const url = `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lon}&format=json&addressdetails=1&zoom=10`;
    const res = await fetchWithTimeout(url, { headers: { 'Accept-Language': 'en' } });
    if (!res.ok) return null;
    const data = await res.json();
    const addr = data.address || {};
    const city = addr.city || addr.town || addr.village || addr.hamlet;
    const state = addr.state;
    if (city && state) return `${city}, ${state}`;
    if (city) return city;
    if (state) return state;
    return null;
  } catch {
    return null;
  }
}

// Returns "City, State" (e.g. "Gettysburg, Pennsylvania") or null.
async function reverseGeocodeLocality(lat, lon) {
  return (await reverseGeocodeLocalityBigDataCloud(lat, lon)) || (await reverseGeocodeLocalityNominatim(lat, lon));
}

/**
 * Find the nearest known AGES tour stop to the given GPS coordinates.
 * Queries ALL tour stops (across all tours) within a bounding box, then
 * filters by exact haversine distance ≤ NEARBY_STOP_THRESHOLD_MI. Returns
 * the nearest stop record, or null if none are within the threshold.
 * Only name, latitude and longitude are fetched to minimize data transfer.
 */
async function findNearestStop(lat, lon) {
  try {
    const res = await base44.entities.TourStop.filter(
      {
        latitude: { $gte: lat - BBOX_LAT_DELTA, $lte: lat + BBOX_LAT_DELTA },
        longitude: { $gte: lon - BBOX_LON_DELTA, $lte: lon + BBOX_LON_DELTA },
      },
      { limit: 100, fields: ['name', 'latitude', 'longitude'] }
    );
    const stops = res.items || [];
    let nearest = null;
    let nearestDist = Infinity;
    for (const s of stops) {
      if (s.latitude == null || s.longitude == null) continue;
      const d = haversineMiles(lat, lon, s.latitude, s.longitude);
      if (d <= NEARBY_STOP_THRESHOLD_MI && d < nearestDist) {
        nearest = s;
        nearestDist = d;
      }
    }
    return nearest;
  } catch {
    return null;
  }
}

/**
 * Resolve the best written location label for a GPS evidence save.
 * Checks ALL known AGES tour stops (not just the active one) for a stop
 * within NEARBY_STOP_THRESHOLD_MI of the GPS coordinates. If found, returns
 * "Stop Name — Locality" (or just the stop name if the locality is
 * unavailable). Otherwise returns just the locality, or a neutral fallback
 * if the locality is also unavailable. Never attaches an unrelated or stale
 * stop name — proximity is the only criterion. The actual GPS coordinates
 * are not modified.
 */
async function resolveGpsLocationName(lat, lon) {
  const [locality, nearestStop] = await Promise.all([
    reverseGeocodeLocality(lat, lon),
    findNearestStop(lat, lon),
  ]);

  if (nearestStop?.name) {
    if (locality) return `${nearestStop.name} — ${locality}`;
    return nearestStop.name;
  }

  return locality || NEUTRAL_FALLBACK;
}

/**
 * Forward-geocode a typed address to GPS coordinates using Nominatim.
 * Returns { latitude, longitude } or null if geocoding fails.
 */
export async function geocodeAddress(address) {
  try {
    const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(address)}&format=json&limit=1`;
    const res = await fetchWithTimeout(url, { headers: { 'Accept-Language': 'en' } });
    if (!res.ok) return null;
    const data = await res.json();
    if (data && data.length > 0) {
      return { latitude: parseFloat(data[0].lat), longitude: parseFloat(data[0].lon) };
    }
    return null;
  } catch {
    return null;
  }
}

export async function buildEvidenceContext(overrides = {}, options = {}) {
  // "Save Without Location": the user declined every location source, so the
  // record must carry NO location-derived data. Previously the last viewed
  // tour/stop from the user profile was attached anyway, which made the
  // journal show an old stop's name as if it were this save's location.
  if (overrides.location_source === 'NONE') return {};

  const activeCtx = await getActiveContext();
  const ctx = {};
  if (activeCtx.tour_id && !overrides.tour_id) ctx.tour_id = activeCtx.tour_id;
  if (activeCtx.stop_id && !overrides.stop_id) ctx.stop_id = activeCtx.stop_id;

  // When GPS coordinates are the location source, the location name MUST come
  // from reverse-geocoding those coordinates — NOT from the tour stop context.
  // The tour stop name describes a different physical location than the user's
  // actual GPS. Using it would label evidence "South Carolina tour stop" while
  // the coordinates point to the user's actual location hundreds of miles away.
  const isGpsSource = overrides.location_source === 'GPS';
  if (activeCtx.location_name && !overrides.location_name && !isGpsSource) {
    ctx.location_name = activeCtx.location_name;
  }

  // Skip GPS capture when coordinates are already provided (e.g., from the
  // useToolGpsSave dialog) or when the caller explicitly opts out.
  if (options.skipGps || (overrides.latitude != null && overrides.longitude != null)) {
    // When GPS coordinates are provided with location_source 'GPS', reverse-
    // geocode them to get the actual location name (unless an explicit
    // location_name override was provided by the caller, e.g. LocationTermBank).
    if (isGpsSource && overrides.latitude != null && !overrides.location_name && !ctx.location_name) {
      const place = await resolveGpsLocationName(overrides.latitude, overrides.longitude);
      if (place) ctx.location_name = place;
    }
    return ctx;
  }

  // Never let GPS hold up a save forever, but allow enough time for both the
  // high-accuracy (8s) and low-accuracy fallback (15s) attempts to finish.
  // Use the fix tracked while the tool was open (instant); only if there is
  // none, try a fresh capture.
  const cached = lastGps && Date.now() - lastGps.at < 30 * 60 * 1000 ? lastGps : null;
  const gps = cached
    ? cached
    : await Promise.race([captureGPS(), new Promise((r) => setTimeout(() => r(null), 26000))]);

  if (gps?.latitude) {
    ctx.latitude = gps.latitude;
    ctx.longitude = gps.longitude;
    ctx.location_source = 'GPS';
    // If no tour/stop context and no explicit location_name, reverse geocode
    // the GPS to a readable place name so the journal shows more than raw coords.
    if (!ctx.location_name && !overrides.location_name) {
      const place = await resolveGpsLocationName(gps.latitude, gps.longitude);
      if (place) ctx.location_name = place;
    }
  }
  return ctx;
}
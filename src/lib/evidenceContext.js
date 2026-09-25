import { base44 } from '@/api/base44Client';
import { getDevicePosition } from '@/lib/deviceCapabilities';

/**
 * Captures the current device GPS coordinates.
 * Returns { latitude, longitude } or null if unavailable/denied.
 */
export function captureGPS() {
  return getDevicePosition({ enableHighAccuracy: true, timeout: 8000, maximumAge: 30000 })
    .then((result) => {
      if (!result?.ok) return null;
      return { latitude: result.coords.lat, longitude: result.coords.lng };
    })
    .catch(() => null);
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
export async function reverseGeocodePlace(lat, lon) {
  try {
    const url = `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lon}&format=json&addressdetails=1&zoom=14`;
    const res = await fetch(url, { headers: { 'Accept-Language': 'en' } });
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

/**
 * Forward-geocode a typed address to GPS coordinates using Nominatim.
 * Returns { latitude, longitude } or null if geocoding fails.
 */
export async function geocodeAddress(address) {
  try {
    const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(address)}&format=json&limit=1`;
    const res = await fetch(url, { headers: { 'Accept-Language': 'en' } });
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

export async function buildEvidenceContext(overrides = {}) {
  const [gps, activeCtx] = await Promise.all([captureGPS(), getActiveContext()]);
  const ctx = {};
  if (activeCtx.tour_id && !overrides.tour_id) ctx.tour_id = activeCtx.tour_id;
  if (activeCtx.stop_id && !overrides.stop_id) ctx.stop_id = activeCtx.stop_id;
  if (activeCtx.location_name && !overrides.location_name) ctx.location_name = activeCtx.location_name;
  if (gps) {
    if (overrides.latitude == null) ctx.latitude = gps.latitude;
    if (overrides.longitude == null) ctx.longitude = gps.longitude;
    // If no tour/stop context and no explicit location_name, reverse geocode
    // the GPS to a readable place name so the journal shows more than raw coords.
    if (!ctx.location_name && !overrides.location_name) {
      const place = await reverseGeocodePlace(gps.latitude, gps.longitude);
      if (place) ctx.location_name = place;
    }
  }
  return ctx;
}
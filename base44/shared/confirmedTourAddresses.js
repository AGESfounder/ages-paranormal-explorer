import { haversine } from './geo.ts';
import { ownsTourLease } from './tourLease.js';

const streetWords = { n: 'north', s: 'south', e: 'east', w: 'west', st: 'street', ave: 'avenue', av: 'avenue', rd: 'road', ln: 'lane', dr: 'drive', blvd: 'boulevard', ct: 'court', pl: 'place', pkwy: 'parkway', hwy: 'highway', ter: 'terrace', cir: 'circle' };
const normalize = value => String(value || '').toLowerCase().replace(/[^a-z0-9 -]/g, '').trim().split(/\s+/).map(word => streetWords[word] || word).join(' ');
const houseAddress = address => String(address || '').split(',')[0].trim().match(/^(\d+[a-z]?(?:-\d+[a-z]?)?)\s+(.+)$/i);
const addressKey = address => normalize(address);

// A search hit must contain the requested house number AND street. A town,
// road midpoint, or guessed existing pin is never a confirmed address.
export function matchesConfirmedAddress(result, query) {
  const requested = houseAddress(query);
  const found = result.address || {};
  if (!requested || normalize(found.house_number) !== normalize(requested[1])) return false;
  const road = found.road || found.pedestrian || found.residential || found.footway;
  if (!road || normalize(road) !== normalize(requested[2])) return false;
  const zip = String(query).match(/\b(\d{5})(?:-\d{4})?\b/)?.[1];
  if (zip && String(found.postcode || '').slice(0, 5) !== zip) return false;
  const state = String(query).match(/(?:,\s*|\s)([A-Z]{2})(?:\s+\d{5}|\s*,|\s*$)/)?.[1];
  if (state && found['ISO3166-2-lvl4'] !== `US-${state}`) return false;
  const lat = Number(result.lat), lon = Number(result.lon);
  return Number.isFinite(lat) && Math.abs(lat) <= 90 && Number.isFinite(lon) && Math.abs(lon) <= 180;
}

function canCorrect(stop, counts) {
  return !['parking', 'shuttle'].includes(stop.stop_type) && !stop.same_structure
    && !stop.user_verified && !stop.verified_by_id && !stop.verified_date
    && (stop.needs_placement === true || stop.geocoded !== true || stop.latitude == null || stop.longitude == null)
    && typeof stop.address === 'string' && stop.address.length <= 300 && !!houseAddress(stop.address)
    && !/\b(near|vicinity|intersection|approximate|opposite)\b/i.test(stop.address)
    && counts.get(addressKey(stop.address)) === 1;
}

// Address-only opening pass. No AI, content generation, pin scattering, parking
// changes, stop reordering, or human-verification grants. Each bounded page is
// protected by the same lease as builds/repairs, but failed lookups are NOT cached.
export async function correctConfirmedTourAddresses(base44, tour, userId, nonce, offset, lookup) {
  const entities = base44.asServiceRole.entities;
  const page = await entities.TourStop.filter({ tour_id: tour.id }, { sort: 'id', limit: 100 });
  if (page.has_more) return { tourId: tour.id, updates: [], nextOffset: null, error: 'This tour needs an administrator review before its addresses can be checked.' };
  const counts = new Map();
  for (const stop of page.items.filter(s => !['parking', 'shuttle'].includes(s.stop_type))) {
    const key = addressKey(stop.address);
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  const candidates = page.items.slice(offset, offset + 10).filter(stop => canCorrect(stop, counts));
  const updates = [];
  for (const stop of candidates) {
    const coords = await lookup(stop);
    if (!coords) continue;
    // This is a wrong-region guard, not the walking radius. Valid addresses
    // outside the walking cluster still belong at their real location.
    if (tour.tour_category !== 'road_trip' && Number.isFinite(tour.start_latitude) && Number.isFinite(tour.start_longitude)
      && haversine(tour.start_latitude, tour.start_longitude, coords.lat, coords.lon) > 50) continue;
    if (!(await ownsTourLease(base44, tour.id, userId, nonce))) break;
    const fields = { latitude: coords.lat, longitude: coords.lon, geocoded: true, needs_placement: false };
    // Conditional writes protect a pin moved/verified while geocoding was in
    // flight, without reading and then overwriting a newer user's placement.
    const result = await entities.TourStop.updateMany({
      id: stop.id, tour_id: tour.id, address: stop.address,
      user_verified: { $ne: true }, same_structure: { $ne: true },
      verified_by_id: stop.verified_by_id ?? null, verified_date: stop.verified_date ?? null,
      latitude: stop.latitude ?? null, longitude: stop.longitude ?? null,
      geocoded: stop.geocoded ?? null, needs_placement: stop.needs_placement ?? null,
    }, { $set: fields });
    if (result?.updated) updates.push({ id: stop.id, ...fields,
      previous: { address: stop.address, latitude: stop.latitude, longitude: stop.longitude } });
  }
  console.log('Confirmed tour addresses checked:', { tourId: tour.id, checked: candidates.length, updated: updates.length });
  return { tourId: tour.id, updates, nextOffset: offset + 10 < page.items.length ? offset + 10 : null };
}
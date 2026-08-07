import { base44 } from '@/api/base44Client';

/**
 * Geocode an array of addresses via the geocode-addresses backend function.
 * Returns a map of address -> { lat, lon } (null if geocoding failed).
 * @param {string[]} addresses
 * @returns {Promise<Object>} { address: { lat, lon } | null }
 */
export async function geocodeAddresses(addresses) {
  const unique = [...new Set(addresses.filter(Boolean))];
  if (unique.length === 0) return {};

  try {
    const response = await base44.functions.invoke('geocode-addresses', { addresses: unique });
    return response.data?.results || {};
  } catch (e) {
    console.error('Geocoding failed:', e);
    return {};
  }
}

/**
 * Geocode stops using enhanced multi-strategy geocoding (name + address + city/state).
 * Uses the stop's landmark name as a geocoding query when the address is vague
 * (intersections, "near", no street number) — this finds the actual landmark
 * instead of a random intersection point.
 * @param {Array} stops — array of stop objects with {id, name, address, city, state}
 * @returns {Promise<Object>} { stopId: { lat, lon } | null }
 */
export async function geocodeStopsWithNames(stops, center) {
  if (!stops || stops.length === 0) return {};
  // Deduplicate by id
  const unique = [];
  const seen = new Set();
  for (const s of stops) {
    if (s.id && !seen.has(s.id)) {
      seen.add(s.id);
      unique.push({ id: s.id, name: s.name, address: s.address, city: s.city, state: s.state });
    }
  }
  if (unique.length === 0) return {};

  const results = {};
  // Process in batches of 10 (backend limit)
  for (let i = 0; i < unique.length; i += 10) {
    const batch = unique.slice(i, i + 10);
    try {
      const response = await base44.functions.invoke('geocode-addresses', { stops: batch, center: center ? { lat: center.lat, lon: center.lon } : null, maxDistMiles: center?.maxDistMiles, clusterRadius: center?.clusterRadius });
      const batchResults = response.data?.results || {};
      for (const [id, r] of Object.entries(batchResults)) {
        results[id] = r?.coords || null;
      }
    } catch (e) {
      console.error('Geocoding batch failed:', e);
    }
  }
  return results;
}
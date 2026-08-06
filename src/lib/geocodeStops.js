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
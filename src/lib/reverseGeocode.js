/**
 * Reverse-geocode a parking location to generate a descriptive name.
 * Uses Nominatim's reverse API to find the nearest road or area.
 * Returns a name like "Rodman Avenue Parking" or null if geocoding fails.
 */
export async function reverseGeocodeParking(lat, lon) {
  try {
    const url = `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lon}&format=json&addressdetails=1&zoom=18`;
    const res = await fetch(url, { headers: { 'Accept-Language': 'en' } });
    if (!res.ok) return null;
    const data = await res.json();
    const addr = data.address || {};
    const road = addr.road || addr.pedestrian || addr.path || addr.cycleway;
    const area = addr.neighbourhood || addr.hamlet || addr.suburb || addr.village || addr.town || addr.city;
    if (road) return `${road} Parking`;
    if (area) return `${area} Parking`;
    return null;
  } catch (e) {
    console.error('Reverse geocode failed:', e);
    return null;
  }
}

/**
 * Reverse-geocode coordinates to a one-line street address, for places that
 * store the lot's real address ("12 Main St, Salem, MA 01970") rather than a
 * name. Returns null when the lookup fails or resolves to nothing usable, so a
 * caller can leave the address it already has alone.
 */
export async function reverseGeocodeStreetAddress(lat, lon) {
  try {
    const url = `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lon}&format=json&addressdetails=1&zoom=18`;
    const res = await fetch(url, { headers: { 'Accept-Language': 'en' } });
    if (!res.ok) return null;
    const data = await res.json();
    const addr = data.address || {};
    const street = [addr.house_number, addr.road || addr.pedestrian || addr.path || addr.cycleway]
      .filter(Boolean).join(' ');
    const city = addr.city || addr.town || addr.village || addr.hamlet || addr.suburb;
    const region = [addr.state || addr.state_code, addr.postcode].filter(Boolean).join(' ');
    const line = [street, city, region].filter(Boolean).join(', ');
    return line || data.display_name || null;
  } catch (e) {
    console.error('Reverse geocode (address) failed:', e);
    return null;
  }
}
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
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Geocode a single address query via Nominatim (OpenStreetMap).
// LLM-generated GPS coordinates are often off by blocks or miles; this
// replaces them with real geocoded coordinates from the address string.
async function geocodeAddress(query) {
  const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(query)}`;
  const response = await fetch(url, {
    headers: { 'User-Agent': 'AGES-Paranormal-Explorer/1.0' },
  });
  if (!response.ok) return null;
  const data = await response.json();
  if (!data || data.length === 0) return null;
  return { lat: parseFloat(data[0].lat), lon: parseFloat(data[0].lon) };
}

export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();
    const addresses = body.addresses;
    if (!Array.isArray(addresses) || addresses.length === 0) {
      return Response.json({ error: 'addresses array required' }, { status: 400 });
    }

    // Deduplicate — many stops share the same address (e.g. landmark tours)
    const unique = [...new Set(addresses.filter(Boolean))];
    if (unique.length > 12) {
      return Response.json({ error: 'Max 12 unique addresses per call' }, { status: 400 });
    }

    const results = {};
    for (const addr of unique) {
      try {
        results[addr] = await geocodeAddress(addr);
      } catch (e) {
        console.error(`Geocode failed for "${addr}":`, e.message);
        results[addr] = null;
      }
      // Nominatim usage policy: max 1 request per second
      await sleep(1100);
    }

    return Response.json({ results });
  } catch (error) {
    console.error('Geocode function error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
}
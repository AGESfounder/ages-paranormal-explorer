import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Geocode a single query via Nominatim (OpenStreetMap).
async function geocodeQuery(query, countrycodes = 'us') {
  const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=${countrycodes}&q=${encodeURIComponent(query)}`;
  const response = await fetch(url, {
    headers: { 'User-Agent': 'AGES-Paranormal-Explorer/1.0' },
  });
  if (!response.ok) return null;
  const data = await response.json();
  if (!data || data.length === 0) return null;
  return { lat: parseFloat(data[0].lat), lon: parseFloat(data[0].lon) };
}

// Detect vague addresses that likely won't geocode to the actual landmark:
// intersections ("X & Y"), "near", "vicinity", "approach", or no street number.
function isVagueAddress(addr) {
  if (!addr) return true;
  const vaguePatterns = /\b(near|vicinity|approach|intersection of|various|future)\b/i;
  if (vaguePatterns.test(addr)) return true;
  // Intersection pattern: "X & Y" or "X and Y"
  if (/\s[&]\s/i.test(addr) || /\s+and\s+(st|street|ave|avenue|blvd|boulevard|rd|road|dr|drive|hwy|highway|pkwy|parkway)\b/i.test(addr)) return true;
  // No leading street number
  if (!/^\s*\d+\s/.test(addr)) return true;
  return false;
}

// Geocode a stop using multiple strategies:
// 1. Try the address (if not vague)
// 2. Try "stop name, city, state" (landmark name often resolves better)
// 3. Try simplified address (street + city + state, no cross-street)
async function geocodeStop(stop) {
  const { name, address, city, state } = stop;
  const cityState = [city, state].filter(Boolean).join(', ');
  const results = {};

  // Strategy 1: Full address (if not vague)
  if (address && !isVagueAddress(address)) {
    try {
      const r = await geocodeQuery(address);
      if (r) { results.address = r; return { coords: r, strategy: 'address' }; }
    } catch (e) { console.error(`Address geocode failed for "${address}":`, e.message); }
    await sleep(1100);
  }

  // Strategy 2: Landmark name + city/state (best for vague addresses)
  if (name && cityState) {
    const nameQuery = `${name}, ${cityState}`;
    try {
      const r = await geocodeQuery(nameQuery);
      if (r) { results.name = r; return { coords: r, strategy: 'name' }; }
    } catch (e) { console.error(`Name geocode failed for "${name}":`, e.message); }
    await sleep(1100);
  }

  // Strategy 3: Simplified address — strip cross-street info, keep main street
  if (address) {
    const simplified = address.replace(/\s*&.*$/, '').replace(/\bnear\b.*$/i, '').replace(/\bvicinity\b.*$/i, '').trim();
    if (simplified && simplified !== address) {
      try {
        const r = await geocodeQuery(simplified);
        if (r) { results.simplified = r; return { coords: r, strategy: 'simplified' }; }
      } catch (e) { console.error(`Simplified geocode failed for "${simplified}":`, e.message); }
      await sleep(1100);
    }
  }

  // Strategy 4: City/state centroid (last resort — at least gets the right town)
  if (cityState) {
    try {
      const r = await geocodeQuery(cityState);
      if (r) { results.centroid = r; return { coords: r, strategy: 'centroid' }; }
    } catch (e) { console.error(`Centroid geocode failed for "${cityState}":`, e.message); }
  }

  return { coords: null, strategy: 'failed' };
}

export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();

    // Enhanced mode: stops array with name + address + city + state
    if (Array.isArray(body.stops) && body.stops.length > 0) {
      if (body.stops.length > 10) {
        return Response.json({ error: 'Max 10 stops per call' }, { status: 400 });
      }
      const results = {};
      for (const stop of body.stops) {
        try {
          const r = await geocodeStop(stop);
          results[stop.id] = r;
        } catch (e) {
          console.error(`Geocode failed for stop "${stop.name}":`, e.message);
          results[stop.id] = { coords: null, strategy: 'error' };
        }
        await sleep(1100);
      }
      return Response.json({ results });
    }

    // Legacy mode: addresses array (backward compatible)
    const addresses = body.addresses;
    if (!Array.isArray(addresses) || addresses.length === 0) {
      return Response.json({ error: 'addresses or stops array required' }, { status: 400 });
    }

    const unique = [...new Set(addresses.filter(Boolean))];
    if (unique.length > 12) {
      return Response.json({ error: 'Max 12 unique addresses per call' }, { status: 400 });
    }

    const results = {};
    for (const addr of unique) {
      try {
        results[addr] = await geocodeQuery(addr);
      } catch (e) {
        console.error(`Geocode failed for "${addr}":`, e.message);
        results[addr] = null;
      }
      await sleep(1100);
    }

    return Response.json({ results });
  } catch (error) {
    console.error('Geocode function error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
}
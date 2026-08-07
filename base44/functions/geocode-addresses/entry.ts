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

function haversine(lat1, lon1, lat2, lon2) {
  const R = 3958.8;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// Reverse geocode to check if a point is on land (not in water/ocean)
async function reverseGeocode(lat, lon) {
  const url = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}&zoom=17`;
  const res = await fetch(url, { headers: { 'User-Agent': 'AGES-Paranormal-Explorer/1.0' } });
  if (!res.ok) return null;
  return await res.json();
}

function isOnLand(rev) {
  if (!rev) return false;
  const addr = rev.address || {};
  return !!(addr.road || addr.building || addr.house_number || addr.neighbourhood ||
    addr.suburb || addr.city || addr.town || addr.village || addr.amenity ||
    addr.tourism || addr.historic || (rev.category && rev.category !== 'boundary'));
}

// Geocode a stop using multiple strategies:
// 1. Try the address (if not vague)
// 2. Try "stop name, city, state" (landmark name often resolves better)
// 3. Try simplified address (street + city + state, no cross-street)
// Each result is rejected if >maxDistMiles from center (when provided) —
// prevents outliers like a stop geocoding to a different state entirely.
async function geocodeStop(stop, center, maxDistMiles, clusterRadius) {
  const { name, address, city, state } = stop;
  const cityState = [city, state].filter(Boolean).join(', ');
  const distFromCenter = (coords) => {
    if (!center || !coords) return Infinity;
    return haversine(center.lat, center.lon, coords.lat, coords.lon);
  };
  const withinMaxDist = (coords) => {
    if (!center || !coords) return true;
    return distFromCenter(coords) <= maxDistMiles;
  };
  // A result is "in cluster" if it's within clusterRadius of the tour center.
  // When clusterRadius is set (area/cold_spot/ship tours), an address result
  // that's within maxDistMiles but OUTSIDE the cluster is suspicious — it's
  // likely a bad geocode (wrong street match). In that case we don't short-
  // circuit; we fall through to the name strategy and pick the closest result.
  const withinCluster = (coords) => {
    if (!clusterRadius || !center || !coords) return true;
    return distFromCenter(coords) <= clusterRadius;
  };

  let bestResult = null;
  let bestDist = Infinity;

  // Strategy 1: Full address (if not vague)
  if (address && !isVagueAddress(address)) {
    try {
      const r = await geocodeQuery(address);
      if (r && withinMaxDist(r)) {
        if (withinCluster(r)) return { coords: r, strategy: 'address' };
        // Address result is within max but outside cluster — save as
        // fallback and try the name strategy (often finds the real landmark).
        bestResult = { coords: r, strategy: 'address' };
        bestDist = distFromCenter(r);
      }
    } catch (e) { console.error(`Address geocode failed for "${address}":`, e.message); }
    await sleep(1100);
  }

  // Strategy 2: Landmark name + city/state
  // Strip parenthetical additions like "(Approach)" or "(Site vicinity)"
  // that confuse Nominatim's landmark search.
  if (name && cityState) {
    const cleanName = name.replace(/\s*\([^)]*\)\s*/g, '').trim();
    const nameQuery = `${cleanName}, ${cityState}`;
    try {
      const r = await geocodeQuery(nameQuery);
      if (r && withinMaxDist(r)) {
        if (withinCluster(r)) return { coords: r, strategy: 'name' };
        const d = distFromCenter(r);
        if (d < bestDist) { bestResult = { coords: r, strategy: 'name' }; bestDist = d; }
      }
    } catch (e) { console.error(`Name geocode failed for "${name}":`, e.message); }
    await sleep(1100);
  }

  // Return the best valid geocode found so far. For linear tours (e.g., a
  // 1+ mile boardwalk), legitimate stops fall outside the cluster radius
  // but are still correctly geocoded — rejecting them would leave the stop
  // with inaccurate LLM coordinates. The cluster preference is already
  // applied above (in-cluster results return immediately); this is the
  // fallback for out-of-cluster but within-max-distance results.
  if (bestResult) return bestResult;

  // Strategy 3: Simplified address — strip cross-street info, keep main street
  if (address) {
    const simplified = address.replace(/\s*&.*$/, '').replace(/\bnear\b.*$/i, '').replace(/\bvicinity\b.*$/i, '').trim();
    if (simplified && simplified !== address) {
      try {
        const r = await geocodeQuery(simplified);
        if (r && withinMaxDist(r)) return { coords: r, strategy: 'simplified' };
      } catch (e) { console.error(`Simplified geocode failed for "${simplified}":`, e.message); }
      await sleep(1100);
    }
  }

  // Strategy 4: City/state centroid (last resort — at least gets the right town)
  if (cityState) {
    try {
      const r = await geocodeQuery(cityState);
      if (r && withinMaxDist(r)) return { coords: r, strategy: 'centroid' };
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
      const center = body.center || null;
      const maxDistMiles = body.maxDistMiles || 50;
      const clusterRadius = body.clusterRadius || null;
      const results = {};
      for (const stop of body.stops) {
        try {
          const r = await geocodeStop(stop, center, maxDistMiles, clusterRadius);
          // Water check: reject coordinates that reverse-geocode as water/ocean
          if (r?.coords) {
            try {
              const rev = await reverseGeocode(r.coords.lat, r.coords.lon);
              await sleep(1100);
              if (!isOnLand(rev)) {
                r.coords = null;
                r.strategy = 'water';
              }
            } catch (e) { /* keep result if reverse geocode fails */ }
          }
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
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Geocode a query via Nominatim
async function geocode(query) {
  const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=us&q=${encodeURIComponent(query)}`;
  const res = await fetch(url, { headers: { 'User-Agent': 'AGES-Paranormal-Explorer/1.0' } });
  if (!res.ok) return null;
  const data = await res.json();
  if (!data || data.length === 0) return null;
  return { lat: parseFloat(data[0].lat), lon: parseFloat(data[0].lon) };
}

// Reverse geocode to check if a point is on land (returns specific feature, not just county)
async function reverseGeocode(lat, lon) {
  const url = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}&zoom=17`;
  const res = await fetch(url, { headers: { 'User-Agent': 'AGES-Paranormal-Explorer/1.0' } });
  if (!res.ok) return null;
  return await res.json();
}

function isOnLand(rev) {
  if (!rev) return false;
  const addr = rev.address || {};
  // Explicitly water — reject
  if (addr.water || rev.category === 'water' || rev.class === 'water' || rev.type === 'water') return false;
  // Display name mentions a water body with no land address fields — reject
  if (rev.display_name && /\b(ocean|sea|gulf|strait|channel|bay|harbor|cove|inlet|lake|river|creek|stream|pond|reservoir)\b/i.test(rev.display_name)
      && !addr.road && !addr.building && !addr.house_number && !addr.amenity && !addr.tourism && !addr.historic) return false;
  // Any land indicator present — accept
  return !!(addr.road || addr.building || addr.house_number || addr.neighbourhood ||
    addr.suburb || addr.city || addr.town || addr.village || addr.amenity ||
    addr.tourism || addr.historic || addr.county || addr.state_district ||
    addr.postcode || (rev.category && rev.category !== 'boundary' && rev.category !== 'natural'));
}

// Query Overpass API for named features + military/historic features near a point
async function queryOverpass(lat, lon, radiusDeg = 0.012) {
  const r = radiusDeg.toFixed(6);
  const bbox = `${(lat - radiusDeg).toFixed(6)},${(lon - radiusDeg).toFixed(6)},${(lat + radiusDeg).toFixed(6)},${(lon + radiusDeg).toFixed(6)}`;
  const query = `[out:json][timeout:25];
  (
    node["name"](${bbox});
    way["name"](${bbox})["building"];
    way["name"](${bbox})["historic"];
    way["name"](${bbox})["military"];
    way["name"](${bbox})["tourism"];
    way["name"](${bbox})["amenity"];
    way["name"](${bbox})["leisure"];
    way["military"](${bbox});
    way["historic"](${bbox});
    node["military"](${bbox});
    node["historic"](${bbox});
  );
  out center tags 300;`;
  const res = await fetch('https://overpass-api.de/api/interpreter', {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain', 'User-Agent': 'AGES-Paranormal-Explorer/1.0' },
    body: query,
  });
  if (!res.ok) throw new Error(`Overpass error: ${res.status}`);
  const data = await res.json();
  return (data.elements || []).map((e) => ({
    lat: e.lat || e.center?.lat,
    lon: e.lon || e.center?.lon,
    name: e.tags?.name,
    tags: e.tags,
  })).filter((e) => e.lat && e.lon);
}

// Normalize a name for fuzzy matching
function normalizeName(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/\s*\([^)]*\)\s*/g, '')
    .replace(/^(the|a|an)\s+/, '')
    .replace(/\b(area|grounds|section|room|wing|building|the|site|of)\b/g, ' ')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// Match a stop name to an OSM feature by fuzzy name matching
function matchStopToFeature(stopName, features) {
  const stopNorm = normalizeName(stopName);
  if (!stopNorm) return null;
  const named = features.filter((f) => f.name);

  // Exact match
  for (const f of named) {
    if (normalizeName(f.name) === stopNorm) return f;
  }
  // Partial match (one contains the other)
  for (const f of named) {
    const fNorm = normalizeName(f.name);
    if (fNorm.length < 4) continue;
    if (stopNorm.includes(fNorm) || fNorm.includes(stopNorm)) return f;
  }
  // Keyword match — need at least 2 significant words in common
  const stopWords = stopNorm.split(' ').filter((w) => w.length > 3);
  let best = null;
  let bestScore = 0;
  for (const f of named) {
    const fNorm = normalizeName(f.name);
    if (fNorm.length < 4) continue;
    const score = stopWords.filter((w) => fNorm.includes(w)).length;
    if (score > bestScore) { bestScore = score; best = f; }
  }
  return bestScore >= 2 ? best : null;
}

function haversine(lat1, lon1, lat2, lon2) {
  const R = 3958.8;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function orderStopsByProximity(stops) {
  if (stops.length <= 1) return stops;
  const ordered = [stops[0]];
  const remaining = stops.slice(1);
  while (remaining.length > 0) {
    const last = ordered[ordered.length - 1];
    let nearestIdx = 0;
    let nearestDist = Infinity;
    for (let i = 0; i < remaining.length; i++) {
      const d = haversine(last.latitude, last.longitude, remaining[i].latitude, remaining[i].longitude);
      if (d < nearestDist) { nearestDist = d; nearestIdx = i; }
    }
    ordered.push(remaining.splice(nearestIdx, 1)[0]);
  }
  return ordered;
}

// Verifies and corrects stop coordinates for landmark/ship tours using
// OpenStreetMap's Overpass API (real mapped features) instead of LLM guesses.
// Also fixes collapsed coordinates and reorders by proximity.
// Admins can verify any tour; regular users can only verify their own tours.
export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();
    const tourId = body.tourId;
    if (!tourId) return Response.json({ error: 'tourId required' }, { status: 400 });

    const tour = await base44.asServiceRole.entities.Tour.get(tourId);
    if (!tour) return Response.json({ error: 'Tour not found' }, { status: 404 });
    if (tour.tour_category !== 'landmark' && tour.tour_category !== 'ship' && tour.tour_category !== 'cold_spot') {
      return Response.json({ error: 'Only landmark/ship/cold_spot tours supported' }, { status: 400 });
    }
    // Non-admins can only verify their own tours
    if (user.role !== 'admin' && tour.created_by_id !== user.id) {
      return Response.json({ error: 'Forbidden' }, { status: 403 });
    }

    const allStops = await base44.asServiceRole.entities.TourStop.filter({ tour_id: tourId });
    // Exclude parking stops — they have their own coordinates and should not
    // be reordered or matched to OSM features by the landmark/ship fixer.
    const stops = allStops.filter(s => s.stop_type !== 'parking');
    stops.sort((a, b) => (a.stop_number || 0) - (b.stop_number || 0));
    if (stops.length < 1) return Response.json({ tourId, updated: 0, reason: 'no stops' });

    // Step 1: Determine the property center. Always geocode the address first
    // (most reliable), then fall back to start coords. LLM-generated start
    // coords are often wrong (wrong location or in water), so the address
    // is the preferred source. If the address fails AND start coords are in
    // water, try geocoding the tour's start_location_name (progressively
    // shorter prefixes) + state — this finds landmarks like "Rackliffe House"
    // that Nominatim knows by name but not by address.
    let centerLat = null;
    let centerLon = null;

    if (stops[0]?.address) {
      const geo = await geocode(stops[0].address);
      if (geo) { centerLat = geo.lat; centerLon = geo.lon; }
      await sleep(1100);
    }

    // Fallback: try geocoding the tour's start_location_name + state when
    // address geocoding fails. Tries progressively shorter prefixes so
    // "Rackliffe House Manor Facade" eventually tries "Rackliffe House".
    const _debug = { addressTried: !!stops[0]?.address, addressResult: null, nameAttempts: [] };
    if ((!centerLat || !centerLon) && tour.start_location_name) {
      const stateName = tour.state || '';
      const words = tour.start_location_name.split(/\s+/).filter(w => w.length > 0);
      for (let len = words.length; len >= 2; len--) {
        const prefix = words.slice(0, len).join(' ');
        const query = `${prefix}, ${stateName}`;
        const geo = await geocode(query);
        _debug.nameAttempts.push({ query, geo });
        await sleep(1100);
        if (geo) {
          const rev = await reverseGeocode(geo.lat, geo.lon);
          const onLand = isOnLand(rev);
          _debug.nameAttempts[_debug.nameAttempts.length - 1].rev = rev ? { category: rev.category, onLand } : null;
          await sleep(1100);
          if (onLand) { centerLat = geo.lat; centerLon = geo.lon; break; }
        }
      }
    }

    if (!centerLat || !centerLon) {
      centerLat = tour.start_latitude;
      centerLon = tour.start_longitude;
      // Verify start coords are on land; if not, we can't proceed safely
      if (centerLat && centerLon) {
        const rev = await reverseGeocode(centerLat, centerLon);
        if (!isOnLand(rev)) {
          return Response.json({ tourId, updated: 0, reason: 'start coords in water and no valid address', _debug });
        }
        await sleep(1100);
      }
    }

    if (!centerLat || !centerLon) {
      return Response.json({ tourId, updated: 0, reason: 'cannot determine property center' });
    }

    // If we found a valid center via name geocoding (different from the
    // tour's start coords), update the tour's start coordinates so parking
    // generation and other fallbacks use the corrected on-land location.
    if (tour.start_latitude && tour.start_longitude &&
        (Math.abs(centerLat - tour.start_latitude) > 0.001 || Math.abs(centerLon - tour.start_longitude) > 0.001)) {
      await base44.asServiceRole.entities.Tour.update(tourId, {
        start_latitude: centerLat, start_longitude: centerLon,
      });
    }

    // Step 2: Query Overpass for named features near the center
    let features = [];
    try {
      features = await queryOverpass(centerLat, centerLon, 0.015);
    } catch (e) {
      console.error('Overpass query failed:', e.message);
    }

    // Step 3: Match each stop to an OSM feature by name
    const matched = new Set();
    const updates = [];
    for (const stop of stops) {
      const feature = matchStopToFeature(stop.name, features);
      if (feature) {
        updates.push({ id: stop.id, latitude: feature.lat, longitude: feature.lon, geocoded: true });
        matched.add(stop.id);
      }
    }

    // Step 4: For unmatched stops, distribute around the center in a grid.
    // Since all stops are within the same property/vessel, they should be
    // within a few hundred feet of the center.
    const unmatched = stops.filter((s) => !matched.has(s.id));
    if (unmatched.length > 0) {
      const offsetDeg = 0.0006; // ~200 feet
      const cols = Math.ceil(Math.sqrt(unmatched.length));
      unmatched.forEach((stop, i) => {
        const row = Math.floor(i / cols);
        const col = i % cols;
        updates.push({
          id: stop.id,
          latitude: centerLat + (row - (cols - 1) / 2) * offsetDeg,
          longitude: centerLon + (col - (cols - 1) / 2) * offsetDeg,
          geocoded: true,
        });
      });
    }

    // Step 5: Apply coordinate updates
    if (updates.length > 0) {
      await base44.asServiceRole.entities.TourStop.bulkUpdate(updates);
    }

    // Step 5b: Verify the parking stop. The LLM/geocoder often places parking
    // at a nearby visitor center or road that's far from the property or on a
    // narrow causeway that renders as water. If parking is more than 0.3 miles
    // from the corrected center, or reverse-geocodes as water, move it to the
    // verified on-land center so it sits with the tour stops.
    const parkingStop = allStops.find(s => s.stop_type === 'parking');
    if (parkingStop && parkingStop.latitude && parkingStop.longitude) {
      const pDist = haversine(centerLat, centerLon, parkingStop.latitude, parkingStop.longitude);
      let needsMove = pDist > 0.3;
      if (!needsMove) {
        const pRev = await reverseGeocode(parkingStop.latitude, parkingStop.longitude);
        needsMove = !isOnLand(pRev);
        await sleep(1100);
      }
      if (needsMove) {
        // Place parking just south of the center so it doesn't overlap a stop
        await base44.asServiceRole.entities.TourStop.update(parkingStop.id, {
          latitude: centerLat - 0.0004,
          longitude: centerLon,
          geocoded: true,
        });
      }
    }

    // Step 6: Reorder stops by proximity and set travel methods
    const updatedStops = stops.map((s) => {
      const u = updates.find((x) => x.id === s.id);
      return u ? { ...s, latitude: u.latitude, longitude: u.longitude } : s;
    });
    const ordered = orderStopsByProximity(updatedStops);
    const WALK_LIMIT = 0.33;
    const reorderUpdates = ordered.map((s, i) => {
      let travel = 'walking';
      if (i > 0) {
        const prev = ordered[i - 1];
        const dist = haversine(prev.latitude, prev.longitude, s.latitude, s.longitude);
        travel = dist <= WALK_LIMIT ? 'walking' : 'driving';
      }
      return { id: s.id, stop_number: i + 1, travel_method: travel };
    });
    await base44.asServiceRole.entities.TourStop.bulkUpdate(reorderUpdates);

    // Update tour type if needed
    const methods = new Set(reorderUpdates.map((u) => u.travel_method));
    const correctedType = methods.has('driving') && methods.has('walking') ? 'mixed'
      : methods.has('driving') ? 'driving' : 'walking';
    await base44.asServiceRole.entities.Tour.update(tourId, { tour_type: correctedType, user_reordered: false });

    return Response.json({
      tourId,
      title: tour.title,
      matched: matched.size,
      distributed: unmatched.length,
      total: stops.length,
      featuresFound: features.length,
    });
  } catch (error) {
    console.error('fix-collapsed-coords error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
}
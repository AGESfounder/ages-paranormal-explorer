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

// Query Overpass API for named features near a point
async function queryOverpass(lat, lon, radiusDeg = 0.012, limit = 300) {
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
  out center tags ${limit};`;
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

// Query Overpass for features matching a specific name pattern within a bbox
async function queryOverpassByName(stopName, bbox) {
  const norm = normalizeName(stopName);
  // Search by significant proper nouns, not the full name — "Piper House"
  // must find "Piper Farmhouse", which a full-name regex would miss.
  const commonWords = new Set(['house', 'farm', 'church', 'road', 'lane', 'inn', 'tavern', 'hotel', 'mill', 'bridge', 'fort', 'camp', 'site', 'area', 'park', 'building', 'grounds', 'section', 'room', 'wing']);
  let words = norm.split(' ').filter(w => w.length > 3 && !commonWords.has(w));
  if (words.length === 0) words = norm.split(' ').filter(w => w.length > 3);
  if (words.length === 0) return [];
  const pattern = words.map(w => w.replace(/["\\]/g, '\\$&')).join('|');
  const query = `[out:json][timeout:25];
  (
    node["name"~"${pattern}",i](${bbox});
    way["name"~"${pattern}",i](${bbox});
  );
  out center tags 50;`;
  const res = await fetch('https://overpass-api.de/api/interpreter', {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain', 'User-Agent': 'AGES-Paranormal-Explorer/1.0' },
    body: query,
  });
  if (!res.ok) return [];
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

// Check if a feature is a generic place (town, city, etc.) that shouldn't
// be matched as a specific landmark via partial substring matching.
function isGenericPlace(feature) {
  const tags = feature.tags || {};
  if (tags.place && ['town', 'city', 'village', 'hamlet', 'suburb', 'neighbourhood', 'county', 'state', 'island'].includes(tags.place)) {
    return true;
  }
  // Also reject boundary/administrative features — they're areas, not landmarks
  if (tags.boundary === 'administrative' || tags.admin_level) return true;
  return false;
}

// Check if two words are "close" — exact, plural/singular, or Levenshtein distance 1
function wordsAreClose(w1, w2) {
  if (w1 === w2) return true;
  // Substring match: "house" is part of "farmhouse", "mill" is part of "miller"
  if (w1.length >= 4 && w2.length >= 4 && (w1.includes(w2) || w2.includes(w1))) return true;
  if (w1.length > 4 && w2.length > 4) {
    // Plural/singular: "harpers" → "harper"
    if (w1.replace(/s$/, '') === w2.replace(/s$/, '')) return true;
  }
  // Levenshtein distance 1 for words of similar length
  if (Math.abs(w1.length - w2.length) <= 1 && w1.length > 4) {
    let diff = 0;
    const [shorter, longer] = w1.length <= w2.length ? [w1, w2] : [w2, w1];
    let j = 0;
    for (let i = 0; i < longer.length; i++) {
      if (j < shorter.length && longer[i] === shorter[j]) { j++; }
      else { diff++; if (diff > 1) return false; }
    }
    return true;
  }
  return false;
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
  // Partial match — feature name contains stop name (more specific version
  // of the same place, e.g. "Jefferson Rock Connector" contains "Jefferson Rock")
  for (const f of named) {
    const fNorm = normalizeName(f.name);
    if (fNorm.length < 4) continue;
    if (fNorm.includes(stopNorm)) return f;
  }
  // Partial match — stop name contains feature name, but ONLY if the feature
  // is NOT a generic place (town, city, etc.) — "Harpers Ferry Cemetery" should
  // NOT match the "Harpers Ferry" town node.
  for (const f of named) {
    const fNorm = normalizeName(f.name);
    if (fNorm.length < 4) continue;
    if (isGenericPlace(f)) continue;
    if (stopNorm.includes(fNorm)) return f;
  }
  // Keyword match — need at least 2 significant words in common (with
  // fuzzy word matching to catch plurals like "Harpers" → "Harper")
  const stopWords = stopNorm.split(' ').filter((w) => w.length > 3);
  let best = null;
  let bestScore = 0;
  for (const f of named) {
    if (isGenericPlace(f)) continue;
    const fNorm = normalizeName(f.name);
    if (fNorm.length < 4) continue;
    const fWords = fNorm.split(' ').filter(w => w.length > 3);
    let score = 0;
    for (const sw of stopWords) {
      for (const fw of fWords) {
        if (wordsAreClose(sw, fw)) { score++; break; }
      }
    }
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

// Verifies and corrects stop coordinates for ALL tour types using
// OpenStreetMap's Overpass API (real mapped features) instead of Nominatim
// guesses. For landmark/ship/cold_spot tours, all stops are on the same
// property — uses a single center point and distributes unmatched stops
// in a grid. For area/road_trip tours, stops are at different properties —
// uses a broad query covering all stops and keeps unmatched stops at their
// existing coordinates (no grid distribution). Collapsed coordinates
// (multiple stops at same point) trigger a wider per-stop name search.
export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();
    const tourId = body.tourId;
    const skipReorder = body.skipReorder || false;
    if (!tourId) return Response.json({ error: 'tourId required' }, { status: 400 });

    const tour = await base44.asServiceRole.entities.Tour.get(tourId);
    if (!tour) return Response.json({ error: 'Tour not found' }, { status: 404 });

    const allStops = await base44.asServiceRole.entities.TourStop.filter({ tour_id: tourId });
    const stops = allStops.filter(s => s.stop_type !== 'parking');
    stops.sort((a, b) => (a.stop_number || 0) - (b.stop_number || 0));
    if (stops.length < 1) return Response.json({ tourId, updated: 0, reason: 'no stops' });

    const isSingleSite = tour.tour_category === 'landmark' || tour.tour_category === 'ship' || tour.tour_category === 'cold_spot';
    const updates = [];
    const matched = new Set();

    if (isSingleSite) {
      // === SINGLE-SITE LOGIC (landmark/ship/cold_spot) ===
      // All stops are on the same property — find the property center,
      // query Overpass near it, match by name, distribute unmatched in a grid.

      let centerLat = null;
      let centerLon = null;

      if (stops[0]?.address) {
        const geo = await geocode(stops[0].address);
        if (geo) { centerLat = geo.lat; centerLon = geo.lon; }
        await sleep(1100);
      }

      // Fallback: try geocoding the tour's start_location_name + state
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

      // Update tour start coords if we found a better center
      if (tour.start_latitude && tour.start_longitude &&
          (Math.abs(centerLat - tour.start_latitude) > 0.001 || Math.abs(centerLon - tour.start_longitude) > 0.001)) {
        await base44.asServiceRole.entities.Tour.update(tourId, {
          start_latitude: centerLat, start_longitude: centerLon,
        });
      }

      let features = [];
      try {
        features = await queryOverpass(centerLat, centerLon, 0.015);
      } catch (e) {
        console.error('Overpass query failed:', e.message);
      }

      for (const stop of stops) {
        const feature = matchStopToFeature(stop.name, features);
        if (feature) {
          updates.push({ id: stop.id, latitude: feature.lat, longitude: feature.lon, geocoded: true });
          matched.add(stop.id);
        }
      }

      // Distribute unmatched stops in a grid around the center
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
          matched.add(stop.id);
        });
      }

      // Apply coordinate updates
      if (updates.length > 0) {
        await base44.asServiceRole.entities.TourStop.bulkUpdate(updates);
      }

      // Verify parking stop — move to center if too far or in water
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
          await base44.asServiceRole.entities.TourStop.update(parkingStop.id, {
            latitude: centerLat - 0.0004,
            longitude: centerLon,
            geocoded: true,
          });
        }
      }

    } else {
      // === MULTI-SITE LOGIC (area/road_trip) ===
      // ONLY fix stops that are COLLAPSED (sharing identical coordinates with
      // another stop) or IN WATER. Stops with unique, valid coordinates are
      // left alone — they were geocoded to their physical addresses and must
      // not be overridden by name-matching to potentially wrong OSM features.
      // "Stops with physical addresses should be marked at those addresses."

      // Identify collapsed stops (sharing identical coordinates)
      const coordMap = {};
      for (const s of stops) {
        if (s.latitude == null || s.longitude == null) continue;
        const key = `${s.latitude.toFixed(5)},${s.longitude.toFixed(5)}`;
        if (!coordMap[key]) coordMap[key] = [];
        coordMap[key].push(s);
      }
      // Collapse detection — same_structure aware. Skip groups where ALL stops
      // are same_structure: true (rooms/areas within one building legitimately
      // share coordinates). Only flag as collapsed if at least one stop is NOT
      // same_structure, indicating distinct buildings that were wrongly placed
      // at the same point.
      const collapsedStopIds = new Set();
      for (const group of Object.values(coordMap)) {
        if (group.length > 1) {
          const allSameStructure = group.every(s => s.same_structure === true);
          if (!allSameStructure) {
            for (const s of group) collapsedStopIds.add(s.id);
          }
        }
      }

      // Only fix collapsed stops or stops missing coordinates
      const needsFix = stops.filter(s =>
        collapsedStopIds.has(s.id) ||
        s.latitude == null || s.longitude == null
      );

      if (needsFix.length > 0) {
        if (tour.tour_category === 'road_trip') {
          // Per-stop Overpass queries for road trips (stops are far apart)
          for (const stop of needsFix) {
            const searchLat = stop.latitude || tour.start_latitude;
            const searchLon = stop.longitude || tour.start_longitude;
            if (!searchLat || !searchLon) continue;
            try {
              const stopFeatures = await queryOverpass(searchLat, searchLon, 0.015);
              const feature = matchStopToFeature(stop.name, stopFeatures);
              if (feature) {
                updates.push({ id: stop.id, latitude: feature.lat, longitude: feature.lon, geocoded: true });
                matched.add(stop.id);
              }
            } catch (e) {
              console.error(`Overpass query failed for stop "${stop.name}":`, e.message);
            }
            await sleep(1000);
          }
        } else {
          // Area tour: try address geocoding FIRST (physical address is most
          // accurate), then fall back to OSM name search if geocoding fails
          for (const stop of needsFix) {
            let fixed = false;
            // Step 1: Geocode the stop's physical address
            if (stop.address) {
              const geo = await geocode(`${stop.address}, ${tour.city || ''}, ${tour.state || ''}`);
              await sleep(1100);
              if (geo) {
                // Skip if geocoding returned the same coordinates that caused
                // the collapse — address geocoding is what put them there.
                // Fall through to OSM name search instead.
                const sameCoords = stop.latitude != null && stop.longitude != null &&
                  Math.abs(geo.lat - stop.latitude) < 0.001 && Math.abs(geo.lon - stop.longitude) < 0.001;
                if (!sameCoords) {
                  const rev = await reverseGeocode(geo.lat, geo.lon);
                  await sleep(1100);
                  if (isOnLand(rev)) {
                    updates.push({ id: stop.id, latitude: geo.lat, longitude: geo.lon, geocoded: true });
                    matched.add(stop.id);
                    fixed = true;
                  }
                }
              }
            }
            // Step 2: Fallback — OSM name search across the city area
            if (!fixed && tour.start_latitude && tour.start_longitude) {
              const cityBbox = `${(tour.start_latitude - 0.1).toFixed(6)},${(tour.start_longitude - 0.1).toFixed(6)},${(tour.start_latitude + 0.1).toFixed(6)},${(tour.start_longitude + 0.1).toFixed(6)}`;
              const cleanName = stop.name.replace(/\s*\([^)]*\)\s*/g, '').trim();
              if (cleanName && cleanName.length >= 4) {
                try {
                  const nameMatches = await queryOverpassByName(cleanName, cityBbox);
                  const feature = matchStopToFeature(stop.name, nameMatches);
                  if (feature) {
                    updates.push({ id: stop.id, latitude: feature.lat, longitude: feature.lon, geocoded: true });
                    matched.add(stop.id);
                  }
                } catch (e) {
                  console.error(`Name search failed for "${stop.name}":`, e.message);
                }
                await sleep(1000);
              }
            }
          }
        }

        // Apply coordinate updates
        if (updates.length > 0) {
          await base44.asServiceRole.entities.TourStop.bulkUpdate(updates);
        }
      }
    }

    // NOTE: Stop reordering is NOT done here. The frontend's enforceWalkingDistance
    // is the single source of truth for stop order — it properly separates the
    // walking cluster (near parking, first) from driving stops (at the end).
    // Reordering here with orderStopsByProximity would undo that ordering.

    return Response.json({
      tourId,
      title: tour.title,
      matched: matched.size,
      total: stops.length,
    });
  } catch (error) {
    console.error('fix-collapsed-coords error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
}
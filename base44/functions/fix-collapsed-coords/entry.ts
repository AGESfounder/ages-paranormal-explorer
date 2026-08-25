import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';

// Inline large-property detection — inlined (not imported from shared module)
// to ensure the deployed function always uses the latest keyword list.
const LARGE_PROPERTY_KEYWORDS = [
  'park', 'fort', 'farm', 'battlefield', 'battle field',
  'plantation', 'farmstead',
  'lake', 'dam', 'reservoir', 'recreation area',
  'wildlife refuge', 'preserve', 'forest', 'woods',
  'greenway', 'trail system', 'cemetery', 'graveyard',
  'campus', 'grounds', 'estate', 'manor',
];
function isLargeProperty(tour) {
  if (!tour) return false;
  const text = [
    tour.title || '',
    tour.start_location_name || '',
    tour.description || '',
  ].join(' ').toLowerCase();
  return LARGE_PROPERTY_KEYWORDS.some((kw) => {
    const escaped = kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp('\\b' + escaped + '\\b').test(text);
  });
}

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

// Search Nominatim for a landmark by name (not address). Returns the best
// match within maxDist miles of the reference point, or null. Used for
// shared-address stops where address geocoding would collapse all stops
// to the same point — name search finds the specific landmark instead.
async function geocodeByName(name, city, state, refLat, refLon, maxDist = 5) {
  // Try with city first, then without city (just name + state). The 5-mile
  // radius check from the reference point filters out wrong matches, so
  // searching without the city safely catches landmarks in neighboring
  // townships (e.g. "John Eisenhower Bridge" is in Cumberland Township, not
  // Gettysburg — searching with "Gettysburg" misses it, but "Pennsylvania"
  // alone finds it).
  const queries = city
    ? [`${name}, ${city}, ${state}`, `${name}, ${state}`]
    : [`${name}, ${state}`];
  let best = null;
  let bestDist = Infinity;
  for (const query of queries) {
    const url = `https://nominatim.openstreetmap.org/search?format=json&limit=5&countrycodes=us&q=${encodeURIComponent(query)}`;
    const res = await fetch(url, { headers: { 'User-Agent': 'AGES-Paranormal-Explorer/1.0' } });
    if (!res.ok) continue;
    const data = await res.json();
    if (!data || data.length === 0) continue;
    for (const d of data) {
      const lat = parseFloat(d.lat);
      const lon = parseFloat(d.lon);
      if (refLat && refLon) {
        const dist = haversine(refLat, refLon, lat, lon);
        if (dist < bestDist && dist <= maxDist) { bestDist = dist; best = { lat, lon }; }
      } else {
        best = { lat, lon };
        break;
      }
    }
    if (best) break;
  }
  return best;
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

// Normalize an address for comparison (lowercase, strip non-alphanumeric)
function normalizeAddr(a) {
  return String(a || '').toLowerCase().replace(/[^a-z0-9]/g, '').trim();
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

// Detect if a stop name refers to a ROOM, AREA, or SECTION within a single
// building/vessel rather than a distinct separate structure. Used to
// auto-classify stops the LLM failed to tag as same_structure: true.
// Matches names like "The Third Floor Hallway", "Guest Room 311",
// "The Main Lobby & Grand Staircase", "The Canary Café", "The Front Portico".
function looksLikeRoomOrArea(name) {
  const n = String(name || '').toLowerCase();
  const roomWords = [
    'room', 'floor', 'hallway', 'hall', 'lobby', 'staircase', 'stairs',
    'ballroom', 'café', 'cafe', 'dining', 'wing', 'level', 'basement',
    'attic', 'kitchen', 'parlor', 'parlour', 'suite', 'chamber',
    'corridor', 'portico', 'porch', 'exterior', 'interior', 'deck',
    'cabin', 'hold', 'galley', 'bridge', 'lounge', 'library', 'office',
    'mechanical', 'boiler', 'furnace', 'cellar', 'vault', 'tower room',
    'tower floor', 'penthouse', 'balcony', 'veranda', 'verandah',
    'foyer', 'vestibule', 'anteroom', 'anteroom', 'cloakroom',
    'ballroom', 'conservatory', 'orangery', 'solarium', 'sunroom',
    'study', 'den', 'sitting room', 'drawing room', 'morning room',
    'servants hall', 'servants\' hall', 'butler\'s pantry', 'pantry',
    'laundry', 'scullery', 'stillroom', 'dairy', 'brewery',
    'chapel', 'crypt', 'catacomb', 'ossuary', 'sepulchre',
    'promenade deck', 'lido deck', 'sun deck', 'boat deck',
    'engine room', 'boiler room', 'steerage', 'cargo hold',
    // Added after "Main Bar" & "Apartment Landing" stops were scattered
    // across the city by wrong web-search matches for generic room names
    'bar', 'taproom', 'tap room', 'apartment', 'landing', 'storage',
  ];
  // Word-boundary matching — substring matching causes false positives
  // (e.g., "bar" matches inside "barracks", "den" inside "garden").
  return roomWords.some((w) => {
    const escaped = w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp('\\b' + escaped + '\\b').test(n);
  });
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
    const verifyAll = body.verifyAll || false;
    if (!tourId) return Response.json({ error: 'tourId required' }, { status: 400 });

    const tour = await base44.asServiceRole.entities.Tour.get(tourId);
    if (!tour) return Response.json({ error: 'Tour not found' }, { status: 404 });

    const allStops = await base44.asServiceRole.entities.TourStop.filter({ tour_id: tourId });
    const stops = allStops.filter(s => s.stop_type !== 'parking');
    stops.sort((a, b) => (a.stop_number || 0) - (b.stop_number || 0));
    if (stops.length < 1) return Response.json({ tourId, updated: 0, reason: 'no stops' });

    const isSingleSite = tour.tour_category === 'landmark' || tour.tour_category === 'ship' || tour.tour_category === 'cold_spot';
    const largeProp = isLargeProperty(tour);
    console.log(`fix-collapsed-coords: tour="${tour.title}", category=${tour.tour_category}, largeProp=${largeProp}, isSingleSite=${isSingleSite}`);
    const verifyRadius = largeProp ? 2 : 0.5;
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
        // Skip stops the user has manually verified via marker drag —
        // their coordinates are correct and should not be overwritten.
        if (stop.user_verified) {
          matched.add(stop.id);
          continue;
        }
        // If generation already marked this stop same_structure: true (a room
        // within the building), use the building center — don't try Overpass,
        // which would match it to an unrelated nearby feature.
        // EXCEPT for large properties (lakes, dams, parks, forts): outdoor
        // areas like "The Dam Overlook Deck" or "Shoreline Trail" get wrongly
        // tagged same_structure during generation, collapsing distinct
        // outdoor sites to one point. For large properties, verify each stop
        // individually via Overpass/LLM instead.
        if (stop.same_structure === true && !largeProp) {
          updates.push({ id: stop.id, latitude: centerLat, longitude: centerLon, geocoded: true, same_structure: true, needs_placement: false });
          matched.add(stop.id);
          continue;
        }
        const feature = matchStopToFeature(stop.name, features);
        if (feature) {
          updates.push({ id: stop.id, latitude: feature.lat, longitude: feature.lon, geocoded: true, needs_placement: false });
          matched.add(stop.id);
        }
      }

      // For unmatched stops, try LLM web search to find real coordinates.
      // For large properties (parks, forts, farms, battlefields), do NOT
      // trust the LLM's original generation coordinates — they are often
      // wrong (user confirmed markers at Fort Miles are in incorrect spots).
      // Every unmatched stop must be verified via LLM web search. If no
      // definitive location is found, the stop is placed near the parking
      // area with a pink "Needs Placement" marker so a visitor can drag it
      // to the correct spot. For small properties, trust existing coords
      // within the verify radius (0.5 miles) — only search for outliers.
      const unmatched = stops.filter((s) => !matched.has(s.id));
      if (unmatched.length > 0) {
        let needsPlacementIdx = 0;
        const parkingStopData = allStops.find(s => s.stop_type === 'parking');
        const placementLat = (parkingStopData?.latitude || centerLat);
        const placementLon = (parkingStopData?.longitude || centerLon);
        for (const stop of unmatched) {
          const cleanName = stop.name.replace(/\s*\([^)]*\)\s*/g, '').trim();
          const looksLikeRoom = looksLikeRoomOrArea(cleanName);

          // ROOM/AREA within the building — use the building's coordinates
          // directly. Do NOT web search: a generic room name like "The Main
          // Bar" or "The Dining Room" matches a DIFFERENT business elsewhere
          // in the city, scattering markers. The room IS inside the building
          // at the building's coordinates — that's accurate, not a guess.
          // EXCEPT for large properties: outdoor structures like "The Dam
          // Overlook Deck" or "The Shoreline Trail" contain room words but
          // are distinct outdoor sites, not rooms in a building.
          if (looksLikeRoom && !largeProp) {
            updates.push({
              id: stop.id,
              latitude: centerLat,
              longitude: centerLon,
              same_structure: true,
              geocoded: true,
              needs_placement: false,
            });
            matched.add(stop.id);
            continue;
          }

          // SAME ADDRESS = SAME PROPERTY: For a single house/building (not a
          // large property like a fort or park), if this stop's address matches
          // the property's address, it's on the same property — place it at the
          // building center. The LLM routinely invents fake distinct coordinates
          // for areas of a single house ("The Garden", "The Fountain", "The Old
          // Oak"), scattering markers across town. Don't web-search these generic
          // names — that matches a different feature elsewhere and makes it
          // worse. Large properties are excluded: distinct buildings on a
          // fort/park can share one mailing address but need their own coords.
          if (!largeProp) {
            const propertyAddr = normalizeAddr(stops[0]?.address);
            const stopAddr = normalizeAddr(stop.address);
            if (propertyAddr && (stopAddr === propertyAddr || !stopAddr)) {
              updates.push({
                id: stop.id,
                latitude: centerLat,
                longitude: centerLon,
                same_structure: true,
                geocoded: true,
                needs_placement: false,
              });
              matched.add(stop.id);
              continue;
            }
          }

          // DISTINCT structure — for small properties, trust the LLM's
          // web-searched coordinates from generation IF they're within the
          // verify radius (0.5 miles). For large properties, do NOT trust
          // existing coords — go straight to LLM web search (the user has
          // confirmed LLM-generated coords at Fort Miles are wrong).
          if (!largeProp && stop.latitude != null && stop.longitude != null) {
            const dist = haversine(centerLat, centerLon, stop.latitude, stop.longitude);
            if (dist <= verifyRadius) {
              updates.push({ id: stop.id, geocoded: true, same_structure: false, needs_placement: false });
              matched.add(stop.id);
              continue;
            }
          }

          // No coordinates or outlier — search for its real coords.
          const prompt = `Search the web for the EXACT GPS coordinates of this location:

"${cleanName}"
within "${tour.title}" at ${tour.start_location_name || tour.city || ''}, ${tour.state}.

This stop is a DISTINCT building or structure on the property. The coordinates must be the REAL location of "${cleanName}", not the property's general location.

Search for its coordinates using:
- Official park/site maps (e.g., "${cleanName} ${tour.state} map GPS")
- Historical registry listings (National Register of Historic Places)
- Wikipedia articles with coordinates
- OpenStreetMap or Google Maps listings for "${cleanName} ${tour.city || ''} ${tour.state}"
- Historical preservation society documents
- Fort/park brochures with labeled maps

CRITICAL RULES:
1. Do NOT estimate, guess, or approximate. Only return coordinates you actually found via web search.
2. If you cannot find the real coordinates via web search, return found: false. Do NOT guess.

Return a JSON object with:
- found: true/false
- latitude: (number, only if found)
- longitude: (number, only if found)
- source: brief description of where you found the coordinates (only if found)`;
          let definitive = false;
          try {
            const llmResult = await base44.asServiceRole.integrations.Core.InvokeLLM({
              prompt,
              add_context_from_internet: true,
              model: 'gemini_3_flash',
              response_json_schema: {
                type: 'object',
                properties: {
                  found: { type: 'boolean' },
                  latitude: { type: 'number' },
                  longitude: { type: 'number' },
                  source: { type: 'string' },
                },
              },
            });
            if (llmResult.found && llmResult.latitude != null && llmResult.longitude != null) {
              const dist = haversine(centerLat, centerLon, llmResult.latitude, llmResult.longitude);
              if (dist <= verifyRadius) {
                updates.push({ id: stop.id, latitude: llmResult.latitude, longitude: llmResult.longitude, geocoded: true, needs_placement: false });
                matched.add(stop.id);
                definitive = true;
              }
            }
          } catch (e) {
            console.error(`Per-stop LLM search failed for "${stop.name}":`, e.message);
          }

          // No definitive location found.
          // For large properties: place near the parking area with a small
          // offset (unstacked) and mark as needs_placement (pink "Needs
          // Placement" marker). A visitor can drag it to the correct spot,
          // which clears needs_placement and turns it blue.
          // For small properties: mark as unverified (geocoded: false).
          if (!definitive) {
            if (largeProp) {
              // Place needs_placement stops in a circle around the parking
              // badge using the golden angle for even distribution at any count.
              const radius = 0.0002; // ~20 meters — surrounding parking, individually visible
              const angle = needsPlacementIdx * 2.39996; // golden angle (137.5°)
              const offsetLat = radius * Math.cos(angle);
              const offsetLon = radius * Math.sin(angle);
              updates.push({
                id: stop.id,
                latitude: placementLat + offsetLat,
                longitude: placementLon + offsetLon,
                geocoded: false,
                needs_placement: true,
                same_structure: false,
              });
              needsPlacementIdx++;
            } else {
              updates.push({ id: stop.id, geocoded: false, needs_placement: false });
            }
          }
        }
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

      // Only fix collapsed stops or stops missing coordinates — unless
      // verifyAll is true, in which case verify ALL stops (including those
      // without coordinates) via the verification pipeline.
      const needsFix = (verifyAll ? stops : stops.filter(s =>
        collapsedStopIds.has(s.id) ||
        s.latitude == null || s.longitude == null
      )).filter(s => !s.user_verified);

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
          // accurate), then OSM name search, then LLM web search as a final
          // fallback. When verifyAll is true, every stop goes through this
          // pipeline to confirm or correct its coordinates.
          // ABSOLUTE LAST RESORT: if all methods fail (e.g. ghost towns where
          // streets no longer exist in any map database), place the stop near
          // the parking area with a pink "Needs Placement" marker so a visitor
          // can drag it to the correct spot.
          const parkingStopData = allStops.find(s => s.stop_type === 'parking');
          const areaPlacementLat = parkingStopData?.latitude || tour.start_latitude;
          const areaPlacementLon = parkingStopData?.longitude || tour.start_longitude;
          let areaNeedsPlacementIdx = 0;
          // Detect stops that share the same address — address geocoding would
          // collapse them all to the same point (coordinate collision). For
          // these stops, skip address geocoding (Steps 1 & 1b) and go directly
          // to OSM name search / LLM web search, which searches by STOP NAME
          // and finds the correct distinct location for each stop.
          const addressCounts = {};
          for (const s of needsFix) {
            if (s.address) {
              const key = normalizeAddr(s.address);
              addressCounts[key] = (addressCounts[key] || 0) + 1;
            }
          }
          for (const stop of needsFix) {
            let fixed = false;
            const sharedAddress = !!(stop.address && addressCounts[normalizeAddr(stop.address)] > 1);
            // NO GUESSING for shared-address stops: do NOT trust existing
            // geocoded coordinates — they were LLM-generated during tour
            // creation and may be inaccurate (e.g. stop 4 of the Sachs Bridge
            // tour was ~100m off). Instead, verify via OSM name search. If OSM
            // can't find the feature, mark as needs_placement near the parking
            // area (pink marker) so a visitor can drag it to the correct spot.
            // LLM web search is skipped for shared-address stops because
            // calling it for 9+ stops causes execution timeouts.
            // Step 1: Geocode the stop's physical address — the address is the
            // source of truth, not the LLM's guessed coordinates. Use the
            // geocoded address directly if within 5 miles of tour start.
            // SKIP for shared addresses — multiple stops at the same address
            // would all collapse to the same geocoded point, destroying their
            // distinct locations (e.g. stops on both sides of a creek sharing
            // "Waterworks Road" would all merge to one point).
            let addrGeocodeCandidate = null;
            if (stop.address && !sharedAddress) {
              const geo = await geocode(`${stop.address}, ${tour.city || ''}, ${tour.state || ''}`);
              await sleep(1100);
              if (geo) {
                const dist = haversine(tour.start_latitude, tour.start_longitude, geo.lat, geo.lon);
                if (dist <= 5) {
                  if (verifyAll) {
                    // Don't short-circuit — save as candidate and continue to
                    // OSM name search (Step 2). Address geocoding alone isn't
                    // definitive — it can resolve to the wrong street (e.g.
                    // "Mumma Farm" on Main St instead of Smokehouse Rd). OSM
                    // name search by landmark name is more specific and
                    // should be preferred when available.
                    addrGeocodeCandidate = { lat: geo.lat, lon: geo.lon, fromFullAddress: true };
                  } else {
                    updates.push({ id: stop.id, latitude: geo.lat, longitude: geo.lon, geocoded: true, needs_placement: false });
                    matched.add(stop.id);
                    fixed = true;
                  }
                }
              }
            }
            // Step 1b: Street-name fallback — if the full address (with
            // house number) failed to geocode, try just the street name
            // without the number. In abandoned/ghost towns like Centralia,
            // Nominatim often can't resolve "1000 Church Rd" but CAN find
            // "Church Rd" itself. Place the marker on the road (estimated)
            // rather than leaving the LLM's random guessed coordinates.
            // Also tries common spelling variants — the LLM often Americanizes
            // British spellings (e.g. "Center St" → "Centre St" in Centralia).
            // SKIP for shared addresses — same collision risk as Step 1.
            if (!fixed && stop.address && !sharedAddress) {
              const streetOnly = stop.address.replace(/^\d+\s+/, '').replace(/\s+\d{5}$/, '').trim();
              if (streetOnly && streetOnly !== stop.address) {
                const variants = [streetOnly];
                // Common American↔British spelling pairs for street names.
                // Try BOTH directions — the LLM may use either spelling while
                // the map database uses the other.
                const spellingPairs = [
                  ['Center', 'Centre'],
                  ['Theater', 'Theatre'],
                  ['Harbor', 'Harbour'],
                  ['Color', 'Colour'],
                  ['Labor', 'Labour'],
                  ['Neighbor', 'Neighbour'],
                  ['Honor', 'Honour'],
                  ['Armor', 'Armour'],
                  ['Favor', 'Favour'],
                  ['Defense', 'Defence'],
                  ['Offense', 'Offence'],
                  ['Pretense', 'Pretence'],
                  ['License', 'Licence'],
                  ['Splendor', 'Splendour'],
                  ['Rumor', 'Rumour'],
                ];
                for (const [us, uk] of spellingPairs) {
                  const usRe = new RegExp(`\\b${us}\\b`, 'gi');
                  const ukRe = new RegExp(`\\b${uk}\\b`, 'gi');
                  if (usRe.test(streetOnly)) variants.push(streetOnly.replace(usRe, uk));
                  if (ukRe.test(streetOnly)) variants.push(streetOnly.replace(ukRe, us));
                }
                for (const variant of variants) {
                  if (fixed) break;
                  const geo = await geocode(`${variant}, ${tour.city || ''}, ${tour.state || ''}`);
                  await sleep(1100);
                  if (geo) {
                    const dist = haversine(tour.start_latitude, tour.start_longitude, geo.lat, geo.lon);
                    if (dist <= 5) {
                      if (verifyAll) {
                        // Save as candidate — don't short-circuit. Step 1
                        // (full address) candidate is preferred over this
                        // street-only fallback.
                        if (!addrGeocodeCandidate) addrGeocodeCandidate = { lat: geo.lat, lon: geo.lon, fromFullAddress: false };
                      } else {
                        updates.push({ id: stop.id, latitude: geo.lat, longitude: geo.lon, geocoded: false, needs_placement: false });
                        matched.add(stop.id);
                        fixed = true;
                      }
                    }
                  }
                }
              }
            }
            // Step 2: Fallback — Nominatim name search for the landmark.
            // Build search variants from specific to general: strip parenthetical
            // aliases, then strip " - Suffix" qualifiers (e.g. "Sachs Covered
            // Bridge - North Portal" → "Sachs Covered Bridge"), then strip
            // trailing generic words (e.g. "Eisenhower Farm Perimeter" →
            // "Eisenhower Farm"). Try each variant until Nominatim finds a
            // match within 5 miles of the tour start. This recognizes clearly-
            // mapped landmarks (covered bridges, named farms) instead of
            // giving them pink "Needs Placement" markers.
            if (!fixed && tour.start_latitude && tour.start_longitude) {
              const baseName = stop.name.replace(/\s*\([^)]*\)\s*/g, '').trim();
              const dashStripped = baseName.replace(/\s*-\s*[^-]+$/,'').trim();
              const genericTrailing = ['perimeter', 'exterior', 'interior', 'grounds', 'area', 'site', 'view', 'entrance', 'approach', 'vicinity', 'surroundings'];
              const wArr = baseName.split(/\s+/);
              let trailingStripped = baseName;
              while (wArr.length > 2 && genericTrailing.includes(wArr[wArr.length - 1].toLowerCase())) {
                wArr.pop();
                trailingStripped = wArr.join(' ');
              }
              const variants = [baseName, dashStripped, trailingStripped]
                .filter((v, i, a) => v && v.length >= 4 && a.indexOf(v) === i);
              for (const variant of variants) {
                if (fixed) break;
                try {
                  const geo = await geocodeByName(variant, tour.city || '', tour.state || '', tour.start_latitude, tour.start_longitude, 5);
                  if (geo) {
                    updates.push({ id: stop.id, latitude: geo.lat, longitude: geo.lon, geocoded: true, needs_placement: false });
                    matched.add(stop.id);
                    fixed = true;
                  }
                } catch (e) {
                  console.error(`Name search failed for "${stop.name}" (variant "${variant}"):`, e.message);
                }
                await sleep(1100);
              }
            }
            // If OSM name search didn't find a match but address geocoding did,
            // verify the geocoded point actually corresponds to the named
            // landmark before trusting it. Nominatim routinely resolves rural
            // addresses like "4000 Kearneysville Pike" to a WRONG point (e.g.
            // downtown instead of the actual park 0.8 miles south). Without
            // this check, the wrong point gets a blue "geocoded" marker,
            // falsely signalling accuracy. Reverse-geocode the candidate and
            // check whether any significant token of the stop NAME appears in
            // the result — if "Morgan's Grove Park" geocodes to a point whose
            // reverse geocode mentions neither "Morgan" nor "Grove" nor "Park",
            // the geocode is suspect. Don't trust it: continue to LLM web
            // search (Step 3) to find the real location. If LLM search also
            // fails, fall back to the address candidate but mark it
            // geocoded: false (amber "EST" badge) so it's not falsely showing
            // as a precise blue marker.
            if (!fixed && addrGeocodeCandidate) {
              let nameMatches = false;
              try {
                const rev = await reverseGeocode(addrGeocodeCandidate.lat, addrGeocodeCandidate.lon);
                await sleep(1100);
                if (rev) {
                  const revText = `${rev.display_name || ''} ${(rev.address || {}).road || ''} ${(rev.address || {}).neighbourhood || ''} ${(rev.address || {}).suburb || ''}`.toLowerCase();
                  const stopTokens = normalizeName(stop.name).split(' ').filter(w => w.length > 3);
                  nameMatches = stopTokens.some(t => revText.includes(t));
                }
              } catch (e) {
                console.error(`Reverse geocode name-check failed for "${stop.name}":`, e.message);
              }
              if (nameMatches) {
                updates.push({ id: stop.id, latitude: addrGeocodeCandidate.lat, longitude: addrGeocodeCandidate.lon, geocoded: !!addrGeocodeCandidate.fromFullAddress, needs_placement: false });
                matched.add(stop.id);
                fixed = true;
              }
              // If name doesn't match, leave fixed=false so Step 3 (LLM web
              // search) runs to find the real coordinates.
            }
            // Step 3: Final fallback — LLM web search for the exact location.
            // SKIP for shared-address stops: calling LLM for 9+ stops causes
            // execution timeouts. For shared-address stops, OSM name search
            // (Step 2) is the only verification; if it fails, go straight to
            // needs_placement (no guessing).
            if (!fixed && !sharedAddress) {
              const cleanName = stop.name.replace(/\s*\([^)]*\)\s*/g, '').trim();
              const prompt = `Search the web for the EXACT GPS coordinates of this specific location:

"${cleanName}"
${stop.address ? `Address: ${stop.address}` : ''}
in ${tour.city || ''}, ${tour.state}.

Search for its exact coordinates using:
- Google Maps / OpenStreetMap listings for "${cleanName} ${tour.city || ''} ${tour.state}"
- Wikipedia articles with coordinates
- Historical registry listings (National Register of Historic Places)
- Cemetery/landmark databases
- Local tourism or historical society documents

CRITICAL RULES:
1. Do NOT estimate, guess, or approximate. Only return coordinates you actually found via web search.
2. The coordinates must be the REAL location of "${cleanName}", not the town's general location.
3. If you cannot find the real coordinates via web search, return found: false. Do NOT guess.

Return a JSON object with:
- found: true/false
- latitude: (number, only if found)
- longitude: (number, only if found)
- source: brief description of where you found the coordinates (only if found)`;
              try {
                const llmResult = await base44.asServiceRole.integrations.Core.InvokeLLM({
                  prompt,
                  add_context_from_internet: true,
                  model: 'gemini_3_flash',
                  response_json_schema: {
                    type: 'object',
                    properties: {
                      found: { type: 'boolean' },
                      latitude: { type: 'number' },
                      longitude: { type: "number" },
                      source: { type: 'string' },
                    },
                  },
                });
                if (llmResult.found && llmResult.latitude != null && llmResult.longitude != null) {
                  // Sanity check: coordinate must be within 5 miles of tour start
                  const dist = haversine(tour.start_latitude, tour.start_longitude, llmResult.latitude, llmResult.longitude);
                  if (dist <= 5) {
                    updates.push({ id: stop.id, latitude: llmResult.latitude, longitude: llmResult.longitude, geocoded: true, needs_placement: false });
                    matched.add(stop.id);
                    fixed = true;
                  }
                }
              } catch (e) {
                console.error(`LLM search failed for "${stop.name}":`, e.message);
              }
            }
            // ABSOLUTE LAST RESORT: all geocoding methods failed AND there are
            // no existing verified coordinates. Place the stop near the parking
            // area with a pink "Needs Placement" marker so a visitor can drag
            // it to the correct spot. This is NOT guessing — the marker is
            // explicitly flagged as unplaced and requires manual verification.
            if (!fixed) {
              const radius = 0.0002; // ~20 meters — surrounding parking, individually visible
              const angle = areaNeedsPlacementIdx * 2.39996; // golden angle
              const offsetLat = radius * Math.cos(angle);
              const offsetLon = radius * Math.sin(angle);
              updates.push({
                id: stop.id,
                latitude: areaPlacementLat + offsetLat,
                longitude: areaPlacementLon + offsetLon,
                geocoded: false,
                needs_placement: true,
              });
              areaNeedsPlacementIdx++;
            }
          }
        }

        // Apply coordinate updates
        if (updates.length > 0) {
          await base44.asServiceRole.entities.TourStop.bulkUpdate(updates);
        }
      }

      // Offset parking from any tour stop it overlaps. For area tours, the
      // parking address often geocodes to the same point as a landmark stop
      // (e.g. "Waterworks Road" is both the parking address and the Sachs
      // Covered Bridge address), placing the parking marker ON the bridge
      // instead of at the parking area. Offset it ~40m from the nearest stop.
      const parkingStop = allStops.find(s => s.stop_type === 'parking');
      if (parkingStop && parkingStop.latitude && parkingStop.longitude) {
        const refreshedStops = await base44.asServiceRole.entities.TourStop.filter({ tour_id: tourId });
        // Only offset from real verified stops — NOT needs_placement markers,
        // which are intentionally placed near parking and should stay there.
        const tourStops = refreshedStops.filter(s => s.stop_type !== 'parking' && s.latitude && s.longitude && !s.needs_placement);
        let overlap = false;
        for (const s of tourStops) {
          const d = haversine(parkingStop.latitude, parkingStop.longitude, s.latitude, s.longitude);
          if (d < 0.03) { overlap = true; break; }
        }
        if (overlap) {
          // Find the centroid of the walking cluster (stops within 0.2 mi of
          // parking) and offset parking away from it, toward open space.
          const nearby = tourStops.filter(s => haversine(parkingStop.latitude, parkingStop.longitude, s.latitude, s.longitude) < 0.2);
          if (nearby.length > 0) {
            const avgLat = nearby.reduce((sum, s) => sum + s.latitude, 0) / nearby.length;
            const avgLon = nearby.reduce((sum, s) => sum + s.longitude, 0) / nearby.length;
            // Offset away from the cluster centroid
            const dLat = parkingStop.latitude - avgLat;
            const dLon = parkingStop.longitude - avgLon;
            const mag = Math.sqrt(dLat * dLat + dLon * dLon) || 1;
            const offsetMag = 0.0006; // ~60m offset
            const newLat = parkingStop.latitude + (dLat / mag) * offsetMag;
            const newLon = parkingStop.longitude + (dLon / mag) * offsetMag;
            await base44.asServiceRole.entities.TourStop.update(parkingStop.id, {
              latitude: newLat,
              longitude: newLon,
              geocoded: true,
            });
          }
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
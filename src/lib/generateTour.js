import { base44 } from '@/api/base44Client';
import { callJson } from '@/lib/llmJson';
import { US_STATES } from '@/lib/statesData';
import { stripConclusionOpeners, CONCLUSION_PHRASE_RULE } from '@/lib/stopContent';
import { enforceWalkingDistance } from '@/lib/routeOptimizer';

function normalizeStateName(state) {
  if (!state) return '';
  const s = String(state).trim();
  const byName = US_STATES.find((st) => st.name.toLowerCase() === s.toLowerCase());
  if (byName) return byName.name;
  const byAbbr = US_STATES.find((st) => st.abbr.toLowerCase() === s.toLowerCase());
  if (byAbbr) return byAbbr.name;
  return s;
}

export async function findExistingTour(destination, state, category, accessType, city, specificLocations) {
  const normalizedState = normalizeStateName(state);
  // Normalize for comparison: lowercase + strip apostrophes/accents so
  // "Harper's Ferry" matches "Harpers Ferry" and "St. Louis" matches "St Louis".
  const norm = (s) => (s || '').toLowerCase().trim().replace(/[''`]/g, '').replace(/\./g, '');
  const destLower = norm(destination);
  const existingTours = await base44.entities.Tour.filter({ state: normalizedState });
  const normAccess = (t) => (t === 'exterior_only' ? 'exterior_only' : 'exterior_interior');
  // If the user provided specific locations, they explicitly want stops that
  // differ from any existing tour — skip city-level dedup so they can create
  // a new area tour in a city that already has one (e.g., a bridge tour when a
  // downtown walking tour already exists).
  const hasSpecificLocations = specificLocations && specificLocations.trim().length > 0;
  return existingTours.find((t) => {
    // COLD SPOT REDUNDANCY RULE:
    // - Creating a Cold Spot: only block if an existing COLD SPOT tour matches
    //   the destination. A Cold Spot can be created for a location that already
    //   has a Property/Area/Road Trip tour (different product, fewer stops).
    // - Creating a non-Cold-Spot: existing Cold Spot tours do NOT block creation,
    //   because a Cold Spot location is allowed to be included as a stop in
    //   Area/Road Trip tours. Only match against non-cold-spot tours.
    if (category === 'cold_spot' && t.tour_category !== 'cold_spot') return false;
    if (category && category !== 'cold_spot' && t.tour_category === 'cold_spot') return false;

    // ACCESS TYPE DIFFERENTIATION: For cold_spot and landmark tours, an
    // exterior-only tour and an exterior/interior tour of the same location
    // are different tours. Only match if access_types are the same. Treat
    // null/undefined as 'exterior_interior' (the default/full tour) so
    // existing tours (pre-access-type) don't block new exterior-only tours.
    if ((category === 'cold_spot' || category === 'landmark') && accessType) {
      if (normAccess(accessType) !== normAccess(t.access_type)) return false;
    }

    // CITY-LEVEL REDUNDANCY: For area tours, an existing area tour in the same
    // city is likely covering the same haunted locations. Creative tour titles
    // differ ("Shadows of Savannah" vs "Savannah Ghost Walk"), so title matching
    // alone misses these near-duplicates. Match on either the explicitly-passed
    // city OR the destination string (which for area tours is often the city
    // name itself — generateLocationTour doesn't have the city until after LLM
    // generation, so dest is the best proxy we have pre-generation). Only
    // applies to area-vs-area matches.
    if (category === 'area' && t.tour_category === 'area' && !hasSpecificLocations) {
      const tCity = norm(t.city);
      if (tCity && ((city && tCity === norm(city)) || tCity === destLower)) {
        return true;
      }
    }

    // Match on TITLE — multiple tours in the same city are valid
    // (e.g., a landmark-specific tour vs. a city walking tour that
    // includes that landmark as one stop). Only flag a true duplicate
    // when the destination matches the tour's actual name/title.
    const normTitle = norm(t.title || '');
    const titleMatch = normTitle.includes(destLower);
    const destInTitle = destLower.includes(normTitle.trim()) && normTitle.trim().length > 3;
    return titleMatch || destInTitle;
  }) || null;
}

export async function generateLocationTour(destination, state, coords, category = 'landmark', accessType, specificLocations) {
  const dest = destination.trim();
  const useCoords = coords && typeof coords.lat === 'number' && typeof coords.lng === 'number';

  // DUPLICATE GUARD: If a tour already exists for this destination, return it
  // instead of creating a duplicate. Callers should use findExistingTour()
  // before calling generateLocationTour to present the user with a choice.
  // Pass the category so the Cold Spot redundancy rule is enforced (see
  // findExistingTour): Cold Spots only block other Cold Spots; non-Cold-Spots
  // ignore existing Cold Spots.
  const existing = await findExistingTour(dest, state, category, accessType, undefined, specificLocations);
  if (existing) return existing;

  // CROSS-TOUR DEDUPLICATION: Fetch stops from existing tours in the same
  // area so we can tell the LLM to avoid them. Without this, the LLM picks
  // the most popular haunted locations — which are likely already covered
  // by other tours in the same city, creating duplicate stops across tours.
  const norm = (s) => (s || '').toLowerCase().trim().replace(/[''`]/g, '').replace(/\./g, '');
  const normalizedState = normalizeStateName(state);
  const existingToursInState = await base44.entities.Tour.filter({ state: normalizedState });
  const sameAreaTours = existingToursInState.filter(t =>
    t.tour_category !== 'cold_spot' &&
    (norm(t.city) === norm(dest) || norm(t.title).includes(norm(dest)) || norm(dest).includes(norm(t.city)))
  );
  const existingStopNames = new Set();
  for (const t of sameAreaTours.slice(0, 5)) {
    try {
      const tStops = await base44.entities.TourStop.filter({ tour_id: t.id });
      for (const s of tStops) {
        if (s.stop_type !== 'parking' && s.name) {
          existingStopNames.add(s.name.toLowerCase().trim());
        }
      }
    } catch (e) { console.error('Failed to fetch stops for dedup:', e); }
  }

  // Build prompt sections for specific locations and existing stops
  const specificLocationsList = specificLocations
    ? specificLocations.split(/[,\n]/).map(s => s.trim()).filter(s => s.length > 2)
    : [];
  const specificLocationsText = specificLocationsList.length > 0
    ? `\nSPECIFIC LOCATIONS TO INCLUDE — FOLLOW EXACTLY: The user has specifically requested these locations be included as stops. You MUST include ALL of them:\n${specificLocationsList.map(s => `- ${s}`).join('\n')}\nThese are the PRIMARY stops the user wants. Fill the remaining stops with other haunted locations in the area that are NOT in the exclusion list below.\n`
    : '';
  const existingStopsText = existingStopNames.size > 0
    ? `\nLOCATIONS ALREADY COVERED — DO NOT DUPLICATE: The following locations are already stops on other tours in this area. Do NOT include any of these as stops:\n${[...existingStopNames].slice(0, 25).map(n => `- ${n}`).join('\n')}\n`
    : '';

  // Creation generates a LIGHTWEIGHT tour + stop skeletons. Full rich
  // historical/paranormal detail and notable people are generated lazily,
  // per stop, when a user opens that stop (see StopDetail.ensureRichContent).
  // This keeps creation fast and reliable (no oversized AI call / timeout).
  const categoryText = category === 'cold_spot'
    ? `This is a COLD SPOT tour — a very short tour with only 1-4 stops at a single haunted location or a tiny cluster of nearby locations. This is for locations that don't have enough distinct areas for a full tour but are still worth investigating. ALL stops must be specific areas, rooms, or sections within or near the location. Set tour_type to "walking". Generate 1-4 stops.`
    : category === 'landmark'
    ? `This is a LOCATION/PROPERTY tour — one specific haunted property (e.g. an asylum, hotel, bridge, cemetery, museum, prison, battlefield, furnace, mansion). ALL stops must be specific areas, rooms, buildings, wings, or sections within or on the grounds of that one location, and all stops share the same street address. Set tour_type to "walking". Generate 8-10 stops.`
    : category === 'area'
    ? `This is an AREA tour — a city, town, or local area where walking or close driving is required. Different locations/properties are the stops. The TOTAL route distance MUST be ≤2.5 miles — plan for a tight walkable cluster, not a sprawling city-wide tour. Set tour_type to "walking" or "mixed". Each stop is a different haunted location with its own real street address and its own real GPS coordinates, spread across the area. Generate 8-10 stops.`
    : category === 'ship'
    ? `This is a SHIP tour — a haunted ship or vessel. ALL stops must be specific decks, cabins, rooms, or areas within or on the vessel. All stops share the same vessel. Set tour_type to "walking". Generate 8-10 stops.`
    : `This is a ROAD TRIP tour — driving between most locations with a higher total mileage. There MUST be considerable driving between stops — at least 5 miles between consecutive stops. Combine different locations and areas into one driving tour. Set tour_type to "driving" or "mixed". Each stop is a different haunted location or area spread across a wider geographic region, each with its own real street address and GPS coordinates. Generate 8-10 stops.`;

  const accessTypeText = (category === 'cold_spot' || category === 'landmark') && accessType === 'exterior_only'
    ? `\n\nACCESS TYPE: EXTERIOR ONLY — This tour covers ONLY the exterior of the property: grounds, perimeter, outside walls, courtyards, and outdoor areas. All stops must be locations accessible from the OUTSIDE without entering the building or paying for interior admission. However, the historical_info, paranormal_info, and narration_text for each stop SHOULD include stories and events from the interior — the tour focuses on exterior access, but the storytelling covers the full haunted history including interior events, ghost sightings inside, and notable interior rooms. The key difference is that investigators visit the EXTERIOR of each stop area, not the interior.`
    : (category === 'cold_spot' || category === 'landmark') && accessType === 'exterior_interior'
    ? `\n\nACCESS TYPE: EXTERIOR AND INTERIOR — This tour covers both the exterior and interior of the property. Stops can include interior rooms, halls, basements, wings, AND exterior grounds, courtyards, and perimeter areas. Include stops that require interior access and paid admission where applicable. This is the full property investigation experience.`
    : '';

  const prompt = `Generate a paranormal ghost hunting tour for the haunted destination "${dest}" in ${state}.

${categoryText}${accessTypeText}

ROUTING & ACCESS RULES — FOLLOW EXACTLY:

1. DISTANCE MINIMIZATION: Minimize distance from stop to stop AND overall tour length. Every consecutive walking stop MUST be ≤0.33 miles from the previous. For AREA tours, the TOTAL route distance MUST be ≤2.5 miles. For driving/mixed tours, arrange stops in the most efficient order with the shortest total driving distance — linear progression, no doubling back.

2. WALKING TOURS (single landmark, or a tight walkable cluster within a region): Stops form a logical loop — start and end near the same point. Route proceeds in an efficient circle so investigators return to their starting point. Every stop ≤0.33 miles from the previous.

3. DRIVING & MIXED TOURS (regions): Driving stops follow a logical linear progression — each stop advances in a single direction with no doubling back. For mixed tours, walking stops form a tight loop (≤0.33 miles between them) at one cluster, then driving stops continue in a linear progression. Minimize both walking and driving distances.

4. PUBLIC ACCESS AFTER 7 PM: ALL stops must be accessible after 7 PM — at minimum, investigators must be able to be outside each building/area after 7 PM. Note any interior access restrictions in hours_of_operation. Include entry fees and ticket pricing in entry_fee.

5. MOST POPULAR STOPS: Prioritize the most famous, most talked-about haunted locations in the area — the places where paranormal activity and ghosts have been observed and recorded most. Include stops that are widely discussed in paranormal circles.

Return a JSON object with:
- title: a creative, spooky tour name for "${dest}"
- tour_category: "${category}"
- state: "${state}"
- city: the primary city or area where "${dest}" is located
- tour_type: "walking", "driving", or "mixed" (per the category rules above)
- description: 4-6 detailed sentences about the destination's haunted history, founding, and why it's notorious
- introduction: 2-3 rich paragraphs setting the scene for investigators — the atmosphere, what to expect, and the location's dark legacy
- conclusion: 2-3 paragraphs wrapping up the investigation and reflecting on what was explored
- difficulty: "easy", "moderate", or "challenging"
- estimated_duration: e.g. "2-3 hours"
- total_distance: e.g. "~0.8 miles" (walking) or "~15 miles" (driving)
- start_location_name: the main entrance, parking area, or first stop
- start_latitude: number (use real coordinates for "${dest}")
- start_longitude: number (use real coordinates for "${dest}")
- image_url: empty string
- tags: array of 3-5 relevant strings
- safety_info: 2-3 practical safety notes for this specific location
- best_time: best season/time for investigating

PLUS a "stops" array (${category === 'cold_spot' ? '1-4 stops' : '8-10 stops'}) — each a LIGHTWEIGHT skeleton (full detail is generated later, so keep these fields brief):
- stop_number: starting from 1
- name: for a PROPERTY tour, a specific area/building/room within the location; for AREA or ROAD TRIP tours, the name of that distinct haunted location
- latitude: real coordinates (number) — EACH stop must have its OWN distinct, real GPS coordinates. For a PROPERTY tour, look up the actual coordinates of that specific area/building within the property (e.g., search "Battery 519 Fort Miles Lewes DE") — do NOT use the same coordinates for all stops. For AREA or ROAD TRIP tours, each stop has its own real coordinates at its own address.
- longitude: real coordinates (number)
- address: ALWAYS a COMPLETE STREET ADDRESS with a street number (e.g. "123 Main St, Lewes, DE 19958"). For a PROPERTY tour, the full street address of "${dest}" (same for all stops); for AREA or ROAD TRIP tours, each stop's own real street address. NEVER use just a city name, an intersection ("X & Y"), or "near"/"vicinity". Must be GPS-searchable — typeable into Google Maps and arriving at the exact location.
- same_structure: true if this stop is a room, area, or section WITHIN a single building or vessel (rooms in the Farnsworth House, decks on a ship, different areas of one cemetery); false if it is its own distinct building or structure on the property (separate buildings at Pennhurst Asylum, separate batteries at a fort). For AREA and ROAD TRIP tours, always false since each stop is a different property.
- historical_info: 2-3 sentences summarizing the key history (construction dates, notable figures, major events). Brief summary only.
- paranormal_info: 2-3 sentences summarizing the key paranormal activity and ghosts. Brief summary only.
- investigation_suggestions: 3-5 specific items like "EVP Session", "Spirit Box Session", "EMF Sweep", "Trigger Object Experiment", "Temperature Monitoring", "Full-Spectrum Photography"
- estimated_investigation_time: e.g. "20-30 minutes"
- construction_date: when that area/location was built if known (with year)
- famous_people: notable people associated with that area/location — full names, roles
- image_url: empty string
- narration_text: 4-6 sentences of dramatic, immersive storytelling narration in a mysterious, captivating style. The narrator is a seasoned paranormal investigator speaking to fellow investigators about what awaits them. Include vivid sensory details and specific ghost stories.
- travel_method: "walking" or "driving" (per the tour type; for mixed tours, "walking" for walking stops and "driving" for driving stops)
- hours_of_operation: ALWAYS provide this — never leave blank. State the location's public access hours (e.g. "Exterior accessible 24/7, interior tours until 10PM Friday-Saturday", "Open daily 9am-5pm"). If freely accessible at all hours, state "Exterior accessible 24/7" explicitly.
- entry_fee: ALWAYS provide this — never leave blank. State the admission cost (e.g. "$25 for day tour, $45 for overnight investigation", "Free, donations welcome"). If completely free, state "Free".

Use real locations and real coordinates for "${dest}". Keep every historical_info and paranormal_info field BRIEF (2-3 sentences) — the full rich detail is generated later.

ADDRESS RESEARCH RULE — FOLLOW EXACTLY: When you learn about haunted locations from existing ghost tour companies, walking tours, or tourism websites, you MUST find the ACTUAL STREET ADDRESS of each location independently. Do NOT copy a tour company's meeting point, starting location, or vague area description — tour companies often list only where their tour GROUPS MEET (e.g., "2nd & Market St") rather than the actual haunted building's address. For every stop, look up the real street address where the actual haunted building, landmark, or site is located (e.g., "43 Cape Henlopen Dr, Lewes, DE 19958" for the ferry terminal, NOT "Near the intersection of 2nd & Market"). The address must be the physical location of the haunted site itself, not a tour company's gathering point.

BRAND RULE: The app is branded AGES, which stands for "Accessible Ghost Exploration Solutions" (never "Affordable"). If you mention the AGES brand anywhere in the text, always define it as "Accessible Ghost Exploration Solutions".
${specificLocationsText}${existingStopsText}
Output ONLY a valid JSON object. No markdown fences, no commentary.${CONCLUSION_PHRASE_RULE}${useCoords ? `\n\nCOORDINATES HINT: The searched point is latitude ${coords.lat}, longitude ${coords.lng}. Use these for start_latitude/start_longitude. For a COLD SPOT tour, every stop uses these same coordinates (areas within one site). For a PROPERTY tour, use these as a reference but look up the ACTUAL distinct coordinates for each specific area/building within the property — each stop must reflect its real location within the site. For AREA or ROAD TRIP tours, place each stop at its OWN real coordinates within ~30 miles of this point, spread across the area.` : ''}`;

  // Coerce LLM output into the exact types/enums the schema expects. The LLM
  // often returns capitalized enums ("Moderate", "Walking") or tags as a string,
  // which fail schema validation and cause Tour.create / TourStop.bulkCreate to
  // throw — so the tour is never stored. Normalizing here fixes that.
  const normEnum = (v, valid, dflt) => {
    const s = String(v || '').toLowerCase().trim();
    return valid.includes(s) ? s : dflt;
  };
  const toNum = (v) => {
    if (typeof v === 'number' && isFinite(v)) return v;
    if (typeof v === 'string' && v.trim() !== '' && !isNaN(parseFloat(v))) return parseFloat(v);
    return null;
  };
  const toStrArr = (v) => Array.isArray(v) ? v.filter((x) => typeof x === 'string' && x.trim()) : [];
  const toStr = (v) => {
    if (Array.isArray(v)) return v.filter((x) => typeof x === 'string' && x.trim()).join('\n\n');
    if (typeof v === 'string') return v;
    if (v == null) return '';
    return String(v);
  };
  const normalizeAddr = (a) => String(a || '').toLowerCase().replace(/[^a-z0-9]/g, '').trim();

  // MINIMUM STOP ENFORCEMENT — prevents low-quality tours (e.g. 1-stop tours)
  // from being created. The LLM sometimes returns too few stops; we retry up to
  // 3 attempts and reject if the minimum still isn't met.
  const MIN_STOPS_FOR = (cat) => cat === 'cold_spot' ? 1 : 5;

  // Process a raw LLM result into normalized tour data + stop records.
  const processResult = (raw) => {
    if (!raw || !raw.stops || raw.stops.length === 0) return null;
    const stopsIn = Array.isArray(raw.stops) ? raw.stops : [];
    const allValidStops = stopsIn.map((s, i) => ({
      s,
      name: (s && typeof s.name === 'string' && s.name.trim()) ? s.name : `${dest} Stop ${i + 1}`,
      stop_number: (s && typeof s.stop_number === 'number') ? s.stop_number : i + 1,
    }));

    // DEDUP GUARD: Remove duplicate stops by name. For AREA and ROAD TRIP
    // tours, also dedup by address (each stop should have a unique address).
    // For PROPERTY (landmark), COLD SPOT, and SHIP tours, all stops share the
    // same address (areas within one site/vessel), so address dedup would
    // incorrectly discard all but the first stop — skip it for those.
    const dedupByAddr = category === 'area' || category === 'road_trip';
    const seenStopNames = new Set();
    const seenStopAddrs = new Set();
    const validStops = [];
    for (const item of allValidStops) {
      const nameKey = item.name.toLowerCase().trim();
      const addrKey = normalizeAddr(item.s?.address);
      if (seenStopNames.has(nameKey)) continue;
      if (dedupByAddr && addrKey && seenStopAddrs.has(addrKey)) continue;
      if (nameKey) seenStopNames.add(nameKey);
      if (dedupByAddr && addrKey) seenStopAddrs.add(addrKey);
      validStops.push(item);
    }

    // CROSS-TOUR DEDUPLICATION: Remove stops that match names already used
    // on other tours in the same area. The LLM is told to avoid them, but
    // this is a safety net in case it ignores the instruction.
    if (existingStopNames && existingStopNames.size > 0) {
      for (let i = validStops.length - 1; i >= 0; i--) {
        if (existingStopNames.has(validStops[i].name.toLowerCase().trim())) {
          validStops.splice(i, 1);
        }
      }
    }

    // CATEGORY CORRECTION: If the user selected "landmark" and all stops
    // share the same street address, confirm "landmark". Do NOT override an
    // explicitly-chosen "area" or "road_trip" — the user knows they want
    // multiple locations. If the LLM assigned same addresses to different
    // locations, forcing "landmark" would cause fix-collapsed-coords to grid
    // all stops around one point, placing them at the wrong locations.
    let correctedCategory = category;
    if (validStops.length >= 2 && correctedCategory === 'landmark') {
      const addrs = validStops.map((v) => normalizeAddr(v.s?.address)).filter(Boolean);
      if (addrs.length >= 2 && addrs.every((a) => a === addrs[0])) {
        correctedCategory = 'landmark';
      }
    }
    // REVERSE CORRECTION: If categorized as "landmark" (property) but the stops
    // span multiple distinct street addresses, it's actually an area tour —
    // reclassify to "area" to prevent city/town tours being tagged as property.
    if (validStops.length >= 3 && correctedCategory === 'landmark') {
      const addrs = validStops.map((v) => normalizeAddr(v.s?.address)).filter(Boolean);
      if (addrs.length >= 3 && new Set(addrs).size >= 3) {
        correctedCategory = 'area';
      }
    }

    const tourData = {
      title: raw.title || `${dest} Paranormal Investigation`,
      tour_category: correctedCategory,
      access_type: (correctedCategory === 'cold_spot' || correctedCategory === 'landmark') ? (accessType || 'exterior_interior') : '',
      state: normalizeStateName(state),
      city: raw.city || '',
      tour_type: normEnum(raw.tour_type, ['walking', 'driving', 'mixed'], 'walking'),
      description: toStr(raw.description),
      introduction: toStr(raw.introduction),
      conclusion: toStr(raw.conclusion),
      difficulty: normEnum(raw.difficulty, ['easy', 'moderate', 'challenging'], 'moderate'),
      estimated_duration: toStr(raw.estimated_duration),
      total_distance: toStr(raw.total_distance),
      start_location_name: toStr(raw.start_location_name),
      start_latitude: useCoords ? coords.lat : toNum(raw.start_latitude),
      start_longitude: useCoords ? coords.lng : toNum(raw.start_longitude),
      image_url: toStr(raw.image_url),
      tags: toStrArr(raw.tags),
      safety_info: toStr(raw.safety_info),
      best_time: toStr(raw.best_time),
    };

    const isLandmarkOrShip = correctedCategory === 'landmark' || correctedCategory === 'ship';
    const stopRecords = validStops.map(({ s, name }, i) => ({
      stop_number: i + 1,
      name,
      latitude: toNum(s.latitude) || (useCoords ? coords.lat : null),
      longitude: toNum(s.longitude) || (useCoords ? coords.lng : null),
      address: toStr(s.address),
      historical_info: toStr(s.historical_info),
      paranormal_info: stripConclusionOpeners(toStr(s.paranormal_info), i === validStops.length - 1),
      investigation_suggestions: toStrArr(s.investigation_suggestions),
      estimated_investigation_time: toStr(s.estimated_investigation_time),
      construction_date: toStr(s.construction_date),
      famous_people: toStr(s.famous_people),
      image_url: toStr(s.image_url),
      narration_text: stripConclusionOpeners(toStr(s.narration_text), i === validStops.length - 1),
      travel_method: normEnum(s.travel_method, ['walking', 'driving'], 'walking'),
      hours_of_operation: toStr(s.hours_of_operation),
      entry_fee: toStr(s.entry_fee),
      same_structure: s.same_structure === true,
      geocoded: isLandmarkOrShip,
    }));

    return { tourData, stopRecords, correctedCategory, validStops };
  };

  // Robust multi-attempt generation: web, then no-web fallback, then a web retry
  // if the minimum stop count isn't met. The lightweight payload makes each
  // attempt fast enough to avoid timeouts.
  const tryCall = async (useWeb) => {
    try { return await callJson(prompt, { useWeb }); }
    catch (e) { console.error('Tour generation failed:', e); return null; }
  };

  let processed = null;
  const attemptOrder = [true, false, true]; // web, no-web, web
  for (let i = 0; i < attemptOrder.length; i++) {
    const raw = await tryCall(attemptOrder[i]);
    const p = processResult(raw);
    if (!p) continue;
    if (!processed) processed = p; // keep first valid result as fallback
    const min = MIN_STOPS_FOR(p.correctedCategory);
    if (p.validStops.length >= min) { processed = p; break; }
    console.warn(`Attempt ${i + 1}: only ${p.validStops.length} stops (min ${min}), retrying...`);
  }

  if (!processed || processed.validStops.length === 0) {
    throw new Error('Could not generate this tour after several attempts. Please try again.');
  }

  const minStops = MIN_STOPS_FOR(processed.correctedCategory);
  if (processed.validStops.length < minStops) {
    throw new Error(
      `This location generated only ${processed.validStops.length} stop${processed.validStops.length === 1 ? '' : 's'} ` +
      `(minimum ${minStops} required). Please try again or try a different location.`
    );
  }

  // Enforce proper route ordering BEFORE storing stops — driving stops go to
  // the end, walking stops form a loop. This guarantees correct ordering at
  // creation time, not just on view (TourDetail re-runs this on load, but
  // only when stops need geocoding; already-geocoded tours would otherwise
  // keep the LLM's original order with driving stops possibly in the middle).
  const orderedStops = enforceWalkingDistance(
    processed.stopRecords,
    processed.tourData.tour_type,
    { lat: processed.tourData.start_latitude, lon: processed.tourData.start_longitude }
  );
  // Auto-correct tour type if stops are a mix of walking + driving
  const methods = new Set(orderedStops.map((s) => s.travel_method));
  const correctedType = methods.has('driving') && methods.has('walking') ? 'mixed'
    : methods.has('driving') ? 'driving' : 'walking';
  if (correctedType !== processed.tourData.tour_type) {
    processed.tourData.tour_type = correctedType;
  }

  const newTour = await base44.entities.Tour.create(processed.tourData);

  try {
    const stopRecords = orderedStops.map((r) => ({ ...r, tour_id: newTour.id }));
    await base44.entities.TourStop.bulkCreate(stopRecords);

    // For landmark/ship tours, verify coordinates via OpenStreetMap Overpass
    // API — LLM-generated coordinates are unreliable (often in water or at
    // wrong locations). Uses real mapped features for accuracy.
    if (processed.correctedCategory === 'landmark' || processed.correctedCategory === 'ship' || processed.correctedCategory === 'cold_spot') {
      try {
        await base44.functions.invoke('fix-collapsed-coords', { tourId: newTour.id });
      } catch (e) {
        console.error('Coordinate verification failed (tour still created):', e);
      }
    }
  } catch (e) {
    // Stop creation failure must not block the tour; TourDetail backfills stops.
    console.error('Stop creation failed (tour still created):', e);
  }

  return newTour;
}
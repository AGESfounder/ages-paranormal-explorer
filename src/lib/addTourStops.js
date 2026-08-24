import { base44 } from '@/api/base44Client';
import { geocodeStopsWithNames } from '@/lib/geocodeStops';
import { stripConclusionOpeners, CONCLUSION_PHRASE_RULE } from '@/lib/stopContent';

const MAX_STOPS = 12;
const COLD_SPOT_MAX_STOPS = 4; // cold_spot = 1-4 stops at a single location

// Adds additional haunted stops to an existing tour, inserting each new stop
// at the position that makes the most geographic/routing sense. Caps the tour
// at MAX_STOPS (12) total stops. Returns { added, capped }.
export async function addTourStops(tour) {
  const existingStops = await base44.entities.TourStop.filter({ tour_id: tour.id });
  existingStops.sort((a, b) => (a.stop_number || 0) - (b.stop_number || 0));

  const maxStops = tour.tour_category === 'cold_spot' ? COLD_SPOT_MAX_STOPS : MAX_STOPS;

  if (existingStops.length >= maxStops) {
    return { added: 0, capped: true, reason: 'max' };
  }

  const slotsAvailable = maxStops - existingStops.length;

  const existingSummary = existingStops
    .map((s, i) => `Stop ${s.stop_number || i + 1}: ${s.name} | coords: ${s.latitude}, ${s.longitude} | travel: ${s.travel_method || 'walking'}`)
    .join('\n');

  const category = tour.tour_category || 'area';

  const locationConstraint = category === 'landmark' || category === 'ship'
    ? `ALL new stops MUST be on the SAME ${category === 'landmark' ? 'property/site' : 'vessel'} as the existing stops. Do NOT add stops in the surrounding area or neighborhood — every new stop must be a different room, building, floor, wing, or area WITHIN the same ${category === 'landmark' ? 'property grounds' : 'vessel'}.\nCOORDINATES — Two cases:\n- DIFFERENT BUILDINGS/STRUCTURES on the property: each MUST have its OWN distinct, real GPS coordinates. Search for each one individually.\n- ROOMS/AREAS WITHIN A SINGLE BUILDING (e.g., rooms in a hotel, floors of a mansion): set same_structure: true and use the BUILDING's real GPS coordinates for all of them. It is CORRECT for same_structure stops to share the same coordinates and stack on the map — they are all inside one structure. Do NOT invent fake distinct coordinates for rooms within one building.`
    : category === 'cold_spot'
    ? `ALL new stops MUST be at the SAME specific haunted location as the existing stops. Do NOT add stops in the surrounding area — new stops must be within 0.1 miles of the existing stops' coordinates (e.g., different spots within the same building or immediate grounds).`
    : category === 'road_trip'
    ? `New stops must be along the road trip route in ${tour.state}, with 5+ miles between most stops. Each must be a distinct haunted location, NOT duplicating existing stops.`
    : `New stops must be different properties/locations within the ${tour.city} area — NOT on the same property as existing stops. Each must be a distinct haunted location in ${tour.city}, ${tour.state}.`;

  const prompt = `You are adding new haunted stops to an existing paranormal ghost hunting tour in ${tour.city}, ${tour.state}.

TOUR TITLE: ${tour.title}
TOUR TYPE: ${tour.tour_type}
TOUR CATEGORY: ${category}

EXISTING STOPS (in current order):
${existingSummary || '(none yet)'}

LOCATION CONSTRAINT — FOLLOW EXACTLY:
${locationConstraint}

Generate up to ${Math.min(slotsAvailable, 2)} NEW haunted stops that are NOT already in the existing stops. Each must be a real, well-documented haunted location that is publicly accessible after 7 PM.

For each new stop, specify "insert_after_stop_number" — the existing stop number after which this new stop should be placed to minimize travel distance and maintain routing logic. Use 0 to insert at the very beginning (before stop 1).

ROUTING RULES — FOLLOW EXACTLY:
1. DISTANCE MINIMIZATION: Minimize distance from stop to stop. Every consecutive walking stop MUST be ≤0.33 miles from the previous.
2. WALKING TOURS: Stops form a logical loop — start and end near the same point.
3. DRIVING TOURS: Stops follow a logical linear progression — no doubling back.
4. MIXED TOURS: Walking stops form a tight loop, driving stops continue linearly.
5. PUBLIC ACCESS AFTER 7 PM: All locations must be publicly accessible after 7 PM.
6. Prioritize the most famous, most talked-about haunted locations.

Each new stop needs:
- insert_after_stop_number: number (0 = before stop 1, N = after existing stop N)
- name: string (the haunted location's name)
- latitude: number (real coordinates)
- longitude: number (real coordinates)
- address: string — ALWAYS a COMPLETE STREET ADDRESS with street number (e.g. "123 Main St, Lewes, DE 19958"). NEVER use just a city name, an intersection ("X & Y"), or "near"/"vicinity". Must be GPS-searchable — typeable into Google Maps and arriving at the exact location.
- same_structure: boolean — true if this stop is a room/area/section WITHIN a single building or vessel; false if it is its own distinct building/structure. For AREA and ROAD TRIP tours, always false.
- historical_info: 2-3 sentences
- paranormal_info: 2-3 sentences
- investigation_suggestions: array of 3-5 strings
- estimated_investigation_time: string
- construction_date: string
- famous_people: string
- narration_text: 4-6 sentences of dramatic, immersive narration
- travel_method: "walking" or "driving"
- hours_of_operation: ALWAYS provide the location's public access hours (never leave blank; use "Exterior accessible 24/7" if freely accessible at all hours)
- entry_fee: ALWAYS provide the admission cost (never leave blank; use "Free" if no charge)

ADDRESS RESEARCH RULE — FOLLOW EXACTLY: When you learn about haunted locations from existing ghost tour companies, walking tours, or tourism websites, you MUST find the ACTUAL STREET ADDRESS of each location independently. Do NOT copy a tour company's meeting point, starting location, or vague area description — tour companies often list only where their tour GROUPS MEET (e.g., "2nd & Market St") rather than the actual haunted building's address. For every stop, look up the real street address where the actual haunted building, landmark, or site is located (e.g., "43 Cape Henlopen Dr, Lewes, DE 19958" for the ferry terminal, NOT "Near the intersection of 2nd & Market"). The address must be the physical location of the haunted site itself, not a tour company's gathering point.

Output ONLY a valid JSON object with a "new_stops" array.${CONCLUSION_PHRASE_RULE}`;

  const result = await base44.integrations.Core.InvokeLLM({
    prompt,
    response_json_schema: {
      type: 'object',
      properties: {
        new_stops: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              insert_after_stop_number: { type: 'number' },
              name: { type: 'string' },
              latitude: { type: 'number' },
              longitude: { type: 'number' },
              address: { type: 'string' },
              historical_info: { type: 'string' },
              paranormal_info: { type: 'string' },
              investigation_suggestions: { type: 'array', items: { type: 'string' } },
              estimated_investigation_time: { type: 'string' },
              construction_date: { type: 'string' },
              famous_people: { type: 'string' },
              narration_text: { type: 'string' },
              travel_method: { type: 'string' },
              hours_of_operation: { type: 'string' },
              entry_fee: { type: 'string' },
              same_structure: { type: 'boolean' },
            },
          },
        },
      },
    },
    model: 'gemini_3_flash',
    add_context_from_internet: true,
  });

  const rawNewStops = Array.isArray(result?.new_stops) ? result.new_stops : [];
  const newStops = rawNewStops.slice(0, slotsAvailable);

  if (newStops.length === 0) {
    return { added: 0, capped: false, reason: 'none' };
  }

  const isLandmarkOrShip = tour.tour_category === 'landmark' || tour.tour_category === 'ship';
  const newGeocodedAddrs = new Set();
  if (isLandmarkOrShip) {
    // For landmark/ship tours, trust the LLM's web-searched coordinates —
    // address geocoding would collapse all stops to one point since they
    // share the same street address.
    for (const ns of newStops) {
      if (ns.address) newGeocodedAddrs.add(ns.address);
    }
  } else {
    // Geocode new stops for accurate GPS coordinates using enhanced
    // multi-strategy geocoding (name + address + city/state) with outlier
    // detection — rejects results too far from the tour center.
    const newStopsForGeocoding = newStops.map((s, i) => ({
      id: `temp_${i}`, name: s.name, address: s.address, city: tour.city, state: tour.state
    }));
    const newGeocodeMap = newStopsForGeocoding.length > 0 ? await geocodeStopsWithNames(newStopsForGeocoding, { lat: tour.start_latitude, lon: tour.start_longitude, maxDistMiles: tour.tour_category === 'road_trip' ? 200 : (tour.tour_category === 'cold_spot' || tour.tour_category === 'ship') ? 0.5 : tour.tour_category === 'area' ? 2.5 : 5 }) : {};
    for (let i = 0; i < newStops.length; i++) {
      const geo = newGeocodeMap[`temp_${i}`];
      if (geo) {
        newStops[i].latitude = geo.lat;
        newStops[i].longitude = geo.lon;
        newGeocodedAddrs.add(newStops[i].address);
      }
    }
  }

  // Create new stops in the database with a temporary stop number.
  const createdStops = [];
  for (const ns of newStops) {
    const created = await base44.entities.TourStop.create({
      tour_id: tour.id,
      stop_number: 999,
      name: ns.name || 'Unnamed Stop',
      latitude: typeof ns.latitude === 'number' ? ns.latitude : parseFloat(ns.latitude) || null,
      longitude: typeof ns.longitude === 'number' ? ns.longitude : parseFloat(ns.longitude) || null,
      address: ns.address || '',
      geocoded: newGeocodedAddrs.has(ns.address),
      historical_info: stripConclusionOpeners(ns.historical_info || '', false),
      paranormal_info: stripConclusionOpeners(ns.paranormal_info || '', false),
      investigation_suggestions: Array.isArray(ns.investigation_suggestions) ? ns.investigation_suggestions.filter((x) => typeof x === 'string' && x.trim()) : [],
      estimated_investigation_time: ns.estimated_investigation_time || '',
      construction_date: ns.construction_date || '',
      famous_people: ns.famous_people || '',
      image_url: '',
      narration_text: stripConclusionOpeners(ns.narration_text || '', false),
      travel_method: String(ns.travel_method || '').toLowerCase() === 'driving' ? 'driving' : 'walking',
      hours_of_operation: ns.hours_of_operation || '',
      entry_fee: ns.entry_fee || '',
      same_structure: ns.same_structure === true,
    });
    createdStops.push({ ...created, _insert_after: ns.insert_after_stop_number || 0 });
  }

  // Merge existing + new into a single ordered list, then renumber.
  const ordered = [];
  const existingByNum = {};
  for (const s of existingStops) existingByNum[s.stop_number] = s;
  const newByInsertAfter = {};
  for (const s of createdStops) {
    const key = s._insert_after;
    if (!newByInsertAfter[key]) newByInsertAfter[key] = [];
    newByInsertAfter[key].push(s);
  }

  // New stops with insert_after = 0 go at the very beginning.
  if (newByInsertAfter[0]) ordered.push(...newByInsertAfter[0]);
  const sortedNums = existingStops.map((s) => s.stop_number).sort((a, b) => a - b);
  for (const num of sortedNums) {
    ordered.push(existingByNum[num]);
    if (newByInsertAfter[num]) ordered.push(...newByInsertAfter[num]);
  }

  // DEDUP GUARD: Remove duplicate stops by name (always) and by address
  // (only for area/road_trip tours, where each stop should have a unique
  // address). For landmark/cold_spot/ship tours, all stops share the same
  // address, so address dedup would discard valid new stops.
  const dedupByAddr = tour.tour_category === 'area' || tour.tour_category === 'road_trip';
  const normalizeAddr = (a) => String(a || '').toLowerCase().replace(/[^a-z0-9]/g, '').trim();
  const seenNames = new Set();
  const seenAddrs = new Set();
  const dedupedOrdered = [];
  const orphanedNewIds = [];
  for (const s of ordered) {
    const nameKey = (s.name || '').toLowerCase().trim();
    const addrKey = normalizeAddr(s.address);
    const isDup = (nameKey && seenNames.has(nameKey)) || (dedupByAddr && addrKey && seenAddrs.has(addrKey));
    if (!isDup) {
      if (nameKey) seenNames.add(nameKey);
      if (dedupByAddr && addrKey) seenAddrs.add(addrKey);
      dedupedOrdered.push(s);
    } else {
      if (createdStops.find((c) => c.id === s.id)) orphanedNewIds.push(s.id);
    }
  }
  for (const id of orphanedNewIds) {
    await base44.entities.TourStop.delete(id);
  }

  // Cap at MAX_STOPS and renumber.
  const finalOrdered = dedupedOrdered.slice(0, maxStops);
  const actualAdded = newStops.length - orphanedNewIds.length;
  const updates = finalOrdered.map((s, i) => ({ id: s.id, stop_number: i + 1 }));
  if (updates.length > 0) {
    await base44.entities.TourStop.bulkUpdate(updates);
  }

  // Verify ALL tour types via Overpass API — corrects collapsed/inaccurate
  // Nominatim coordinates by matching stops to real OSM features by name.
  try {
    await base44.functions.invoke('fix-collapsed-coords', { tourId: tour.id, skipReorder: tour.user_reordered });
  } catch (e) {
    console.error('Coordinate verification failed (stops still added):', e);
  }

  // New stops are unverified — drop the tour's verified status
  if (actualAdded > 0) {
    await base44.entities.Tour.update(tour.id, { verified: false });
  }
  return { added: actualAdded, capped: existingStops.length + newStops.length > maxStops };
}

// Adds a specific stop by name. The admin types a location name (e.g.,
// "Mumma Farm") and this function finds it via LLM web search, generates
// full stop content, and creates the TourStop. The caller re-orders all
// stops via enforceWalkingDistance after this returns.
export async function addStopByName(tour, searchName) {
  const existingStops = await base44.entities.TourStop.filter({ tour_id: tour.id });
  const maxStops = tour.tour_category === 'cold_spot' ? 4 : 12;
  const existingTourStops = existingStops.filter(s => s.stop_type !== 'parking');
  if (existingTourStops.length >= maxStops) {
    return { added: false, reason: 'max' };
  }

  const existingSummary = existingTourStops
    .map((s) => `Stop ${s.stop_number}: ${s.name} | coords: ${s.latitude}, ${s.longitude}`)
    .join('\n');

  const category = tour.tour_category || 'area';

  const locationConstraint = category === 'landmark' || category === 'ship'
    ? `This stop MUST be on the SAME ${category === 'landmark' ? 'property/site' : 'vessel'} as the existing stops.`
    : category === 'cold_spot'
    ? `This stop MUST be at the SAME specific haunted location as the existing stops.`
    : category === 'road_trip'
    ? `This stop must be along the road trip route in ${tour.state}.`
    : `This stop must be a distinct real location in or near ${tour.city}, ${tour.state}.`;

  const prompt = `You are adding a specific stop to an existing paranormal ghost hunting tour in ${tour.city}, ${tour.state}.

TOUR TITLE: ${tour.title}
TOUR TYPE: ${tour.tour_type}
TOUR CATEGORY: ${category}

EXISTING STOPS:
${existingSummary || '(none yet)'}

The user wants to add this specific location: "${searchName}"

${locationConstraint}

Find this exact location using web search. It must be a real place. Generate full stop content for it.

Provide:
- name: the location's real name
- latitude: real GPS coordinates (look up via web search)
- longitude: real GPS coordinates
- address: COMPLETE STREET ADDRESS with street number (e.g., "123 Main St, City, ST 12345"). Must be GPS-searchable.
- same_structure: true if a room/area within a single building, false if its own structure
- historical_info: 2-3 sentences
- paranormal_info: 2-3 sentences
- investigation_suggestions: array of 3-5 strings
- estimated_investigation_time: string
- construction_date: string
- famous_people: string
- narration_text: 4-6 sentences of dramatic narration
- travel_method: "walking" or "driving"
- hours_of_operation: always provide (use "Exterior accessible 24/7" if freely accessible)
- entry_fee: always provide (use "Free" if no charge)

Output ONLY a valid JSON object with a "stop" property. No markdown fences.`;

  const result = await base44.integrations.Core.InvokeLLM({
    prompt,
    response_json_schema: {
      type: 'object',
      properties: {
        stop: {
          type: 'object',
          properties: {
            name: { type: 'string' },
            latitude: { type: 'number' },
            longitude: { type: 'number' },
            address: { type: 'string' },
            historical_info: { type: 'string' },
            paranormal_info: { type: 'string' },
            investigation_suggestions: { type: 'array', items: { type: 'string' } },
            estimated_investigation_time: { type: 'string' },
            construction_date: { type: 'string' },
            famous_people: { type: 'string' },
            narration_text: { type: 'string' },
            travel_method: { type: 'string' },
            hours_of_operation: { type: 'string' },
            entry_fee: { type: 'string' },
            same_structure: { type: 'boolean' },
          },
        },
      },
    },
    model: 'gemini_3_flash',
    add_context_from_internet: true,
  });

  const stopData = result?.stop;
  if (!stopData || !stopData.name) {
    return { added: false, reason: 'not_found' };
  }

  // Geocode for non-landmark tours (landmark/ship stops share an address)
  const isLandmarkOrShip = category === 'landmark' || category === 'ship';
  let geocoded = isLandmarkOrShip;
  if (!isLandmarkOrShip && stopData.address) {
    const geoMap = await geocodeStopsWithNames([{
      id: 'new', name: stopData.name, address: stopData.address, city: tour.city, state: tour.state
    }], { lat: tour.start_latitude, lon: tour.start_longitude, maxDistMiles: category === 'road_trip' ? 200 : 5 });
    if (geoMap.new) {
      stopData.latitude = geoMap.new.lat;
      stopData.longitude = geoMap.new.lon;
      geocoded = true;
    }
  }

  // Create the stop with a temporary high stop number — the caller re-orders.
  const created = await base44.entities.TourStop.create({
    tour_id: tour.id,
    stop_number: 999,
    name: stopData.name,
    latitude: typeof stopData.latitude === 'number' ? stopData.latitude : parseFloat(stopData.latitude) || null,
    longitude: typeof stopData.longitude === 'number' ? stopData.longitude : parseFloat(stopData.longitude) || null,
    address: stopData.address || '',
    geocoded,
    historical_info: stripConclusionOpeners(stopData.historical_info || '', false),
    paranormal_info: stripConclusionOpeners(stopData.paranormal_info || '', false),
    investigation_suggestions: Array.isArray(stopData.investigation_suggestions) ? stopData.investigation_suggestions.filter(x => typeof x === 'string' && x.trim()) : [],
    estimated_investigation_time: stopData.estimated_investigation_time || '',
    construction_date: stopData.construction_date || '',
    famous_people: stopData.famous_people || '',
    narration_text: stripConclusionOpeners(stopData.narration_text || '', false),
    travel_method: String(stopData.travel_method || '').toLowerCase() === 'driving' ? 'driving' : 'walking',
    hours_of_operation: stopData.hours_of_operation || '',
    entry_fee: stopData.entry_fee || '',
    same_structure: stopData.same_structure === true,
  });

  // Verify coordinates via the backend
  try {
    await base44.functions.invoke('fix-collapsed-coords', { tourId: tour.id, skipReorder: tour.user_reordered });
  } catch (e) {
    console.error('Coordinate verification failed (stop still added):', e);
  }

  await base44.entities.Tour.update(tour.id, { verified: false });
  return { added: true, stop: created };
}
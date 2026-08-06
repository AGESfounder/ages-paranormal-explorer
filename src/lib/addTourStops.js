import { base44 } from '@/api/base44Client';
import { geocodeAddresses } from '@/lib/geocodeStops';

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
    ? `ALL new stops MUST be on the SAME ${category === 'landmark' ? 'property/site' : 'vessel'} as the existing stops. Do NOT add stops in the surrounding area or neighborhood — every new stop must be a different room, building, floor, wing, or area WITHIN the same ${category === 'landmark' ? 'property grounds' : 'vessel'}. Look up the REAL GPS coordinates of each specific area using web search — each stop must have its OWN distinct coordinates reflecting its actual physical location within the site. Do NOT use the same coordinates for all stops.`
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

Output ONLY a valid JSON object with a "new_stops" array.`;

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
    // Geocode new stops for accurate GPS coordinates (LLM coordinates are often wrong)
    const newAddresses = newStops.map(s => s.address).filter(Boolean);
    const newGeocodeMap = newAddresses.length > 0 ? await geocodeAddresses(newAddresses) : {};
    for (const ns of newStops) {
      const geo = ns.address ? newGeocodeMap[ns.address] : null;
      if (geo) {
        ns.latitude = geo.lat;
        ns.longitude = geo.lon;
        newGeocodedAddrs.add(ns.address);
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
      historical_info: ns.historical_info || '',
      paranormal_info: ns.paranormal_info || '',
      investigation_suggestions: Array.isArray(ns.investigation_suggestions) ? ns.investigation_suggestions.filter((x) => typeof x === 'string' && x.trim()) : [],
      estimated_investigation_time: ns.estimated_investigation_time || '',
      construction_date: ns.construction_date || '',
      famous_people: ns.famous_people || '',
      image_url: '',
      narration_text: ns.narration_text || '',
      travel_method: String(ns.travel_method || '').toLowerCase() === 'driving' ? 'driving' : 'walking',
      hours_of_operation: ns.hours_of_operation || '',
      entry_fee: ns.entry_fee || '',
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

  return { added: actualAdded, capped: existingStops.length + newStops.length > maxStops };
}
import { base44 } from '@/api/base44Client';
import { callJson } from '@/lib/llmJson';
import { US_STATES } from '@/lib/statesData';

function normalizeStateName(state) {
  if (!state) return '';
  const s = String(state).trim();
  const byName = US_STATES.find((st) => st.name.toLowerCase() === s.toLowerCase());
  if (byName) return byName.name;
  const byAbbr = US_STATES.find((st) => st.abbr.toLowerCase() === s.toLowerCase());
  if (byAbbr) return byAbbr.name;
  return s;
}

export async function findExistingTour(destination, state, category) {
  const normalizedState = normalizeStateName(state);
  const destLower = destination.trim().toLowerCase();
  const existingTours = await base44.entities.Tour.filter({ state: normalizedState });
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

    // Match on TITLE only — multiple tours in the same city are valid
    // (e.g., a landmark-specific tour vs. a city walking tour that
    // includes that landmark as one stop). Only flag a true duplicate
    // when the destination matches the tour's actual name/title.
    const titleMatch = (t.title || '').toLowerCase().includes(destLower);
    const destInTitle = destLower.includes((t.title || '').toLowerCase().trim()) && (t.title || '').trim().length > 3;
    return titleMatch || destInTitle;
  }) || null;
}

export async function generateLocationTour(destination, state, coords, category = 'landmark') {
  const dest = destination.trim();
  const useCoords = coords && typeof coords.lat === 'number' && typeof coords.lng === 'number';

  // DUPLICATE GUARD: If a tour already exists for this destination, return it
  // instead of creating a duplicate. Callers should use findExistingTour()
  // before calling generateLocationTour to present the user with a choice.
  // Pass the category so the Cold Spot redundancy rule is enforced (see
  // findExistingTour): Cold Spots only block other Cold Spots; non-Cold-Spots
  // ignore existing Cold Spots.
  const existing = await findExistingTour(dest, state, category);
  if (existing) return existing;

  // Creation generates a LIGHTWEIGHT tour + stop skeletons. Full rich
  // historical/paranormal detail and notable people are generated lazily,
  // per stop, when a user opens that stop (see StopDetail.ensureRichContent).
  // This keeps creation fast and reliable (no oversized AI call / timeout).
  const categoryText = category === 'cold_spot'
    ? `This is a COLD SPOT tour — a very short tour with only 1-4 stops at a single haunted location or a tiny cluster of nearby locations. This is for locations that don't have enough distinct areas for a full tour but are still worth investigating. ALL stops must be specific areas, rooms, or sections within or near the location. Set tour_type to "walking". Generate 1-4 stops.`
    : category === 'landmark'
    ? `This is a LOCATION/PROPERTY tour — one specific haunted property (e.g. an asylum, hotel, bridge, cemetery, museum, prison, battlefield, furnace, mansion). ALL stops must be specific areas, rooms, buildings, wings, or sections within or on the grounds of that one location, and all stops share the same street address. Set tour_type to "walking". Generate 8-10 stops.`
    : category === 'area'
    ? `This is an AREA tour — a city, town, or local area where walking or close driving is required. Different locations/properties are the stops. Plan for 1-3 miles of walking, a little more if nearby driving is needed. Set tour_type to "walking" or "mixed". Each stop is a different haunted location with its own real street address and its own real GPS coordinates, spread across the area. Generate 8-10 stops.`
    : category === 'ship'
    ? `This is a SHIP tour — a haunted ship or vessel. ALL stops must be specific decks, cabins, rooms, or areas within or on the vessel. All stops share the same vessel. Set tour_type to "walking". Generate 8-10 stops.`
    : `This is a ROAD TRIP tour — driving between most locations with a higher total mileage. There MUST be considerable driving between stops — at least 5 miles between consecutive stops. Combine different locations and areas into one driving tour. Set tour_type to "driving" or "mixed". Each stop is a different haunted location or area spread across a wider geographic region, each with its own real street address and GPS coordinates. Generate 8-10 stops.`;

  const prompt = `Generate a paranormal ghost hunting tour for the haunted destination "${dest}" in ${state}.

${categoryText}

ROUTING & ACCESS RULES — FOLLOW EXACTLY:

1. DISTANCE MINIMIZATION: Minimize distance from stop to stop AND overall tour length. Every consecutive walking stop MUST be ≤0.33 miles from the previous. For driving/mixed tours, arrange stops in the most efficient order with the shortest total driving distance — linear progression, no doubling back.

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
- latitude: real coordinates (number) — for a PROPERTY tour all stops share the destination's coordinates (areas within one site); for AREA or ROAD TRIP tours each stop has its OWN distinct coordinates
- longitude: real coordinates (number)
- address: for a PROPERTY tour, the full street address of "${dest}" (same for all stops); for AREA or ROAD TRIP tours, each stop's own real street address
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

BRAND RULE: The app is branded AGES, which stands for "Accessible Ghost Exploration Solutions" (never "Affordable"). If you mention the AGES brand anywhere in the text, always define it as "Accessible Ghost Exploration Solutions".

Output ONLY a valid JSON object. No markdown fences, no commentary.${useCoords ? `\n\nCOORDINATES HINT: The searched point is latitude ${coords.lat}, longitude ${coords.lng}. Use these for start_latitude/start_longitude. For a PROPERTY or COLD SPOT tour, every stop uses these same coordinates (areas within one site). For AREA or ROAD TRIP tours, place each stop at its OWN real coordinates within ~30 miles of this point, spread across the area.` : ''}`;

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

    // DEDUP GUARD: Remove duplicate stops by name OR address (case-insensitive).
    const seenStopNames = new Set();
    const seenStopAddrs = new Set();
    const validStops = [];
    for (const item of allValidStops) {
      const nameKey = item.name.toLowerCase().trim();
      const addrKey = normalizeAddr(item.s?.address);
      if (seenStopNames.has(nameKey)) continue;
      if (addrKey && seenStopAddrs.has(addrKey)) continue;
      if (nameKey) seenStopNames.add(nameKey);
      if (addrKey) seenStopAddrs.add(addrKey);
      validStops.push(item);
    }

    // CATEGORY CORRECTION: If all stops share the same street address, force
    // to "landmark" (property) to prevent miscategorization.
    let correctedCategory = category;
    if (validStops.length >= 2 && correctedCategory !== 'ship') {
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

    const stopRecords = validStops.map(({ s, name, stop_number }) => ({
      stop_number,
      name,
      latitude: useCoords ? coords.lat : toNum(s.latitude),
      longitude: useCoords ? coords.lng : toNum(s.longitude),
      address: toStr(s.address),
      historical_info: toStr(s.historical_info),
      paranormal_info: toStr(s.paranormal_info),
      investigation_suggestions: toStrArr(s.investigation_suggestions),
      estimated_investigation_time: toStr(s.estimated_investigation_time),
      construction_date: toStr(s.construction_date),
      famous_people: toStr(s.famous_people),
      image_url: toStr(s.image_url),
      narration_text: toStr(s.narration_text),
      travel_method: normEnum(s.travel_method, ['walking', 'driving'], 'walking'),
      hours_of_operation: toStr(s.hours_of_operation),
      entry_fee: toStr(s.entry_fee),
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

  const newTour = await base44.entities.Tour.create(processed.tourData);

  try {
    const stopRecords = processed.stopRecords.map((r) => ({ ...r, tour_id: newTour.id }));
    await base44.entities.TourStop.bulkCreate(stopRecords);
  } catch (e) {
    // Stop creation failure must not block the tour; TourDetail backfills stops.
    console.error('Stop creation failed (tour still created):', e);
  }

  return newTour;
}
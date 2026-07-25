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

export async function generateLocationTour(destination, state, coords) {
  const dest = destination.trim();
  const useCoords = coords && typeof coords.lat === 'number' && typeof coords.lng === 'number';

  // Creation generates a LIGHTWEIGHT tour + stop skeletons. Full rich
  // historical/paranormal detail and notable people are generated lazily,
  // per stop, when a user opens that stop (see StopDetail.ensureRichContent).
  // This keeps creation fast and reliable (no oversized AI call / timeout).
  const prompt = `Generate a paranormal ghost hunting tour for the haunted destination "${dest}" in ${state}.

This is a SINGLE DESTINATION tour — ALL stops must be specific areas, rooms, buildings, wings, features, or sections within or on the grounds of "${dest}". Do NOT create stops that are separate, unaffiliated locations.

Examples of valid stops (for a destination like Pennhurst Asylum): Administration Building, Devon Building, Quaker Building, Tunnels, Patient Wards, Basement, Infirmary, Morgue, Museum, Exterior Grounds. Every stop belongs to the same destination.

ROUTING & ACCESS RULES — FOLLOW EXACTLY:

1. DISTANCE MINIMIZATION: Minimize distance from stop to stop AND overall tour length. Every consecutive walking stop MUST be ≤0.33 miles from the previous. Arrange stops in the most efficient order possible.

2. WALKING TOURS (preferred for single destinations): Stops form a logical loop — start and end near the entrance/main building. Route proceeds in an efficient circle so investigators return to their starting point. Every stop ≤0.33 miles from the previous.

3. PUBLIC ACCESS AFTER 7 PM: ALL stops must be accessible after 7 PM — at minimum, investigators must be able to be outside each building/area after 7 PM. Note any interior access restrictions in hours_of_operation. Include entry fees and ticket pricing in entry_fee.

4. MOST POPULAR STOPS: Prioritize the most famous, most talked-about areas of "${dest}" — the locations where paranormal activity and ghosts have been observed and recorded most. Include stops that are widely discussed in paranormal circles.

Return a JSON object with:
- title: "${dest} Paranormal Investigation"
- state: "${state}"
- city: the city where "${dest}" is located
- tour_type: "walking" (use "walking" unless the destination is extremely spread out)
- description: 4-6 detailed sentences about the destination's haunted history, founding, and why it's notorious
- introduction: 2-3 rich paragraphs setting the scene for investigators — the atmosphere, what to expect, and the location's dark legacy
- conclusion: 2-3 paragraphs wrapping up the investigation and reflecting on what was explored
- difficulty: "easy", "moderate", or "challenging"
- estimated_duration: e.g. "2-3 hours"
- total_distance: e.g. "~0.8 miles"
- start_location_name: the main entrance or parking area
- start_latitude: number (use real coordinates for "${dest}")
- start_longitude: number (use real coordinates for "${dest}")
- image_url: empty string
- tags: array of 3-5 relevant strings
- safety_info: 2-3 practical safety notes for this specific location
- best_time: best season/time for investigating

PLUS a "stops" array (6-8 stops) — each a LIGHTWEIGHT skeleton (full detail is generated later, so keep these fields brief):
- stop_number: starting from 1
- name: specific area/building/room name within "${dest}"
- latitude: real coordinates (number)
- longitude: real coordinates (number)
- address: street address of "${dest}" (same for all stops — use "${dest}" full address)
- historical_info: 2-3 sentences summarizing the key history (construction dates, notable figures, major events). Brief summary only.
- paranormal_info: 2-3 sentences summarizing the key paranormal activity and ghosts. Brief summary only.
- investigation_suggestions: 3-5 specific items like "EVP Session", "Spirit Box Session", "EMF Sweep", "Trigger Object Experiment", "Temperature Monitoring", "Full-Spectrum Photography"
- estimated_investigation_time: e.g. "20-30 minutes"
- construction_date: when that area was built if known (with year)
- famous_people: notable people associated with that area — full names, roles
- image_url: empty string
- narration_text: 4-6 sentences of dramatic, immersive storytelling narration in a mysterious, captivating style. The narrator is a seasoned paranormal investigator speaking to fellow investigators about what awaits them. Include vivid sensory details and specific ghost stories.
- travel_method: "walking"
- hours_of_operation: e.g. "Exterior accessible 24/7, interior tours until 10PM Friday-Saturday"
- entry_fee: e.g. "$25 for day tour, $45 for overnight investigation"

Use real locations and real coordinates for "${dest}". Keep every historical_info and paranormal_info field BRIEF (2-3 sentences) — the full rich detail is generated later.

BRAND RULE: The app is branded AGES, which stands for "Accessible Ghost Exploration Solutions" (never "Affordable"). If you mention the AGES brand anywhere in the text, always define it as "Accessible Ghost Exploration Solutions".

Output ONLY a valid JSON object. No markdown fences, no commentary.${useCoords ? `\n\nEXACT COORDINATES: This destination is located at exactly latitude ${coords.lat}, longitude ${coords.lng}. Use these EXACT coordinates for start_latitude, start_longitude, and for EVERY stop's latitude and longitude (all stops are areas within this single destination). Do not use any other coordinates.` : ''}`;

  // Robust multi-attempt generation: web search first, then a no-web fallback
  // using the model's training knowledge. The lightweight payload makes either
  // attempt fast enough to avoid timeouts.
  let result = null;
  try {
    result = await callJson(prompt, { useWeb: true });
  } catch (e) { console.error('Tour generation (web) failed:', e); }
  if (!result || !result.stops || result.stops.length === 0) {
    try {
      result = await callJson(prompt, { useWeb: false });
    } catch (e) { console.error('Tour generation (no-web) failed:', e); }
  }
  if (!result || !result.stops || result.stops.length === 0) {
    throw new Error('Could not generate this tour after several attempts. Please try again.');
  }

  const tourData = {
    title: result.title || `${dest} Paranormal Investigation`,
    state: normalizeStateName(state),
    city: result.city || '',
    tour_type: result.tour_type || 'walking',
    description: result.description || '',
    introduction: result.introduction || '',
    conclusion: result.conclusion || '',
    difficulty: result.difficulty || 'moderate',
    estimated_duration: result.estimated_duration || '',
    total_distance: result.total_distance || '',
    start_location_name: result.start_location_name || '',
    start_latitude: useCoords ? coords.lat : result.start_latitude,
    start_longitude: useCoords ? coords.lng : result.start_longitude,
    image_url: result.image_url || '',
    tags: result.tags || [],
    safety_info: result.safety_info || '',
    best_time: result.best_time || '',
  };

  const newTour = await base44.entities.Tour.create(tourData);

  if (result.stops?.length > 0) {
    try {
      const stopRecords = result.stops.map((s) => ({
        tour_id: newTour.id,
        stop_number: s.stop_number,
        name: s.name,
        latitude: useCoords ? coords.lat : s.latitude,
        longitude: useCoords ? coords.lng : s.longitude,
        address: s.address,
        historical_info: s.historical_info || '',
        paranormal_info: s.paranormal_info || '',
        investigation_suggestions: s.investigation_suggestions || [],
        estimated_investigation_time: s.estimated_investigation_time || '',
        construction_date: s.construction_date || '',
        famous_people: s.famous_people || '',
        image_url: s.image_url || '',
        narration_text: s.narration_text || '',
        travel_method: s.travel_method || 'walking',
        hours_of_operation: s.hours_of_operation || '',
        entry_fee: s.entry_fee || '',
      }));
      await base44.entities.TourStop.bulkCreate(stopRecords);
    } catch (e) {
      // Stop creation failure must not block the tour; TourDetail backfills stops.
      console.error('Stop creation failed (tour still created):', e);
    }
  }

  return newTour;
}
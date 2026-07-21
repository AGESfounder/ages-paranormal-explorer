import { base44 } from '@/api/base44Client';

export async function generateLocationTour(destination, state) {
  const dest = destination.trim();
  const result = await base44.integrations.Core.InvokeLLM({
    prompt: `Generate a paranormal ghost hunting tour for the haunted destination "${dest}" in ${state}.

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

PLUS a "stops" array (6-8 stops) — each with:
- stop_number: starting from 1
- name: specific area/building/room name within "${dest}"
- latitude: real coordinates (number)
- longitude: real coordinates (number)
- address: street address of "${dest}" (same for all stops since it's one destination — use "${dest}" full address)
- historical_info: 4-5 DETAILED paragraphs covering construction dates and architecture, major historical events that occurred in that specific area, notable figures who lived/worked/visited/died there, scandals/murders/tragedies, and the area's significance over time. Go deep into specific dates, full names, and documented events. Do not merely mention people — explain who they were, what happened to them, and why it matters.
- paranormal_info: 4-5 DETAILED paragraphs covering specific ghost sightings (with dates and eyewitness names when known), EVP recordings and their content, apparition descriptions (clothing, behavior, exact location within the building), shadow figures, cold spots, poltergeist activity, residual hauntings vs intelligent hauntings, and local folklore/urban legends tied to that area. Include investigator testimonies and well-known paranormal events. Do not just list ghost names — tell their full stories.
- investigation_suggestions: 3-5 specific items like "EVP Session", "Spirit Box Session", "EMF Sweep", "Trigger Object Experiment", "Temperature Monitoring", "Full-Spectrum Photography"
- estimated_investigation_time: e.g. "20-30 minutes"
- construction_date: when that area was built if known (with year)
- famous_people: notable people associated with that area — include full names, roles, and what happened to them
- image_url: empty string
- narration_text: 6-9 sentences of dramatic, immersive storytelling narration written in a mysterious, captivating style. The narrator is a seasoned paranormal investigator speaking to fellow investigators about what awaits them. Include vivid sensory details (sounds, smells, temperature, lighting), specific ghost stories, and build anticipation. This should feel like a professional ghost tour guide speaking.
- travel_method: "walking"
- hours_of_operation: e.g. "Exterior accessible 24/7, interior tours until 10PM Friday-Saturday"
- entry_fee: e.g. "$25 for day tour, $45 for overnight investigation"

Use real locations and real paranormal history for "${dest}". Verify hours, pricing, and after-7PM accessibility. Make every stop feel distinct and worth visiting. Every historical_info and paranormal_info field MUST be richly detailed (4-5 paragraphs each) — never brief. When people are mentioned, always include their full story, role, and fate, not just a name.

BRAND RULE: The app is branded AGES, which stands for "Accessible Ghost Exploration Solutions" (never "Affordable"). If you mention the AGES brand anywhere in the text, always define it as "Accessible Ghost Exploration Solutions".`,

    response_json_schema: {
      type: "object",
      properties: {
        title: { type: "string" },
        state: { type: "string" },
        city: { type: "string" },
        tour_type: { type: "string", enum: ["walking", "driving", "mixed"] },
        description: { type: "string" },
        introduction: { type: "string" },
        conclusion: { type: "string" },
        difficulty: { type: "string", enum: ["easy", "moderate", "challenging"] },
        estimated_duration: { type: "string" },
        total_distance: { type: "string" },
        start_location_name: { type: "string" },
        start_latitude: { type: "number" },
        start_longitude: { type: "number" },
        image_url: { type: "string" },
        tags: { type: "array", items: { type: "string" } },
        safety_info: { type: "string" },
        best_time: { type: "string" },
        stops: {
          type: "array",
          items: {
            type: "object",
            properties: {
              stop_number: { type: "number" },
              name: { type: "string" },
              latitude: { type: "number" },
              longitude: { type: "number" },
              address: { type: "string" },
              historical_info: { type: "string" },
              paranormal_info: { type: "string" },
              investigation_suggestions: { type: "array", items: { type: "string" } },
              estimated_investigation_time: { type: "string" },
              construction_date: { type: "string" },
              famous_people: { type: "string" },
              image_url: { type: "string" },
              narration_text: { type: "string" },
              travel_method: { type: "string", enum: ["walking", "driving"] },
              hours_of_operation: { type: "string" },
              entry_fee: { type: "string" },
            },
            required: ["stop_number", "name", "latitude", "longitude", "address"],
          }
        }
      },
      required: ["title", "state", "city", "tour_type", "stops"],
    },
    model: "gemini_3_flash",
    add_context_from_internet: true,
  });

  const tourData = {
    title: result.title,
    state,
    city: result.city,
    tour_type: result.tour_type,
    description: result.description,
    introduction: result.introduction,
    conclusion: result.conclusion,
    difficulty: result.difficulty,
    estimated_duration: result.estimated_duration,
    total_distance: result.total_distance,
    start_location_name: result.start_location_name,
    start_latitude: result.start_latitude,
    start_longitude: result.start_longitude,
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
        latitude: s.latitude,
        longitude: s.longitude,
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
    }
  }

  return newTour;
}
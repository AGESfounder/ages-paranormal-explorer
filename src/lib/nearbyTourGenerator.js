import { base44 } from '@/api/base44Client';
import { findExistingTour } from '@/lib/generateTour';

// Phase 1: Try up to AREA_MAX_ATTEMPTS times to create a new Area tour in a
// location that doesn't already have one. Each redundant result adds its city
// to the avoid-list so the next attempt picks somewhere different.
// Phase 2: If every Area attempt is redundant, try once for a Cold Spot tour.
// Phase 3: If that also fails, return existing tours so the UI can suggest one.
const AREA_MAX_ATTEMPTS = 2;
const COLD_SPOT_MAX_ATTEMPTS = 1;

const TOUR_SCHEMA = {
  type: 'object',
  properties: {
    tours: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          title: { type: 'string' },
          tour_category: { type: 'string' },
          city: { type: 'string' },
          state: { type: 'string' },
          tour_type: { type: 'string' },
          description: { type: 'string' },
          introduction: { type: 'string' },
          conclusion: { type: 'string' },
          difficulty: { type: 'string' },
          estimated_duration: { type: 'string' },
          total_distance: { type: 'string' },
          start_location_name: { type: 'string' },
          start_latitude: { type: 'number' },
          start_longitude: { type: 'number' },
          tags: { type: 'array', items: { type: 'string' } },
          safety_info: { type: 'string' },
          best_time: { type: 'string' },
        },
      },
    },
  },
};

const ROUTING_RULES = `
ROUTING & ACCESS RULES — FOLLOW EXACTLY:

1. DISTANCE MINIMIZATION: Minimize distance from stop to stop AND overall tour length. Every consecutive walking stop MUST be ≤0.33 miles from the previous. Arrange stops in the most efficient order possible — shortest total route wins.

2. WALKING TOURS: Walking tours form a logical loop — stops start and end near the same point with no crisscrossing. Route proceeds in an efficient circle so investigators return to their starting point.

3. DRIVING-ONLY TOURS: Stops follow a logical linear progression — each stop advances in a single direction with no doubling back. Minimize total driving distance.

4. MIXED TOURS: The tour can start by driving to a parking area near a walking cluster, then walking stops form a logical loop (≤0.33 miles between stops, returning to that parking area). Remaining driving stops continue in a linear progression. Use this pattern when it makes the most logical sense — drive to where the walking cluster is, walk the loop, then drive to remaining stops. Minimize both walking and driving distances.

5. PUBLIC ACCESS AFTER 7 PM: ALL locations must be publicly accessible after 7 PM. Ghost hunts occur at night. Do NOT use locations that close before 7 PM, have locked gates, or prohibit nighttime access (e.g. national battlefields, state parks closing at sunset, gated cemeteries, museums closing at 5 PM). At minimum, investigators must be able to be outside the building after 7 PM. Verify nighttime access for every location.

6. MOST POPULAR STOPS: Include the most popular, most talked-about paranormal hotspots — the locations where paranormal activity and ghosts have been observed, recorded, and discussed most. Prioritize locations with the richest documented paranormal history and famous ghost sightings. Do NOT include obscure or unknown locations.

Use real locations with documented paranormal history only.`;

async function getExistingTourLocations() {
  try {
    const tours = await base44.entities.Tour.list('-created_date', 500);
    const locations = [];
    for (const t of tours) {
      if (t.city && t.state) {
        locations.push(`${t.city.trim()}, ${t.state.trim()}`);
      }
    }
    return locations;
  } catch (e) {
    return [];
  }
}

function buildAvoidText(locations) {
  if (!locations.length) return '';
  const sample = locations.slice(0, 60).map((l) => `"${l}"`).join(', ');
  return `\n\nREDUNDANCY RULE — CRITICAL: The following locations already have tours in the app. Do NOT generate a tour in ANY of these cities/towns: ${sample}${locations.length > 60 ? ' (and others)' : ''}. You MUST pick a DIFFERENT city or town within the specified distance that is NOT in this list. If every location in the distance range is already covered, return an empty tours array.`;
}

function buildPrompt(locationContext, category, avoidLocations) {
  const categoryText = category === 'cold_spot'
    ? 'This is a COLD SPOT tour — a very short tour with only 1-4 stops at a single haunted location or a tiny cluster of nearby locations. Set tour_category to "cold_spot". Set tour_type to "walking".'
    : 'This is an AREA tour — walking or close driving, different locations 1-3 miles apart. Set tour_category to "area". Set tour_type to "walking", "driving", or "mixed".';

  return `Generate exactly 1 paranormal tour with a start location ${locationContext}.

Tour category: ${categoryText}

Include:
- title: a creative, spooky tour name
- tour_category: "${category}"
- city: the town/city where the tour starts
- state: full state name
- tour_type: "walking", "driving", or "mixed"
- description: 2-3 compelling sentences about the tour's haunted locations
- introduction: historical overview + paranormal overview (each 3-4 paragraphs, rich with dates, specific events, eyewitness accounts, local legends) + safety info. Mention "AGES (Accessible Ghost Exploration Solutions) encourages explorers to conduct respectful paranormal investigations while preserving historic locations."
- conclusion: closing paragraph ending with "Thank you for exploring with AGES — Accessible Ghost Exploration Solutions. Remember that every legend has a story, every location has a history, and every investigation adds to the mystery."
- difficulty: "easy", "moderate", or "challenging"
- estimated_duration: e.g. "2-3 hours"
- total_distance: e.g. "1.5 miles"
- start_location_name, start_latitude, start_longitude (real coordinates at a location ${locationContext})
- tags: array of relevant tags
- safety_info: important safety notes
- best_time: "Dusk to midnight"

${ROUTING_RULES}${buildAvoidText(avoidLocations)}`;
}

async function attemptGeneration(locationContext, category, avoidLocations) {
  try {
    const result = await base44.integrations.Core.InvokeLLM({
      prompt: buildPrompt(locationContext, category, avoidLocations),
      response_json_schema: TOUR_SCHEMA,
      model: 'gemini_3_flash',
      add_context_from_internet: true,
    });
    return result.tours?.[0] || null;
  } catch (e) {
    console.error('Tour generation attempt failed:', e);
    return null;
  }
}

/**
 * Try to create a NEW non-redundant tour near the given location.
 *
 * Flow:
 *   1. Try up to 2 Area tours, avoiding cities that already have tours.
 *   2. If all Area attempts are redundant, try 1 Cold Spot tour.
 *    3. If that also fails, return existing tours for the UI to suggest.
 *
 * @param {string} locationContext — e.g. "1-20 miles from (lat, lng)"
 * @returns {Promise<{status: 'created', tour: object} | {status: 'none', existingTours: array}>}
 */
export async function generateNewNearbyTour(locationContext) {
  const avoidLocations = await getExistingTourLocations();

  // Phase 1: Area tours
  for (let i = 0; i < AREA_MAX_ATTEMPTS; i++) {
    const tourData = await attemptGeneration(locationContext, 'area', avoidLocations);
    if (!tourData) continue;
    const existing = await findExistingTour(tourData.title, tourData.state, 'area', undefined, tourData.city);
    if (!existing) {
      const saved = await base44.entities.Tour.create({ ...tourData, tour_category: 'area' });
      return { status: 'created', tour: saved };
    }
    // Redundant — add to avoid list and retry with a different area
    if (tourData.city && tourData.state) {
      avoidLocations.push(`${tourData.city.trim()}, ${tourData.state.trim()}`);
    }
  }

  // Phase 2: Cold Spot fallback
  for (let i = 0; i < COLD_SPOT_MAX_ATTEMPTS; i++) {
    const tourData = await attemptGeneration(locationContext, 'cold_spot', avoidLocations);
    if (!tourData) continue;
    const existing = await findExistingTour(tourData.title, tourData.state, 'cold_spot', undefined, tourData.city);
    if (!existing) {
      const saved = await base44.entities.Tour.create({ ...tourData, tour_category: 'cold_spot' });
      return { status: 'created', tour: saved };
    }
    if (tourData.city && tourData.state) {
      avoidLocations.push(`${tourData.city.trim()}, ${tourData.state.trim()}`);
    }
  }

  // Phase 3: No new tour possible — gather existing tours to suggest
  let existingTours = [];
  try {
    existingTours = await base44.entities.Tour.list('-created_date', 20);
  } catch (e) { /* ignore */ }
  return { status: 'none', existingTours };
}
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';

// Fixes collapsed stop coordinates for landmark/ship tours by looking up
// real GPS coordinates via LLM web search. Admin-only.
export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    if (user.role !== 'admin') return Response.json({ error: 'Forbidden' }, { status: 403 });

    const body = await req.json();
    const tourId = body.tourId;
    if (!tourId) return Response.json({ error: 'tourId required' }, { status: 400 });

    const tour = await base44.asServiceRole.entities.Tour.get(tourId);
    if (!tour) return Response.json({ error: 'Tour not found' }, { status: 404 });
    if (tour.tour_category !== 'landmark' && tour.tour_category !== 'ship') {
      return Response.json({ error: 'Only landmark/ship tours supported' }, { status: 400 });
    }

    const stops = await base44.asServiceRole.entities.TourStop.filter({ tour_id: tourId });
    stops.sort((a, b) => (a.stop_number || 0) - (b.stop_number || 0));
    if (stops.length < 2) return Response.json({ tourId, updated: 0, reason: 'less than 2 stops' });

    // Check if already fixed (has distinct coordinates)
    const coordSet = new Set(stops.map(s => `${s.latitude},${s.longitude}`));
    if (coordSet.size > 1) return Response.json({ tourId, updated: 0, reason: 'already has distinct coords' });

    const stopList = stops.map(s => `${s.stop_number}. ${s.name}`).join('\n');
    const prompt = `I need the REAL GPS coordinates (latitude, longitude) for each of these specific areas within "${tour.title}" in ${tour.city}, ${tour.state}. Look up each location's actual coordinates using web search:

${stopList}

For each stop, provide the real latitude and longitude as numbers. Each stop is a different area within the same property/site. Return a JSON object with a "stops" array, each with "stop_number" (number), "latitude" (number), and "longitude" (number). Output ONLY valid JSON.`;

    const result = await base44.asServiceRole.integrations.Core.InvokeLLM({
      prompt,
      model: 'gemini_3_flash',
      add_context_from_internet: true,
      response_json_schema: {
        type: 'object',
        properties: {
          stops: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                stop_number: { type: 'number' },
                latitude: { type: 'number' },
                longitude: { type: 'number' },
              },
            },
          },
        },
      },
    });

    const llmStops = Array.isArray(result?.stops) ? result.stops : [];
    const updates = [];
    for (const llmStop of llmStops) {
      const stop = stops.find(s => s.stop_number === llmStop.stop_number);
      if (stop && typeof llmStop.latitude === 'number' && typeof llmStop.longitude === 'number'
          && Math.abs(llmStop.latitude) < 90 && Math.abs(llmStop.longitude) < 180) {
        updates.push({ id: stop.id, latitude: llmStop.latitude, longitude: llmStop.longitude, geocoded: true });
      }
    }

    if (updates.length > 0) {
      await base44.asServiceRole.entities.TourStop.bulkUpdate(updates);
    }

    return Response.json({ tourId, title: tour.title, updated: updates.length, total: stops.length });
  } catch (error) {
    console.error('fix-collapsed-coords error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
}
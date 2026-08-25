import { base44 } from '@/api/base44Client';
import { callJson } from '@/lib/llmJson';
import { geocodeStopsWithNames } from '@/lib/geocodeStops';

// Creates a shuttle drop-off stop for a tour. Used when the parking area is
// at a visitor center and a shuttle takes investigators to the tour start.
// The shuttle stop is positioned via LLM web search for the drop-off location,
// and can be user-validated on the first tour run (same as any stop).
// The shuttle stop follows the same rules as parking — it doesn't count as
// a tour stop, is excluded from route calculations, and renders with a green S.
export async function addShuttleStop(tour) {
  // Check if a shuttle stop already exists
  const existingStops = await base44.entities.TourStop.filter({ tour_id: tour.id });
  const existingShuttle = existingStops.find(s => s.stop_type === 'shuttle');
  if (existingShuttle) {
    return { added: false, reason: 'exists' };
  }

  const prompt = `Search for the shuttle drop-off location for a paranormal tour at "${tour.title}" in ${tour.city}, ${tour.state}.

This tour starts at: ${tour.start_location_name || 'the tour start location'}
Tour start coordinates: ${tour.start_latitude}, ${tour.start_longitude}

Many historical sites and national parks use a shuttle system where visitors park at a visitor center and take a shuttle to the actual site. Find the shuttle drop-off point for this specific location.

Search for:
- "${tour.title} shuttle drop-off"
- "${tour.city} ${tour.state} visitor shuttle"
- "${tour.start_location_name} shuttle stop"
- "${tour.title} parking shuttle"

Return JSON with:
- name: Name of the shuttle drop-off location (e.g., "Harpers Ferry Shuttle Drop-Off", "Visitor Center Shuttle Stop")
- address: Complete street address of the drop-off point
- latitude: GPS latitude of the drop-off point
- longitude: GPS longitude of the drop-off point
- parking_type: "shuttle_free" or "shuttle_paid"
- parking_cost: Cost description (e.g., "Free shuttle", "$5 round-trip", "Free with park admission")

Output ONLY valid JSON. No markdown fences.`;

  let result = null;
  try {
    result = await callJson(prompt, { useWeb: true });
  } catch (e) {
    console.error('Shuttle stop generation failed:', e);
  }

  if (!result || !result.name) {
    return { added: false, reason: 'not_found' };
  }

  // Geocode the shuttle address for accurate coordinates, falling back to
  // the tour's start coordinates (the shuttle drops you at the tour start).
  let lat = result.latitude || tour.start_latitude;
  let lon = result.longitude || tour.start_longitude;
  if (result.address) {
    try {
      const geoMap = await geocodeStopsWithNames([{
        id: 'shuttle', name: result.name, address: result.address,
        city: tour.city, state: tour.state
      }], { lat: tour.start_latitude, lon: tour.start_longitude, maxDistMiles: 5 });
      if (geoMap.shuttle) { lat = geoMap.shuttle.lat; lon = geoMap.shuttle.lon; }
    } catch (e) {
      console.error('Shuttle geocode failed:', e);
    }
  }

  const shuttleStop = await base44.entities.TourStop.create({
    tour_id: tour.id,
    stop_type: 'shuttle',
    stop_number: 0,
    name: result.name,
    address: result.address || '',
    latitude: lat,
    longitude: lon,
    parking_type: result.parking_type || 'shuttle_free',
    parking_cost: result.parking_cost || 'Free',
    travel_method: 'walking',
    geocoded: false, // LLM-sourced — amber EST badge until user validates
  });

  return { added: true, stop: shuttleStop };
}
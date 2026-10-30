import { base44 } from '@/api/base44Client';
import { enforceWalkingDistance, getWalkingLimit } from '@/lib/routeOptimizer';

// Cheap local sanity check — does the stored order break the route rules?
// Walking stops must come first as one loop, driving stops last, and no leg
// may be tagged walking when it is further than the tour's walking limit.
export function orderViolatesRules(tour, stops) {
  const located = (stops || [])
    .filter(s => s.stop_type !== 'parking' && s.stop_type !== 'shuttle'
      && s.latitude != null && s.longitude != null && !s.needs_placement)
    .sort((a, b) => (a.stop_number || 0) - (b.stop_number || 0));
  if (located.length < 2) return false;
  const limit = getWalkingLimit(tour);
  let sawDriving = false;
  for (let i = 0; i < located.length; i++) {
    const stop = located[i];
    if (stop.travel_method === 'driving') sawDriving = true;
    else if (sawDriving) return true; // a walking stop after a driving one
    const prev = located[i - 1];
    if (prev && stop.travel_method === 'walking'
      && Math.hypot((stop.latitude - prev.latitude) * 69, (stop.longitude - prev.longitude) * 53) > limit * 2) {
      return true; // an impossible walking leg
    }
  }
  return false;
}

// A corrected address moves a stop. Its old visit order and walking/driving
// tag described the coordinates it no longer has, so the tour is re-derived
// by the same route rules a build uses: walking loop from the lot first,
// driving stops last and ordered outward. Returns the re-ordered stops and
// the tour-level fields that follow from them.
export default async function reorderCorrectedStops(tour, stops) {
  if (!tour?.id || !stops?.length) return null;
  const investigation = stops.filter(s => s.stop_type !== 'parking' && s.stop_type !== 'shuttle');
  if (investigation.length < 2) return null;
  const parking = stops.find(s => s.stop_type === 'parking');
  const parkingCoords = parking && parking.latitude != null && !parking.needs_placement
    ? { lat: parking.latitude, lon: parking.longitude }
    : null;

  const ordered = await enforceWalkingDistance(
    investigation,
    tour.tour_type,
    { lat: tour.start_latitude, lon: tour.start_longitude },
    { walkingLimit: getWalkingLimit(tour), tourCategory: tour.tour_category, parkingCoords },
  );

  const before = new Map(investigation.map(s => [s.id, s]));
  const changed = ordered.filter(s => {
    const prev = before.get(s.id);
    return !prev || prev.stop_number !== s.stop_number || prev.travel_method !== s.travel_method;
  });
  if (!changed.length) return null;

  await base44.entities.TourStop.bulkUpdate(changed.map(s => ({
    id: s.id,
    stop_number: s.stop_number,
    travel_method: s.travel_method,
  })));

  // The tour's own type follows its stops — a stopped that can no longer be
  // walked makes the route mixed, not a pure walking tour.
  const methods = new Set(ordered.filter(s => s.latitude != null).map(s => s.travel_method));
  const tourType = methods.has('driving') && methods.has('walking') ? 'mixed'
    : methods.has('driving') ? 'driving' : 'walking';
  const tourUpdates = {};
  if (tourType !== tour.tour_type) tourUpdates.tour_type = tourType;
  const firstName = ordered[0]?.name;
  if (firstName && firstName !== tour.start_location_name) tourUpdates.start_location_name = firstName;
  if (Object.keys(tourUpdates).length) {
    await base44.entities.Tour.update(tour.id, tourUpdates);
  }

  const shuttle = stops.find(s => s.stop_type === 'shuttle');
  return {
    stops: [...(parking ? [parking] : []), ...(shuttle ? [shuttle] : []), ...ordered],
    tourUpdates,
  };
}
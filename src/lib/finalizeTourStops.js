import { base44 } from '@/api/base44Client';
import { enforceWalkingDistance, getWalkingLimit, normalizeAreaTourType } from '@/lib/routeOptimizer';
import ensureTourParking from '@/lib/ensureTourParking';

// Initial builds share this order: resolve locations, classify the real stops,
// find parking for that walk, then store the final order and completion state.
const STOPS_PREP_VERSION = 22;

// Everything a build does AFTER coordinates are resolved. Runs for a new build
// and for a repair started by a person — same steps, same result.
export default async function finalizeTourStops(tour) {
  const [tours, page] = await Promise.all([
    base44.entities.Tour.filter({ id: tour.id }),
    base44.entities.TourStop.filter({ tour_id: tour.id }, { sort: 'stop_number', limit: 100 }),
  ]);
  if (page.has_more) throw new Error('This tour needs review because it has too many saved stops.');
  const current = tours[0];
  if (!current) throw new Error('The tour no longer exists.');
  if (current.verified) return { tour: current, stops: page.items };
  const regular = page.items.filter(s => s.stop_type !== 'parking' && s.stop_type !== 'shuttle');
  if (!regular.length) throw new Error('This tour has no saved investigation stops.');
  const options = { walkingLimit: getWalkingLimit(current), tourCategory: current.tour_category,
    preserveOrder: !!(current.manual_reorder || current.user_reordered) };
  const type = normalizeAreaTourType(current.tour_category, current.tour_type);
  const start = { lat: current.start_latitude, lon: current.start_longitude };
  const classified = await enforceWalkingDistance(regular, type, start, { ...options, preserveOrder: true });
  const parking = await ensureTourParking(current, [ ...page.items.filter(s => s.stop_type === 'parking'), ...classified ]);
  const routed = await enforceWalkingDistance(regular, type, start, { ...options,
    parkingCoords: parking && !parking.needs_placement ? { lat: parking.latitude, lon: parking.longitude } : null });
  // The drive belongs at the END: walking stops keep their relative order, then
  // every driving stop follows. A kept order (manual or user order) can only
  // choose the sequence WITHIN each group, never put a drive before a walk.
  const ordered = [...routed.filter(s => s.travel_method !== 'driving'), ...routed.filter(s => s.travel_method === 'driving')]
    .map((s, i) => (s.stop_number === i + 1 ? s : { ...s, stop_number: i + 1 }));
  const updates = ordered.filter(s => regular.some(old => old.id === s.id && (old.stop_number !== s.stop_number || old.travel_method !== s.travel_method)))
    .map(s => ({ id: s.id, stop_number: s.stop_number, travel_method: s.travel_method }));
  if (updates.length) await base44.entities.TourStop.bulkUpdate(updates);
  const methods = new Set(ordered.filter(s => !s.needs_placement).map(s => s.travel_method));
  const tourType = methods.size === 2 ? 'mixed' : methods.has('driving') ? 'driving' : methods.has('walking') ? 'walking' : current.tour_type;
  // A tour with stops and no lot is never 'ready' — a missing parking record is
  // a failed step, not a finished build.
  const buildStatus = !parking || parking.needs_placement || ordered.some(s => s.needs_placement || s.geocoded !== true)
    ? 'needs_review' : 'ready';
  const fields = { tour_type: tourType, build_status: buildStatus, stops_regenerated: STOPS_PREP_VERSION };
  await base44.entities.Tour.update(tour.id, fields);
  const shuttle = page.items.find(s => s.stop_type === 'shuttle');
  return { tour: { ...current, ...fields }, stops: [...(parking ? [parking] : []), ...(shuttle ? [shuttle] : []), ...ordered] };
}
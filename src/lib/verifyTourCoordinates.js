import { base44 } from '@/api/base44Client';

// Coordinate verification is paced by a map lookup per stop (address, street
// fallback, name search, street snap — about a second each). A whole tour in one
// call outruns the function's time limit, and when that call is cut, every step
// after it is lost: coordinates unmarked, no parking, no order, no status. A few
// stops at a time keeps each call short. Only the last page settles parking, so
// the lot is never judged against half a loop.
const PAGE = 3;

export default async function verifyTourCoordinates(tour, buildNonce) {
  const page = await base44.entities.TourStop.filter(
    { tour_id: tour.id, stop_type: { $nin: ['parking', 'shuttle'] } },
    { sort: 'stop_number', limit: 100 },
  );
  const pending = page.items.filter(s => s.geocoded !== true && !s.user_verified);
  for (let i = 0; i < pending.length; i += PAGE) {
    const payload = {
      tourId: tour.id,
      verifyAll: true,
      stopIds: pending.slice(i, i + PAGE).map(s => s.id),
      skipParking: i + PAGE < pending.length,
      ...(buildNonce ? { buildNonce } : {}),
    };
    try {
      await base44.functions.invoke('fix-collapsed-coords', payload);
    } catch (error) {
      // A page fails on a rate-limited lookup or a slow model, not on anything
      // about the tour, so the same page is worth one more try before the build
      // carries on with what it has.
      console.error('Coordinate verification page failed; retrying it once:', error);
      await base44.functions.invoke('fix-collapsed-coords', payload);
    }
  }
}
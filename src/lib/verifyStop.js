import { base44 } from '@/api/base44Client';

// Verify a stop's coordinates and check if the tour is now fully verified.
// Called after either GPS marking (paid user) or marker drag (admin).
// Updates the stop with verified coordinates, then checks all sibling stops
// — if every stop is user_verified, the tour's `verified` flag is set to true.
export async function verifyStopLocation(stopId, tourId, latitude, longitude, userId) {
  await base44.entities.TourStop.update(stopId, {
    latitude,
    longitude,
    user_verified: true,
    needs_placement: false,
    verified_by_id: userId,
    verified_date: new Date().toISOString(),
  });

  const siblings = await base44.entities.TourStop.filter({ tour_id: tourId });
  // The just-updated stop may not yet reflect user_verified: true in the
  // filter result (read-after-write lag). Treat it as verified since we
  // just set it — otherwise the tour's verified flag can flip to false
  // when the last stop is verified.
  const allVerified = siblings.length > 0 && siblings.every(s => s.user_verified || s.id === stopId);
  await base44.entities.Tour.update(tourId, { verified: allVerified });

  return { allVerified, totalStops: siblings.length };
}
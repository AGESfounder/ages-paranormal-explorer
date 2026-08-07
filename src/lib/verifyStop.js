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
    verified_by_id: userId,
    verified_date: new Date().toISOString(),
  });

  const siblings = await base44.entities.TourStop.filter({ tour_id: tourId });
  const allVerified = siblings.length > 0 && siblings.every(s => s.user_verified);
  await base44.entities.Tour.update(tourId, { verified: allVerified });

  return { allVerified, totalStops: siblings.length };
}
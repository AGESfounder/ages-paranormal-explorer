import { base44 } from '@/api/base44Client';

// Place a stop's pin: saves where it is and clears the "needs placement" flag,
// but never verifies it. Dragging a pin says where the stop is, not that a
// person stood there — that stays with the validate button.
export async function placeStopLocation(stopId, tourId, latitude, longitude) {
  const before = await base44.entities.TourStop.get(stopId).catch(() => null);
  const wasUnplaced = before?.needs_placement === true;
  await base44.entities.TourStop.update(stopId, {
    latitude,
    longitude,
    geocoded: true,
    needs_placement: false,
  });
  // An unplaced stop's number was provisional, so placing it leaves the visit
  // order to be rebuilt by the route rules on a later opening.
  if (wasUnplaced) {
    await base44.entities.Tour.update(tourId, { order_rebuild_pending: true });
  }
  return { wasUnplaced };
}

// Verify a stop's coordinates and check if the tour is now fully verified.
// Called only from the explicit validate actions: GPS vantage-point marking and
// the validation photo.
// Updates the stop with verified coordinates, then checks all sibling stops
// — if every stop is user_verified, the tour's `verified` flag is set to true.
export async function verifyStopLocation(stopId, tourId, latitude, longitude, userId, photoUrl) {
  // Was this pin still unplaced? An unplaced stop's number was provisional, so
  // placing it leaves the tour's visit order to be rebuilt by the route rules
  // on a later opening — never in the middle of someone's investigation.
  const before = await base44.entities.TourStop.get(stopId).catch(() => null);
  const wasUnplaced = before?.needs_placement === true;
  const update = {
    latitude,
    longitude,
    user_verified: true,
    geocoded: true,
    needs_placement: false,
    verified_by_id: userId,
    verified_date: new Date().toISOString(),
  };
  if (photoUrl) update.verification_photo_url = photoUrl;
  await base44.entities.TourStop.update(stopId, update);

  const siblings = await base44.entities.TourStop.filter({ tour_id: tourId });
  // The just-updated stop may not yet reflect user_verified: true in the
  // filter result (read-after-write lag). Treat it as verified since we
  // just set it — otherwise the tour's verified flag can flip to false
  // when the last stop is verified.
  const allVerified = siblings.length > 0 && siblings.every(s => s.user_verified || s.id === stopId);
  await base44.entities.Tour.update(tourId, wasUnplaced
    ? { verified: allVerified, order_rebuild_pending: true }
    : { verified: allVerified });

  return { allVerified, totalStops: siblings.length };
}
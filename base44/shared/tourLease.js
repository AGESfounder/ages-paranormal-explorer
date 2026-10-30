// One expiring lease per tour, claimed with a compare-and-set update so two
// devices (or a double-tap) can never start the same build at once.
//
// The nonce is deliberately NOT named "token": the platform redacts any field
// whose name contains "token" on read, which would make the ownership check
// impossible.
export async function acquireTourLease(base44, tourId, userId) {
  const entities = base44.asServiceRole.entities;
  const tour = await entities.Tour.get(tourId).catch(e => e.status === 404 ? null : Promise.reject(e));
  if (!tour || tour.verified === true) return null;
  const now = Date.now();
  if (Number(tour.maintenance_expires_at) > now) return null;
  const nonce = crypto.randomUUID();
  const result = await entities.Tour.updateMany({
    id: tourId,
    verified: { $ne: true },
    maintenance_nonce: tour.maintenance_nonce ?? null,
    maintenance_expires_at: tour.maintenance_expires_at ?? null,
  }, { $set: { maintenance_nonce: nonce, maintenance_user_id: userId, maintenance_expires_at: now + 15 * 60 * 1000 } });
  return result?.updated ? nonce : null;
}

export async function ownsTourLease(base44, tourId, userId, nonce) {
  if (!nonce) return false;
  const tour = await base44.asServiceRole.entities.Tour.get(tourId).catch(e => e.status === 404 ? null : Promise.reject(e));
  return !!tour && tour.verified !== true && tour.maintenance_nonce === nonce
    && tour.maintenance_user_id === userId && Number(tour.maintenance_expires_at) > Date.now();
}

export async function releaseTourLease(base44, tourId, userId, nonce) {
  await base44.asServiceRole.entities.Tour.updateMany({
    id: tourId, maintenance_nonce: nonce, maintenance_user_id: userId,
  }, { $set: { maintenance_nonce: '', maintenance_user_id: '', maintenance_expires_at: 0 } });
}
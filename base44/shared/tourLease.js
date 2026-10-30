// One expiring, atomically claimed lease per existing tour, across devices.
export async function acquireTourLease(base44, tourId, userId) {
  const entities = base44.asServiceRole.entities;
  const now = Date.now();
  const token = crypto.randomUUID();
  await entities.Tour.updateMany({
    id: tourId, verified: { $ne: true },
    $or: [{ maintenance_expires_at: { $exists: false } }, { maintenance_expires_at: { $lte: now } }],
  }, { $set: { maintenance_token: token, maintenance_user_id: userId, maintenance_expires_at: now + 15 * 60 * 1000 } });
  const fresh = await entities.Tour.get(tourId);
  return fresh.maintenance_token === token ? token : null;
}

export async function ownsTourLease(base44, tourId, userId, token) {
  if (!token) return false;
  const tour = await base44.asServiceRole.entities.Tour.get(tourId);
  return tour.maintenance_token === token && tour.maintenance_user_id === userId
    && tour.maintenance_expires_at > Date.now() && tour.verified !== true;
}

export async function releaseTourLease(base44, tourId, userId, token) {
  await base44.asServiceRole.entities.Tour.updateMany({
    id: tourId, maintenance_token: token, maintenance_user_id: userId,
  }, { $set: { maintenance_token: '', maintenance_user_id: '', maintenance_expires_at: 0 } });
}
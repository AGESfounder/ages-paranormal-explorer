import { createClientFromRequest } from 'npm:@base44/sdk@0.8.54';
import { acquireTourLease, releaseTourLease } from '../../shared/tourLease.js';

export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me().catch(e => e.status === 401 ? null : Promise.reject(e));
    if (!user) return Response.json({ error: 'Sign in to build tour stops.' }, { status: 401 });
    const { tourId, action, nonce } = await req.json().catch(() => ({}));
    if (typeof tourId !== 'string' || !/^[a-zA-Z0-9_-]{8,80}$/.test(tourId) || !['acquire', 'repair', 'release'].includes(action)) {
      return Response.json({ error: 'A valid tour and action are required.' }, { status: 400 });
    }
    const entities = base44.asServiceRole.entities;
    const tour = await entities.Tour.get(tourId).catch(e => e.status === 404 ? null : Promise.reject(e));
    if (!tour) return Response.json({ error: 'Tour not found.' }, { status: 404 });
    if (action === 'release') {
      if (typeof nonce !== 'string' || nonce.length > 64 || !nonce || tour.maintenance_nonce !== nonce || tour.maintenance_user_id !== user.id) {
        return Response.json({ error: 'This build does not belong to this request.' }, { status: 403 });
      }
      await releaseTourLease(base44, tourId, user.id, nonce);
      return Response.json({ released: true });
    }
    if (tour.verified) return Response.json({ error: 'This tour is validated, so its stops are frozen.' }, { status: 409 });
    // 'repair' runs on a tour that already has stops — same lock, same conflict
    // rules, it just does not require an empty tour.
    const query = { tour_id: tourId, stop_type: { $nin: ['parking', 'shuttle'] } };
    if (action === 'acquire' && await entities.TourStop.count(query)) return Response.json({ error: 'This tour already has stops. Reopen it to load the saved build.' }, { status: 409 });
    const claimed = await acquireTourLease(base44, tourId, user.id);
    if (!claimed) return Response.json({ error: 'A build or coordinate update is already running for this tour. Wait for it to finish, then reopen the tour.' }, { status: 409 });
    if (action === 'acquire' && await entities.TourStop.count(query)) {
      await releaseTourLease(base44, tourId, user.id, claimed);
      return Response.json({ error: 'This tour already has a saved build. Reopen it.' }, { status: 409 });
    }
    return Response.json({ nonce: claimed });
  } catch (error) {
    console.error('Tour build lease failed:', error);
    return Response.json({ error: 'Could not coordinate this tour build. Please try again.' }, { status: 500 });
  }
}
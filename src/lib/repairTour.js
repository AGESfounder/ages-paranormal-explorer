import { base44 } from '@/api/base44Client';
import dedupeTourStops from '@/lib/dedupeTourStops';
import finalizeTourStops from '@/lib/finalizeTourStops';

const repairs = new Set();

// Repair re-runs the checks a build runs — coordinates, duplicate places,
// walking vs driving, order and parking — on a tour that already has stops. It
// only ever starts when a person asks for it, and it holds the tour's build lock
// while it runs, so it cannot overlap a build or a second repair.
export default async function repairTour(tour) {
  if (!tour?.id) throw new Error('No tour to repair.');
  if (tour.verified) throw new Error('This tour is validated, so its stops are frozen.');
  if (repairs.has(tour.id)) throw new Error('A repair is already running for this tour.');
  repairs.add(tour.id);
  let nonce = null;
  try {
    const lease = await base44.functions.invoke('tourBuildLease', { tourId: tour.id, action: 'repair' });
    nonce = lease.data.nonce;
    await base44.entities.Tour.update(tour.id, { build_status: 'building' });
    await base44.functions.invoke('fix-collapsed-coords', { tourId: tour.id, verifyAll: true, buildNonce: nonce });
    const { removed } = await dedupeTourStops(tour.id);
    const result = await finalizeTourStops(tour);
    return { ...result, removed };
  } catch (error) {
    await base44.entities.Tour.update(tour.id, { build_status: 'needs_review' }).catch(() => {});
    throw error;
  } finally {
    repairs.delete(tour.id);
    if (nonce) {
      await base44.functions.invoke('tourBuildLease', { tourId: tour.id, action: 'release', nonce })
        .catch(e => console.error('Repair lease release failed; it will expire:', e));
    }
  }
}
import { base44 } from '@/api/base44Client';
import finalizeTourStops from '@/lib/finalizeTourStops';

// A new build resolves every stop's coordinates first, then hands off to the
// shared finalize step (classification, parking, order, build status).
export default async function finalizeTourBuild(tour, buildNonce) {
  await base44.functions.invoke('fix-collapsed-coords', { tourId: tour.id, verifyAll: true, ...(buildNonce ? { buildNonce } : {}) });
  return finalizeTourStops(tour);
}
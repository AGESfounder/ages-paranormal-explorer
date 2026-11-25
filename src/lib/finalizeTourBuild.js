import finalizeTourStops from '@/lib/finalizeTourStops';
import verifyTourCoordinates from '@/lib/verifyTourCoordinates';

// A new build resolves every stop's coordinates first, then hands off to the
// shared finalize step (classification, parking, order, build status).
//
// Finalizing is NOT conditional on verification succeeding. When verification
// was cut off, the build used to stop right there and the tour kept its saved
// stops with no lot, no order and no status — which is what a "failed" tour
// looked like. Now the tour always ends up finished as far as it can be: a lot,
// an order, and a needs_review flag when stops are still unconfirmed.
export default async function finalizeTourBuild(tour, buildNonce) {
  let verifyError = null;
  try {
    await verifyTourCoordinates(tour, buildNonce);
  } catch (error) {
    verifyError = error;
    console.error('Coordinate verification did not finish; finalizing what was placed:', error);
  }
  const built = await finalizeTourStops(tour);
  if (!verifyError) return built;
  return {
    ...built,
    verifyError: verifyError?.response?.data?.error || verifyError?.message || 'Coordinate verification did not finish.',
  };
}
import { base44 } from '@/api/base44Client';
import { getOfflineTour, saveTourOffline } from '@/lib/offlineTours';

const activeChecks = new Map();

export function needsAddressCorrection(tour, stops) {
  return tour?.id && !tour.verified && tour.build_status !== 'building' && stops.some(stop =>
    !['parking', 'shuttle'].includes(stop.stop_type) && !stop.same_structure && !stop.user_verified
    && !stop.verified_by_id && !stop.verified_date && /^\s*\d+[a-z]?(?:-\d+[a-z]?)?\s+/i.test(stop.address || '')
    && (stop.needs_placement || stop.geocoded !== true || stop.latitude == null || stop.longitude == null));
}

export function applyAddressCorrections(stops, updates) {
  const byId = new Map(updates.map(update => [update.id, update]));
  return stops.map(stop => {
    const update = byId.get(stop.id);
    if (!update || stop.user_verified || stop.verified_by_id || stop.verified_date || stop.same_structure
      || stop.address !== update.previous.address || stop.latitude !== update.previous.latitude
      || stop.longitude !== update.previous.longitude) return stop;
    return { ...stop, latitude: update.latitude, longitude: update.longitude, geocoded: true, needs_placement: false };
  });
}

async function checkAddresses(tourId) {
  const updates = [];
  let offset = 0;
  try {
    // Pages refer to the stable stop-id order, not the shrinking list of
    // unresolved stops. Failed addresses are attempted once per opening.
    do {
      const { data } = await base44.functions.invoke('fix-collapsed-coords', { tourId, mode: 'confirmed_addresses', offset });
      if (data?.error) return { updates, error: data.error };
      updates.push(...(data?.updates || []));
      offset = data?.nextOffset ?? null;
    } while (offset !== null);
    const cached = getOfflineTour(tourId);
    if (updates.length && cached) {
      saveTourOffline(cached.tour, applyAddressCorrections(cached.stops || [], updates), cached.saved_by_user_id);
    }
    return { updates };
  } catch (error) {
    console.error('Automatic tour address check failed:', error);
    return { updates, error: error?.response?.status === 409
      ? 'Another address check or tour build is in progress. Reopen the tour to refresh.'
      : 'Address checking is unavailable. Saved stops are still available; reopen the tour to try again.' };
  }
}

export default function correctTourAddresses(tourId) {
  if (!activeChecks.has(tourId)) {
    activeChecks.set(tourId, checkAddresses(tourId).finally(() => activeChecks.delete(tourId)));
  }
  return activeChecks.get(tourId);
}
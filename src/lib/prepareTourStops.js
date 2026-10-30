import { sanitizeStopRecord } from '@/lib/stopRecordSanitize';
import { classifyStopAccess } from '@/lib/stopAccess';
import { looksLikeRoomOrArea } from '@/lib/roomDetection';
import { isLargeProperty } from '@/lib/largeProperty';
import { stripStopConclusion } from '@/lib/stopContent';

export const stopIdentity = value => String(value || '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');

// Structural checks precede every initial stop write. They are not a claim of
// real-world verification: AI coordinates always start as estimates.
export default function prepareTourStops(rawStops, tour, { min = 1, max = 10 } = {}) {
  const singleSite = ['landmark', 'ship', 'cold_spot'].includes(tour.tour_category);
  const names = new Set();
  const addresses = new Set();
  const stops = [];
  for (const raw of rawStops) {
    const stop = sanitizeStopRecord(raw);
    const name = stopIdentity(stop.name);
    const address = stopIdentity(stop.address);
    if (!name) throw new Error('A generated stop is missing its name. Nothing new was saved.');
    if (names.has(name) || (!singleSite && address && addresses.has(address))) continue;
    names.add(name);
    if (address) addresses.add(address);
    if (!stop.address || !stop.hours_of_operation || !stop.entry_fee) {
      throw new Error(`"${stop.name}" is missing an address, hours, or entry fee. Nothing new was saved.`);
    }
    if (!Number.isFinite(stop.latitude) || Math.abs(stop.latitude) > 90
      || !Number.isFinite(stop.longitude) || Math.abs(stop.longitude) > 180
      || (stop.latitude === 0 && stop.longitude === 0)) {
      throw new Error(`"${stop.name}" has no usable coordinates. Nothing new was saved.`);
    }
    const sameAddress = address && address === stopIdentity(rawStops[0]?.address);
    if (singleSite && !isLargeProperty(tour) && (stop.same_structure || looksLikeRoomOrArea(stop.name) || sameAddress)
      && Number.isFinite(tour.start_latitude) && Number.isFinite(tour.start_longitude)) {
      stop.latitude = tour.start_latitude;
      stop.longitude = tour.start_longitude;
      stop.same_structure = true;
    }
    Object.assign(stop, stripStopConclusion(stop, false));
    stops.push({ ...stop, stop_type: 'tour', stop_number: stops.length + 1,
      access_area: stop.access_area || classifyStopAccess(stop.name), geocoded: stop.user_verified === true });
  }
  if (stops.length < min || stops.length > max) throw new Error(`The build needs ${min}-${max} unique stops; it produced ${stops.length}. Nothing new was saved.`);
  return stops;
}
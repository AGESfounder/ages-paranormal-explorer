import { base44 } from '@/api/base44Client';
import { enforceWalkingDistance } from '@/lib/routeOptimizer';
import { reverseGeocodeStreetAddress } from '@/lib/reverseGeocode';
import { verifyStopLocation } from '@/lib/verifyStop';

// Changing WHERE a tour starts changes how it should be walked, so a parking
// move is the one pin move that re-orders a tour: the stops are re-laid from the
// new lot using the normal ordering rules (nearest stop to the lot first, the
// walking cluster as a loop that begins at the lot, driving stops after it).
// Moving any other pin keeps its stop in place and leaves the order untouched.
//
// The lot's own details are what the tour displays (name, type, cost), so they
// are confirmed with the new location and written here as one change, together
// with the tour's copy of the parking fields and the spot's street address.
//
// A fully validated tour is the exception: its parking spot is fixed, so the
// order the tour already has is kept exactly as it is.

export const PARKING_TYPES = [
  { value: 'street', label: 'Street Parking' },
  { value: 'parking_lot', label: 'Parking Lot' },
  { value: 'parking_garage', label: 'Parking Garage' },
];

export const PARKING_COST_KINDS = [
  { value: 'free', label: 'Free' },
  { value: 'metered', label: 'Metered' },
  { value: 'paid_lot', label: 'Paid Lot' },
  { value: 'other', label: 'Other' },
];

// The cost dropdown picks the kind of charge and the detail field carries the
// amount; together they store the readable string the app already uses
// ("Free", "Metered ($1.50/hr, free after 6pm)", "Paid lot ($5 flat rate)").
export function composeParkingCost(kind, details) {
  const detail = String(details || '').trim();
  if (kind === 'free') return 'Free';
  if (kind === 'metered') return detail ? `Metered (${detail})` : 'Metered';
  if (kind === 'paid_lot') return detail ? `Paid lot (${detail})` : 'Paid lot';
  return detail;
}

// Prefill the dropdowns from a cost string a tour already carries. Anything the
// dropdowns can't express is kept whole in the editable details field, so
// confirming the dialog never quietly trims a lot's cost note.
export function parseParkingCost(cost) {
  const text = String(cost || '').trim();
  if (!text) return { kind: 'free', details: '' };
  if (/^free$/i.test(text)) return { kind: 'free', details: '' };
  const bracketed = text.match(/\(([^)]+)\)/);
  const metered = text.match(/^metered\s*(.*)$/i);
  if (metered) return { kind: 'metered', details: bracketed ? bracketed[1] : metered[1].trim() };
  const paid = text.match(/^(?:paid lot|paid garage|paid parking|paid)\s*(.*)$/i);
  if (paid) return { kind: 'paid_lot', details: bracketed ? bracketed[1] : paid[1].trim() };
  return { kind: 'other', details: text };
}

// Apply a parking location change: the new coordinates, the lot's confirmed
// details, the refreshed street address, and — for a tour that is not yet fully
// validated — the stops re-laid from the new lot. `details` is
// { name, parking_type, costKind, costDetails }.
export async function changeParkingLocation({ tour, stops, parkingStopId, latitude, longitude, details, userId, walkingLimit }) {
  const name = String(details.name || '').trim();
  const parkingCost = composeParkingCost(details.costKind, details.costDetails);
  // A fully validated tour keeps the order it has — its parking spot is locked
  // to the spot the tour was validated around.
  const orderIsFinal = tour.verified === true;

  // Coordinates and verification first — this also re-checks whether the whole
  // tour is now validated — then the lot's own details. The street address is
  // looked up alongside, so the stored address matches the new coordinates.
  const [, streetAddress] = await Promise.all([
    verifyStopLocation(parkingStopId, tour.id, latitude, longitude, userId),
    reverseGeocodeStreetAddress(latitude, longitude),
  ]);
  await base44.entities.TourStop.update(parkingStopId, {
    name,
    parking_type: details.parking_type,
    parking_cost: parkingCost,
    ...(streetAddress ? { address: streetAddress } : {}),
  });

  // Parking and the shuttle drop-off are never part of the order itself.
  const tourStopsOnly = stops.filter(s => s.stop_type !== 'parking' && s.stop_type !== 'shuttle');
  let ordered = tourStopsOnly;
  let orderedType = null;
  if (!orderIsFinal) {
    ordered = await enforceWalkingDistance(
      tourStopsOnly,
      tour.tour_type,
      { lat: tour.start_latitude, lon: tour.start_longitude },
      { walkingLimit, parkingCoords: { lat: latitude, lon: longitude } },
    );
    for (const s of ordered) {
      const existing = tourStopsOnly.find(ts => ts.id === s.id);
      if (existing && (existing.stop_number !== s.stop_number || existing.travel_method !== s.travel_method)) {
        await base44.entities.TourStop.update(s.id, { stop_number: s.stop_number, travel_method: s.travel_method });
      }
    }
    const methods = new Set(ordered.map(s => s.travel_method));
    orderedType = methods.has('driving') && methods.has('walking') ? 'mixed'
      : methods.has('driving') ? 'driving' : 'walking';
  }

  const tourUpdates = {
    parking_name: name,
    parking_type: details.parking_type,
    parking_cost: parkingCost,
    parking_latitude: latitude,
    parking_longitude: longitude,
    parking_verified: true,
  };
  if (streetAddress) tourUpdates.parking_address = streetAddress;
  if (!orderIsFinal) {
    // A new lot re-anchors the route: neither the order freeze held during
    // validation nor a hand-made order can survive it.
    tourUpdates.user_reordered = false;
    tourUpdates.manual_reorder = false;
    if (orderedType && orderedType !== tour.tour_type) tourUpdates.tour_type = orderedType;
    const newFirstName = ordered[0]?.name;
    if (newFirstName && newFirstName !== tour.start_location_name) tourUpdates.start_location_name = newFirstName;
  }
  await base44.entities.Tour.update(tour.id, tourUpdates);

  return {
    parking: {
      latitude,
      longitude,
      name,
      parking_type: details.parking_type,
      parking_cost: parkingCost,
      user_verified: true,
      geocoded: true,
      needs_placement: false,
      ...(streetAddress ? { address: streetAddress } : {}),
    },
    reordered: ordered,
    orderIsFinal,
    tourUpdates,
  };
}
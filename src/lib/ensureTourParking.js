import { base44 } from '@/api/base44Client';
import { callJson } from '@/lib/llmJson';
import { geocodeStopsWithNames } from '@/lib/geocodeStops';
import { haversineDistance, getWalkingLimit } from '@/lib/routeOptimizer';

export default async function ensureTourParking(tour, stops) {
  const existing = stops.find(s => s.stop_type === 'parking');
  if (existing || tour.verified) return existing || null;
  const walking = stops.filter(s => s.travel_method === 'walking' && !s.needs_placement
    && Number.isFinite(s.latitude) && Number.isFinite(s.longitude));
  if (!walking.length) return null;
  const lat = walking.reduce((sum, s) => sum + s.latitude, 0) / walking.length;
  const lon = walking.reduce((sum, s) => sum + s.longitude, 0) / walking.length;
  const limit = getWalkingLimit(tour);
  const result = await callJson(`Find ONE real parking area for "${tour.title}" in ${tour.city}, ${tour.state}, publicly accessible after 7 PM and within ${limit} miles of a stop on this walking loop: ${walking.map(s => `${s.name}: ${s.address}`).join('; ')}. Return only JSON with parking_name, parking_address (complete physical address), parking_type (street, parking_lot, parking_garage), parking_cost. Do not invent a lot or claim free parking without evidence. If none can be established return {}.`, { useWeb: true });
  let coords = null;
  if (result?.parking_address) {
    const found = await geocodeStopsWithNames([{ id: 'parking', name: result.parking_name,
      address: result.parking_address, city: tour.city, state: tour.state }], { lat, lon, maxDistMiles: 5 });
    const candidate = found.parking;
    if (candidate && walking.some(s => haversineDistance(candidate.lat, candidate.lon, s.latitude, s.longitude) <= limit)) coords = candidate;
  }
  const fresh = await base44.entities.TourStop.filter({ tour_id: tour.id, stop_type: 'parking' });
  if (fresh.length) return fresh[0];
  return base44.entities.TourStop.create({ tour_id: tour.id, stop_type: 'parking', stop_number: 0,
    name: coords ? (result.parking_name || 'Parking Area') : 'Parking Area',
    address: coords ? result.parking_address : '', latitude: coords?.lat ?? lat, longitude: coords?.lon ?? lon,
    parking_type: ['street', 'parking_lot', 'parking_garage'].includes(result?.parking_type) ? result.parking_type : 'street',
    parking_cost: coords ? String(result.parking_cost || 'Cost not confirmed') : 'Cost not confirmed',
    travel_method: 'walking', geocoded: !!coords, needs_placement: !coords });
}
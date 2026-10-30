import { base44 } from '@/api/base44Client';

const key = value => String(value || '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
  .toLowerCase().replace(/[^a-z0-9]/g, '');

// One name is one place. A build saves each stop once; a tour that went through
// more than one build can still carry the same place twice under the same name.
// Keep the best copy and delete the rest. A stop a person verified is never
// deleted — if both copies are verified, both stay.
export default async function dedupeTourStops(tourId) {
  const page = await base44.entities.TourStop.filter({ tour_id: tourId }, { sort: 'stop_number', limit: 100 });
  const kept = new Map();
  const removals = [];
  const rank = s => (s.user_verified ? 2 : 0) + (s.geocoded && !s.needs_placement ? 1 : 0);
  for (const stop of page.items) {
    if (stop.stop_type === 'parking' || stop.stop_type === 'shuttle') continue;
    const name = key(stop.name);
    if (!name) continue;
    const existing = kept.get(name);
    if (!existing) { kept.set(name, stop); continue; }
    if (rank(stop) > rank(existing)) {
      removals.push(existing);
      kept.set(name, stop);
    } else removals.push(stop);
  }
  const deletable = removals.filter(s => !s.user_verified);
  for (const stop of deletable) await base44.entities.TourStop.delete(stop.id);
  return { removed: deletable.map(s => s.name) };
}
import { base44 } from '@/api/base44Client';

const signature = s => JSON.stringify([s.stop_number, s.name, s.address]);

// A failed response does not mean a failed write. Never replay the batch as
// individual creates: a timeout may have already saved every stop.
export default async function saveTourStopBatch(tourId, records) {
  const query = { tour_id: tourId, stop_type: { $nin: ['parking', 'shuttle'] } };
  if (await base44.entities.TourStop.count(query)) throw new Error('This tour already has saved stops. Reopen it instead of rebuilding.');
  try {
    return await base44.entities.TourStop.bulkCreate(records.map(s => ({ ...s, tour_id: tourId })));
  } catch (error) {
    const saved = await base44.entities.TourStop.filter(query, { sort: 'stop_number', limit: 100 });
    const expected = new Set(records.map(signature));
    if (!saved.has_more && saved.items.length === records.length && saved.items.every(s => expected.has(signature(s)))) return saved.items;
    throw new Error('The stop save could not be confirmed. It was not repeated, to prevent duplicates. Any saved stops are preserved for review.');
  }
}
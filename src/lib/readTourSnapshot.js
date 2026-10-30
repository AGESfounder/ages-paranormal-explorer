import { base44 } from '@/api/base44Client';
import { classifyStopAccess } from '@/lib/stopAccess';

// Opening a tour is a read, never a migration, AI job, or route write.
export default async function readTourSnapshot(tourId) {
  const [tours, stopPage, favorites, completions] = await Promise.all([
    base44.entities.Tour.filter({ id: tourId }),
    base44.entities.TourStop.filter({ tour_id: tourId }, { sort: 'stop_number', limit: 100 }),
    base44.entities.Favorite.filter({ tour_id: tourId }),
    base44.entities.Investigation.filter({ tour_id: tourId, is_completed: true }),
  ]);
  if (stopPage.has_more) throw new Error('This tour has too many stop records to display safely. It needs an administrator review.');
  const order = s => s.stop_type === 'parking' ? -2 : s.stop_type === 'shuttle' ? -1 : (s.stop_number || 0);
  const stops = stopPage.items.map(s => ({
    ...s,
    access_area: s.access_area || classifyStopAccess(s.name),
  })).sort((a, b) => order(a) - order(b));
  return { tour: tours[0] || null, stops, favorite: favorites.length > 0, completed: completions.length > 0 };
}
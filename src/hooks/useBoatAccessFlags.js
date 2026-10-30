import { useEffect, useRef } from 'react';
import { syncBoatAccessFlags } from '@/lib/boatAccess';

// Answers the boat-access question for a tour that was built before it was
// asked. Runs once per tour opening, never on a tour a person has validated,
// and stores its answer so it is never asked again.
export default function useBoatAccessFlags(tour, stops, setStops) {
  const asked = useRef('');
  const current = useRef(stops);
  current.current = stops;
  const tourId = tour?.id;
  const verified = tour?.verified;
  const stopKey = stops.map(s => s.id).join(',');

  useEffect(() => {
    if (!tourId || verified || !stopKey || asked.current === tourId) return;
    asked.current = tourId;
    syncBoatAccessFlags(current.current)
      .then(updated => { if (updated) setStops(updated); })
      .catch(() => {});
  }, [tourId, verified, stopKey]);
}
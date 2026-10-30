import { base44 } from '@/api/base44Client';

// Some stops cannot be reached on foot at all — a lighthouse standing out in
// the bay, a wreck offshore. The route rules can only ever call those a drive,
// which tells a visitor to do something impossible. So the stop says what it
// really needs: a boat.
//
// The water-barrier test the route order uses cannot answer this: downtown Fall
// River trips nine "crossings" over its canals, so every stop looks cut off,
// while the lighthouse standing in Mount Hope Bay trips none. The stop's own
// generated text is the reliable source, and it is free and instant — the
// description of a boat-only stop reads like one ("Observe from the shoreline",
// "accessible only by boat"). Anything else is left alone: a legend that
// mentions a phantom ship "offshore", or a park beside a ferry landing, is not
// a boat stop — a wrong boat badge on a walkable stop is worse than none.
const WATER_ONLY = [
  /\bonly (?:by|via|from) (?:a )?(?:boat|ferry|water taxi)\b/i,
  /\b(?:accessible|reachable) (?:only )?by (?:boat|ferry|water taxi)\b/i,
  /\bno (?:land|road|foot|pedestrian) access\b/i,
  /\bcannot be reached (?:on foot|by (?:car|foot|land))\b/i,
  /\b(?:observe|view(?:ed)?|seen) (?:it )?from the (?:shore|shoreline|water)\b/i,
  /\bfrom the shoreline\b/i,
  /\bboat (?:access|required|only|tour)\b/i,
  /\bwater taxi\b/i,
];

// Everything the stop says about itself. The address is excluded on purpose:
// it is always a land address, even for a vessel that never leaves its berth.
const wordsFor = (stop) => [
  stop.historical_info,
  stop.paranormal_info,
  (stop.investigation_suggestions || []).join(' '),
  stop.narration_text,
].filter(Boolean).join(' ');

export const needsBoat = (stop) => {
  const words = wordsFor(stop);
  return !!words && WATER_ONLY.some(pattern => pattern.test(words));
};

// The stops on this tour a visitor can only reach by boat.
export function boatAccessStopIds(stops) {
  return new Set((stops || [])
    .filter(s => s.stop_type !== 'parking' && s.stop_type !== 'shuttle' && needsBoat(s))
    .map(s => s.id));
}

// Store the answer on the stops so the map can mark them. Returns the updated
// list, or null when there was nothing to change. `force` re-reads the text of
// a tour whose stop content has just been regenerated.
export async function syncBoatAccessFlags(stops, { force = false } = {}) {
  const tourStops = (stops || []).filter(s => s.stop_type !== 'parking' && s.stop_type !== 'shuttle');
  if (!tourStops.length) return null;
  if (!force && tourStops.every(s => typeof s.boat_access === 'boolean')) return null;
  const boat = boatAccessStopIds(tourStops);
  const updates = tourStops
    .filter(s => !!s.boat_access !== boat.has(s.id))
    .map(s => ({ id: s.id, boat_access: boat.has(s.id) }));
  if (!updates.length) return null;
  try {
    await base44.entities.TourStop.bulkUpdate(updates);
  } catch (e) {
    console.error('Saving boat access flags failed:', e);
    return null;
  }
  const byId = new Map(updates.map(u => [u.id, u.boat_access]));
  return (stops || []).map(s => (byId.has(s.id) ? { ...s, boat_access: byId.get(s.id) } : s));
}
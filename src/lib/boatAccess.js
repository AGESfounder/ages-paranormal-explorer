import { base44 } from '@/api/base44Client';

// Some stops cannot be reached on foot at all — a light station on its own
// island, a wreck offshore. The route rules can only ever call those a drive,
// which tells a visitor to do something impossible. So the stop says what it
// really needs: a boat.
//
// Detection reuses the same water test the route ordering uses: two stops
// separated by water with no walkable bridge between them. Stops that can all
// still reach each other over land form the mainland; a small group (one or
// two stops) the water cuts off from that mainland is reached by boat. A whole
// district on the far bank is not flagged — that is a long walk or a drive,
// not a crossing.
const coordKey = (s) => `${s.latitude.toFixed(5)},${s.longitude.toFixed(5)}`;

// The largest stranded group still counted as a boat trip rather than a
// separate walkable area.
const MAX_BOAT_GROUP = 2;

const locatedTourStops = (stops) => (stops || []).filter(s =>
  s.stop_type !== 'parking'
  && s.stop_type !== 'shuttle'
  && !s.needs_placement
  && Number.isFinite(s.latitude)
  && Number.isFinite(s.longitude));

// Which stops need a boat, given the water barriers between them.
export function boatAccessStopIds(stops, barriers) {
  const located = locatedTourStops(stops);
  if (located.length < 3 || !barriers?.length) return new Set();
  const cut = new Set();
  for (const b of barriers) {
    cut.add(`${b.a}->${b.b}`);
    cut.add(`${b.b}->${b.a}`);
  }
  // Stops that reach each other without crossing water share a land group.
  const parent = located.map((_, i) => i);
  const find = (i) => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  for (let i = 0; i < located.length; i++) {
    for (let j = i + 1; j < located.length; j++) {
      if (!cut.has(`${coordKey(located[i])}->${coordKey(located[j])}`)) parent[find(i)] = find(j);
    }
  }
  const groups = new Map();
  located.forEach((stop, i) => {
    const root = find(i);
    if (!groups.has(root)) groups.set(root, []);
    groups.get(root).push(stop);
  });
  const mainland = [...groups.values()].sort((a, b) => b.length - a.length)[0];
  const island = new Set();
  for (const group of groups.values()) {
    if (group === mainland || group.length > MAX_BOAT_GROUP) continue;
    const acrossWater = group.some(s => mainland.some(m => cut.has(`${coordKey(s)}->${coordKey(m)}`)));
    if (acrossWater) group.forEach(s => island.add(s.id));
  }
  return island;
}

// Ask the water test once and store the answer on the stops. Returns the
// updated stop list, or null when nothing was learned (fewer than three
// located stops, the water test could not run, or every stop already has an
// answer). `force` re-tests a tour whose coordinates have just changed.
export async function syncBoatAccessFlags(stops, { force = false } = {}) {
  const located = locatedTourStops(stops);
  if (located.length < 3) return null;
  if (!force && located.every(s => typeof s.boat_access === 'boolean')) return null;
  let result;
  try {
    result = await base44.functions.invoke('detect-water-barriers', {
      stops: located.map(s => ({ lat: s.latitude, lon: s.longitude })),
    });
  } catch (e) {
    console.error('Boat access check failed:', e);
    return null;
  }
  // The water test reports whether Overpass actually answered. A failed test
  // must never be stored as "no water", or a boat stop would stay unflagged.
  if (result?.data?.ok !== true) return null;
  const island = boatAccessStopIds(located, result.data.barriers);
  const updates = located
    .filter(s => !!s.boat_access !== island.has(s.id))
    .map(s => ({ id: s.id, boat_access: island.has(s.id) }));
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
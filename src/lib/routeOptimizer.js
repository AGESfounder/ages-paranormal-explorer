import { base44 } from '@/api/base44Client';
import { isLargeProperty } from '@/lib/largeProperty';

// Shared route optimization logic — used by both tour creation (generateTour.js)
// and tour viewing (TourDetail.jsx). Extracted here so creation can enforce
// correct stop ordering (driving stops at the end, walking stops as a loop)
// BEFORE stops are stored, not just on view.

import { haversineDistance, WALK_LINK_GRACE, isLocatedStop, walkingComponents, planWalkingRoute } from '@/lib/walkingRoute';
export { haversineDistance, WALK_LINK_GRACE } from '@/lib/walkingRoute';

// Rounding helper for coordinate-based map keys (5 decimals ≈ 1 meter).
const coordKey = (s) => `${s.latitude.toFixed(5)},${s.longitude.toFixed(5)}`;

// Fetch routed distances from OSRM (Open Source Routing Machine). Unlike
// haversine (straight-line), OSRM routes along the road network — over
// bridges, around water — so two stops separated by a creek get a longer
// distance that reflects the actual walk via the nearest bridge crossing.
// Returns a Map keyed by `"latA,lonA->latB,lonB"` → miles, or null on
// failure (caller falls back to haversine).
async function fetchRouteDistanceMatrix(stops) {
  const valid = stops.filter(s => s.latitude != null && s.longitude != null);
  if (valid.length < 2) return null;
  try {
    const coords = valid.map(s => `${s.longitude},${s.latitude}`).join(';');
    const url = `https://router.project-osrm.org/table/v1/driving/${coords}?annotations=distance`;
    // Timeout after 5 seconds — OSRM is often slow or unreachable. Without
    // this, airplane mode / no-network hangs for 30+ seconds on the fetch.
    const res = await Promise.race([
      fetch(url),
      new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 5000)),
    ]);
    if (!res.ok) return null;
    const data = await res.json();
    if (data.code !== 'Ok' || !data.distances) return null;
    const lookup = new Map();
    for (let i = 0; i < valid.length; i++) {
      for (let j = 0; j < valid.length; j++) {
        lookup.set(`${coordKey(valid[i])}->${coordKey(valid[j])}`, data.distances[i][j] / 1609.344);
      }
    }
    return lookup;
  } catch (e) {
    console.error('OSRM distance matrix failed:', e);
    return null;
  }
}

// Fetch water barriers from the backend. Returns a Set of coordinate-key
// pairs that cross a waterway without a nearby walkable bridge. The ordering
// applies a large penalty to these pairs so it groups same-side stops together
// and only crosses water when a walkable bridge exists.
async function fetchWaterBarriers(stops) {
  const valid = stops.filter(s => s.latitude != null && s.longitude != null);
  if (valid.length < 2) return new Set();
  try {
    // Timeout after 8 seconds — Overpass is often slow or down. If it
    // times out, fall back to OSRM/haversine without water barriers.
    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('timeout')), 8000)
    );
    const fetchPromise = base44.functions.invoke('detect-water-barriers', {
      stops: valid.map(s => ({ lat: s.latitude, lon: s.longitude })),
    });
    const res = await Promise.race([fetchPromise, timeoutPromise]);
    const barriers = res?.data?.barriers || [];
    const set = new Set();
    for (const b of barriers) {
      set.add(`${b.a}->${b.b}`);
      set.add(`${b.b}->${b.a}`); // bidirectional
    }
    return set;
  } catch (e) {
    console.error('Water barrier detection failed:', e);
    return new Set();
  }
}

// 2-opt optimization: reverses route segments that reduce total distance.
// Fixes backtracking patterns that nearest-neighbor alone produces.
// When includeReturn is true, the return-to-start edge is included in the
// cost so walking tours form a loop that brings the user back near start.
function optimizeRoute2Opt(route, includeReturn, distFn) {
  if (route.length <= 3) return route;
  const dist = distFn || ((a, b) => haversineDistance(a.latitude, a.longitude, b.latitude, b.longitude));
  let improved = true;
  let iterations = 0;
  while (improved && iterations < 50) {
    improved = false;
    iterations++;
    for (let i = 1; i < route.length - 1; i++) {
      for (let j = i + 1; j < route.length; j++) {
        const a = route[i - 1];
        const b = route[i];
        const c = route[j];
        const d = (j + 1 < route.length) ? route[j + 1] : (includeReturn ? route[0] : null);
        const oldD = dist(a, b) + (d ? dist(c, d) : 0);
        const newD = dist(a, c) + (d ? dist(b, d) : 0);
        if (newD < oldD - 0.0001) {
          const reversed = route.slice(i, j + 1).reverse();
          route.splice(i, j - i + 1, ...reversed);
          improved = true;
        }
      }
    }
  }
  return route;
}

export function orderStopsByProximity(stops, includeReturn = false, distFn) {
  if (stops.length <= 1) return stops;
  const dist = distFn || ((a, b) => haversineDistance(a.latitude, a.longitude, b.latitude, b.longitude));
  const ordered = [stops[0]];
  const remaining = stops.slice(1);
  while (remaining.length > 0) {
    const last = ordered[ordered.length - 1];
    let nearestIdx = 0;
    let nearestDist = Infinity;
    for (let i = 0; i < remaining.length; i++) {
      const d = dist(last, remaining[i]);
      if (d < nearestDist) { nearestDist = d; nearestIdx = i; }
    }
    ordered.push(remaining.splice(nearestIdx, 1)[0]);
  }
  return optimizeRoute2Opt(ordered, includeReturn, dist);
}

// Half a mile is a ten-minute walk, so stops on the same downtown street stay
// in one walking loop from the parking area instead of being split into a
// second, separate walking pocket.
const WALKING_LIMIT = 0.5;

// The same walking-link tolerance is used for membership, route expansion and
// map geometry. Parking affects where the walk starts, not which stops survive.

// Walking threshold for stop clustering. Single-site tours (landmark/ship/
// cold_spot) are large properties where you walk between structures that can
// be 0.5+ miles apart — use 1.0-mile threshold so they form a walking cluster
// ordered as a loop. Area tours use 0.33 miles (downtown walking tours).
export const getWalkingLimit = (tour) => {
  const cat = tour?.tour_category;
  if (cat === 'landmark' || cat === 'ship' || cat === 'cold_spot') {
    return isLargeProperty(tour) ? 1.0 : 0.33;
  }
  return WALKING_LIMIT;
};



// An AREA tour is walkable by definition — its generation prompt requires a
// tight walkable cluster (total route ≤2.5 miles), so a city/town tour is never
// a pure driving tour. When the model labels one "driving" anyway, every stop
// gets stamped driving, cluster detection never runs and no parking is ever
// created: a downtown tour whose stops are 300 ft apart shows as all-driving
// with no lot (the Richmond bug). Seed area tours as "mixed" instead — the
// enforcement below then finds the real cluster and re-derives the final type
// from the stops (walking + driving = mixed), while a genuinely spread-out area
// tour still comes back out as "driving".
export const normalizeAreaTourType = (tourCategory, tourType) =>
  tourCategory === 'area' && tourType === 'driving' ? 'mixed' : tourType;

// Classify walking eligibility before ordering. All located stops in the main
// connected group stay walkable, independently of parking and visit order.
// Walking routes may retrace legal links; driving routes use road distances.
// `startCoords` is only an ordering reference, never a walking cut-off.
export async function enforceWalkingDistance(stops, tourType, startCoords, options = {}) {
  const walkingLimit = options.walkingLimit || WALKING_LIMIT;
  tourType = normalizeAreaTourType(options.tourCategory, tourType);
  const parkingCoords = options.parkingCoords;
  const preserveOrder = options.preserveOrder || false;
  if (!stops.length) return stops;

  // Manual and automatic order use identical walking membership. The order
  // cannot remove a nearby stop from its connected walking group.
  const withCoords = stops.filter(isLocatedStop);
  const unlocated = stops.filter(s => !isLocatedStop(s));
  const refCoords = parkingCoords?.lat != null && parkingCoords?.lon != null ? parkingCoords : startCoords;
  const pocketDistance = (group) => refCoords?.lat != null && refCoords?.lon != null
    ? Math.min(...group.map(s => haversineDistance(refCoords.lat, refCoords.lon, s.latitude, s.longitude)))
    : Infinity;
  const components = walkingComponents(withCoords, walkingLimit * WALK_LINK_GRACE);
  components.sort((a, b) => b.length - a.length || pocketDistance(a) - pocketDistance(b));
  const walkingCluster = components[0]?.length > 1 || withCoords.length === 1 ? components[0] : [];
  const walkingSet = new Set(walkingCluster);
  const pendingMethod = s => s.travel_method || (tourType === 'driving' ? 'driving' : 'walking');
  if (preserveOrder) {
    return stops.map(s => ({
      ...s,
      travel_method: !isLocatedStop(s) ? pendingMethod(s)
        : tourType !== 'driving' && walkingSet.has(s) ? 'walking' : 'driving',
    }));
  }

  // Fetch water barriers — pairs of stops separated by a waterway with no
  // nearby walkable bridge. These get a large distance penalty so the
  // ordering groups same-side stops together and only crosses water at a
  // bridge.
  const waterBarriers = await fetchWaterBarriers(stops);
  // For WALKING & MIXED tours: use haversine (straight-line) distances, NOT
  // OSRM driving distances. Downtown areas have one-way streets that make
  // driving distances wildly different from walking distances — two stops
  // 0.1 mi apart by foot can be 0.5 mi apart by car, causing the nearest-
  // neighbor to pick wrong stops and produce crisscrossing routes. The
  // water barrier penalties above handle creek/bridge crossings.
  // For DRIVING tours: use OSRM driving distances for accurate road routing.
  const routedLookup = tourType === 'driving' ? await fetchRouteDistanceMatrix(stops) : null;
  // Moderate penalty — enough to make the ordering prefer same-side stops
  // (grouping them together, crossing water only once at a bridge), but
  // small enough that cross-water stops can still be grouped as walking
  // (within the 0.33-mile walking limit).
  const WATER_PENALTY = 0.15; // miles
  const baseDist = routedLookup
    ? (a, b) => routedLookup.get(`${coordKey(a)}->${coordKey(b)}`) ?? haversineDistance(a.latitude, a.longitude, b.latitude, b.longitude)
    : (a, b) => haversineDistance(a.latitude, a.longitude, b.latitude, b.longitude);
  const dist = (a, b) => {
    const base = baseDist(a, b);
    // Water penalty only RAISES the distance for close stops (so the
    // ordering prefers same-side stops). It must never LOWER the distance
    // for far-apart stops — that would wrongly group driving stops as
    // walking. Math.max ensures a 5-mile road distance stays 5 miles
    // even if the straight line crosses a creek.
    if (waterBarriers.has(`${coordKey(a)}->${coordKey(b)}`)) return Math.max(base, WATER_PENALTY);
    return base;
  };

  // Sort by stop_number for a consistent base order, then move the stop
  // closest to parking (or the tour's start coordinates if no parking) to
  // the front — the user starts investigating from where they park.
  stops = [...stops].sort((a, b) => (a.stop_number || 0) - (b.stop_number || 0));
  if (refCoords && refCoords.lat != null && refCoords.lon != null) {
    let bestIdx = 0;
    let bestDist = Infinity;
    for (let i = 0; i < stops.length; i++) {
      if (stops[i].latitude != null && stops[i].longitude != null) {
        const d = haversineDistance(refCoords.lat, refCoords.lon, stops[i].latitude, stops[i].longitude);
        if (d < bestDist) { bestDist = d; bestIdx = i; }
      }
    }
    if (bestIdx > 0) {
      const startStop = stops.splice(bestIdx, 1)[0];
      stops.unshift(startStop);
    }
  }

  if (tourType === 'driving') {
    // Stops awaiting placement are not located — they never take part in the
    // driving order either. Append them after the real route.
    const awaiting = stops.filter(s => s.needs_placement);
    const routed = stops.filter(s => !s.needs_placement);
    return [
      ...orderStopsByProximity(routed, false, dist),
      ...awaiting,
    ].map((s, i) => ({ ...s, travel_method: 'driving', stop_number: i + 1 }));
  }

  // Preserve the whole connected walk. Shortest-path expansion permits a
  // return along the same street instead of demoting the tail to driving.
  const plan = planWalkingRoute(walkingCluster, walkingLimit * WALK_LINK_GRACE, parkingCoords, false, dist);
  const orderedCluster = plan.ordered;
  const drivingStops = withCoords.filter(s => !walkingSet.has(s));
  const clusterEnd = orderedCluster[orderedCluster.length - 1];
  if (drivingStops.length && clusterEnd) {
    drivingStops.sort((a, b) => dist(clusterEnd, a) - dist(clusterEnd, b));
  }
  const final = [...orderedCluster, ...orderStopsByProximity(drivingStops, false, dist), ...unlocated];
  return final.map((s, i) => ({
    ...s,
    travel_method: !isLocatedStop(s) ? pendingMethod(s) : walkingSet.has(s) ? 'walking' : 'driving',
    stop_number: i + 1,
  }));
}
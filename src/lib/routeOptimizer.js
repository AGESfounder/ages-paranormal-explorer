import { base44 } from '@/api/base44Client';

// Shared route optimization logic — used by both tour creation (generateTour.js)
// and tour viewing (TourDetail.jsx). Extracted here so creation can enforce
// correct stop ordering (driving stops at the end, walking stops as a loop)
// BEFORE stops are stored, not just on view.

export function haversineDistance(lat1, lon1, lat2, lon2) {
  const R = 3958.8;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

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
    const res = await fetch(url);
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

const WALKING_LIMIT = 0.33;

// Enforce proper stop ordering for a tour's stops.
// - DRIVING tours: linear nearest-neighbor order, all stops driving.
// - WALKING & MIXED tours: build connected components (stops within
//   WALKING_LIMIT of each other). The largest component (2+ stops) is the
//   walking cluster, ordered as a loop. All other stops are DRIVING stops,
//   appended AFTER the walking cluster — never in the middle.
//
// Distances use OSRM routed distances (over bridges, around water) when
// available, falling back to haversine (straight-line) if OSRM is down.
// This prevents two stops separated by a creek from being ordered adjacent
// when the actual walking distance via the nearest bridge is much longer.
//
// `startCoords` ({ lat, lon }) optionally moves the stop closest to the
// tour's designated start to the front before ordering begins.
export async function enforceWalkingDistance(stops, tourType, startCoords, options = {}) {
  const walkingLimit = options.walkingLimit || WALKING_LIMIT;
  if (!stops.length) return stops;

  // Fetch routed distances — accounts for water barriers and bridge
  // crossings. Falls back to haversine if OSRM is unavailable.
  const routedLookup = await fetchRouteDistanceMatrix(stops);
  // Fetch water barriers — pairs of stops separated by a waterway with no
  // nearby walkable bridge. These get a large distance penalty so the
  // ordering groups same-side stops together and only crosses water at a
  // bridge. OSRM's driving profile finds road crossings that walkers can't
  // use, so this Overpass-based check is necessary for walking tours.
  const waterBarriers = await fetchWaterBarriers(stops);
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
  // closest to the tour's start coordinates to the front.
  stops = [...stops].sort((a, b) => (a.stop_number || 0) - (b.stop_number || 0));
  if (startCoords && startCoords.lat != null && startCoords.lon != null) {
    let bestIdx = 0;
    let bestDist = Infinity;
    for (let i = 0; i < stops.length; i++) {
      if (stops[i].latitude != null && stops[i].longitude != null) {
        const d = haversineDistance(startCoords.lat, startCoords.lon, stops[i].latitude, stops[i].longitude);
        if (d < bestDist) { bestDist = d; bestIdx = i; }
      }
    }
    if (bestIdx > 0) {
      const startStop = stops.splice(bestIdx, 1)[0];
      stops.unshift(startStop);
    }
  }

  if (tourType === 'driving') {
    return orderStopsByProximity(stops, false, dist).map((s, i) => ({ ...s, travel_method: 'driving', stop_number: i + 1 }));
  }

  // WALKING & MIXED tours: separate into a walking cluster (the largest group
  // of stops within WALKING_LIMIT of each other) and driving stops. Order the
  // walking cluster as a loop (2-opt with return-to-start) so the first and
  // last stops are near each other — the user walks a circle and returns to
  // their car. The loop's start/end point is the stop closest to the tour
  // start / parking area. Driving stops are appended in linear order AFTER
  // the walking cluster — never in the middle.
  const withCoords = stops.filter(s => s.latitude != null && s.longitude != null);
  const noCoords = stops.filter(s => s.latitude == null || s.longitude == null);

  // Build connected components: stops linked when within WALKING_LIMIT.
  // Uses routed distances (over bridges, around water) so stops on opposite
  // sides of a creek are NOT grouped as walking even if straight-line distance
  // is short — the actual walk to the bridge makes them too far apart.
  // Uses a head-index queue (not shift) to avoid O(n²) on larger stop sets.
  const visited = new Array(withCoords.length).fill(false);
  const components = [];
  for (let i = 0; i < withCoords.length; i++) {
    if (visited[i]) continue;
    const comp = [];
    const queue = [i];
    let head = 0;
    visited[i] = true;
    while (head < queue.length) {
      const idx = queue[head++];
      comp.push(withCoords[idx]);
      for (let j = 0; j < withCoords.length; j++) {
        if (!visited[j]) {
          const d = dist(withCoords[idx], withCoords[j]);
          if (d <= walkingLimit) { visited[j] = true; queue.push(j); }
        }
      }
    }
    components.push(comp);
  }
  components.sort((a, b) => b.length - a.length);

  // Largest component (2+ stops) = walking cluster; everything else = driving
  const walkingCluster = components[0] && components[0].length > 1 ? components[0] : [];
  const drivingStops = (walkingCluster.length > 0 ? components.slice(1) : components).flat();

  // Order the walking cluster as a loop (2-opt with return-to-start)
  const orderedCluster = walkingCluster.length > 1
    ? orderStopsByProximity(walkingCluster, true, dist)
    : walkingCluster.slice();

  // Rotate the loop so the stop closest to the tour start / parking area
  // is first. The walking cluster is a closed loop — the user starts at
  // their car (parking), walks the loop, and returns to the first stop
  // (near the car). Starting at the parking-adjacent stop keeps both the
  // walk out and the walk back to the car short, and avoids zigzagging
  // across bridges. Do NOT rotate to the driving-adjacent stop — the user
  // returns to their car (at parking), not to the driving stop, before
  // driving out.
  if (orderedCluster.length > 1 && startCoords && startCoords.lat != null && startCoords.lon != null) {
    let bestIdx = 0;
    let bestDist = Infinity;
    for (let i = 0; i < orderedCluster.length; i++) {
      const s = orderedCluster[i];
      if (s.latitude != null && s.longitude != null) {
        const d = haversineDistance(startCoords.lat, startCoords.lon, s.latitude, s.longitude);
        if (d < bestDist) { bestDist = d; bestIdx = i; }
      }
    }
    if (bestIdx > 0) {
      const rotated = [...orderedCluster.slice(bestIdx), ...orderedCluster.slice(0, bestIdx)];
      orderedCluster.length = 0;
      orderedCluster.push(...rotated);
    }
  }

  // Order driving stops linearly, starting from the one closest to the
  // tour start / parking area. After the walking loop the user returns to
  // their car at parking, then drives — so the first driving stop should
  // be the one closest to parking, not to the last walking stop.
  const clusterEnd = orderedCluster[orderedCluster.length - 1];
  const orderedDriving = [];
  if (drivingStops.length > 0) {
    const ref = (startCoords && startCoords.lat != null) ? { latitude: startCoords.lat, longitude: startCoords.lon } : (clusterEnd || withCoords[0]);
    let startIdx = 0;
    let startDist = Infinity;
    for (let i = 0; i < drivingStops.length; i++) {
      if (ref) {
        const d = dist(ref, drivingStops[i]);
        if (d < startDist) { startDist = d; startIdx = i; }
      }
    }
    const sorted = [drivingStops[startIdx], ...drivingStops.filter((_, i) => i !== startIdx)];
    orderedDriving.push(...orderStopsByProximity(sorted, false, dist));
  }

  // Final order: walking cluster loop + driving stops + no-coords stops
  const clusterSet = new Set(orderedCluster);
  const final = [...orderedCluster, ...orderedDriving, ...noCoords];
  return final.map((s, i) => ({
    ...s,
    travel_method: clusterSet.has(s) ? 'walking' : 'driving',
    stop_number: i + 1,
  }));
}
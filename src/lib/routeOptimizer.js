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

// 2-opt optimization: reverses route segments that reduce total distance.
// Fixes backtracking patterns that nearest-neighbor alone produces.
// When includeReturn is true, the return-to-start edge is included in the
// cost so walking tours form a loop that brings the user back near start.
function optimizeRoute2Opt(route, includeReturn) {
  if (route.length <= 3) return route;
  const dist = (a, b) => haversineDistance(a.latitude, a.longitude, b.latitude, b.longitude);
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

export function orderStopsByProximity(stops, includeReturn = false) {
  if (stops.length <= 1) return stops;
  const ordered = [stops[0]];
  const remaining = stops.slice(1);
  while (remaining.length > 0) {
    const last = ordered[ordered.length - 1];
    let nearestIdx = 0;
    let nearestDist = Infinity;
    for (let i = 0; i < remaining.length; i++) {
      const d = haversineDistance(last.latitude, last.longitude, remaining[i].latitude, remaining[i].longitude);
      if (d < nearestDist) { nearestDist = d; nearestIdx = i; }
    }
    ordered.push(remaining.splice(nearestIdx, 1)[0]);
  }
  return optimizeRoute2Opt(ordered, includeReturn);
}

const WALKING_LIMIT = 0.33;

// Enforce proper stop ordering for a tour's stops.
// - DRIVING tours: linear nearest-neighbor order, all stops driving.
// - WALKING & MIXED tours: build connected components (stops within
//   WALKING_LIMIT of each other). The largest component (2+ stops) is the
//   walking cluster, ordered as a loop. All other stops are DRIVING stops,
//   appended AFTER the walking cluster — never in the middle. This ensures
//   driving segments only appear at the end of the route, never splitting
//   the walking loop.
//
// `startCoords` ({ lat, lon }) optionally moves the stop closest to the
// tour's designated start to the front before ordering begins.
export function enforceWalkingDistance(stops, tourType, startCoords) {
  if (!stops.length) return stops;

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
    return orderStopsByProximity(stops).map((s, i) => ({ ...s, travel_method: 'driving', stop_number: i + 1 }));
  }

  // WALKING & MIXED tours: separate into a walking cluster (the largest group
  // of stops within WALKING_LIMIT of each other) and driving stops. Order the
  // walking cluster as a loop (2-opt with return-to-start) so the first and
  // last stops are near each other — the user walks a circle and returns to
  // their car. The loop's start/end point is chosen as the stop closest to the
  // nearest driving stop. Driving stops are appended in linear order AFTER the
  // walking cluster — never in the middle.
  const withCoords = stops.filter(s => s.latitude != null && s.longitude != null);
  const noCoords = stops.filter(s => s.latitude == null || s.longitude == null);

  // Build connected components: stops linked when within WALKING_LIMIT.
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
          const d = haversineDistance(withCoords[idx].latitude, withCoords[idx].longitude, withCoords[j].latitude, withCoords[j].longitude);
          if (d <= WALKING_LIMIT) { visited[j] = true; queue.push(j); }
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
    ? orderStopsByProximity(walkingCluster, true)
    : walkingCluster.slice();

  // Rotate the loop so the stop closest to the nearest driving stop is
  // first/last — positions the user near their car for the drive out.
  if (orderedCluster.length > 1 && drivingStops.length > 0) {
    let bestIdx = 0;
    let bestDist = Infinity;
    for (let i = 0; i < orderedCluster.length; i++) {
      for (const ds of drivingStops) {
        const d = haversineDistance(orderedCluster[i].latitude, orderedCluster[i].longitude, ds.latitude, ds.longitude);
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
  // end of the walking cluster so the drive-out is as short as possible.
  const clusterEnd = orderedCluster[orderedCluster.length - 1];
  const orderedDriving = [];
  if (drivingStops.length > 0) {
    const ref = clusterEnd || withCoords[0];
    let startIdx = 0;
    let startDist = Infinity;
    for (let i = 0; i < drivingStops.length; i++) {
      if (ref) {
        const d = haversineDistance(ref.latitude, ref.longitude, drivingStops[i].latitude, drivingStops[i].longitude);
        if (d < startDist) { startDist = d; startIdx = i; }
      }
    }
    const sorted = [drivingStops[startIdx], ...drivingStops.filter((_, i) => i !== startIdx)];
    orderedDriving.push(...orderStopsByProximity(sorted, false));
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
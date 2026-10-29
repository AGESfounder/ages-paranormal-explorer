// Walking membership comes from connected, short links, never from a greedy
// visit order or distance straight back to parking. A linear street may need
// retracing through earlier stops; that is still a walk, not a reason to drive.
export const WALK_LINK_GRACE = 1.05;

export function haversineDistance(lat1, lon1, lat2, lon2) {
  const radians = Math.PI / 180;
  const a = Math.sin((lat2 - lat1) * radians / 2) ** 2
    + Math.cos(lat1 * radians) * Math.cos(lat2 * radians)
    * Math.sin((lon2 - lon1) * radians / 2) ** 2;
  return 3958.8 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(Math.max(0, 1 - a)));
}

export const isLocatedStop = (s) => !s.needs_placement
  && Number.isFinite(s.latitude) && Number.isFinite(s.longitude);
const measure = (a, b) => haversineDistance(a.latitude, a.longitude, b.latitude, b.longitude);

export function walkingComponents(stops, limit, distance = measure) {
  const remaining = new Set(stops.filter(isLocatedStop));
  const groups = [];
  while (remaining.size) {
    const group = [remaining.values().next().value];
    remaining.delete(group[0]);
    for (let head = 0; head < group.length; head++) {
      for (const stop of remaining) {
        if (distance(group[head], stop) <= limit) {
          remaining.delete(stop);
          group.push(stop);
        }
      }
    }
    groups.push(group);
  }
  return groups;
}

// Shortest paths use only legal walking links. Returning via an earlier stop
// does not create another investigation stop or change that stop's number.
export function walkingNetwork(stops, limit, endpoint, distance = measure) {
  const anchored = endpoint && Number.isFinite(endpoint.lat) && Number.isFinite(endpoint.lon)
    && stops.some(s => measure(s, { latitude: endpoint.lat, longitude: endpoint.lon }) <= limit);
  const anchor = anchored ? { latitude: endpoint.lat, longitude: endpoint.lon } : null;
  const nodes = [...stops, ...(anchor ? [anchor] : [])];
  const index = new Map(nodes.map((s, i) => [s, i]));
  const costs = nodes.map((a, i) => nodes.map((b, j) => {
    if (i === j) return 0;
    const d = a === anchor || b === anchor ? measure(a, b) : distance(a, b);
    return d <= limit ? d : Infinity;
  }));
  const next = costs.map((row, i) => row.map((d, j) => i !== j && Number.isFinite(d) ? j : null));
  for (let k = 0; k < nodes.length; k++) {
    for (let i = 0; i < nodes.length; i++) {
      for (let j = 0; j < nodes.length; j++) {
        const cost = costs[i][k] + costs[k][j];
        if (cost < costs[i][j] - 1e-10) {
          costs[i][j] = cost;
          next[i][j] = next[i][k];
        }
      }
    }
  }
  const path = (from, to) => {
    let i = index.get(from);
    const j = index.get(to);
    if (i === undefined || j === undefined || !Number.isFinite(costs[i][j])) return [];
    const result = [from];
    while (i !== j && result.length <= nodes.length) {
      i = next[i][j];
      if (i == null) return [];
      result.push(nodes[i]);
    }
    return result;
  };
  return { anchor, path, distance: (a, b) => costs[index.get(a)]?.[index.get(b)] ?? Infinity };
}

// Exact shortest round-trip order for the app's bounded tours (at most ten
// stops). This avoids greedy dead ends on branches and long, narrow streets.
export function planWalkingRoute(stops, limit, endpoint, preserveOrder = false, distance = measure) {
  if (!stops.length) return { ordered: [], path: [], miles: 0 };
  const network = walkingNetwork(stops, limit, endpoint, distance);
  const origin = network.anchor || stops[0];
  let ordered = [...stops];
  if (!preserveOrder && stops.length <= 12) {
    const n = stops.length;
    const size = 1 << n;
    const costs = Array.from({ length: size }, () => new Float64Array(n).fill(Infinity));
    const previous = Array.from({ length: size }, () => new Int16Array(n).fill(-1));
    stops.forEach((s, i) => { costs[1 << i][i] = network.distance(origin, s); });
    for (let mask = 1; mask < size; mask++) {
      for (let last = 0; last < n; last++) {
        if (!Number.isFinite(costs[mask][last])) continue;
        for (let next = 0; next < n; next++) {
          if (mask & (1 << next)) continue;
          const nextMask = mask | (1 << next);
          const candidate = costs[mask][last] + network.distance(stops[last], stops[next]);
          if (candidate < costs[nextMask][next]) {
            costs[nextMask][next] = candidate;
            previous[nextMask][next] = last;
          }
        }
      }
    }
    let last = 0;
    for (let i = 1; i < n; i++) {
      if (costs[size - 1][i] + network.distance(stops[i], origin)
        < costs[size - 1][last] + network.distance(stops[last], origin)) last = i;
    }
    const sequence = [];
    let mask = size - 1;
    while (last >= 0) {
      sequence.unshift(stops[last]);
      const before = previous[mask][last];
      mask ^= 1 << last;
      last = before;
    }
    ordered = sequence;
  }
  const path = [origin];
  for (const target of [...ordered, origin]) {
    const leg = network.path(path[path.length - 1], target);
    if (!leg.length) return { ordered: [...stops], path: [], miles: 0 };
    path.push(...leg.slice(1));
  }
  // When an optimized leg passes another stop, investigate it on first arrival.
  if (!preserveOrder) ordered = [...new Set(path.filter(s => stops.includes(s)))];
  const miles = path.slice(1).reduce((sum, s, i) => sum + distance(path[i], s), 0);
  return { ordered, path, miles };
}
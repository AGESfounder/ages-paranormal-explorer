import { isLargeProperty } from '@/lib/largeProperty';
import { haversineDistance } from '@/lib/walkingRoute';

// The walk rules, in one place. These are the numbers the generation prompts
// have always asked for; here they are actually enforced on the built route,
// not left to the model's compliance.
//
// A leg up to WALK_LINK_MILES is a plain walk. Coordinates usually point at a
// building's centroid rather than its entrance, so a leg up to WALK_GRACE_MILES
// still counts as walked. Anything longer is a drive — never a "walk" bridged
// through other stops.
export const WALK_LINK_MILES = 0.33;
export const WALK_GRACE_MILES = 0.4;

// An area tour is one walkable downtown, never a multi-mile hike.
export const WALK_TOTAL_MILES = 2.5;

// The longest single leg that may be walked. Single-site tours (landmark/ship/
// cold_spot) are large properties where the walk between structures can
// legitimately be a mile; small ones behave like a downtown block.
export const getWalkingLimit = (tour) => {
  const cat = tour?.tour_category;
  if (cat === 'landmark' || cat === 'ship' || cat === 'cold_spot') {
    return isLargeProperty(tour) ? 1.0 : WALK_LINK_MILES;
  }
  return WALK_LINK_MILES;
};

// The hard per-leg ceiling, limit plus grace. Beyond this the stop is a drive.
export const getWalkingCeiling = (tour) => {
  const cat = tour?.tour_category;
  if (cat === 'landmark' || cat === 'ship' || cat === 'cold_spot') return getWalkingLimit(tour) * 1.05;
  return WALK_GRACE_MILES;
};

// The most an area tour's whole walk may total. Other tour types are not capped.
export const getWalkingTotal = (tour) => (tour?.tour_category === 'area' ? WALK_TOTAL_MILES : Infinity);

// One options object for every path that lays out a tour's route.
export const walkRuleOptions = (tour) => ({
  walkingLimit: getWalkingLimit(tour),
  walkingCeiling: getWalkingCeiling(tour),
  walkingTotal: getWalkingTotal(tour),
});

// Every rule the ordered walk breaks, in words. Empty means the walk is legal.
export function walkLegProblems(tour, orderedStops) {
  const ceiling = getWalkingCeiling(tour);
  const total = getWalkingTotal(tour);
  const walk = (orderedStops || []).filter(s => s.travel_method !== 'driving'
    && Number.isFinite(s.latitude) && Number.isFinite(s.longitude));
  if (walk.length < 2) return [];
  const problems = [];
  let miles = 0;
  for (let i = 1; i < walk.length; i++) {
    const d = haversineDistance(walk[i - 1].latitude, walk[i - 1].longitude, walk[i].latitude, walk[i].longitude);
    miles += d;
    if (d > ceiling) problems.push(`${walk[i - 1].name} to ${walk[i].name} is a ${d.toFixed(2)} mi walk`);
  }
  if (Number.isFinite(total) && miles > total) problems.push(`the walking route totals ${miles.toFixed(2)} mi`);
  return problems;
}
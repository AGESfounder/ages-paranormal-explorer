import { getWalkingLimit } from '@/lib/routeOptimizer';
import { haversineDistance, WALK_LINK_GRACE, isLocatedStop, walkingComponents, planWalkingRoute } from '@/lib/walkingRoute';

// Shared by the map and distance summary. Lines may retrace legal links without
// adding or renumbering investigation stops. Never connect an unplaced pin.
export default function tourRouteGeometry(stops, tour) {
  const parking = stops.find(s => s.stop_type === 'parking' && isLocatedStop(s));
  const shuttle = stops.find(s => s.stop_type === 'shuttle' && isLocatedStop(s));
  const regular = stops.filter(s => s.stop_type !== 'parking' && s.stop_type !== 'shuttle' && isLocatedStop(s))
    .slice().sort((a, b) => (a.stop_number || 0) - (b.stop_number || 0));
  const walking = regular.filter(s => s.travel_method !== 'driving');
  const driving = regular.filter(s => s.travel_method === 'driving');
  const limit = getWalkingLimit(tour) * WALK_LINK_GRACE;
  const endpoint = shuttle || parking;
  const anchor = endpoint ? { lat: endpoint.latitude, lon: endpoint.longitude } : null;
  const components = walkingComponents(walking, limit);
  const walkingLines = components.map(group => {
    const members = new Set(group);
    const ordered = walking.filter(s => members.has(s));
    return planWalkingRoute(ordered, limit, anchor, true).path.map(s => [s.latitude, s.longitude]);
  }).filter(line => line.length > 1);
  const driveOrigin = parking || walking[walking.length - 1];
  const drivingLine = driving.length
    ? [...(driveOrigin ? [[driveOrigin.latitude, driveOrigin.longitude]] : []), ...driving.map(s => [s.latitude, s.longitude])]
    : [];
  const lineDistance = line => line.slice(1).reduce((sum, point, i) =>
    sum + haversineDistance(line[i][0], line[i][1], point[0], point[1]), 0);
  return {
    walkingLines,
    drivingLine,
    distance: walkingLines.reduce((sum, line) => sum + lineDistance(line), 0) + lineDistance(drivingLine),
  };
}
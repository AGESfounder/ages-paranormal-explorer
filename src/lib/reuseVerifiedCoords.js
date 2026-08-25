import { base44 } from '@/api/base44Client';

// Finds user-verified coordinates for stop names by checking existing tours
// in the same state. When a user has manually verified a stop's coordinates
// (user_verified: true) in one tour, those coordinates are ground truth —
// they should be reused for any new tour covering the same location, instead
// of generating fresh (often wrong) coordinates.
//
// Returns a Map: normalizedStopName -> { latitude, longitude, address }
const normalize = (s) =>
  String(s || '')
    .toLowerCase()
    .trim()
    .replace(/[''`]/g, '')
    .replace(/\./g, '')
    .replace(/[^a-z0-9]/g, '');

// Fuzzy match — one normalized name contains the other (catches
// "Yellow House" vs "The Yellow House (Entler-Weltzheimer House)").
function namesMatch(a, b) {
  const na = normalize(a);
  const nb = normalize(b);
  if (!na || !nb) return false;
  if (na === nb) return true;
  if (na.length >= 8 && nb.length >= 8 && (na.includes(nb) || nb.includes(na))) return true;
  return false;
}

export async function getVerifiedCoordsForStops(stopNames, state) {
  if (!stopNames || stopNames.length === 0 || !state) return new Map();

  const existingTours = await base44.entities.Tour.filter({ state });
  const verifiedMap = new Map();

  // Check stops on all tours in this state — look for user_verified stops
  // whose names match any of the requested stop names.
  for (const tour of existingTours) {
    try {
      const stops = await base44.entities.TourStop.filter({ tour_id: tour.id });
      for (const stop of stops) {
        if (stop.stop_type === 'parking') continue;
        if (!stop.user_verified || stop.latitude == null || stop.longitude == null) continue;
        for (const requestedName of stopNames) {
          if (namesMatch(requestedName, stop.name)) {
            const key = normalize(requestedName);
            // Only store the first match (first verified stop wins)
            if (!verifiedMap.has(key)) {
              verifiedMap.set(key, {
                latitude: stop.latitude,
                longitude: stop.longitude,
                address: stop.address,
                sourceTour: tour.title,
              });
            }
          }
        }
      }
    } catch (e) {
      console.error('Failed to fetch stops for verified coord reuse:', e);
    }
  }

  return verifiedMap;
}

// Apply verified coordinates to generated stop records. For each stop whose
// name matches a verified stop in another tour, override the coordinates
// (and optionally the address) with the verified values. Returns the updated
// stop records and a count of how many were overridden.
export function applyVerifiedCoords(stopRecords, verifiedMap) {
  let reused = 0;
  for (const stop of stopRecords) {
    const key = normalize(stop.name);
    const verified = verifiedMap.get(key);
    if (verified) {
      stop.latitude = verified.latitude;
      stop.longitude = verified.longitude;
      // Mark as geocoded (blue) and user_verified since these coords were
      // confirmed by a real person at the actual location.
      stop.geocoded = true;
      stop.user_verified = true;
      stop.needs_placement = false;
      reused++;
    }
  }
  return { stopRecords, reused };
}
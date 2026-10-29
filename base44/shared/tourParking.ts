import { haversine } from './geo.ts';

// Parking is decided AFTER the walking loop exists. The loop is the evidence:
// the located stops say where the tour actually is, and the lot has to serve
// them. The lot is never the anchor that stop addresses are measured from —
// that inversion is what pushed verified addresses out into a parking-lot
// cluster. See planParking() for the rules, applyParkingPlan() for the writes.

// Walking-cluster radius for this tour — mirrors getWalkingLimit in
// src/lib/routeOptimizer.js. Large properties legitimately spread their stops
// further apart, so a flat 0.33 mi would reject a good lot on exactly the tours
// that have the most parking. Keep the two in step.
export function getWalkingLimit(tour, isLarge) {
  const cat = tour?.tour_category;
  if (cat === 'landmark' || cat === 'ship' || cat === 'cold_spot') {
    return isLarge ? 1.0 : 0.33;
  }
  return 0.33;
}

// Hairline grace on the walking link, mirrored from WALK_LINK_GRACE in
// src/lib/routeOptimizer.js. A pair measuring a couple of thousandths over the
// limit is still a walk; without this the loop the parking plan judges a lot
// against is a different (smaller) pocket than the one the map draws.
const WALK_LINK_GRACE = 1.05;

// The walking loop: the largest group of stops within `limit` of each other.
// Returns [] when no cluster of 2+ exists — a driving-only route has no loop to
// centre anything on, and no lot is invented for it.
export function largestWalkingCluster(stops, limit) {
  const unvisited = new Set(stops.map((_, i) => i));
  let best = [];
  while (unvisited.size > 0) {
    const seed = unvisited.values().next().value as number;
    unvisited.delete(seed);
    const comp = [seed];
    for (let head = 0; head < comp.length; head++) {
      const i = comp[head];
      for (const j of [...unvisited]) {
        if (haversine(stops[i].latitude, stops[i].longitude, stops[j].latitude, stops[j].longitude) <= limit * WALK_LINK_GRACE) {
          unvisited.delete(j);
          comp.push(j);
        }
      }
    }
    if (comp.length > best.length) best = comp;
  }
  return best.length > 1 ? best.map((i) => stops[i]) : [];
}

export function centroidOf(stops) {
  return {
    lat: stops.reduce((sum, s) => sum + s.latitude, 0) / stops.length,
    lon: stops.reduce((sum, s) => sum + s.longitude, 0) / stops.length,
  };
}

// Evenly spread `count` markers in a small ring around an anchor, using the
// golden angle so any count stays individually tappable (~20 m radius).
export function ringOffsets(count, anchor, radius = 0.0002) {
  return Array.from({ length: count }, (_, i) => {
    const angle = i * 2.39996;
    return {
      latitude: anchor.lat + radius * Math.cos(angle),
      longitude: anchor.lon + radius * Math.sin(angle),
    };
  });
}

const hasHouseNumber = (address) => /^\d+\s+\w/.test(String(address || ''));

// Decide the lot for a tour's walking loop.
//
// Returns { loop, parking, update }:
//   loop     — the located stops forming the loop (driving-only tours: [])
//   parking  — { lat, lon, needsPlacement } the rest of the run should use
//   update   — the parking-stop fields to write, or null when nothing changes
//
// Rules, in order:
//   1. A lot a person placed (or one validated with the tour) is ground truth.
//   2. A lot is usable when it sits within the loop's walking limit of the
//      loop's NEAREST stop — the walk a visitor actually makes.
//   3. An unresolved pin parked at the loop centre is always "near the loop",
//      so its own coordinates are never evidence it was found. Only a proven
//      street address (house number) can resolve it.
//   4. Nothing usable → the pin goes to the loop centre, flagged for a human.
export async function planParking({ tour, walkingLimit, parkingStop, locatedStops, geocodeParkingAddress }) {
  const loop = tour?.tour_type === 'driving' ? [] : largestWalkingCluster(locatedStops, walkingLimit);

  if (!parkingStop || parkingStop.latitude == null || parkingStop.longitude == null) {
    return { loop, parking: null, update: null };
  }

  const untouched = {
    loop,
    parking: {
      lat: parkingStop.latitude,
      lon: parkingStop.longitude,
      needsPlacement: parkingStop.needs_placement === true,
    },
    update: null,
  };

  if (loop.length === 0) return untouched;

  const nearestToLoop = (lat, lon) => Math.min(
    ...loop.map((s) => haversine(lat, lon, s.latitude, s.longitude)),
  );

  // 1. Placed by a person — never moved, never re-flagged.
  if (parkingStop.user_verified === true || tour?.parking_verified === true) {
    return untouched;
  }

  // 2. Is the lot we already have usable for this loop?
  let lat = parkingStop.latitude;
  let lon = parkingStop.longitude;
  let usable = parkingStop.needs_placement !== true && nearestToLoop(lat, lon) <= walkingLimit;

  // 3. Unresolved or too far — try its own address. Only a house number counts
  //    as proof; a vague street name geocodes near the loop and would silently
  //    "confirm" a lot nobody found.
  if (!usable && hasHouseNumber(parkingStop.address)) {
    const geo = await geocodeParkingAddress(parkingStop.address);
    if (geo && nearestToLoop(geo.lat, geo.lon) <= walkingLimit) {
      lat = geo.lat;
      lon = geo.lon;
      usable = true;
    }
  }

  // 3b. Address geocoding is unreliable — Nominatim rate-limits and returns
  //     nothing — and a lot that already sits inside the loop is not wrong just
  //     because a lookup failed. The loop is the evidence. Accept its own
  //     coordinates unless the pin is parked at the loop CENTRE, which is where
  //     unresolved pins are put and therefore proves nothing about a real lot.
  if (!usable) {
    const centre = centroidOf(loop);
    const parkedAtCentre = haversine(parkingStop.latitude, parkingStop.longitude, centre.lat, centre.lon) <= 0.02;
    if (!parkedAtCentre && nearestToLoop(parkingStop.latitude, parkingStop.longitude) <= walkingLimit) {
      usable = true;
    }
  }

  if (usable) {
    const changed = lat !== parkingStop.latitude
      || lon !== parkingStop.longitude
      || parkingStop.needs_placement === true
      || parkingStop.geocoded !== true;
    return {
      loop,
      parking: { lat, lon, needsPlacement: false },
      update: changed ? { latitude: lat, longitude: lon, geocoded: true, needs_placement: false } : null,
    };
  }

  // 4. No lot for this loop — flag it at the loop centre. Never invent a lot,
  //    and never present a guess as confirmed.
  const centre = centroidOf(loop);
  const moved = haversine(parkingStop.latitude, parkingStop.longitude, centre.lat, centre.lon) > 0.02
    || parkingStop.needs_placement !== true;
  return {
    loop,
    parking: { lat: centre.lat, lon: centre.lon, needsPlacement: true },
    update: moved ? { latitude: centre.lat, longitude: centre.lon, geocoded: false, needs_placement: true } : null,
  };
}

// Write the plan out: the lot on both records, a confirmed lot nudged off a
// stop it sits on, then the unresolved markers ringed around it.
//
// Parking coordinates exist on the parking stop AND on the tour record
// (TourMap reads either), so both are always written together — otherwise the
// app keeps showing the old lot.
export async function applyParkingPlan({
  entities, tourId, parkingStop, parking, update, located, unresolvedStops, startCoords, parkingLocked,
}) {
  const writeParking = async (lat, lon, fields = {}) => {
    if (parkingStop) {
      await entities.TourStop.update(parkingStop.id, { latitude: lat, longitude: lon, ...fields });
    }
    await entities.Tour.update(tourId, {
      parking_latitude: lat,
      parking_longitude: lon,
      parking_verified: false,
    });
  };

  if (parking && update) {
    await writeParking(parking.lat, parking.lon, update);
  }

  // A confirmed lot that coincides with a stop (a lot address often geocodes to
  // the same point as a landmark — "Waterworks Road" is both the parking address
  // and the Sachs Covered Bridge). Never nudge an unresolved pin: it is
  // deliberately at the loop centre. Never move a lot a person placed.
  if (parking && !parking.needsPlacement && parkingStop && !parkingLocked) {
    const coincident = located.some((s) => haversine(parking.lat, parking.lon, s.latitude, s.longitude) < 0.03);
    if (coincident) {
      const nearby = located.filter((s) => haversine(parking.lat, parking.lon, s.latitude, s.longitude) < 0.2);
      if (nearby.length > 0) {
        const avgLat = nearby.reduce((sum, s) => sum + s.latitude, 0) / nearby.length;
        const avgLon = nearby.reduce((sum, s) => sum + s.longitude, 0) / nearby.length;
        const dLat = parking.lat - avgLat;
        const dLon = parking.lon - avgLon;
        const mag = Math.sqrt(dLat * dLat + dLon * dLon) || 1;
        const offsetMag = 0.0006; // ~60m, away from the cluster
        parking.lat += (dLat / mag) * offsetMag;
        parking.lon += (dLon / mag) * offsetMag;
        await writeParking(parking.lat, parking.lon, { geocoded: true, needs_placement: false });
      }
    }
  }

  // Unresolved markers go LAST, ringed around whatever lot we ended up with
  // (the loop centre when none was found). They are markers waiting for a
  // human, not locations — nothing above ever reads them back.
  if (unresolvedStops.length === 0) return;

  const anchor = parking
    || (located.length > 0 ? centroidOf(located) : null)
    || startCoords;
  if (!anchor) return;

  const ring = ringOffsets(unresolvedStops.length, anchor);
  const refreshed = await entities.TourStop.filter({ tour_id: tourId });
  const verifiedIds = new Set(refreshed.filter((s) => s.user_verified).map((s) => s.id));
  const safeRing = unresolvedStops
    .map((stop, i) => ({
      id: stop.id,
      latitude: ring[i].latitude,
      longitude: ring[i].longitude,
      geocoded: false,
      needs_placement: true,
    }))
    .filter((u) => !verifiedIds.has(u.id));

  if (safeRing.length > 0) {
    await entities.TourStop.bulkUpdate(safeRing);
    console.log(`tourParking: placed ${safeRing.length} unresolved stop(s) around parking`);
  }
}
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.54';
import { getWalkingLimit, largestWalkingCluster, centroidOf } from '../../shared/tourParking.ts';
import { haversine } from '../../shared/geo.ts';

// One-time maintenance pass: area tours built before parking became part of the
// build have no parking stop, so their tour page shows no lot at all. This finds
// one real lot per tour from its own stops and creates the parking stop the
// build path would have created — a found lot when one exists, otherwise a
// placeholder at the loop centre flagged needs_placement for a human.
//
// Batched: call it repeatedly, each call does up to `limit` tours and reports
// how many are still waiting. Idempotent — a tour that already has a lot is
// skipped, so re-running or two overlapping calls can never double up.

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const USER_AGENT = 'AGES-Paranormal-Explorer/1.0';
const PARKING_TYPES = ['street', 'parking_lot', 'parking_garage'];

async function geocode(query) {
  try {
    const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=us&q=${encodeURIComponent(query)}`;
    const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT }, signal: AbortSignal.timeout(10000) });
    if (!res.ok) return null;
    const data = await res.json();
    if (!Array.isArray(data) || data.length === 0) return null;
    const lat = parseFloat(data[0].lat);
    const lon = parseFloat(data[0].lon);
    return Number.isFinite(lat) && Number.isFinite(lon) ? { lat, lon } : null;
  } catch (e) {
    console.error(`parking backfill: geocode failed for "${query}":`, e.message);
    return null;
  }
}

async function findLot(base44, tour, anchor, limit) {
  const prompt = `Find ONE real parking area for "${tour.title}" in ${tour.city}, ${tour.state}, publicly accessible after 7 PM and within ${limit} miles of this tour's stops: ${anchor.map((s) => `${s.name}: ${s.address || 'address unknown'}`).join('; ')}. Return only JSON with parking_name, parking_address (complete physical address), parking_type (street, parking_lot, parking_garage), parking_cost. Do not invent a lot or claim free parking without evidence. If none can be established return {}.`;
  const plan = await base44.asServiceRole.integrations.Core.InvokeLLM({
    prompt,
    add_context_from_internet: true,
    response_json_schema: {
      type: 'object',
      properties: {
        parking_name: { type: 'string' },
        parking_address: { type: 'string' },
        parking_type: { type: 'string' },
        parking_cost: { type: 'string' },
      },
    },
  });
  const address = String(plan?.parking_address || '').trim();
  let coords = null;
  if (address) {
    coords = await geocode(address);
    if (!coords && plan?.parking_name) {
      await sleep(1100);
      coords = await geocode(`${plan.parking_name}, ${tour.city}, ${tour.state}`);
    }
    // A lot outside the walking limit of every stop does not serve this tour.
    if (coords && !anchor.some((s) => haversine(coords.lat, coords.lon, s.latitude, s.longitude) <= limit * 1.05)) {
      coords = null;
    }
  }
  return { plan, coords };
}

async function createParking(base44, tour, stops) {
  const existing = await base44.asServiceRole.entities.TourStop.filter({ tour_id: tour.id, stop_type: 'parking' }, { limit: 1 });
  if ((existing.items || []).length > 0) return { outcome: 'already_has_parking' };

  const located = stops.filter((s) => s.stop_type !== 'parking' && s.stop_type !== 'shuttle'
    && Number.isFinite(s.latitude) && Number.isFinite(s.longitude));
  const limit = getWalkingLimit(tour, false);
  const loop = located.length >= 2 ? largestWalkingCluster(located, limit) : located;
  const anchor = loop.length ? loop : located;
  // No walking loop (a driving route) means the lot serves where the tour
  // begins — its first stop — not the mid-point of a multi-mile drive.
  const firstLocated = located.slice().sort((a, b) => (a.stop_number || 0) - (b.stop_number || 0))[0];
  const centre = loop.length ? centroidOf(loop)
    : firstLocated ? { lat: firstLocated.latitude, lon: firstLocated.longitude }
      : Number.isFinite(tour.start_latitude) && Number.isFinite(tour.start_longitude)
        ? { lat: tour.start_latitude, lon: tour.start_longitude }
        : null;
  if (!centre) return { outcome: 'skipped_no_coordinates' };

  let plan = null;
  let coords = null;
  if (anchor.length) {
    try {
      const found = await findLot(base44, tour, anchor, limit);
      plan = found.plan;
      coords = found.coords;
    } catch (e) {
      // A failed lookup still leaves the tour with a lot: the placeholder below.
      console.error(`parking backfill: lookup failed for "${tour.title}":`, e.message);
    }
  }

  const record = await base44.asServiceRole.entities.TourStop.create({
    tour_id: tour.id,
    stop_type: 'parking',
    stop_number: 0,
    name: coords ? (plan?.parking_name || 'Parking Area') : 'Parking Area',
    address: coords ? String(plan?.parking_address || '') : '',
    latitude: coords ? coords.lat : centre.lat,
    longitude: coords ? coords.lon : centre.lon,
    parking_type: PARKING_TYPES.includes(plan?.parking_type) ? plan.parking_type : 'street',
    parking_cost: coords ? String(plan?.parking_cost || 'Cost not confirmed') : 'Cost not confirmed',
    travel_method: 'walking',
    geocoded: !!coords,
    needs_placement: !coords,
  });

  if (!coords) {
    await base44.asServiceRole.entities.Tour.update(tour.id, { build_status: 'needs_review' })
      .catch((e) => console.error(`parking backfill: could not flag "${tour.title}":`, e.message));
  }

  return {
    outcome: coords ? 'created' : 'unresolved',
    parking_name: record.name,
    address: record.address || null,
  };
}

export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me().catch((e) => (e.status === 401 ? null : Promise.reject(e)));
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    if (user.role !== 'admin') return Response.json({ error: 'Forbidden' }, { status: 403 });

    const body = await req.json().catch(() => ({}));
    const limit = Math.min(Math.max(Number(body.limit) || 9, 1), 15);

    const tourPage = await base44.asServiceRole.entities.Tour.filter(
      { tour_category: 'area' }, { sort: 'created_date', limit: 300 },
    );
    const tours = (tourPage.items || []).filter((t) => t.verified !== true);

    // Read every stop of these tours in a few bulk queries rather than one per tour.
    const stopsByTour = new Map();
    for (let i = 0; i < tours.length; i += 25) {
      const chunk = tours.slice(i, i + 25).map((t) => t.id);
      const page = await base44.asServiceRole.entities.TourStop.filter({ tour_id: { $in: chunk } }, { limit: 400 });
      for (const stop of page.items || []) {
        if (!stopsByTour.has(stop.tour_id)) stopsByTour.set(stop.tour_id, []);
        stopsByTour.get(stop.tour_id).push(stop);
      }
    }

    const candidates = [];
    for (const tour of tours) {
      const stops = stopsByTour.get(tour.id) || [];
      if (stops.length === 0) continue;
      if (stops.some((s) => s.stop_type === 'parking')) continue;
      candidates.push({ tour, stops });
    }

    const batch = candidates.slice(0, limit);
    const results = [];
    for (let i = 0; i < batch.length; i += 3) {
      const settled = await Promise.allSettled(
        batch.slice(i, i + 3).map((c) => createParking(base44, c.tour, c.stops)),
      );
      settled.forEach((outcome, k) => {
        const tour = batch[i + k].tour;
        if (outcome.status === 'fulfilled') {
          results.push({ title: tour.title, city: tour.city, ...outcome.value });
        } else {
          console.error(`parking backfill failed for "${tour.title}":`, outcome.reason?.message);
          results.push({ title: tour.title, city: tour.city, outcome: 'error', error: outcome.reason?.message });
        }
      });
    }

    return Response.json({
      areaToursScanned: tours.length,
      pending: candidates.length,
      processed: batch.length,
      remaining: candidates.length - batch.length,
      created: results.filter((r) => r.outcome === 'created').length,
      unresolved: results.filter((r) => r.outcome === 'unresolved').length,
      errors: results.filter((r) => r.outcome === 'error').length,
      results,
    });
  } catch (error) {
    console.error('parking backfill crashed:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
}
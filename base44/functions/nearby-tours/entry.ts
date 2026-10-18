import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';
import { haversine } from '../../shared/geo.ts';

// Server-side radius query for tours (and optionally stops) within a given
// distance of a lat/lng origin. Replaces the client-side "load every tour then
// haversine in JS" pattern on the Nearby page and Haunted Explorations, so the
// payload stops growing with the catalog. Returns FULL records (no field
// projection) with a computed `distance` field — the radius filter is the
// payload win, and full records mean no list card ever renders a blank field.
//
// Bounding-box pre-filter ($gte/$lte on lat/lng) narrows the scan before the
// haversine math, so the server touches far fewer records than a full table
// read. A small degree padding is added so the box fully contains the circle.

export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const { lat, lng, radiusMiles, includeStops } = body || {};
    if (typeof lat !== 'number' || typeof lng !== 'number' || typeof radiusMiles !== 'number') {
      return Response.json({ error: 'lat, lng, and radiusMiles (numbers) are required' }, { status: 400 });
    }

    // Bounding box: 1 degree latitude ≈ 69 miles. Longitude degrees shrink with
    // cos(latitude). +0.5 deg padding ensures the box fully contains the circle
    // even at diagonal corners.
    const latDelta = radiusMiles / 69 + 0.5;
    const lngDelta = radiusMiles / (69 * Math.cos(lat * Math.PI / 180)) + 0.5;
    const minLat = lat - latDelta, maxLat = lat + latDelta;
    const minLng = lng - lngDelta, maxLng = lng + lngDelta;

    // Tours: only those with start coordinates inside the bounding box. Tours
    // without coords can't be distance-matched and were never shown in any
    // distance band anyway, so excluding them is no loss.
    const tourQuery = {
      start_latitude: { $gte: minLat, $lte: maxLat },
      start_longitude: { $gte: minLng, $lte: maxLng },
    };
    const tourPage = await base44.entities.Tour.filter(tourQuery, { limit: 1000 });
    const tourItems = tourPage.items || tourPage;
    const tours = (Array.isArray(tourItems) ? tourItems : [])
      .map(t => ({
        ...t,
        distance: (t.start_latitude && t.start_longitude)
          ? haversine(lat, lng, t.start_latitude, t.start_longitude)
          : Infinity,
      }))
      .filter(t => t.distance <= radiusMiles)
      .sort((a, b) => a.distance - b.distance);

    // Stops: optional, used by Haunted Explorations for stop-level location
    // cards. Parking stops are excluded server-side (the client did this too).
    let stops = [];
    if (includeStops) {
      const stopQuery = {
        latitude: { $gte: minLat, $lte: maxLat },
        longitude: { $gte: minLng, $lte: maxLng },
        stop_type: { $ne: 'parking' },
      };
      const stopPage = await base44.entities.TourStop.filter(stopQuery, { limit: 2000 });
      const stopItems = stopPage.items || stopPage;
      stops = (Array.isArray(stopItems) ? stopItems : [])
        .map(s => ({
          ...s,
          distance: (s.latitude && s.longitude)
            ? haversine(lat, lng, s.latitude, s.longitude)
            : Infinity,
        }))
        .filter(s => s.distance <= radiusMiles)
        .sort((a, b) => a.distance - b.distance);
    }

    return Response.json({ tours, stops });
  } catch (error) {
    console.error('nearby-tours error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
}
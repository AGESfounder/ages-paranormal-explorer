import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';

// Check if the user is authenticated (security — prevent unauthorized calls).
// This function only queries Overpass, no entity access needed.

// Direction test: which side of line A→B is point P on?
// Positive = left, negative = right, zero = collinear.
function direction(ax, ay, bx, by, px, py) {
  return (bx - ax) * (py - ay) - (by - ay) * (px - ax);
}

// Standard segment-segment intersection test (strict — excludes collinear
// / endpoint-touching, which is fine for waterway crossing detection since
// a stop sitting exactly on a waterway line is an edge case we can ignore).
function segmentsIntersect(p1, p2, p3, p4) {
  const d1 = direction(p3.x, p3.y, p4.x, p4.y, p1.x, p1.y);
  const d2 = direction(p3.x, p3.y, p4.x, p4.y, p2.x, p2.y);
  const d3 = direction(p1.x, p1.y, p2.x, p2.y, p3.x, p3.y);
  const d4 = direction(p1.x, p1.y, p2.x, p2.y, p4.x, p4.y);
  return ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) &&
         ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0));
}

// Compute the intersection point of two segments (assumes they intersect).
function intersectionPoint(p1, p2, p3, p4) {
  const denom = (p1.x - p2.x) * (p3.y - p4.y) - (p1.y - p2.y) * (p3.x - p4.x);
  if (Math.abs(denom) < 1e-12) return null;
  const t = ((p1.x - p3.x) * (p3.y - p4.y) - (p1.y - p3.y) * (p3.x - p4.x)) / denom;
  return { x: p1.x + t * (p2.x - p1.x), y: p1.y + t * (p2.y - p1.y) };
}

// Haversine distance in meters.
function haversineMeters(lat1, lon1, lat2, lon2) {
  const R = 6371000;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// Distance from point P to segment A-B in meters.
function pointToSegmentMeters(p, a, b) {
  const dx = b.lon - a.lon, dy = b.lat - a.lat;
  const lenSq = dx * dx + dy * dy;
  if (lenSq < 1e-12) return haversineMeters(p.lat, p.lon, a.lat, a.lon);
  let t = ((p.lon - a.lon) * dx + (p.lat - a.lat) * dy) / lenSq;
  t = Math.max(0, Math.min(1, t));
  return haversineMeters(p.lat, p.lon, a.lat + t * dy, a.lon + t * dx);
}

const BRIDGE_NEARBY_M = 20; // a bridge within 20m of the crossing point = walkable

export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();
    const stops = body.stops;
    if (!stops || stops.length < 2) return Response.json({ barriers: [] });

    // Bounding box with ~500m padding
    const lats = stops.map(s => s.lat);
    const lons = stops.map(s => s.lon);
    const pad = 0.005;
    const bbox = `${Math.min(...lats) - pad},${Math.min(...lons) - pad},${Math.max(...lats) + pad},${Math.max(...lons) + pad}`;

    // Query Overpass for waterways and bridges in one call
    const query = `[out:json][timeout:25];
    (
      way["waterway"](${bbox});
      way["natural"="water"](${bbox});
      way["bridge"](${bbox});
    );
    out geom 300;`;

    let waterwaySegs = [];
    let bridgeSegs = [];
    let _overpassStatus = 'not_called';
    // Try multiple Overpass endpoints — the main one is often overloaded (521).
    const overpassEndpoints = [
      'https://overpass.kumi.systems/api/interpreter',
      'https://overpass.openstreetmap.fr/api/interpreter',
      'https://overpass-api.de/api/interpreter',
    ];
    for (const endpoint of overpassEndpoints) {
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 10000);
        const res = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'text/plain', 'User-Agent': 'AGES-Paranormal-Explorer/1.0' },
          body: query,
          signal: controller.signal,
        });
        clearTimeout(timeout);
        _overpassStatus = `${endpoint}: ${res.status}`;
        if (res.ok) {
          const data = await res.json();
          for (const el of data.elements || []) {
            const geom = el.geometry || [];
            const isBridge = !!el.tags?.bridge;
            for (let i = 1; i < geom.length; i++) {
              const seg = {
                p1: { x: geom[i - 1].lon, y: geom[i - 1].lat, lat: geom[i - 1].lat, lon: geom[i - 1].lon },
                p2: { x: geom[i].lon, y: geom[i].lat, lat: geom[i].lat, lon: geom[i].lon },
              };
              if (isBridge) bridgeSegs.push(seg);
              else waterwaySegs.push(seg);
            }
          }
          break; // success — stop trying endpoints
        }
      } catch (e) {
        _overpassStatus = `${endpoint}: ${e.message}`;
        console.error('Overpass query failed:', e.message);
      }
    }

    if (waterwaySegs.length === 0) return Response.json({ barriers: [] });

    // For each pair of stops, check if the straight line crosses a waterway
    // without a nearby walkable bridge.
    const coordKey = (s) => `${s.lat.toFixed(5)},${s.lon.toFixed(5)}`;
    const barriers = [];

    for (let i = 0; i < stops.length; i++) {
      for (let j = i + 1; j < stops.length; j++) {
        const p1 = { x: stops[i].lon, y: stops[i].lat };
        const p2 = { x: stops[j].lon, y: stops[j].lat };

        let crossing = null;
        for (const ws of waterwaySegs) {
          if (segmentsIntersect(p1, p2, ws.p1, ws.p2)) {
            crossing = intersectionPoint(p1, p2, ws.p1, ws.p2);
            break;
          }
        }
        if (!crossing) continue;

        // Check for a walkable bridge near the crossing point
        let hasBridge = false;
        if (crossing) {
          const cp = { lat: crossing.y, lon: crossing.x };
          for (const bs of bridgeSegs) {
            if (pointToSegmentMeters(cp, bs.p1, bs.p2) < BRIDGE_NEARBY_M) {
              hasBridge = true;
              break;
            }
          }
        }

        if (!hasBridge) {
          barriers.push({ a: coordKey(stops[i]), b: coordKey(stops[j]) });
        }
      }
    }

    return Response.json({ barriers });
  } catch (error) {
    console.error('detect-water-barriers error:', error);
    return Response.json({ barriers: [] });
  }
}
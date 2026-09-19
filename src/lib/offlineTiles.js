// Prefetch and cache Esri map tiles for a tour's geographic area so the
// map works offline. Uses the Cache API directly (the service worker serves
// these cached tiles when the network is unavailable).

const TILE_LAYERS = [
  'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}',
  'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Reference/MapServer/tile/{z}/{y}/{x}',
];

const TILE_CACHE = 'ages-tiles-v1';

// Zoom levels to cache. 12 = city overview, 17 = street-level detail.
// This range covers what users see when viewing a tour map.
const MIN_ZOOM = 12;
const MAX_ZOOM = 17;

function lon2tileX(lon, zoom) {
  return Math.floor(((lon + 180) / 360) * Math.pow(2, zoom));
}

function lat2tileY(lat, zoom) {
  const rad = (lat * Math.PI) / 180;
  return Math.floor(
    ((1 - Math.asinh(Math.tan(rad)) / Math.PI) / 2) * Math.pow(2, zoom)
  );
}

function tileToLat(y, zoom) {
  const n = Math.PI - (2 * Math.PI * y) / Math.pow(2, zoom);
  return (180 / Math.PI) * Math.atan(Math.sinh(n));
}

function tileToLon(x, zoom) {
  return (x / Math.pow(2, zoom)) * 360 - 180;
}

// Generate all tile URLs for the given bounding box across zoom levels.
function generateTileUrls(minLat, minLon, maxLat, maxLon) {
  const urls = [];
  for (let zoom = MIN_ZOOM; zoom <= MAX_ZOOM; zoom++) {
    const minTx = lon2tileX(minLon, zoom);
    const maxTx = lon2tileX(maxLon, zoom);
    const minTy = lat2tileY(maxLat, zoom); // lat increases upward, tile y increases downward
    const maxTy = lat2tileY(minLat, zoom);

    // Clamp to reasonable tile counts per zoom level to avoid fetching
    // thousands of tiles for road trips spanning hundreds of miles.
    const maxTilesPerZoom = 80;
    const txCount = Math.abs(maxTx - minTx) + 1;
    const tyCount = Math.abs(maxTy - minTy) + 1;

    if (txCount * tyCount > maxTilesPerZoom) {
      // Too many tiles at this zoom — skip the higher detail levels for large areas
      if (zoom > 14) continue;
      // For zoom 12-14, cap by sampling (fetch a subset)
      const stepX = Math.ceil(txCount / Math.sqrt(maxTilesPerZoom / tyCount || 1));
      const stepY = Math.ceil(tyCount / Math.sqrt(maxTilesPerZoom / txCount || 1));
      for (let tx = Math.min(minTx, maxTx); tx <= Math.max(minTx, maxTx); tx += stepX) {
        for (let ty = Math.min(minTy, maxTy); ty <= Math.max(minTy, maxTy); ty += stepY) {
          for (const layer of TILE_LAYERS) {
            urls.push(layer.replace('{z}', zoom).replace('{y}', ty).replace('{x}', tx));
          }
        }
      }
      continue;
    }

    for (let tx = Math.min(minTx, maxTx); tx <= Math.max(minTx, maxTx); tx++) {
      for (let ty = Math.min(minTy, maxTy); ty <= Math.max(minTy, maxTy); ty++) {
        for (const layer of TILE_LAYERS) {
          urls.push(layer.replace('{z}', zoom).replace('{y}', ty).replace('{x}', tx));
        }
      }
    }
  }
  return urls;
}

// Compute a bounding box from tour stops with padding.
export function computeBoundingBox(stops, tour) {
  const points = [];
  for (const s of stops) {
    if (s.latitude && s.longitude) {
      points.push({ lat: s.latitude, lon: s.longitude });
    }
  }
  if (tour?.start_latitude && tour?.start_longitude) {
    points.push({ lat: tour.start_latitude, lon: tour.start_longitude });
  }
  if (tour?.parking_latitude && tour?.parking_longitude) {
    points.push({ lat: tour.parking_latitude, lon: tour.parking_longitude });
  }
  if (points.length === 0) return null;

  const lats = points.map((p) => p.lat);
  const lons = points.map((p) => p.lon);
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  const minLon = Math.min(...lons);
  const maxLon = Math.max(...lons);

  // Pad by ~0.01 degrees (~0.7 miles) so markers at edges aren't cut off
  const pad = 0.01;
  return {
    minLat: minLat - pad,
    maxLat: maxLat + pad,
    minLon: minLon - pad,
    maxLon: maxLon + pad,
  };
}

// Prefetch all tiles for a tour's bounding box and store in Cache API.
// Calls onProgress(completed, total) as tiles download.
// Returns { cached, total, errors }.
export async function prefetchTourTiles(stops, tour, onProgress) {
  if (!('caches' in window)) {
    return { cached: 0, total: 0, errors: 0, reason: 'Cache API unavailable' };
  }

  const bbox = computeBoundingBox(stops, tour);
  if (!bbox) return { cached: 0, total: 0, errors: 0, reason: 'No coordinates' };

  const urls = generateTileUrls(bbox.minLat, bbox.minLon, bbox.maxLat, bbox.maxLon);
  const cache = await caches.open(TILE_CACHE);
  let completed = 0;
  let errors = 0;

  // Fetch in small batches to avoid overwhelming the browser
  const BATCH = 6;
  for (let i = 0; i < urls.length; i += BATCH) {
    const batch = urls.slice(i, i + BATCH);
    const results = await Promise.allSettled(
      batch.map(async (url) => {
        // Check if already cached
        const existing = await cache.match(url, { ignoreSearch: true });
        if (existing) return;
        const resp = await fetch(url);
        if (resp.ok || resp.type === 'opaque') {
          await cache.put(url, resp.clone());
        }
      })
    );
    for (const r of results) {
      if (r.status === 'rejected') errors++;
      else completed++;
    }
    if (onProgress) onProgress(completed + errors, urls.length);
  }

  return { cached: completed, total: urls.length, errors };
}

// Remove cached tiles for a specific tour (best-effort — tiles may be shared
// between tours, so we only clear the entire tile cache on explicit removal).
export async function clearAllTiles() {
  if (!('caches' in window)) return;
  await caches.delete(TILE_CACHE);
}
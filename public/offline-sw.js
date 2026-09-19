// Service worker for offline map tile + audio caching.
// Cache-first for Esri tile URLs and pre-generated audio URLs.
// Everything else passes through to the network.

const TILE_CACHE = 'ages-tiles-v1';
const AUDIO_CACHE = 'ages-audio-v1';

const TILE_PATTERNS = [
  'server.arcgisonline.com/ArcGIS/rest/services',
];

// Pre-generated audio URLs are stored with a known prefix so we can identify
// them in fetch events. The app stores audio blobs keyed by their original
// remote URL, so when the app plays a pre-generated URL offline, this SW
// intercepts the fetch and serves the cached blob.
const AUDIO_URL_PREFIX = 'ages-offline-audio:';

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      // Clean up old caches
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter((k) => k !== TILE_CACHE && k !== AUDIO_CACHE)
          .map((k) => caches.delete(k))
      );
      await self.clients.claim();
    })()
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);

  // Only handle GET requests
  if (req.method !== 'GET') return;

  const isTile = TILE_PATTERNS.some((p) => url.href.includes(p));
  const isAudio = url.href.includes(AUDIO_URL_PREFIX) || req.headers.get('X-Ages-Offline-Audio') === '1';

  if (!isTile && !isAudio) return;

  const cacheName = isAudio ? AUDIO_CACHE : TILE_CACHE;

  event.respondWith(
    (async () => {
      const cache = await caches.open(cacheName);
      const cached = await cache.match(req, { ignoreSearch: true });
      if (cached) return cached;

      try {
        const resp = await fetch(req);
        // Only cache successful responses
        if (resp.ok || resp.type === 'opaque') {
          cache.put(req, resp.clone());
        }
        return resp;
      } catch (err) {
        // Offline and not cached — return a transparent 1px placeholder for tiles
        if (isTile) {
          return new Response(
            'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
            { headers: { 'Content-Type': 'image/png' } }
          );
        }
        throw err;
      }
    })()
  );
});

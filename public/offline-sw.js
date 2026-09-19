// AGES Paranormal Explorer — offline service worker
// Caches map tiles and narration audio for offline tour playback.
// Uses a cache-first strategy for cached resources, network-first for everything else.

const TILE_CACHE = 'ages-tiles-v1';
const AUDIO_CACHE = 'ages-audio-v1';
const CORE_CACHE = 'ages-core-v1';

// Core app assets to precache (minimal — just the shell)
const CORE_ASSETS = ['/'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CORE_CACHE).then((cache) => cache.addAll(CORE_ASSETS)).catch(() => {})
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((names) =>
      Promise.all(
        names
          .filter((name) => ![TILE_CACHE, AUDIO_CACHE, CORE_CACHE].includes(name))
          .map((name) => caches.delete(name))
      )
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);

  // Cache-first for map tiles (Esri ArcGIS)
  if (url.hostname.includes('arcgisonline.com')) {
    event.respondWith(
      caches.open(TILE_CACHE).then(async (cache) => {
        const cached = await cache.match(req, { ignoreSearch: true });
        if (cached) return cached;
        try {
          const resp = await fetch(req);
          if (resp.ok || resp.type === 'opaque') {
            cache.put(req, resp.clone());
          }
          return resp;
        } catch {
          return new Response('', { status: 504 });
        }
      })
    );
    return;
  }

  // Cache-first for audio blobs stored in our audio cache
  if (url.protocol === 'blob:' || url.href.includes('ages-offline-audio:')) {
    event.respondWith(
      caches.open(AUDIO_CACHE).then(async (cache) => {
        const cached = await cache.match(req);
        if (cached) return cached;
        return fetch(req);
      })
    );
    return;
  }

  // Network-first for everything else (don't break the app offline — just let it fail)
  event.respondWith(fetch(req).catch(() => caches.match(req)));
});

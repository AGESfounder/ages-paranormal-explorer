// AGES Paranormal Explorer — offline service worker
// ONLY intercepts map tiles and cached audio. Everything else passes through
// to the browser untouched (no event.respondWith) so the app is never broken.

const TILE_CACHE = 'ages-tiles-v1';
const AUDIO_CACHE = 'ages-audio-v1';

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((names) =>
      Promise.all(
        names
          .filter((name) => ![TILE_CACHE, AUDIO_CACHE].includes(name))
          .map((name) => caches.delete(name))
      )
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);

  // Cache-first for map tiles (Esri ArcGIS) only
  if (url.hostname.includes('arcgisonline.com')) {
    event.respondWith(
      caches.open(TILE_CACHE).then(async (cache) => {
        const cached = await cache.match(req, { ignoreSearch: true });
        if (cached) return cached;
        try {
          const resp = await fetch(req);
          if (resp.ok || resp.type === 'opaque') cache.put(req, resp.clone());
          return resp;
        } catch {
          return new Response('', { status: 504 });
        }
      })
    );
    return;
  }

  // Cache-first for audio blobs only
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

  // Everything else: do NOTHING — let the browser handle it normally.
  // Calling event.respondWith with undefined or a failed cache match crashes the app.
});

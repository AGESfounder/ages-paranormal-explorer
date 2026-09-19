// AGES Paranormal Explorer — service worker self-uninstaller.
// A previous version of this SW intercepted all fetch requests and caused
// a black screen. This version's ONLY job is to unregister itself and tell
// all open clients to reload, so the app returns to normal (no SW control).

self.addEventListener('install', (event) => {
  // Activate immediately — don't wait for old SW to die.
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      // Unregister this service worker so it stops controlling the app.
      await self.registration.unregister();
      // Tell all open tabs/windows to reload with no SW interference.
      const clients = await self.clients.matchAll({ type: 'window' });
      clients.forEach((client) => {
        try { client.navigate(client.url); } catch {}
      });
    })()
  );
});

// Do NOT add a fetch handler — let the browser handle everything normally.

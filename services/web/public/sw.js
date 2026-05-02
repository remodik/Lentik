// Self-destroying service worker.
//
// Earlier builds of the app registered `/sw.js`, but no real worker file
// shipped, so old visitors ended up with a stale registration that kept
// serving cached pages until they did a hard reload.  This script
// replaces any such registration, wipes the caches, and unregisters
// itself, so future page loads bypass the SW entirely.

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      try {
        const keys = await caches.keys();
        await Promise.all(keys.map((key) => caches.delete(key)));
      } catch {}
      try {
        await self.registration.unregister();
      } catch {}
      try {
        const clientList = await self.clients.matchAll({ type: "window" });
        for (const client of clientList) {
          client.navigate(client.url);
        }
      } catch {}
    })(),
  );
});

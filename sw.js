/* Tiny service worker so Chrome can offer Install app.
   HTML and JS are network-first so a new deploy is not stuck behind an old cache.
   Icons stay cache-first. Cache name is stamped per build. */
const CACHE = "ed16-20261117-152325";
const ASSETS = [
  "./",
  "./index.html",
  "./game.js?v=20261117-152325",
  "./manifest.json",
  "./icon-192.png",
  "./icon-512.png",
  "./icon-192-maskable.png",
  "./icon-512-maskable.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(ASSETS)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  const dest = event.request.destination;
  const url = new URL(event.request.url);
  const networkFirst = dest === "document" || dest === "script" ||
    url.pathname.endsWith(".html") || url.pathname.endsWith(".js") ||
    url.pathname.endsWith("/") || url.pathname.endsWith("/endless-depths-16");
  if (networkFirst) {
    event.respondWith(
      fetch(event.request).then((res) => {
        if (res && res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then((cache) => cache.put(event.request, copy));
        }
        return res;
      }).catch(() => caches.match(event.request))
    );
    return;
  }
  event.respondWith(
    caches.match(event.request).then((hit) => hit || fetch(event.request))
  );
});

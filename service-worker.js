const CACHE_NAME = "tique-cache-v43";
// Keep these query strings in sync with the versioned URLs index.html actually
// requests (styles.css?vN, app.js?vN) — cache lookups match the full URL
// including the query string, so a stale/mismatched version here is never
// hit by a real request and silently fails to guarantee offline availability.
const APP_SHELL = [
  "./",
  "./index.html",
  "./styles.css?v=30",
  "./app.js?v=41",
  "./manifest.json?v=2",
  "./icons/icon-192.png?v=2",
  "./icons/icon-512.png?v=2",
  "./icons/apple-touch-icon.png?v=2"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);

  // Never cache Open Food Facts lookups — always want fresh data
  if (url.hostname.includes("openfoodfacts.org")) {
    return;
  }

  // The document itself must be network-first: a cache-first shell means
  // reopening the home-screen icon keeps serving the old index.html forever
  // (it references the old versioned app.js/styles.css URLs, so a new SW
  // never even gets a chance to take over). Falls back to cache only when
  // there's no connection, so offline launch still works.
  if (event.request.mode === "navigate") {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          }
          return response;
        })
        .catch(() => caches.match(event.request).then((cached) => cached || caches.match("./index.html")))
    );
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;
      return fetch(event.request).then((response) => {
        // Only cache same-origin, successful responses
        if (response.ok && url.origin === self.location.origin) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
        }
        return response;
      }).catch(() => cached);
    })
  );
});

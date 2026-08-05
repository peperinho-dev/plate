/// <reference lib="webworker" />
// Service worker, ported from the hand-written service-worker.js in the
// vanilla app. injectManifest (rather than generateSW) is used so this
// logic stays explicit instead of being reconstructed from Workbox config.
//
// The one deliberate change: the vanilla version listed the app shell by
// hand, with `styles.css?v=32`-style query strings that had to be bumped in
// two files on every edit — and silently served stale code whenever they
// drifted. Workbox's injected manifest is generated from the real build
// output with content hashes, so that entire class of mistake is gone.
import { precacheAndRoute } from "workbox-precaching";

declare const self: ServiceWorkerGlobalScope;

// Hashed build assets: JS, CSS, icons, and the ZXing .wasm — which is what
// makes barcode scanning work offline.
precacheAndRoute(self.__WB_MANIFEST);

const CACHE_NAME = "plate-runtime-v1";

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => k.startsWith("plate-runtime-") && k !== CACHE_NAME).map((k) => caches.delete(k)))
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);

  // Never cache Open Food Facts lookups — always want fresh product data,
  // and a stale hit here would defeat the local barcode cache's purpose.
  if (url.hostname.endsWith("openfoodfacts.org")) return;

  // The document itself is network-first: a cache-first shell meant
  // reopening the home-screen icon kept serving an old index.html forever.
  // Falls back to cache only when offline, so launching without a
  // connection still works.
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
        .catch(async () => (await caches.match(event.request)) ?? (await caches.match("/index.html")) ?? Response.error())
    );
  }
});

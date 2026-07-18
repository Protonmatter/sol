// Service worker: offline support + instant repeat loads, with zero maintenance burden.
//
// Design rules (each one is load-bearing):
//   • The cache name embeds the ?v= content token (stamped by tools/build_web.py, like every
//     other token in this app), so a deploy retires the old cache wholesale on activate.
//   • The precache list is DERIVED from index.html at install time — every href/src carrying
//     a ?v= token — so there is no hand-maintained URL list to drift when a module is added
//     (the modulepreload list already enumerates the whole graph, and validate_web_static
//     enforces that list).
//   • cache-first ONLY for ?v=-tokened URLs: they are content-addressed, hence immutable —
//     a stale hit is impossible by construction.
//   • network-first for navigations, data/*.json, and pkg/*.wasm: freshness rules stay
//     exactly as the app defines them (no-cache revalidation), and the cached copy is only
//     an OFFLINE fallback, never a staleness source.
//   • Cross-origin (SDO imagery, Helioviewer) is never intercepted: opaque responses would
//     bloat the cache and hide failures the app already handles.
//   • Paths are relative so the same worker serves / locally and /sol/ on GitHub Pages.

const TOKEN = "?v=8a19107712"; // restamped by tools/build_web.py with every content change
const CACHE = `sol-${TOKEN.slice(3)}`;

self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    const response = await fetch("./", { cache: "no-cache" });
    if (response.ok) {
      const html = await response.clone().text();
      await cache.put("./", response);
      const tokened = [...html.matchAll(/(?:href|src)="([^"]+\?v=[0-9a-zA-Z]+)"/g)].map((m) => m[1]);
      // Best-effort per-URL (not addAll): one blocked asset must not void offline support.
      await Promise.all(tokened.map((url) =>
        cache.add(url).catch(() => { /* skipped from precache; runtime caching will retry */ })
      ));
    }
    await self.skipWaiting();
  })());
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names.filter((name) => name.startsWith("sol-") && name !== CACHE)
      .map((name) => caches.delete(name)));
    await self.clients.claim();
  })());
});

async function cacheFirst(request) {
  const hit = await caches.match(request, { ignoreVary: true });
  if (hit) return hit;
  const response = await fetch(request);
  if (response.ok) {
    const cache = await caches.open(CACHE);
    cache.put(request, response.clone());
  }
  return response;
}

async function networkFirst(request, fallbackUrl) {
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(CACHE);
      cache.put(request, response.clone());
    }
    return response;
  } catch (error) {
    const hit = await caches.match(request, { ignoreVary: true })
      || (fallbackUrl && await caches.match(fallbackUrl, { ignoreVary: true }));
    if (hit) return hit;
    throw error;
  }
}

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (/\?v=[0-9a-zA-Z]+$/.test(url.search)) {
    event.respondWith(cacheFirst(request));
  } else if (request.mode === "navigate") {
    event.respondWith(networkFirst(request, "./"));
  } else if (/\/(data|pkg)\//.test(url.pathname)) {
    event.respondWith(networkFirst(request));
  }
  // Everything else falls through to the network untouched.
});

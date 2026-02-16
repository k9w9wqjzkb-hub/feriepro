// iWork PWA Service Worker (GitHub Pages safe) - v12
const VERSION = 'iwork-v12';
const RUNTIME = 'iwork-runtime-v12';

// Files we want to precache (resolved relative to scope)
const PRECACHE = [
  './',
  './index.html',
  './ferie.html',
  './malattia.html',
  './calendario.html',
  './style.css',
  './app.js',
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(VERSION);
    // Resolve each entry against this SW scope to work under /feriepro/
    const urls = PRECACHE.map(u => new URL(u, self.registration.scope).toString());
    await cache.addAll(urls);
    self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.map(k => {
      if (k !== VERSION && k !== RUNTIME) return caches.delete(k);
    }));
    await self.clients.claim();
  })());
});

// Allow the page to force-activate the waiting SW
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);

  // Only handle same-origin
  if (url.origin !== self.location.origin) return;

  // 1) HTML navigations: Network-first (so you always see the latest UI), fallback to cache
  if (req.mode === 'navigate' || (req.headers.get('accept') || '').includes('text/html')) {
    event.respondWith((async () => {
      try {
        const fresh = await fetch(req, { cache: 'no-store' });
        const cache = await caches.open(RUNTIME);
        cache.put(req, fresh.clone());
        return fresh;
      } catch (e) {
        // fallback to runtime cache, then precache
        const cached = await caches.match(req);
        if (cached) return cached;

        // fallback to cached index (app shell)
        const indexUrl = new URL('./index.html', self.registration.scope).toString();
        const indexCached = await caches.match(indexUrl);
        return indexCached || Response.error();
      }
    })());
    return;
  }

  // 2) Static assets: Stale-while-revalidate
  if (['style', 'script', 'image', 'font'].includes(req.destination)) {
    event.respondWith((async () => {
      const cached = await caches.match(req);
      const fetchPromise = fetch(req).then(async (res) => {
        const cache = await caches.open(RUNTIME);
        cache.put(req, res.clone());
        return res;
      }).catch(() => null);

      return cached || (await fetchPromise) || Response.error();
    })());
    return;
  }

  // 3) Default: cache-first fallback
  event.respondWith(caches.match(req).then(r => r || fetch(req)));
});

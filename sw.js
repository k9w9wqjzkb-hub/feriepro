// iWork Service Worker (v9)
const CACHE_NAME = 'iwork-v10';

// Files to pre-cache (relative paths for GitHub Pages)
const ASSETS = [
  './',
  './index.html?v=10',
  './ferie.html?v=10',
  './malattia.html?v=10',
  './calendario.html?v=10',
  './style.css?v=10',
  './app.js?v=10',
  './manifest.json?v=10',
  './icon-192.png',
  './icon-512.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(ASSETS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.map(k => (k !== CACHE_NAME ? caches.delete(k) : Promise.resolve())))
    ).then(() => self.clients.claim())
  );
});

// Network-first for navigations, stale-while-revalidate for assets
self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);

  if (req.method !== 'GET') return;

  // only handle same-origin
  if (url.origin !== self.location.origin) return;

  // Navigations: always try network first
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req).then(res => {
        const copy = res.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(req, copy));
        return res;
      }).catch(() => caches.match(req).then(r => r || caches.match('./')))
    );
    return;
  }

  // Assets: cache-first, update in background
  event.respondWith(
    caches.match(req).then(cached => {
      const fetchPromise = fetch(req).then(res => {
        const copy = res.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(req, copy));
        return res;
      }).catch(() => cached);

      return cached || fetchPromise;
    })
  );
});

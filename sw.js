// Service Worker iWork (GitHub Pages friendly)
// v11 - cache versioned + cleanup + network-first for navigations (iOS/PWA)
const CACHE_NAME = 'iwork-v11';

// Percorsi RELATIVI (repo: /feriepro/)
const ASSETS = [
  './',
  './index.html?v=11',
  './ferie.html?v=11',
  './malattia.html?v=11',
  './calendario.html?v=11',
  './style.css?v=11',
  './app.js?v=11',
  './manifest.json?v=11',
  './icon-192.png',
  './icon-512.png',
  './icon-180.png',
  './icon-167.png',
  './icon-152.png',
  './icon-120.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    await cache.addAll(ASSETS);
    self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.map((k) => (k !== CACHE_NAME ? caches.delete(k) : Promise.resolve())));
    self.clients.claim();
  })());
});

// Helpers
const isNavigation = (req) => req.mode === 'navigate' || (req.destination === 'document');

self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);

  // Only same-origin (GitHub Pages)
  if (url.origin !== location.origin) return;

  // HTML / navigations: NETWORK FIRST (evita "versione vecchia" su PWA iOS)
  if (isNavigation(req)) {
    event.respondWith((async () => {
      try {
        const fresh = await fetch(req);
        const cache = await caches.open(CACHE_NAME);
        cache.put(req, fresh.clone());
        return fresh;
      } catch (e) {
        const cached = await caches.match(req);
        return cached || caches.match('./index.html?v=11');
      }
    })());
    return;
  }

  // Static assets: STALE-WHILE-REVALIDATE
  event.respondWith((async () => {
    const cache = await caches.open(CACHE_NAME);
    const cached = await cache.match(req);
    const fetchPromise = fetch(req).then((fresh) => {
      cache.put(req, fresh.clone());
      return fresh;
    }).catch(() => null);

    return cached || (await fetchPromise) || new Response('', { status: 504, statusText: 'Offline' });
  })());
});
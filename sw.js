// Service Worker - iWork
// Obiettivo: aggiornamenti più affidabili su iPhone/PWA + cache versionata

const CACHE_VERSION = 'v6'; // <-- incrementa (v7, v8, ...) quando fai deploy
const CACHE_NAME = `iwork-${CACHE_VERSION}`;

// Usa percorsi RELATIVI (importante su GitHub Pages / sottocartelle)
const CORE_ASSETS = [
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

// INSTALL: precache + attiva più in fretta
self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    await cache.addAll(CORE_ASSETS);
    await self.skipWaiting();
  })());
});

// ACTIVATE: prendi controllo + pulizia vecchie cache
self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(
      keys
        .filter(k => k.startsWith('iwork-') && k !== CACHE_NAME)
        .map(k => caches.delete(k))
    );
    await self.clients.claim();
  })());
});

// Messaggio per forzare skipWaiting (opzionale)
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
});

// FETCH strategy:
// - HTML (navigate/document): NETWORK FIRST (così gli update arrivano subito)
// - static assets (js/css/img): STALE-WHILE-REVALIDATE
self.addEventListener('fetch', (event) => {
  const req = event.request;

  // Solo GET
  if (req.method !== 'GET') return;

  const isDocument = req.mode === 'navigate' || req.destination === 'document';

  if (isDocument) {
    event.respondWith((async () => {
      try {
        const fresh = await fetch(req, { cache: 'no-store' });
        const cache = await caches.open(CACHE_NAME);
        cache.put(req, fresh.clone());
        return fresh;
      } catch (err) {
        const cached = await caches.match(req);
        return cached || caches.match('./index.html');
      }
    })());
    return;
  }

  // Asset: stale-while-revalidate
  event.respondWith((async () => {
    const cached = await caches.match(req);
    const fetchPromise = fetch(req).then(async (res) => {
      const cache = await caches.open(CACHE_NAME);
      cache.put(req, res.clone());
      return res;
    }).catch(() => null);

    return cached || (await fetchPromise) || Response.error();
  })());
});

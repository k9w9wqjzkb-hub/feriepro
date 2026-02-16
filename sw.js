/* =========================================================
   iWork Service Worker - v17
   ========================================================= */

const CACHE_NAME = 'iwork-v17';

// Elenco degli asset da memorizzare nella cache durante l'installazione
const ASSETS = [
  './',
  './index.html?v=17',
  './ferie.html?v=17',
  './malattia.html?v=17',
  './calendario.html?v=17',
  './style.css?v=17',
  './app.js?v=17',
  './manifest.json?v=17',
  './icon-192.png',
  './icon-512.png',
  './icon-180.png'
];

// Installazione: crea la cache e aggiunge gli asset
self.addEventListener('install', (event) => {
  self.skipWaiting(); // Forza l'attivazione immediata del nuovo SW
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('SW: Cache aperta e asset in fase di aggiunta');
      return cache.addAll(ASSETS);
    })
  );
});

// Attivazione: pulizia delle vecchie cache
self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys.map((k) => {
          if (k !== CACHE_NAME) {
            console.log('SW: Rimozione vecchia cache:', k);
            return caches.delete(k);
          }
        })
      );
      await self.clients.claim();
    })()
  );
});

// Gestione delle richieste (Fetch)
self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);

  // Gestisci solo richieste dello stesso origin (evita problemi con script esterni)
  if (url.origin !== self.location.origin) return;

  const accept = req.headers.get('accept') || '';
  const isHTML = accept.includes('text/html') || url.pathname.endsWith('.html') || url.pathname.endsWith('/');

  if (isHTML) {
    // STRATEGIA: Network-First per HTML
    // Proviamo a scaricare la versione più recente, se fallisce (offline) usiamo la cache
    event.respondWith(
      (async () => {
        try {
          const fresh = await fetch(req);
          const cache = await caches.open(CACHE_NAME);
          cache.put(req, fresh.clone());
          return fresh;
        } catch (e) {
          const cached = await caches.match(req, { ignoreSearch: true });
          return cached || caches.match('./index.html?v=17');
        }
      })()
    );
    return;
  }

  // STRATEGIA: Cache-First per asset statici (CSS, JS, Immagini)
  event.respondWith(
    (async () => {
      const cached = await caches.match(req, { ignoreSearch: true });
      if (cached) return cached;

      try {
        const fresh = await fetch(req);
        const cache = await caches.open(CACHE_NAME);
        cache.put(req, fresh.clone());
        return fresh;
      } catch (e) {
        // Se siamo qui, la risorsa non è in cache e non c'è rete
        return new Response('Offline', { status: 503, statusText: 'Service Unavailable' });
      }
    })()
  );
});
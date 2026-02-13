const CACHE_NAME = 'iwork-v3'; // Versione aggiornata per forzare il refresh dei nuovi stili
const ASSETS = [
  './',
  'index.html',
  'ferie.html',
  'malattia.html',
  'calendario.html',
  'style.css',
  'app.js',
  'manifest.json',
  'icon-192.png',
  'icon-512.png'
];

// Installazione: Creazione cache e pre-caricamento asset
self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('iWork SW: Cache "'+ CACHE_NAME +'" creata con successo');
      return cache.addAll(ASSETS);
    })
  );
  self.skipWaiting(); 
});

// Attivazione: Pulizia automatica delle versioni precedenti (v1, v2)
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keyList) => {
      return Promise.all(keyList.map((key) => {
        if (key !== CACHE_NAME) {
          console.log('iWork SW: Eliminazione vecchia cache:', key);
          return caches.delete(key);
        }
      }));
    })
  );
  return self.clients.claim(); 
});

// Strategia: Cache First con fallback sul Network
self.addEventListener('fetch', (e) => {
  e.respondWith(
    caches.match(e.request).then((res) => {
      // Restituisce la risorsa se in cache, altrimenti va in rete
      return res || fetch(e.request).then((networkResponse) => {
        // Opzionale: aggiunge dinamicamente nuove risorse caricate alla cache
        return caches.open(CACHE_NAME).then((cache) => {
          cache.put(e.request, networkResponse.clone());
          return networkResponse;
        });
      }).catch(() => {
        // Se totalmente offline e la risorsa non è in cache
        if (e.request.mode === 'navigate') {
          return caches.match('index.html');
        }
      });
    })
  );
});
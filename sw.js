const CACHE_NAME = 'iwork-v2'; // Cambia il numero (v1, v2, v3) ogni volta che fai modifiche pesanti
const ASSETS = [
  './',                // La root del sito
  'index.html',
  'ferie.html',
  'malattia.html',
  'calendario.html',   // Fondamentale!
  'style.css',
  'app.js',
  'manifest.json',
  'icon-192.png'       // Aggiungi le icone per evitare errori 404 offline
];

// Installazione: salva i file in cache e forza l'attivazione
self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('iWork: File in cache');
      return cache.addAll(ASSETS);
    })
  );
  self.skipWaiting(); // Forza l'aggiornamento immediato del nuovo SW
});

// Attivazione: pulisce le vecchie cache
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keyList) => {
      return Promise.all(keyList.map((key) => {
        if (key !== CACHE_NAME) {
          console.log('iWork: Rimozione vecchia cache', key);
          return caches.delete(key);
        }
      }));
    })
  );
  return self.clients.claim(); // Prende il controllo delle pagine immediatamente
});

// Intercetta le richieste: Cache First, poi Network
self.addEventListener('fetch', (e) => {
  e.respondWith(
    caches.match(e.request).then((res) => {
      return res || fetch(e.request).catch(() => {
        // Opzionale: se l'utente è offline e cerca una pagina non in cache
        if (e.request.mode === 'navigate') {
          return caches.match('index.html');
        }
      });
    })
  );
});
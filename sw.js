const CACHE_NAME = 'iwork-v5';
const assets = ['/', '/index.html', '/ferie.html', '/malattia.html', '/style.css', '/app.js', '/manifest.json'];
self.addEventListener('install', e => e.waitUntil(caches.open(CACHE_NAME).then(c => c.addAll(assets))));
self.addEventListener('fetch', e => e.respondWith(caches.match(e.request).then(r => r || fetch(e.request))));
// Water Quality Explorer — Service Worker
const CACHE = 'wq-explorer-v3';
const STATIC = [
  '/vatn/',
  '/vatn/index.html',
  '/vatn/blyth.html',
  '/vatn/derwent.html',
  '/vatn/blyth_app.js',
  '/vatn/derwent_app.js',
  '/vatn/sites.js',
  '/vatn/manifest.json',
  '/vatn/icon-192.png',
  '/vatn/icon-512.png',
];

// Install: cache all static assets
self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(c => c.addAll(STATIC)).then(() => self.skipWaiting())
  );
});

// Activate: clean up old caches
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

// Fetch: cache-first for our assets, network-first for everything else
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  const isOurs = url.origin === self.location.origin && url.pathname.startsWith('/vatn/');
  
  if (isOurs) {
    // Cache-first: serve from cache, fall back to network
    e.respondWith(
      caches.match(e.request).then(cached => {
        if (cached) return cached;
        return fetch(e.request).then(res => {
          if (res.ok) {
            const clone = res.clone();
            caches.open(CACHE).then(c => c.put(e.request, clone));
          }
          return res;
        });
      })
    );
  }
  // External requests (tiles, CDN, fonts) — network only, no caching
});

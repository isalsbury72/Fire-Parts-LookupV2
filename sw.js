// sw.js
const CACHE = 'fpl-v5-3-10';

const ASSETS = [
  './',
  'index.html',
  'app.js?v=5.3.10',
  'manifest.json',
  'icon-192.png',
  'icon-512.png',
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE)
      .then(c => c.addAll(ASSETS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys.map(k => (k === CACHE ? null : caches.delete(k)))
      )
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  // 🔹 Special case: always try network first for Parts.csv so new rows show up
  if (url.pathname.endsWith('/Parts.csv')) {
    event.respondWith(
      fetch(event.request.clone())
        .then(response => {
          // Cache the fresh CSV for offline use as well
          const copy = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, copy));
          return response;
        })
        .catch(() => {
          // If offline, fall back to cached CSV if we have it
          return caches.match(event.request);
        })
    );
    return; // Important: don't fall through to the generic handler
  }

  // ... your existing fetch logic for navigations, app.js, other assets ...
});

  // Cache first for everything else
  e.respondWith(
    caches.match(e.request).then(r => r || fetch(e.request))
  );
});

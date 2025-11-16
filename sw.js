// sw.js
const CACHE = 'fpl-v5-3-4';

const ASSETS = [
  '/fire-parts-lookup/',
  '/fire-parts-lookup/index.html',
  '/fire-parts-lookup/app.js?v=5.3.4',
  '/fire-parts-lookup/manifest.json',
  '/fire-parts-lookup/icon-192.png',
  '/fire-parts-lookup/icon-512.png',
  '/fire-parts-lookup/Parts.csv'
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

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  const isHTML =
    e.request.mode === 'navigate' ||
    (e.request.headers.get('accept') || '').includes('text/html');
  const isApp =
    url.pathname.endsWith('/app.js') || url.searchParams.has('v');

  // Network first for HTML + app.js so updates appear quickly
  if (isHTML || isApp) {
    e.respondWith(
      fetch(e.request)
        .then(resp => {
          const copy = resp.clone();
          caches.open(CACHE).then(c => c.put(e.request, copy));
          return resp;
        })
        .catch(() => caches.match(e.request))
    );
    return;
  }

  // Cache first for everything else
  e.respondWith(
    caches.match(e.request).then(r => r || fetch(e.request))
  );
});

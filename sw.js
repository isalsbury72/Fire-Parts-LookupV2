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
        .catch(() => {
          if (isHTML) {
            return caches.match('./index.html');
          }
          return caches.match(e.request);
        })
    );
    return;
  }

  // Cache first for everything else
  e.respondWith(
    caches.match(e.request).then(r => r || fetch(e.request))
  );
});

// sw.js
const CACHE = 'fpl-v5-3-6';

const ASSETS = [
  './',
  './index.html',
  './app.js?v=5.3.6',
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
  './Parts.csv'
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
  const req = e.request;
  const url = new URL(req.url);

  const isNavigate =
    req.mode === 'navigate' ||
    (req.headers.get('accept') || '').includes('text/html');

  const isApp =
    url.pathname.endsWith('app.js') ||
    url.searchParams.has('v');

  // Navigation: network first, fall back to cached index.html
  if (isNavigate) {
    e.respondWith(
      fetch(req)
        .then(resp => {
          const copy = resp.clone();
          caches.open(CACHE).then(c => c.put('./index.html', copy));
          return resp;
        })
        .catch(() => caches.match('./index.html'))
    );
    return;
  }

  // app.js: network first
  if (isApp) {
    e.respondWith(
      fetch(req)
        .then(resp => {
          const copy = resp.clone();
          caches.open(CACHE).then(c => c.put(req, copy));
          return resp;
        })
        .catch(() => caches.match(req))
    );
    return;
  }

  // Everything else: cache first
  e.respondWith(
    caches.match(req).then(r => r || fetch(req))
  );
});

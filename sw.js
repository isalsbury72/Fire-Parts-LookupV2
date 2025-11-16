// sw.js
const CACHE = 'fpl-v5-3-4';

const ASSETS = [
  'index.html',
  'app.js',
  'manifest.json',
  'icon-192.png',
  'icon-512.png',
  'Parts.csv',
  'offline.html'
];

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    // Attempt to cache all assets; tolerate individual failures so install doesn't fail
    await Promise.all(ASSETS.map(async url => {
      try {
        await cache.add(url);
      } catch (err) {
        // Non-fatal; log and continue
        console.warn('Failed to precache', url, err);
      }
    }));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.map(k => (k === CACHE ? Promise.resolve() : caches.delete(k))));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  const isNavigation = event.request.mode === 'navigate' || (event.request.headers.get('accept') || '').includes('text/html');
  const isAppJs = url.pathname.endsWith('/app.js') || url.pathname.endsWith('app.js');

  // Network-first for navigation and app bundle so updates appear quickly
  if (isNavigation || isAppJs) {
    event.respondWith((async () => {
      try {
        const networkResp = await fetch(event.request);
        // Update cache with the fresh response
        const copy = networkResp.clone();
        const cache = await caches.open(CACHE);
        try { await cache.put(event.request, copy); } catch (e) { /* ignore */ }
        return networkResp;
      } catch (err) {
        // Network failed — try fallback to cached index.html or offline page
        const cache = await caches.open(CACHE);
        const cachedIndex = await cache.match('index.html');
        if (cachedIndex) return cachedIndex;
        const offline = await cache.match('offline.html');
        if (offline) return offline;
        return new Response('Offline', { status: 503, statusText: 'Offline' });
      }
    })());
    return;
  }

  // Cache-first for other GET requests
  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const cached = await cache.match(event.request);
    if (cached) return cached;
    try {
      const resp = await fetch(event.request);
      try { await cache.put(event.request, resp.clone()); } catch (e) { /* ignore */ }
      return resp;
    } catch (err) {
      // If request is for an HTML document, try offline fallback
      const accept = event.request.headers.get('accept') || '';
      if (accept.includes('text/html')) {
        const offline = await cache.match('offline.html');
        if (offline) return offline;
      }
      return new Response('Offline', { status: 503, statusText: 'Offline' });
    }
  })());
});

// Allow the page to tell the SW to skip waiting immediately
self.addEventListener('message', event => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
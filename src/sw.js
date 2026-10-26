// ─── Service worker: install and first paint only ───
//
// Design spec §5. Deliberately minimal: this worker exists so the site
// can be installed to a home screen (and, later, receive push — iOS
// allows web push only for installed web apps, §6). It caches the app
// shell so a cold or flaky start paints something.
//
// It does NOT cache API responses. The API is the source of truth, and
// a stale roster or event time is worse than a spinner — someone could
// travel to a cancelled event on cached data. Requests to any other
// origin (the API, fonts) are not intercepted at all.
//
// Code is fetched fresh, never served from the cache first: the app is
// dozens of ES modules (screens, the copy engine, the copy bundles) that
// must all come from the same deploy. Serving cached modules first and
// refreshing behind meant the first load after a deploy could pair a new
// screen with an old bundle — missing-key text on screen. The cache
// stays as the offline fallback.
//
// Bump CACHE when the shell changes; activate deletes older caches.

// v3: code is network-first (above), so this worker must replace v2's.
const CACHE = 'irl-shell-v3';

const SHELL = [
  './',
  './index.html',
  './app.html',
  './terms.html',
  './css/styles.css',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE)
      // Individually, so one 404 cannot fail the whole install.
      .then((cache) => Promise.allSettled(SHELL.map((url) => cache.add(url))))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  // Same-origin only: the API and font CDNs pass straight through.
  if (url.origin !== self.location.origin) return;

  // Navigations: network first, so a deploy is picked up immediately;
  // the cached shell is the offline fallback, never the fast path.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          caches.open(CACHE).then((cache) => cache.put(request, copy));
          return response;
        })
        .catch(() => caches.match(request).then((hit) => hit || caches.match('./index.html'))),
    );
    return;
  }

  // Code and data: network first, revalidated against the server (an
  // unchanged file answers 304, so this costs a round trip, not a
  // download); the cached copy only when offline.
  if (/\.(css|js|mjs|json|webmanifest)$/.test(url.pathname)) {
    event.respondWith(
      fetch(request, { cache: 'no-cache' })
        .then((response) => {
          if (response.ok) {
            const copy = response.clone();
            caches.open(CACHE).then((cache) => cache.put(request, copy));
          }
          return response;
        })
        .catch(() => caches.match(request).then((hit) => hit || Response.error())),
    );
    return;
  }

  // Images: serve from cache, refresh in the background — an old icon is
  // harmless, and these never change in step with the code.
  if (/\.(png|svg)$/.test(url.pathname)) {
    event.respondWith(
      caches.match(request).then((hit) => {
        const network = fetch(request)
          .then((response) => {
            const copy = response.clone();
            caches.open(CACHE).then((cache) => cache.put(request, copy));
            return response;
          })
          .catch(() => hit);
        return hit || network;
      }),
    );
  }
});

// AQS Learning Platform — Service Worker
// Cache version: bump to refresh all caches
const CACHE_VERSION = 'v1';
const SHELL_CACHE = `aqs-shell-${CACHE_VERSION}`;
const ASSETS_CACHE = `aqs-assets-${CACHE_VERSION}`;
const IMAGES_CACHE = `aqs-images-${CACHE_VERSION}`;

const EXPECTED_CACHES = [SHELL_CACHE, ASSETS_CACHE, IMAGES_CACHE];

// Static files to pre-cache during install (app shell)
const SHELL_URLS = [
  '/',
  '/manifest.json',
  '/icon.svg'
];

// ─── INSTALL ────────────────────────────────────────────────────
// Pre-cache the app shell so the app loads instantly offline.
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE)
      .then((cache) => cache.addAll(SHELL_URLS))
      .then(() => {
        // Activate immediately — don't wait for page reload
        return self.skipWaiting();
      })
  );
});

// ─── ACTIVATE ───────────────────────────────────────────────────
// Delete stale caches from previous versions, then take control
// of all open clients so the new SW applies immediately.
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((name) => {
          if (!EXPECTED_CACHES.includes(name)) {
            return caches.delete(name);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// ─── FETCH ──────────────────────────────────────────────────────
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // ──────────────────────────────────────────────────────────────
  // 1. API GET requests — network-first, fall back to cache.
  //    The PouchDBService data layer handles offline queuing and
  //    sync; this cache provides a backup so course listings and
  //    progress load instantly from cache when offline.
  //    POST/PUT/DELETE API calls are never cached — those are
  //    write operations that must always reach the server.
  // ──────────────────────────────────────────────────────────────
  if (url.pathname.startsWith('/api/')) {
    if (request.method === 'GET') {
      event.respondWith(
        fetch(request).then((response) => {
          if (response && response.status === 200) {
            const clone = response.clone();
            caches.open(ASSETS_CACHE).then((cache) => cache.put(request, clone));
          }
          return response;
        }).catch(() => caches.match(request))
      );
    }
    return;
  }

  // ──────────────────────────────────────────────────────────────
  // 2. Navigation requests — serve app shell from cache.
  //    This is the SPA pattern: every route returns the same HTML,
  //    and React handles client-side routing via pushState.
  //    If the shell cache is missing (storage eviction) and we're
  //    offline, serve a minimal offline page.
  // ──────────────────────────────────────────────────────────────
  if (request.mode === 'navigate') {
    event.respondWith(
      caches.match('/').then((cached) => {
        return cached || fetch(request);
      }).catch(() => {
        return new Response(
          '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Offline</title><style>body{font-family:sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;background:#0f172a;color:#f8fafc;text-align:center;padding:1rem}h1{font-size:1.5rem;margin-bottom:.5rem}p{color:#94a3b8;max-width:24rem;line-height:1.6}</style></head><body><div><h1>No Connection</h1><p>You are offline. Please connect to the internet and try again.</p></div></body></html>',
          { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8' } }
        );
      })
    );
    return;
  }

  // ──────────────────────────────────────────────────────────────
  // 3. Same-origin static assets (JS, CSS, fonts).
  //    Cache-first: once loaded, always available offline.
  //    Vite's content-hashed filenames ensure cache invalidation
  //    on rebuild — a changed file has a different URL.
  // ──────────────────────────────────────────────────────────────
  if (url.origin === self.location.origin) {
    if (
      url.pathname.startsWith('/assets/') ||
      url.pathname.endsWith('.js') ||
      url.pathname.endsWith('.css') ||
      url.pathname.endsWith('.woff2') ||
      url.pathname.endsWith('.woff') ||
      url.pathname.endsWith('.ttf')
    ) {
      event.respondWith(
        caches.match(request).then((cached) => {
          if (cached) return cached;
          return fetch(request).then((response) => {
            if (response && response.status === 200) {
              const clone = response.clone();
              caches.open(ASSETS_CACHE).then((cache) => cache.put(request, clone));
            }
            return response;
          });
        })
      );
      return;
    }
  }

  // ──────────────────────────────────────────────────────────────
  // 4. Images (cross-origin Unsplash, etc.) — stale-while-revalidate.
  //    Serve cached copy immediately, update in background.
  //    If fetch fails (offline), fall back to cached version.
  // ──────────────────────────────────────────────────────────────
  if (
    request.destination === 'image' ||
    /\.(png|jpg|jpeg|gif|svg|webp|ico|avif)(\?.*)?$/i.test(url.pathname)
  ) {
    event.respondWith(
      caches.match(request).then((cached) => {
        const fetchAndCache = fetch(request).then((response) => {
          if (response && response.status === 200) {
            const clone = response.clone();
            caches.open(IMAGES_CACHE).then((cache) => cache.put(request, clone));
          }
          return response;
        }).catch(() => cached);
        return cached || fetchAndCache;
      })
    );
    return;
  }
});

// ─── MESSAGE HANDLER ────────────────────────────────────────────
// Listen for SKIP_WAITING message from the client. This allows the
// new SW to activate immediately when the user wants to update.
self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

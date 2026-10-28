const CACHE = 'local-static-v1';
const PRECACHE = ['/manifest.webmanifest', '/favicon.ico', '/local-logo.svg'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(PRECACHE)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || url.origin !== self.location.origin) return;
  const isStaticAsset = PRECACHE.includes(url.pathname) || url.pathname.startsWith('/icons/');
  if (!isStaticAsset) return;
  event.respondWith(
    caches.open(CACHE).then((cache) =>
      cache.match(event.request).then(
        (cached) =>
          cached ||
          fetch(event.request).then((response) => {
            if (response.ok) cache.put(event.request, response.clone());
            return response;
          })
      )
    )
  );
});
const STATIC_CACHE = 'ai-agency-static-v1';

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

self.addEventListener('fetch', (event) => {
  const request = event.request;
  const url = new URL(request.url);
  const cacheableStaticAsset = request.method === 'GET' &&
    url.origin === self.location.origin &&
    (url.pathname.startsWith('/assets/') || /^\/(favicon|pwa-)/.test(url.pathname));

  if (!cacheableStaticAsset) return;

  event.respondWith(
    caches.open(STATIC_CACHE).then(async (cache) => {
      const cached = await cache.match(request);
      if (cached) return cached;
      const response = await fetch(request);
      if (response.ok) await cache.put(request, response.clone());
      return response;
    }),
  );
});

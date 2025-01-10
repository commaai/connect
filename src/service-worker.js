const SERVICE_WORKER_VERSION = 1;
const CACHE_NAME = `comma-connect-cache-v${SERVICE_WORKER_VERSION}`;

const STATIC_ASSETS = [
  '/index.html',
  '/manifest.json',
  '/no-connection.html',
  '/images/icon-256.png',
];

const CACHEABLE_URL_PATTERNS = [
  /\/images\/.*\.(png|jpg|svg)$/,
  /\/fonts\.googleapis\.com\//,
  /\/fonts\.gstatic\.com\//,
];

self.addEventListener('install', (installEvent) => {
  installEvent.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(STATIC_ASSETS);
    })
  );
});

self.addEventListener('fetch', (fetchEvent) => {
  if (fetchEvent.request.method !== 'GET') {
    return;
  }

  if (shouldCacheUrl(fetchEvent.request.url)) {
    fetchEvent.respondWith(
      caches.match(fetchEvent.request).then((cachedResponse) => {
        if (cachedResponse) {
          return cachedResponse;
        }
        return fetch(fetchEvent.request).then((networkResponse) => {
          if (networkResponse.status === 200) {
            const clonedResponse = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(fetchEvent.request, clonedResponse);
            });
          }
          return networkResponse;
        });
      }).catch(handleFetchError)
    );
  } else {
    fetchEvent.respondWith(
      fetch(fetchEvent.request).catch(handleFetchError)
    );
  }
});

async function handleFetchError(error) {
  try {
    const cachedResponse = await caches.match('/no-connection.html');
    if (cachedResponse) {
      const body = await cachedResponse.blob();
      return new Response(body, {
        status: 200,
        headers: cachedResponse.headers
      });
    }
  } catch (cacheError) {
    console.error('Cache error:', cacheError);
    return new Response('An error occurred.', {
      status: 503,
      headers: { 'Content-Type': 'text/html' }
    });
  }
}

function shouldCacheUrl(url) {
  const urlPath = new URL(url).pathname;
  return CACHEABLE_URL_PATTERNS.some((pattern) => pattern.test(urlPath));
}
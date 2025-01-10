const CACHE_NAME = 'connect-cache'
const URLS_TO_CACHE = [
  '/index.html',
  '/manifest.json',
  '/offline.html',
]

const CACHE_PATTERNS = [
  /\/images\/.*\.(png|jpg|svg)$/,
  /\/fonts\.googleapis\.com\//,
  /\/fonts\.gstatic\.com\//,
]

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(URLS_TO_CACHE))
  )
})

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') {
    return
  }

  if (shouldCache(event.request.url)) {
    event.respondWith(
      caches.match(event.request).then((response) => {
        if (response) {
          return response
        }
        return fetch(event.request).then((fetchResponse) => {
          if (fetchResponse.status === 200) {
            const responseToCache = fetchResponse.clone()
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(event.request, responseToCache)
            })
          }
          return fetchResponse
        })
      }).catch(handleError))
  } else {
    event.respondWith(
      fetch(event.request).catch(handleError)
    )
  }
})

function handleError(err) {
  if (!navigator.onLine) {
    return caches.match('/offline.html')
  }
  throw err
}

function shouldCache(url) {
  const path = new URL(url).pathname
  return CACHE_PATTERNS.some((pattern) => pattern.test(path))
}

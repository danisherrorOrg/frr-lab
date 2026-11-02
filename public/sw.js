// LFA Lab service worker: keeps the site's files so it works offline after the
// first load (docs/01-requirements.md, DECISIONS.md D61). The build fills in the
// list below (src/offline/precache.ts); in `npm run dev` it isn't registered.

const PRECACHE = self.__PRECACHE__ || {}
const CACHE = 'lfa-lab-' + (PRECACHE.version || 'dev')
const URLS = PRECACHE.urls || []

self.addEventListener('install', (event) => {
  // cache: 'reload' skips the HTTP cache, so the copies match this deploy.
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(URLS.map((url) => new Request(url, { cache: 'reload' }))))
      .then(() => self.skipWaiting()),
  )
})

self.addEventListener('activate', (event) => {
  // Drop older deploys' files; they no longer exist on the server either.
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))),
      )
      .then(() => self.clients.claim()),
  )
})

self.addEventListener('fetch', (event) => {
  const request = event.request
  const url = new URL(request.url)
  if (request.method !== 'GET' || url.origin !== self.location.origin) return

  if (request.mode === 'navigate') {
    // The page: try the network first so a new deploy shows up, else the saved copy.
    // Share links keep their settings after '#', so every page is '/'.
    event.respondWith(
      fetch(request).catch(() =>
        caches.match('/index.html').then((hit) => hit || caches.match('/')),
      ),
    )
    return
  }

  // Built files have a hash in their name, so a saved copy is never out of date.
  event.respondWith(caches.match(request).then((hit) => hit || fetch(request)))
})

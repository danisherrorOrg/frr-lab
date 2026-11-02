// Builds the offline file list for the service worker (DECISIONS.md D61).
// Runs at build time in Node (vite.config.ts), so it stays free of DOM and fs.

/** The text in `public/sw.js` that the build replaces with the real list. */
export const PRECACHE_PLACEHOLDER = 'self.__PRECACHE__ || {}'

/** The site's own files to keep offline: the page itself plus every built file, sorted. */
export function precacheList(files: readonly string[]): string[] {
  const urls = new Set(['/'])
  for (const file of files) {
    // Source maps and the worker script itself aren't needed to run the app.
    if (file.endsWith('.map') || file === 'sw.js') continue
    urls.add('/' + file.replace(/^\/+/, ''))
  }
  return [...urls].sort()
}

/** A short hash of the list, so each deploy gets its own cache name. FNV-1a, 32 bit. */
export function listHash(urls: readonly string[]): string {
  let hash = 0x811c9dc5
  for (const char of urls.join('\n')) {
    hash ^= char.charCodeAt(0)
    hash = Math.imul(hash, 0x01000193) >>> 0
  }
  return hash.toString(16).padStart(8, '0')
}

/** Fills the placeholder in the service worker source. Throws if it is missing. */
export function fillServiceWorker(source: string, files: readonly string[]): string {
  if (!source.includes(PRECACHE_PLACEHOLDER)) {
    throw new Error(`sw.js: placeholder ${PRECACHE_PLACEHOLDER} not found`)
  }
  const urls = precacheList(files)
  const value = JSON.stringify({ version: listHash(urls), urls })
  return source.replace(PRECACHE_PLACEHOLDER, value)
}

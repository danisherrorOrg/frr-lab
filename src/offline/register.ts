// Turns on offline use (DECISIONS.md D61). Only in the built site: in dev the
// service worker would serve stale files and break hot reload.
export function registerServiceWorker(): void {
  if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch((error: unknown) => {
      // Offline use is a bonus; the app works without it.
      console.warn('Service worker not registered:', error)
    })
  })
}

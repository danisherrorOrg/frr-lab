import { readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import type { Plugin } from 'vite'
import { defineConfig } from 'vitest/config'
import { fillServiceWorker } from './src/offline/precache.ts'

// Writes the list of built files into dist/sw.js, so the service worker can keep
// them all offline and each deploy gets a new sw.js (DECISIONS.md D61).
function precacheServiceWorker(): Plugin {
  let outDir = 'dist'
  let publicDir = 'public'
  return {
    name: 'lfa-lab:precache-sw',
    apply: 'build',
    configResolved(config) {
      outDir = config.build.outDir
      publicDir = config.publicDir
    },
    // writeBundle sees the final output, including index.html.
    writeBundle(_options, bundle) {
      const swPath = join(outDir, 'sw.js')
      // Files in public/ are copied as-is, so they aren't in the bundle list.
      const publicFiles = readdirSync(publicDir, { recursive: true, withFileTypes: true })
        .filter((entry) => entry.isFile())
        .map((entry) => join(entry.parentPath, entry.name).slice(publicDir.length + 1))
      const all = [...Object.keys(bundle), ...publicFiles]
      writeFileSync(swPath, fillServiceWorker(readFileSync(swPath, 'utf8'), all))
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss(), precacheServiceWorker()],
  test: {
    include: ['tests/**/*.test.ts', 'tests/**/*.test.tsx'],
    // The engine is pure, so tests run in Node; UI tests can opt into jsdom per file.
    environment: 'node',
  },
})

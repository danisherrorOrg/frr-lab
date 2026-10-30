import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  test: {
    include: ['tests/**/*.test.ts', 'tests/**/*.test.tsx'],
    // The engine is pure, so tests run in Node; UI tests can opt into jsdom per file.
    environment: 'node',
  },
})

// Builds every diagram in docs/excalidraw/src/ into docs/excalidraw/:
// <name>.excalidraw (open in excalidraw.com or the VS Code extension) and
// <name>.svg (preview that GitHub shows). Fails if a layout overlaps.
// Usage: node docs/excalidraw/build.mjs [name-filter]

import { readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { toSvg } from './lib/preview.mjs'

const here = dirname(fileURLToPath(import.meta.url))
const filter = process.argv[2] ?? ''
const files = readdirSync(join(here, 'src'))
  .filter((f) => f.endsWith('.mjs') && f.includes(filter))
  .sort()

for (const f of files) {
  const name = f.replace(/\.mjs$/, '')
  const { default: draw } = await import(join(here, 'src', f))
  const scene = draw()
  const out = join(here, `${name}.excalidraw`)
  scene.save(out)
  writeFileSync(join(here, `${name}.svg`), toSvg(JSON.parse(readFileSync(out, 'utf8'))))
}

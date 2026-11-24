// Renders a .excalidraw file (the element types scene.mjs makes) to a plain
// SVG preview, so the diagrams also show on GitHub. No dependencies.
// Usage: node docs/excalidraw/lib/preview.mjs file.excalidraw [out.svg]

import { readFileSync, writeFileSync } from 'node:fs'

const esc = (s) =>
  String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
const FONT = { 2: 'Helvetica, Arial, sans-serif', 3: "Menlo, Consolas, 'Courier New', monospace" }

export function toSvg(doc) {
  const els = doc.elements.filter((e) => !e.isDeleted)
  let x0 = Infinity,
    y0 = Infinity,
    x1 = -Infinity,
    y1 = -Infinity
  for (const e of els) {
    const pts = e.points
      ? e.points.map(([px, py]) => [e.x + px, e.y + py])
      : [
          [e.x, e.y],
          [e.x + e.width, e.y + e.height],
        ]
    for (const [px, py] of pts) {
      x0 = Math.min(x0, px)
      y0 = Math.min(y0, py)
      x1 = Math.max(x1, px)
      y1 = Math.max(y1, py)
    }
  }
  const pad = 30
  const vb = [x0 - pad, y0 - pad, x1 - x0 + 2 * pad, y1 - y0 + 2 * pad]
  const colors = [...new Set(els.filter((e) => e.type === 'arrow').map((e) => e.strokeColor))]
  const out = [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vb.join(' ')}" width="${vb[2]}" height="${vb[3]}">`,
    '<defs>',
  ]
  colors.forEach((c, i) =>
    out.push(
      `<marker id="ah${i}" markerWidth="10" markerHeight="8" refX="9" refY="4" orient="auto-start-reverse" markerUnits="userSpaceOnUse"><path d="M0,0 L10,4 L0,8 z" fill="${c}"/></marker>`,
    ),
  )
  out.push(
    '</defs>',
    `<rect x="${vb[0]}" y="${vb[1]}" width="${vb[2]}" height="${vb[3]}" fill="${doc.appState?.viewBackgroundColor ?? '#fff'}"/>`,
  )
  for (const e of els) {
    const st = `stroke="${e.strokeColor}" stroke-width="${e.strokeWidth}"${e.strokeStyle === 'dashed' ? ' stroke-dasharray="10 7"' : ''}`
    const fill = e.backgroundColor === 'transparent' ? 'none' : e.backgroundColor
    if (e.type === 'rectangle') {
      const r = e.roundness ? Math.min(16, e.width / 4, e.height / 4) : 0
      out.push(
        `<rect x="${e.x}" y="${e.y}" width="${e.width}" height="${e.height}" rx="${r}" fill="${fill}" ${st}/>`,
      )
    } else if (e.type === 'ellipse') {
      out.push(
        `<ellipse cx="${e.x + e.width / 2}" cy="${e.y + e.height / 2}" rx="${e.width / 2}" ry="${e.height / 2}" fill="${fill}" ${st}/>`,
      )
    } else if (e.type === 'line' || e.type === 'arrow') {
      const pts = e.points.map(([px, py]) => `${e.x + px},${e.y + py}`).join(' ')
      const i = colors.indexOf(e.strokeColor)
      const m =
        (e.endArrowhead ? ` marker-end="url(#ah${i})"` : '') +
        (e.startArrowhead ? ` marker-start="url(#ah${i})"` : '')
      out.push(`<polyline points="${pts}" fill="none" ${st} stroke-linecap="round"${m}/>`)
    } else if (e.type === 'text') {
      const lh = e.fontSize * (e.lineHeight ?? 1.25)
      const anchor = e.textAlign === 'center' ? 'middle' : e.textAlign === 'right' ? 'end' : 'start'
      const ax =
        e.textAlign === 'center' ? e.x + e.width / 2 : e.textAlign === 'right' ? e.x + e.width : e.x
      const spans = e.text
        .split('\n')
        .map(
          (l, i) =>
            `<tspan x="${ax}" y="${e.y + e.fontSize * 0.95 + i * lh}">${esc(l) || ' '}</tspan>`,
        )
        .join('')
      out.push(
        `<text font-family="${FONT[e.fontFamily] ?? FONT[2]}" font-size="${e.fontSize}" fill="${e.strokeColor}" text-anchor="${anchor}" xml:space="preserve">${spans}</text>`,
      )
    }
  }
  out.push('</svg>')
  return out.join('\n') + '\n'
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const src = process.argv[2]
  const dst = process.argv[3] ?? src.replace(/\.excalidraw$/, '.svg')
  writeFileSync(dst, toSvg(JSON.parse(readFileSync(src, 'utf8'))))
  console.log(`✓ ${dst}`)
}

// Export the diagram as an image for slides and docs (D49). PNG comes from Cytoscape
// itself; SVG is written here from each element's computed style, because Cytoscape
// has no SVG export and the extension for it would be a new dependency. Both show
// what is on screen: highlighted paths, failures, heat map and all.
import type cytoscape from 'cytoscape'

/** Slides and docs are usually light, so the image has a white background in both themes. */
export const EXPORT_BACKGROUND = '#ffffff'
/** Space around the drawing, in diagram pixels. */
const MARGIN = 40
/** Distance between parallel links at their middle; close to Cytoscape's bezier step (40). */
const PARALLEL_STEP = 40

type El = cytoscape.NodeSingular | cytoscape.EdgeSingular

// pstyle() (the computed style) isn't in Cytoscape's TypeScript types.
interface Parsed {
  value: unknown
  pfValue?: unknown
  strValue: string
}
const ps = (el: El, prop: string) => (el as unknown as { pstyle(p: string): Parsed }).pstyle(prop)
const str = (el: El, prop: string) => ps(el, prop).strValue
const num = (el: El, prop: string) => {
  const p = ps(el, prop)
  return Number(p.pfValue ?? p.value) || 0
}

const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

/** Rounded to 0.1 px: enough for a drawing, and keeps the file small. */
const r = (n: number) => Math.round(n * 10) / 10

type Pt = { x: number; y: number }

/** A point on the quadratic curve p0 → p2 with control c, at t. */
function onCurve(p0: Pt, c: Pt, p2: Pt, t: number): Pt {
  const u = 1 - t
  return {
    x: u * u * p0.x + 2 * u * t * c.x + t * t * p2.x,
    y: u * u * p0.y + 2 * u * t * c.y + t * t * p2.y,
  }
}

/** Point at `dist` px from p0 along the straight line to p1. */
function along(p0: Pt, p1: Pt, dist: number): Pt {
  const len = Math.hypot(p1.x - p0.x, p1.y - p0.y) || 1
  return { x: p0.x + ((p1.x - p0.x) * dist) / len, y: p0.y + ((p1.y - p0.y) * dist) / len }
}

/** Dash pattern for an SVG stroke, from Cytoscape's line or border style. */
function dashes(style: string, width: number, pattern?: string): string {
  if (style === 'dashed') return pattern && pattern !== '' ? pattern : `${width * 3} ${width * 1.5}`
  if (style === 'dotted') return `${width} ${width * 1.5}`
  return ''
}

/** Rough text width: Cytoscape measures on a canvas, the SVG viewer will too, so this only sizes boxes. */
const textWidth = (line: string, size: number, mono: boolean) =>
  [...line].length * size * (mono ? 0.62 : 0.58)

/** One block of text (lines centred on x, y), with the label background box when it has one. */
function textBlock(el: El, text: string, at: Pt): string {
  if (text === '') return ''
  const lines = text.split('\n')
  const size = num(el, 'font-size')
  const family = str(el, 'font-family')
  const mono = /mono/i.test(family)
  const lineHeight = size * 1.2
  const top = at.y - (lineHeight * lines.length) / 2
  const out: string[] = []
  const bgOpacity = num(el, 'text-background-opacity')
  const borderWidth = num(el, 'text-border-width')
  if (bgOpacity > 0 || borderWidth > 0) {
    const pad = num(el, 'text-background-padding') || 2
    const w = Math.max(...lines.map((l) => textWidth(l, size, mono))) + 2 * pad
    const h = lineHeight * lines.length + 2 * pad
    const round = str(el, 'text-background-shape').startsWith('round') ? 4 : 0
    const stroke =
      borderWidth > 0
        ? ` stroke="${str(el, 'text-border-color')}" stroke-width="${borderWidth}" stroke-opacity="${num(el, 'text-border-opacity')}"`
        : ''
    out.push(
      `<rect x="${r(at.x - w / 2)}" y="${r(top - pad)}" width="${r(w)}" height="${r(h)}" rx="${round}" fill="${str(el, 'text-background-color')}" fill-opacity="${bgOpacity}"${stroke}/>`,
    )
  }
  const tspans = lines
    .map((l, i) => `<tspan x="${r(at.x)}" y="${r(top + lineHeight * (i + 0.5))}">${esc(l)}</tspan>`)
    .join('')
  out.push(
    `<text font-family="${esc(family)}" font-size="${size}" font-weight="${str(el, 'font-weight')}" fill="${str(el, 'color')}" text-anchor="middle" dominant-baseline="central">${tspans}</text>`,
  )
  return out.join('')
}

/** Points of a regular octagon (the overload shape, D47) around a centre. */
function octagon(c: Pt, rad: number): string {
  return Array.from({ length: 8 }, (_, i) => {
    const a = (Math.PI / 4) * i + Math.PI / 8
    return `${r(c.x + rad * Math.cos(a))},${r(c.y + rad * Math.sin(a))}`
  }).join(' ')
}

/** The router's outline at radius `rad`, with the given paint. */
function shapeAt(node: cytoscape.NodeSingular, c: Pt, rad: number, paint: string): string {
  return str(node, 'shape') === 'octagon'
    ? `<polygon points="${octagon(c, rad)}" ${paint}/>`
    : `<circle cx="${r(c.x)}" cy="${r(c.y)}" r="${r(rad)}" ${paint}/>`
}

/** Mid-line arrow (triangle or chevron) at `at`, pointing along `dir`. */
function arrow(at: Pt, dir: Pt, shape: string, color: string, width: number): string {
  const len = Math.hypot(dir.x, dir.y) || 1
  const [ux, uy] = [dir.x / len, dir.y / len]
  const size = 6 + width * 1.2
  const tip = { x: at.x + ux * size * 0.6, y: at.y + uy * size * 0.6 }
  const back = { x: at.x - ux * size * 0.6, y: at.y - uy * size * 0.6 }
  const left = { x: back.x - uy * size * 0.6, y: back.y + ux * size * 0.6 }
  const right = { x: back.x + uy * size * 0.6, y: back.y - ux * size * 0.6 }
  const pts = (p: Pt[]) => p.map((q) => `${r(q.x)},${r(q.y)}`).join(' ')
  return shape === 'chevron'
    ? `<polyline points="${pts([left, tip, right])}" fill="none" stroke="${color}" stroke-width="${Math.max(2, width / 2)}" stroke-linecap="round" stroke-linejoin="round"/>`
    : `<polygon points="${pts([left, tip, right])}" fill="${color}"/>`
}

/**
 * The diagram as a standalone SVG file. Positions are the routers' diagram
 * positions (not the current zoom), so the whole network is always in the picture.
 */
export function diagramSvg(cy: cytoscape.Core, title = 'LFA Lab diagram'): string {
  const nodes = cy.nodes()
  if (nodes.length === 0)
    return `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="100" viewBox="0 0 200 100"><title>${esc(title)}</title><rect width="200" height="100" fill="${EXPORT_BACKGROUND}"/></svg>\n`

  const defs: string[] = []
  const under: string[] = []
  const lines: string[] = []
  const edgeText: string[] = []
  const nodeParts: string[] = []
  const pos = (n: cytoscape.NodeSingular): Pt => n.position()

  // Parallel links (D29) are drawn as curves, spread on both sides of the straight line.
  const bundles = new Map<string, string[]>()
  cy.edges().forEach((e) => {
    const [a, b] = [e.source().id(), e.target().id()].sort()
    const key = `${a}|${b}`
    bundles.set(key, [...(bundles.get(key) ?? []), e.id()])
  })

  cy.edges().forEach((e) => {
    const s = pos(e.source())
    const t = pos(e.target())
    const [a] = [e.source().id(), e.target().id()].sort()
    const bundle = bundles.get([e.source().id(), e.target().id()].sort().join('|'))!
    const k = bundle.indexOf(e.id()) - (bundle.length - 1) / 2
    // Same side for the whole bundle, whichever way each link was written.
    const flip = e.source().id() === a ? 1 : -1
    const len = Math.hypot(t.x - s.x, t.y - s.y) || 1
    const normal = { x: -(t.y - s.y) / len, y: (t.x - s.x) / len }
    // The control point is twice the wanted offset at the middle of a quadratic curve.
    const off = k * PARALLEL_STEP * flip * 2
    const c = { x: (s.x + t.x) / 2 + normal.x * off, y: (s.y + t.y) / 2 + normal.y * off }
    const d =
      k === 0
        ? `M${r(s.x)},${r(s.y)} L${r(t.x)},${r(t.y)}`
        : `M${r(s.x)},${r(s.y)} Q${r(c.x)},${r(c.y)} ${r(t.x)},${r(t.y)}`

    const width = num(e, 'width')
    const halo = num(e, 'underlay-opacity')
    if (halo > 0) {
      const pad = num(e, 'underlay-padding')
      under.push(
        `<path d="${d}" fill="none" stroke="${str(e, 'underlay-color')}" stroke-opacity="${halo}" stroke-width="${width + 2 * pad}" stroke-linecap="round"/>`,
      )
    }
    const dash = dashes(str(e, 'line-style'), width, str(e, 'line-dash-pattern'))
    lines.push(
      `<path d="${d}" fill="none" stroke="${str(e, 'line-color')}" stroke-width="${width}"${dash ? ` stroke-dasharray="${dash}"` : ''}><title>${esc(e.id())}</title></path>`,
    )

    const mid = onCurve(s, c, t, 0.5)
    const dir = { x: t.x - s.x, y: t.y - s.y }
    for (const [prop, sign] of [
      ['mid-target-arrow', 1],
      ['mid-source-arrow', -1],
    ] as const) {
      const shape = str(e, `${prop}-shape`)
      if (shape !== 'none')
        lines.push(
          arrow(mid, { x: dir.x * sign, y: dir.y * sign }, shape, str(e, `${prop}-color`), width),
        )
    }

    edgeText.push(textBlock(e, str(e, 'label'), mid))
    // End labels: the metric leaving each end, a fixed distance from the router (D30).
    const curveStart = k === 0 ? t : c
    const curveEnd = k === 0 ? s : c
    edgeText.push(
      textBlock(e, str(e, 'source-label'), along(s, curveStart, num(e, 'source-text-offset'))),
    )
    edgeText.push(
      textBlock(e, str(e, 'target-label'), along(t, curveEnd, num(e, 'target-text-offset'))),
    )
  })

  let gradients = 0
  nodes.forEach((n) => {
    const c = pos(n)
    const rad = num(n, 'width') / 2
    const opacity = num(n, 'opacity')
    const parts: string[] = []

    const ring = num(n, 'underlay-opacity')
    if (ring > 0)
      parts.push(
        `<circle cx="${r(c.x)}" cy="${r(c.y)}" r="${r(rad + num(n, 'underlay-padding'))}" fill="${str(n, 'underlay-color')}" fill-opacity="${ring}"/>`,
      )

    let fill = str(n, 'background-color')
    if (str(n, 'background-fill') === 'linear-gradient') {
      // P and Q space together (canvas.ts): left half P, right half Q.
      const stops = (ps(n, 'background-gradient-stop-colors').value as number[][]).map(
        (rgb) => `rgb(${rgb.join(',')})`,
      )
      const id = `g${gradients++}`
      defs.push(
        `<linearGradient id="${id}" x1="0" y1="0" x2="1" y2="0">${stops
          .map(
            (col, i) =>
              `<stop offset="${stops.length > 1 ? i / (stops.length - 1) : 0}" stop-color="${col}"/>`,
          )
          .join('')}</linearGradient>`,
      )
      fill = `url(#${id})`
    }
    const bw = num(n, 'border-width')
    const borderStyle = str(n, 'border-style')
    const dash = dashes(borderStyle, bw)
    const stroke = `stroke="${str(n, 'border-color')}" stroke-width="${borderStyle === 'double' ? bw / 3 : bw}"${dash ? ` stroke-dasharray="${dash}"` : ''}`
    parts.push(
      shapeAt(n, c, rad, `fill="${fill}" fill-opacity="${num(n, 'background-opacity')}" ${stroke}`),
    )
    if (borderStyle === 'double')
      parts.push(shapeAt(n, c, rad - (bw * 2) / 3, `fill="none" ${stroke}`))

    const glow = num(n, 'overlay-opacity')
    if (glow > 0)
      parts.push(
        `<circle cx="${r(c.x)}" cy="${r(c.y)}" r="${r(rad + num(n, 'overlay-padding'))}" fill="${str(n, 'overlay-color')}" fill-opacity="${glow}"/>`,
      )
    parts.push(textBlock(n, str(n, 'label'), c))
    nodeParts.push(
      `<g${opacity < 1 ? ` opacity="${opacity}"` : ''}><title>${esc(n.id())}</title>${parts.join('')}</g>`,
    )
  })

  // Box: routers with their rings, plus every edge label (labels can stick out).
  const pts = nodes.map((n) => {
    const p = pos(n)
    const pad = num(n, 'width') / 2 + Math.max(num(n, 'underlay-padding'), 0)
    return [p.x - pad, p.y - pad, p.x + pad, p.y + pad] as const
  })
  const minX = Math.min(...pts.map((p) => p[0])) - MARGIN
  const minY = Math.min(...pts.map((p) => p[1])) - MARGIN
  const w = Math.max(...pts.map((p) => p[2])) + MARGIN - minX
  const h = Math.max(...pts.map((p) => p[3])) + MARGIN - minY
  const box = `${r(minX)} ${r(minY)} ${r(w)} ${r(h)}`

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${Math.ceil(w)}" height="${Math.ceil(h)}" viewBox="${box}">`,
    `<title>${esc(title)}</title>`,
    defs.length > 0 ? `<defs>${defs.join('')}</defs>` : '',
    `<rect x="${r(minX)}" y="${r(minY)}" width="${r(w)}" height="${r(h)}" fill="${EXPORT_BACKGROUND}"/>`,
    `<g>${under.join('')}</g>`,
    `<g>${lines.join('')}</g>`,
    `<g>${nodeParts.join('')}</g>`,
    `<g>${edgeText.join('')}</g>`,
    '</svg>',
    '',
  ].join('\n')
}

/** The whole diagram as a PNG at twice screen resolution, sharp on slides. */
export function diagramPng(cy: cytoscape.Core): Blob {
  return cy.png({ output: 'blob', full: true, scale: 2, bg: EXPORT_BACKGROUND })
}

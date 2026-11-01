// Diagrams for the Learn guide (docs/learn/, D60). Pure: a topology and a few
// highlights in, an SVG string out. The highlights come from the engine, so a
// picture in the guide can't disagree with what the app shows for that example.
import { computeForSource } from '../engine/index'
import { hopLinks, protectionPaths, shortestPath } from '../engine/paths'
import { allPairs } from '../engine/spf'
import type { Link, NodeId, Protection, Segment, Topology } from '../engine/types'

export type PathKind = 'primary' | 'lfa' | 'rlfa' | 'tilfa'
export type SpaceKind = 'p' | 'extp' | 'q'

export interface DiagramSpec {
  /** File name in docs/learn/img/, e.g. `ring5-rlfa.svg`. */
  file: string
  /** Built-in example key (src/state/examples.ts). */
  example: string
  /** Short text for screen readers and the image's alt text. */
  alt: string
  /** Change the example before drawing (e.g. turn node protection off). */
  edit?: (t: Topology) => Topology
  /** The (S, D, protected link S–E) row the paths and spaces are taken from. */
  row?: { source: NodeId; dest: NodeId; via: NodeId }
  paths?: PathKind[]
  /** Shade P-space (plain or extended) and Q-space of the row's protected link. */
  spaces?: SpaceKind[]
  /** Star the chosen PQ node. */
  pq?: boolean
  /** Tag the TI-LFA segment ends with their labels. */
  segments?: boolean
  /** A normal shortest path X → Y, drawn in purple, with its legend text. */
  extra?: { from: NodeId; to: NodeId; label: string }[]
  failLinks?: string[]
  failNodes?: NodeId[]
  /** Write dist(root, X) under every router. */
  distFrom?: NodeId
}

interface Pt {
  x: number
  y: number
}

const R = 18
const PAD = 48
const COLOR = {
  text: '#0f172a',
  muted: '#475569',
  link: '#94a3b8',
  node: '#e2e8f0',
  border: '#475569',
  p: '#bfdbfe',
  q: '#bbf7d0',
  pq: '#a16207',
  source: '#1d4ed8',
  dest: '#c2410c',
  failed: '#dc2626',
  extra: '#7c3aed',
  tag: '#fef3c7',
  tagBorder: '#d97706',
}
// The app's colours (src/ui/canvas.ts) where it has one: primary blue, backup orange,
// final path green. TI-LFA's repair is the final path (RFC 9855 §3), so it is green.
const PATH_STYLE: Record<PathKind, { color: string; dash: string; label: string }> = {
  primary: { color: '#2563eb', dash: '', label: 'Primary path' },
  lfa: { color: '#ea580c', dash: '9 5', label: 'LFA backup' },
  rlfa: { color: '#a16207', dash: '14 5', label: 'Remote LFA backup' },
  tilfa: { color: '#16a34a', dash: '4 4', label: 'TI-LFA backup' },
}

const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
const n1 = (v: number) => Math.round(v * 10) / 10

/** The protection of one results-table row, or undefined if S has no such row. */
export function rowProtection(
  t: Topology,
  source: NodeId,
  dest: NodeId,
  via: NodeId,
): Protection | undefined {
  const d = computeForSource(t, source).find((r) => r.dest === dest)
  return d?.protections.find((p) => p.protectedLink.to === via)
}

/** Each link's shape: straight, bowed (parallel links) or through its LAN's pseudonode. */
function geometry(t: Topology, at: Map<NodeId, Pt>) {
  const lanPos = new Map<string, Pt>()
  for (const lan of t.lans ?? []) {
    const ps = lan.members.map((m) => at.get(m.node)!)
    lanPos.set(lan.id, {
      x: ps.reduce((s, p) => s + p.x, 0) / ps.length,
      y: ps.reduce((s, p) => s + p.y, 0) / ps.length,
    })
  }
  const bundles = new Map<string, Link[]>()
  for (const l of t.links) {
    if (l.lan !== undefined) continue
    const key = [l.a, l.b].sort().join('|')
    bundles.set(key, [...(bundles.get(key) ?? []), l])
  }
  const shape = new Map<string, Pt[]>()
  for (const links of bundles.values()) {
    links.forEach((l, i) => {
      const a = at.get(l.a)!
      const b = at.get(l.b)!
      const bow = (i - (links.length - 1) / 2) * 40
      if (bow === 0) {
        shape.set(l.id, [a, b])
        return
      }
      // A quadratic curve, sampled, so paths can follow it like a straight link.
      const len = Math.hypot(b.x - a.x, b.y - a.y) || 1
      const c = {
        x: (a.x + b.x) / 2 + (-(b.y - a.y) / len) * bow,
        y: (a.y + b.y) / 2 + ((b.x - a.x) / len) * bow,
      }
      const pts: Pt[] = []
      for (let k = 0; k <= 16; k++) {
        const u = k / 16
        pts.push({
          x: (1 - u) * (1 - u) * a.x + 2 * (1 - u) * u * c.x + u * u * b.x,
          y: (1 - u) * (1 - u) * a.y + 2 * (1 - u) * u * c.y + u * u * b.y,
        })
      }
      shape.set(l.id, pts)
    })
  }
  for (const l of t.links) {
    if (l.lan === undefined) continue
    shape.set(l.id, [at.get(l.a)!, lanPos.get(l.lan)!, at.get(l.b)!])
  }
  return { shape, lanPos }
}

const midpoint = (pts: Pt[]): Pt => {
  if (pts.length === 2) return { x: (pts[0]!.x + pts[1]!.x) / 2, y: (pts[0]!.y + pts[1]!.y) / 2 }
  return pts[Math.floor(pts.length / 2)]!
}
const polyline = (pts: Pt[]) => pts.map((p) => `${n1(p.x)},${n1(p.y)}`).join(' ')

/** The points of one hop x → y over `link`, moved sideways by `shift` px. */
function hopPoints(shape: Pt[], fromA: boolean, shift: number): Pt[] {
  const pts = fromA ? shape : [...shape].reverse()
  const a = pts[0]!
  const b = pts[pts.length - 1]!
  const len = Math.hypot(b.x - a.x, b.y - a.y) || 1
  const nx = -(b.y - a.y) / len
  const ny = (b.x - a.x) / len
  return pts.map((p) => ({ x: p.x + nx * shift, y: p.y + ny * shift }))
}

/** Cut `r` px off both ends, so a path starts and ends at the circles, not their centres. */
function trim(pts: Pt[], r: number): Pt[] {
  if (pts.length < 2) return pts
  const out = [...pts]
  const cut = (i: number, j: number) => {
    const p = out[i]!
    const q = out[j]!
    const len = Math.hypot(q.x - p.x, q.y - p.y) || 1
    const k = Math.min(r, len / 2) / len
    out[i] = { x: p.x + (q.x - p.x) * k, y: p.y + (q.y - p.y) * k }
  }
  cut(0, 1)
  cut(out.length - 1, out.length - 2)
  return out
}

function metricText(l: Link): string {
  return l.metricAB === l.metricBA ? String(l.metricAB) : `${l.metricAB} / ${l.metricBA}`
}

function tag(p: Pt, text: string, fill: string, stroke: string, color = COLOR.text): string {
  const w = text.length * 7 + 8
  return (
    `<rect x="${n1(p.x - w / 2)}" y="${n1(p.y - 9)}" width="${w}" height="18" rx="4" fill="${fill}" stroke="${stroke}"/>` +
    `<text x="${n1(p.x)}" y="${n1(p.y + 4)}" text-anchor="middle" font-size="12" fill="${color}">${esc(text)}</text>`
  )
}

/** The SVG for one guide diagram. Same spec in, same text out. */
export function renderDiagram(base: Topology, spec: DiagramSpec): string {
  const t = spec.edit ? spec.edit(base) : base
  const raw = new Map(t.nodes.map((n, i) => [n.id, n.pos ?? { x: i * 120, y: 0 }]))

  // Fit the drawing into about 560 px wide, keeping the example's own layout.
  const xs = [...raw.values()].map((p) => p.x)
  const ys = [...raw.values()].map((p) => p.y)
  const [minX, maxX, minY, maxY] = [
    Math.min(...xs),
    Math.max(...xs),
    Math.min(...ys),
    Math.max(...ys),
  ]
  const scale = Math.min(1.4, 520 / Math.max(maxX - minX, 1), 300 / Math.max(maxY - minY, 1))
  const at = new Map<NodeId, Pt>()
  for (const [id, p] of raw)
    at.set(id, { x: PAD + (p.x - minX) * scale, y: PAD + 20 + (p.y - minY) * scale })
  const width = Math.max(PAD * 2 + (maxX - minX) * scale, 420)
  const drawH = PAD * 2 + 20 + (maxY - minY) * scale

  const { shape, lanPos } = geometry(t, at)
  const failedLinks = new Set(spec.failLinks ?? [])
  const failedNodes = new Set(spec.failNodes ?? [])
  const prot = spec.row && rowProtection(t, spec.row.source, spec.row.dest, spec.row.via)
  if (spec.row && !prot)
    throw new Error(
      `${spec.file}: no row ${spec.row.source} → ${spec.row.dest} via ${spec.row.via}`,
    )

  const legend: Swatch[] = []
  const parts: string[] = []
  const used = new Set<string>()

  // Links.
  for (const l of t.links) {
    const pts = shape.get(l.id)!
    const failed = failedLinks.has(l.id)
    if (l.lan === undefined) {
      parts.push(
        `<polyline points="${polyline(pts)}" fill="none" stroke="${failed ? COLOR.failed : COLOR.link}" stroke-width="${failed ? 3 : 2.5}"${failed ? ' stroke-dasharray="3 4"' : ''}/>`,
      )
    }
  }
  for (const lan of t.lans ?? []) {
    const c = lanPos.get(lan.id)!
    for (const m of lan.members) {
      const p = at.get(m.node)!
      parts.push(
        `<line x1="${n1(p.x)}" y1="${n1(p.y)}" x2="${n1(c.x)}" y2="${n1(c.y)}" stroke="${COLOR.link}" stroke-width="2.5"/>`,
      )
    }
  }

  // Paths, each moved sideways a little so two paths on one link both show.
  const pathKinds = spec.paths ?? []
  if (prot && spec.row) {
    const paths = protectionPaths(t, spec.row.source, spec.row.dest, prot)
    const first: Record<PathKind, string | undefined> = {
      primary: prot.protectedLink.id,
      lfa: prot.lfa.bestLink,
      rlfa: undefined,
      tilfa: prot.tilfa.outLink,
    }
    pathKinds.forEach((kind, i) => {
      const nodes = paths[kind]
      if (!nodes) throw new Error(`${spec.file}: no ${kind} path for this row`)
      const shift = (i - (pathKinds.length - 1) / 2) * 6
      const links = hopLinks(t, nodes, { first: first[kind] })
      const style = PATH_STYLE[kind]
      parts.push(drawPath(t, nodes, links, shape, shift, style.color, style.dash, kind))
      legend.push(lineSwatch(style.color, style.dash, style.label))
    })
  }
  if (spec.extra) {
    const table = allPairs(t)
    for (const e of spec.extra) {
      const nodes = shortestPath(table, e.from, e.to)
      if (!nodes) throw new Error(`${spec.file}: no path ${e.from} → ${e.to}`)
      parts.push(drawPath(t, nodes, hopLinks(t, nodes), shape, -6, COLOR.extra, '2 4', 'extra'))
      legend.push(lineSwatch(COLOR.extra, '2 4', e.label))
    }
  }

  // Metrics on top of the paths, so they stay readable.
  for (const l of t.links) {
    if (l.lan !== undefined) continue
    const m = midpoint(shape.get(l.id)!)
    parts.push(tag(m, metricText(l), '#ffffff', 'none', COLOR.muted))
    if (failedLinks.has(l.id)) {
      parts.push(
        `<text x="${n1(m.x)}" y="${n1(m.y - 14)}" text-anchor="middle" font-size="18" font-weight="bold" fill="${COLOR.failed}">✕</text>`,
      )
      used.add('failed-link')
    }
  }
  for (const lan of t.lans ?? []) {
    const c = lanPos.get(lan.id)!
    parts.push(
      `<rect x="${n1(c.x - 9)}" y="${n1(c.y - 9)}" width="18" height="18" fill="#64748b"/>`,
      tag({ x: c.x, y: c.y + 22 }, `${lan.id}`, '#ffffff', 'none', COLOR.muted),
    )
    for (const m of lan.members) {
      const p = at.get(m.node)!
      parts.push(
        tag(
          { x: p.x + (c.x - p.x) * 0.45, y: p.y + (c.y - p.y) * 0.45 },
          String(m.metric),
          '#ffffff',
          'none',
          COLOR.muted,
        ),
      )
    }
    used.add('lan')
  }

  // Segment tags for TI-LFA: where each segment ends, and its label.
  if (spec.segments && prot?.tilfa.segments) {
    const labels = prot.tilfa.labelStack ?? []
    prot.tilfa.segments.forEach((seg: Segment, i) => {
      const label = labels[i] ?? seg.label
      if (seg.kind === 'prefix') {
        const p = at.get(seg.node)!
        // Below a router in the top half, above one in the bottom half: never on the legend.
        const below = p.y < drawH / 2
        const y = below ? p.y + R + 30 : p.y - R - 16
        parts.push(tag({ x: p.x, y }, `Prefix ${label}`, COLOR.tag, COLOR.tagBorder))
      } else {
        const m = midpoint(shape.get(seg.link)!)
        parts.push(tag({ x: m.x, y: m.y + 22 }, `Adj ${label}`, COLOR.tag, COLOR.tagBorder))
      }
    })
    used.add('segments')
  }

  // Routers.
  const spaces = new Set(spec.spaces ?? [])
  const pSet = new Set(
    prot && spaces.has('extp')
      ? prot.rlfa.extPSpace
      : prot && spaces.has('p')
        ? prot.rlfa.pSpace
        : [],
  )
  const qSet = new Set(prot && spaces.has('q') ? prot.rlfa.qSpace : [])
  const pq = spec.pq && prot?.rlfa.needed ? prot.rlfa.best : undefined
  const dists = spec.distFrom ? allPairs(t).from.get(spec.distFrom)?.dist : undefined
  for (const n of t.nodes) {
    const p = at.get(n.id)!
    const failed = failedNodes.has(n.id)
    const inP = pSet.has(n.id)
    const inQ = qSet.has(n.id)
    const fill = failed
      ? '#cbd5e1'
      : inP && inQ
        ? 'url(#pq-both)'
        : inP
          ? COLOR.p
          : inQ
            ? COLOR.q
            : COLOR.node
    if (inP && inQ) used.add('both')
    else if (inP) used.add('p')
    else if (inQ) used.add('q')
    let stroke = COLOR.border
    let sw = 2
    if (spec.row?.source === n.id) {
      stroke = COLOR.source
      sw = 4
    } else if (spec.row?.dest === n.id) {
      stroke = COLOR.dest
      sw = 4
    }
    if (failed) {
      stroke = COLOR.failed
      used.add('failed-node')
    }
    if (pq === n.id) {
      stroke = COLOR.pq
      sw = 4
    }
    parts.push(
      `<circle cx="${n1(p.x)}" cy="${n1(p.y)}" r="${R}" fill="${fill}" stroke="${stroke}" stroke-width="${sw}"${failed ? ' stroke-dasharray="4 3"' : ''}/>`,
      `<text x="${n1(p.x)}" y="${n1(p.y + 5)}" text-anchor="middle" font-size="${n.id.length > 2 ? 11 : 14}" font-weight="bold" fill="${failed ? '#64748b' : COLOR.text}">${esc(n.id)}</text>`,
    )
    if (failed)
      parts.push(
        `<text x="${n1(p.x + R)}" y="${n1(p.y - R + 4)}" font-size="18" font-weight="bold" fill="${COLOR.failed}">✕</text>`,
      )
    if (pq === n.id) {
      parts.push(
        `<text x="${n1(p.x)}" y="${n1(p.y - R - 6)}" text-anchor="middle" font-size="18" fill="${COLOR.pq}">★</text>`,
      )
      used.add('pq')
    }
    const d = dists?.get(n.id)
    if (d !== undefined)
      parts.push(tag({ x: p.x, y: p.y - R - 14 }, `${d}`, '#eef2ff', '#6366f1', '#3730a3'))
  }
  if (spec.distFrom) used.add('dist')
  if (spec.row) {
    used.add('source')
    if (spec.row.dest !== spec.row.source) used.add('dest')
  }

  // Legend: one row per item, under the drawing.
  const items: Swatch[] = [...legend]
  if (used.has('source')) items.push(ringSwatch(COLOR.source, `Source ${spec.row!.source}`))
  if (used.has('dest')) items.push(ringSwatch(COLOR.dest, `Destination ${spec.row!.dest}`))
  if (used.has('p'))
    items.push(dotSwatch(COLOR.p, spaces.has('extp') ? 'Extended P-space' : 'P-space'))
  if (used.has('q')) items.push(dotSwatch(COLOR.q, 'Q-space'))
  if (used.has('both')) items.push(dotSwatch('url(#pq-both)', 'In P and Q: a PQ node'))
  if (used.has('pq')) items.push(textSwatch('★', COLOR.pq, 'Chosen PQ node'))
  if (used.has('segments')) items.push(boxSwatch('Segment end and its label'))
  if (used.has('dist'))
    items.push(boxSwatch(`dist(${spec.distFrom}, router)`, '#eef2ff', '#6366f1'))
  if (used.has('failed-link') || used.has('failed-node'))
    items.push(lineSwatch(COLOR.failed, '3 4', 'Failed'))
  if (used.has('lan')) items.push(squareSwatch('LAN pseudonode'))

  // Flow the items left to right, wrapping by their text width.
  let x = 16
  let row = 0
  const placed: string[] = []
  for (const item of items) {
    const w = 44 + item.text.length * 6.8
    if (x > 16 && x + w > width - 8) {
      x = 16
      row++
    }
    placed.push(`<g transform="translate(${n1(x)},${n1(drawH + 4 + row * 24)})">${item.svg}</g>`)
    x += w + 12
  }
  const height = drawH + (items.length > 0 ? (row + 1) * 24 + 12 : 0)
  const legendSvg = placed.join('')

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${n1(width)} ${n1(height)}" width="${n1(width)}" height="${n1(height)}" role="img" aria-label="${esc(spec.alt)}" font-family="system-ui, -apple-system, Segoe UI, Roboto, sans-serif">`,
    `<title>${esc(spec.alt)}</title>`,
    `<defs><linearGradient id="pq-both" x1="0" x2="1" y1="0" y2="0"><stop offset="50%" stop-color="${COLOR.p}"/><stop offset="50%" stop-color="${COLOR.q}"/></linearGradient>`,
    ...Object.entries({ ...PATH_STYLE, extra: { color: COLOR.extra } }).map(
      ([k, s]) =>
        `<marker id="arrow-${k}" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="${s.color}"/></marker>`,
    ),
    `</defs>`,
    `<rect width="100%" height="100%" fill="#ffffff"/>`,
    ...parts,
    legendSvg,
    `</svg>`,
    '',
  ].join('\n')
}

function drawPath(
  t: Topology,
  nodes: NodeId[],
  links: (string | undefined)[],
  shape: Map<string, Pt[]>,
  shift: number,
  color: string,
  dash: string,
  marker: string,
): string {
  const pts: Pt[] = []
  for (let i = 0; i + 1 < nodes.length; i++) {
    const id = links[i]
    const link = t.links.find((l) => l.id === id)
    if (!link) throw new Error(`No link for hop ${nodes[i]} → ${nodes[i + 1]}`)
    const hop = hopPoints(shape.get(link.id)!, link.a === nodes[i], shift)
    pts.push(...(i === 0 ? hop : hop.slice(1)))
  }
  return `<polyline points="${polyline(trim(pts, R + 2))}" fill="none" stroke="${color}" stroke-width="4" stroke-linejoin="round" stroke-linecap="round"${dash ? ` stroke-dasharray="${dash}"` : ''} marker-end="url(#arrow-${marker})" opacity="0.9"/>`
}

interface Swatch {
  svg: string
  text: string
}
const label = (x: number, text: string) =>
  `<text x="${x}" y="13" font-size="12" fill="${COLOR.text}">${esc(text)}</text>`
const sw = (shape: string, text: string): Swatch => ({ svg: shape + label(36, text), text })
const lineSwatch = (color: string, dash: string, text: string) =>
  sw(
    `<line x1="0" y1="9" x2="28" y2="9" stroke="${color}" stroke-width="4"${dash ? ` stroke-dasharray="${dash}"` : ''}/>`,
    text,
  )
const ringSwatch = (color: string, text: string) =>
  sw(`<circle cx="14" cy="9" r="7" fill="${COLOR.node}" stroke="${color}" stroke-width="3"/>`, text)
const dotSwatch = (fill: string, text: string) =>
  sw(
    `<circle cx="14" cy="9" r="7" fill="${fill}" stroke="${COLOR.border}" stroke-width="1.5"/>`,
    text,
  )
const textSwatch = (sym: string, color: string, text: string) =>
  sw(`<text x="14" y="15" text-anchor="middle" font-size="16" fill="${color}">${sym}</text>`, text)
const boxSwatch = (text: string, fill = COLOR.tag, stroke = COLOR.tagBorder) =>
  sw(`<rect x="2" y="2" width="24" height="14" rx="3" fill="${fill}" stroke="${stroke}"/>`, text)
const squareSwatch = (text: string) =>
  sw(`<rect x="7" y="2" width="14" height="14" fill="#64748b"/>`, text)

// Tiny Excalidraw scene builder for the algorithm/rule diagrams.
// No dependencies (CLAUDE.md rule 6). Layout is explicit, and every scene
// runs an overlap check before it is saved, so no text or shape collides.

import { writeFileSync } from 'node:fs'

export const C = {
  ink: '#1e1e1e',
  muted: '#495057',
  blue: { s: '#1971c2', f: '#e7f5ff' },
  green: { s: '#2f9e44', f: '#ebfbee' },
  red: { s: '#e03131', f: '#fff5f5' },
  orange: { s: '#e8590c', f: '#fff4e6' },
  purple: { s: '#7048e8', f: '#f3f0ff' },
  yellow: { s: '#f08c00', f: '#fff9db' },
  gray: { s: '#495057', f: '#f8f9fa' },
  teal: { s: '#0c8599', f: '#e3fafc' },
}

const FAMILY = { sans: 2, mono: 3 } // Excalidraw: 2 = Helvetica, 3 = Cascadia (monospace)
const CHAR_W = { sans: 0.56, mono: 0.6 } // conservative average glyph width / font size
const LINE_H = 1.25

export function measure(text, size, family = 'sans') {
  const lines = String(text).split('\n')
  const w = Math.max(...lines.map((l) => l.length)) * size * CHAR_W[family]
  return { w: Math.ceil(w), h: Math.ceil(lines.length * size * LINE_H) }
}

export function wrap(text, maxW, size, family = 'sans') {
  const out = []
  for (const para of String(text).split('\n')) {
    const indent = (para.match(/^(\s*(?:[•\-–]|\d+\.|[a-z]\))\s+)/) || [''])[0]
    const pad = ' '.repeat(indent.length)
    const lead = para.match(/^ */)[0]
    const words = para.slice(lead.length).split(' ')
    let line = lead
    for (const w of words) {
      const next = line.trim() ? line + ' ' + w : line + w
      if (measure(next, size, family).w > maxW && line.trim()) {
        out.push(line)
        line = pad + w
      } else line = next
    }
    out.push(line)
  }
  return out.join('\n')
}

export class Scene {
  constructor(name) {
    this.name = name
    this.els = []
    this.items = [] // collision boxes: {id, box, parent, kind}
    this.segs = [] // line segments: {a, b, parent, ends:[ids]}
    this.n = 0
  }

  #id(p) {
    this.n += 1
    return `${this.name}-${p}-${this.n}`
  }

  #base(type, x, y, w, h, o = {}) {
    const id = this.#id(type)
    const el = {
      id,
      type,
      x: Math.round(x),
      y: Math.round(y),
      width: Math.round(w),
      height: Math.round(h),
      angle: 0,
      strokeColor: o.stroke ?? C.ink,
      backgroundColor: o.fill ?? 'transparent',
      fillStyle: 'solid',
      strokeWidth: o.strokeWidth ?? 2,
      strokeStyle: o.dashed ? 'dashed' : 'solid',
      roughness: 0,
      opacity: 100,
      groupIds: [],
      frameId: null,
      roundness: null,
      seed: this.n * 7919,
      version: 1,
      versionNonce: this.n * 104729,
      isDeleted: false,
      boundElements: null,
      updated: 1,
      link: null,
      locked: false,
    }
    this.els.push(el)
    return el
  }

  #track(id, box, parent, kind) {
    this.items.push({ id, box, parent: parent ?? null, kind })
    return id
  }

  rect(x, y, w, h, o = {}) {
    const el = this.#base('rectangle', x, y, w, h, o)
    el.roundness = o.sharp ? null : { type: 3 }
    return this.#track(el.id, { x, y, w, h }, o.parent, 'rect')
  }

  ellipse(x, y, w, h, o = {}) {
    const el = this.#base('ellipse', x, y, w, h, o)
    return this.#track(el.id, { x, y, w, h }, o.parent, 'ellipse')
  }

  text(x, y, text, o = {}) {
    const size = o.size ?? 18
    const family = o.family ?? 'sans'
    const body = o.maxW ? wrap(text, o.maxW, size, family) : String(text)
    const m = measure(body, size, family)
    const w = o.w ?? m.w
    const el = this.#base('text', x, y, w, m.h, { stroke: o.color ?? C.ink, strokeWidth: 1 })
    Object.assign(el, {
      text: body,
      originalText: body,
      fontSize: size,
      fontFamily: FAMILY[family],
      textAlign: o.align ?? 'left',
      verticalAlign: 'top',
      containerId: null,
      autoResize: true,
      lineHeight: LINE_H,
    })
    const id = this.#track(el.id, { x, y, w, h: m.h }, o.parent, 'text')
    return { id, w, h: m.h }
  }

  // Centred text at (cx, cy).
  label(cx, cy, text, o = {}) {
    const m = measure(text, o.size ?? 18, o.family ?? 'sans')
    return this.text(cx - m.w / 2, cy - m.h / 2, text, { ...o, align: 'center', w: m.w })
  }

  line(points, o = {}) {
    const [x0, y0] = points[0]
    const rel = points.map(([x, y]) => [Math.round(x - x0), Math.round(y - y0)])
    const xs = rel.map((p) => p[0])
    const ys = rel.map((p) => p[1])
    const el = this.#base(
      o.arrow ? 'arrow' : 'line',
      x0,
      y0,
      Math.max(...xs) - Math.min(...xs),
      Math.max(...ys) - Math.min(...ys),
      o,
    )
    Object.assign(el, {
      points: rel,
      lastCommittedPoint: null,
      startBinding: null,
      endBinding: null,
      startArrowhead: o.arrow === 'both' ? 'arrow' : null,
      endArrowhead: o.arrow ? 'arrow' : null,
      roundness: null,
    })
    for (let i = 1; i < points.length; i++)
      this.segs.push({
        a: points[i - 1],
        b: points[i],
        parent: o.parent ?? null,
        ends: o.ends ?? [],
      })
    return el.id
  }

  // ── higher-level helpers ───────────────────────────────────────────────

  // A titled box whose height grows with its content. `body` is a list of
  // blocks: a string (sans), {mono: "..."}, {head: "..."}, {note: "...", color}.
  panel(x, y, w, { title, color = C.gray, body = [], minH = 0, drawH = 0, size = 17 }) {
    const pad = 18
    const inner = w - 2 * pad
    const parts = []
    let h = pad
    if (title) {
      parts.push({ y: h, t: title, o: { size: 22, color: color.s, maxW: inner } })
      h += measure(wrap(title, inner, 22), 22).h + 10
    }
    const drawY = h
    h += drawH ? drawH + 10 : 0
    for (const b of body) {
      const blk =
        typeof b === 'string'
          ? { t: b, o: { size, maxW: inner } }
          : b.mono
            ? {
                t: b.mono,
                o: {
                  size: b.size ?? size - 1,
                  family: 'mono',
                  maxW: inner,
                  color: b.color ?? C.ink,
                },
              }
            : b.head
              ? { t: b.head, o: { size: size + 2, color: b.color ?? color.s, maxW: inner } }
              : {
                  t: b.note,
                  o: { size: b.size ?? size - 1, color: b.color ?? C.muted, maxW: inner },
                }
      const m = measure(wrap(blk.t, inner, blk.o.size, blk.o.family), blk.o.size, blk.o.family)
      parts.push({ y: h, ...blk })
      h += m.h + (b.gap ?? 10)
    }
    h = Math.max(h - 10 + pad, minH)
    const id = this.rect(x, y, w, h, { stroke: color.s, fill: color.f, strokeWidth: 2 })
    for (const p of parts) this.text(x + pad, y + p.y, p.t, { ...p.o, parent: id })
    return { id, x, y, w, h, drawX: x + pad, drawY: y + drawY, drawW: inner }
  }

  // Lay panels side by side; all get the height of the tallest one.
  row(x, y, gap, specs) {
    const probe = new Scene('probe')
    const hs = specs.map((s) => probe.panel(0, 0, s.w, s).h)
    const H = Math.max(...hs)
    const out = []
    let cx = x
    for (const s of specs) {
      out.push(this.panel(cx, y, s.w, { ...s, minH: H }))
      cx += s.w + gap
    }
    return { panels: out, bottom: y + H }
  }

  router(id, cx, cy, o = {}) {
    const r = o.r ?? 32
    const col = o.color ?? C.blue
    const eid = this.ellipse(cx - r, cy - r, 2 * r, 2 * r, {
      stroke: col.s,
      fill: o.fill ?? '#ffffff',
      strokeWidth: o.bold ? 4 : 2,
      dashed: o.dashed,
      parent: o.parent,
    })
    this.label(cx, cy, id, { size: 24, color: col.s, parent: eid })
    return { id, eid, cx, cy, r }
  }

  // Link between two routers, trimmed to the circles, with its metric
  // written on one side (side = +1 or -1).
  link(a, b, metric, o = {}) {
    const dx = b.cx - a.cx
    const dy = b.cy - a.cy
    const L = Math.hypot(dx, dy)
    const ux = dx / L
    const uy = dy / L
    const p1 = [a.cx + ux * (a.r + 4), a.cy + uy * (a.r + 4)]
    const p2 = [b.cx - ux * (b.r + 4), b.cy - uy * (b.r + 4)]
    this.line([p1, p2], {
      stroke: o.color ?? C.muted,
      strokeWidth: o.width ?? 2,
      dashed: o.dashed,
      arrow: o.arrow,
      parent: o.parent,
      ends: [a.eid, b.eid],
    })
    if (metric !== undefined && metric !== null) {
      const side = o.side ?? 1
      const t = o.at ?? 0.5
      const mx = a.cx + dx * t
      const my = a.cy + dy * t
      const m = measure(String(metric), o.msize ?? 20)
      const off = (Math.abs(-uy) * m.w + Math.abs(ux) * m.h) / 2 + 10
      this.label(mx - uy * off * side, my + ux * off * side, String(metric), {
        size: o.msize ?? 20,
        color: o.mcolor ?? C.ink,
        parent: o.parent,
      })
    }
  }

  // ── checks and output ──────────────────────────────────────────────────

  #ancestors(id) {
    const set = new Set()
    let cur = this.items.find((i) => i.id === id)
    while (cur && cur.parent) {
      set.add(cur.parent)
      cur = this.items.find((i) => i.id === cur.parent)
    }
    return set
  }

  check() {
    const errs = []
    const hit = (p, q, gap = 2) =>
      p.x < q.x + q.w + gap &&
      q.x < p.x + p.w + gap &&
      p.y < q.y + q.h + gap &&
      q.y < p.y + p.h + gap
    const inside = (p, q) =>
      p.x >= q.x && p.y >= q.y && p.x + p.w <= q.x + q.w && p.y + p.h <= q.y + q.h
    const anc = new Map(this.items.map((i) => [i.id, this.#ancestors(i.id)]))
    for (let i = 0; i < this.items.length; i++) {
      const A = this.items[i]
      for (const pid of anc.get(A.id)) {
        const P = this.items.find((x) => x.id === pid)
        if (P.kind === 'rect' && !inside(A.box, P.box)) errs.push(`${A.id} sticks out of ${pid}`)
      }
      for (let j = i + 1; j < this.items.length; j++) {
        const B = this.items[j]
        if (anc.get(A.id).has(B.id) || anc.get(B.id).has(A.id)) continue
        if (hit(A.box, B.box))
          errs.push(
            `overlap: ${A.id} × ${B.id} (${describe(this.els, A.id)} / ${describe(this.els, B.id)})`,
          )
      }
    }
    for (const s of this.segs) {
      for (const it of this.items) {
        if (
          it.kind === 'rect' &&
          (it.id === s.parent || this.#ancestors(s.parent ?? '').has(it.id))
        )
          continue
        if (s.ends.includes(it.id) || s.ends.some((e) => anc.get(it.id)?.has(e))) continue
        if (segHitsBox(s.a, s.b, it.box))
          errs.push(`line crosses ${it.id} (${describe(this.els, it.id)})`)
      }
    }
    return errs
  }

  save(path) {
    const errs = this.check()
    if (errs.length) {
      console.error(`✗ ${this.name}: ${errs.length} layout problem(s)`)
      for (const e of errs) console.error('  ' + e)
      process.exitCode = 1
    }
    const doc = {
      type: 'excalidraw',
      version: 2,
      source: 'https://github.com/danisherrorOrg/lfa-lab (docs/excalidraw)',
      elements: this.els,
      appState: { viewBackgroundColor: '#ffffff', gridSize: null },
      files: {},
    }
    writeFileSync(path, JSON.stringify(doc, null, 1) + '\n')
    if (!errs.length) console.log(`✓ ${path}: ${this.els.length} elements, no overlaps`)
  }
}

function describe(els, id) {
  const el = els.find((e) => e.id === id)
  return el?.text ? JSON.stringify(el.text.slice(0, 30)) : el?.type
}

function segHitsBox([x1, y1], [x2, y2], b) {
  // Liang–Barsky clip of the segment against the box (inflated by 2px).
  const g = 2
  let t0 = 0
  let t1 = 1
  const dx = x2 - x1
  const dy = y2 - y1
  const P = [-dx, dx, -dy, dy]
  const Q = [x1 - (b.x - g), b.x + b.w + g - x1, y1 - (b.y - g), b.y + b.h + g - y1]
  for (let i = 0; i < 4; i++) {
    if (P[i] === 0) {
      if (Q[i] < 0) return false
    } else {
      const t = Q[i] / P[i]
      if (P[i] < 0) t0 = Math.max(t0, t)
      else t1 = Math.min(t1, t)
      if (t0 > t1) return false
    }
  }
  return true
}

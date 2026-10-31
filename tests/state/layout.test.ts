// Phase 9.5: the "Auto layout" button. A pure, deterministic force layout.
import { describe, expect, it } from 'vitest'
import type { Topology } from '../../src/engine/types'
import { autoLayout, LAYOUT_SPACING } from '../../src/state/layout'
import { EXAMPLES, exampleTopology } from '../../src/state/examples'

const dist = (p: { x: number; y: number }, q: { x: number; y: number }) =>
  Math.hypot(p.x - q.x, p.y - q.y)

/** The smallest distance between any two routers. */
function closest(t: Topology): number {
  let min = Infinity
  for (let i = 0; i < t.nodes.length; i++)
    for (let j = i + 1; j < t.nodes.length; j++)
      min = Math.min(min, dist(t.nodes[i]!.pos!, t.nodes[j]!.pos!))
  return min
}

/** A ring of n routers, all stacked on one spot (the worst start). */
function ring(n: number): Topology {
  const id = (i: number) => `R${i}`
  return {
    name: 'ring',
    srgbBase: 16000,
    nodes: Array.from({ length: n }, (_, i) => ({ id: id(i), sidIndex: i, pos: { x: 0, y: 0 } })),
    links: Array.from({ length: n }, (_, i) => ({
      id: `${id(i)}-${id((i + 1) % n)}`,
      a: id(i),
      b: id((i + 1) % n),
      metricAB: 10,
      metricBA: 10,
    })),
  }
}

describe('autoLayout', () => {
  it('changes only positions, never the input, and gives the same answer every time', () => {
    const t = exampleTopology(EXAMPLES.find((e) => e.key === 'isp-core')!)
    const copy = structuredClone(t)
    const a = autoLayout(t)
    expect(t).toEqual(copy)
    expect(a).toEqual(autoLayout(t))
    expect(a.links).toBe(t.links)
    const noPos = (x: Topology) => x.nodes.map((n) => ({ ...n, pos: undefined }))
    expect(noPos(a)).toEqual(noPos(t))
    for (const n of a.nodes) {
      expect(Number.isInteger(n.pos!.x) && Number.isInteger(n.pos!.y)).toBe(true)
      expect(n.pos!.x).toBeGreaterThanOrEqual(0)
      expect(n.pos!.y).toBeGreaterThanOrEqual(0)
    }
  })

  it('spreads routers out on every example: none closer than half the spacing', () => {
    for (const ex of EXAMPLES) {
      const t = autoLayout(exampleTopology(ex))
      expect(closest(t), ex.key).toBeGreaterThan(LAYOUT_SPACING / 2)
    }
  })

  it('draws the examples that can be drawn without crossing links that way', () => {
    type P = { x: number; y: number }
    const side = (a: P, b: P, c: P) =>
      Math.sign((b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x))
    for (const key of ['square', 'ring5', 'isp-core', 'link-protecting', 'parallel']) {
      const t = autoLayout(exampleTopology(EXAMPLES.find((e) => e.key === key)!))
      const pos = new Map(t.nodes.map((n) => [n.id, n.pos!]))
      let crossing = 0
      for (const l of t.links)
        for (const m of t.links) {
          if (new Set([l.a, l.b, m.a, m.b]).size < 4) continue
          const [p, q, r, s] = [l.a, l.b, m.a, m.b].map((id) => pos.get(id)!) as [P, P, P, P]
          if (side(p, q, r) * side(p, q, s) < 0 && side(r, s, p) * side(r, s, q) < 0) crossing++
        }
      expect(crossing, key).toBe(0)
      // Wider than tall: canvases are wide.
      const xs = t.nodes.map((n) => n.pos!.x)
      const ys = t.nodes.map((n) => n.pos!.y)
      expect(Math.max(...xs), key).toBeGreaterThanOrEqual(Math.max(...ys))
    }
  })

  it('a ring stacked on one spot comes out as a ring: links of similar length', () => {
    const t = autoLayout(ring(8))
    expect(closest(t)).toBeGreaterThan(LAYOUT_SPACING / 2)
    const pos = new Map(t.nodes.map((n) => [n.id, n.pos!]))
    const lengths = t.links.map((l) => dist(pos.get(l.a)!, pos.get(l.b)!))
    expect(Math.max(...lengths) / Math.min(...lengths)).toBeLessThan(1.5)
  })

  it('keeps a router with no links near the others', () => {
    const t = ring(4)
    t.nodes.push({ id: 'Z', sidIndex: 99, pos: { x: 0, y: 0 } })
    const out = autoLayout(t)
    const z = out.nodes.find((n) => n.id === 'Z')!.pos!
    const far = Math.max(...out.nodes.map((n) => dist(n.pos!, z)))
    expect(far).toBeLessThan(LAYOUT_SPACING * 5)
  })

  it('handles 0 and 1 routers, and 200 routers quickly', () => {
    expect(autoLayout({ name: 'e', srgbBase: 16000, nodes: [], links: [] }).nodes).toEqual([])
    const one = autoLayout({
      name: 'o',
      srgbBase: 16000,
      nodes: [{ id: 'A', sidIndex: 1 }],
      links: [],
    })
    expect(one.nodes[0]!.pos).toEqual({ x: 0, y: 0 })
    const start = performance.now()
    const big = autoLayout(ring(200))
    expect(performance.now() - start).toBeLessThan(1500)
    expect(closest(big)).toBeGreaterThan(LAYOUT_SPACING / 4)
  })
})

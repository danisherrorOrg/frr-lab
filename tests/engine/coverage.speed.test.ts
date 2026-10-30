import { describe, expect, it } from 'vitest'
import { computeCoverage } from '../../src/engine/index'
import type { Link, Topology } from '../../src/engine/types'

/**
 * A fixed 200-router, 600-link topology: a ring (so it's connected) plus
 * 400 chords from a seeded generator, metrics 1–20. Same graph every run.
 */
function bigTopology(n = 200, linkCount = 600): Topology {
  let seed = 12345
  const next = (max: number) => {
    seed = (seed * 48271) % 2147483647
    return seed % max
  }
  const id = (i: number) => `R${String(i).padStart(3, '0')}`
  const seen = new Set<string>()
  const links: Link[] = []
  const add = (a: number, b: number) => {
    const key = `${Math.min(a, b)}:${Math.max(a, b)}`
    if (a === b || seen.has(key)) return
    seen.add(key)
    const m = 1 + next(20)
    links.push({ id: `${id(a)}-${id(b)}`, a: id(a), b: id(b), metricAB: m, metricBA: 1 + next(20) })
  }
  for (let i = 0; i < n; i++) add(i, (i + 1) % n)
  while (links.length < linkCount) add(next(n), next(n))
  return {
    name: 'speed',
    srgbBase: 16000,
    nodes: Array.from({ length: n }, (_, i) => ({ id: id(i), sidIndex: i })),
    links,
  }
}

// TODO.md Phase 5: all-sources coverage on 200 routers / 600 links in under 2 s.
describe('coverage speed', () => {
  it('200 routers, 600 links, all sources: under 2 s', () => {
    const topo = bigTopology()
    expect(topo.links).toHaveLength(600)
    const start = performance.now()
    const r = computeCoverage(topo)
    const ms = performance.now() - start
    expect(r.sources).toHaveLength(200)
    expect(r.total.tilfa).toBe(r.total.pairs)
    expect(ms).toBeLessThan(2000)
  })
})

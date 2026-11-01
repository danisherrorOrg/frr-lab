import { describe, expect, it } from 'vitest'
import { coverageMap } from '../../src/engine/heat-map'
import { computeAllSources, computeCoverage } from '../../src/engine/index'
import { whatIf } from '../../src/engine/what-if'
import { simulateAllSources } from '../../src/engine/simulate'
import { weakSpots } from '../../src/engine/weak-spots'
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

/**
 * Time limit for a speed test. The limits are for a laptop (docs/01-requirements.md);
 * shared CI runners are about 2.7× slower, so CI gets 3× the time (DECISIONS.md D46).
 */
const budget = (ms: number) => (process.env.CI ? ms * 3 : ms)

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
    expect(ms).toBeLessThan(budget(2000))
  })

  // TODO backlog: the coverage heat map does the same work, grouped per link.
  it('200 routers, 600 links, heat map: under 2 s', () => {
    const start = performance.now()
    const m = coverageMap(bigTopology())
    const ms = performance.now() - start
    expect(Object.keys(m.routers)).toHaveLength(200)
    expect(Object.keys(m.links)).toHaveLength(600)
    expect(ms).toBeLessThan(budget(2000))
  })

  // TODO backlog: the what-if diff runs coverage twice (before and after), so 2 × 2 s.
  it('200 routers, 600 links, what-if diff: under 4 s', () => {
    const topo = bigTopology()
    const after = {
      ...topo,
      links: topo.links.map((l, i) => (i === 0 ? { ...l, metricAB: 1, metricBA: 1 } : l)),
    }
    const start = performance.now()
    const w = whatIf(topo, after)
    const ms = performance.now() - start
    expect(w.sources).toHaveLength(200)
    expect(ms).toBeLessThan(budget(4000))
  })
})

// Phase 9.6: the "All routers" view stays under 2 s on the same topology.
describe('all routers as the DUT: speed', () => {
  const topo = bigTopology()

  it('results rows for every router: under 2 s', () => {
    const start = performance.now()
    const all = computeAllSources(topo)
    const ms = performance.now() - start
    expect(all).toHaveLength(200)
    expect(all.every((x) => x.rows.length >= 199)).toBe(true)
    expect(ms).toBeLessThan(budget(2000))
  })

  it('failure summary for every router (a router and a link down, TI-LFA): under 2 s', () => {
    const start = performance.now()
    const all = simulateAllSources(topo, { links: [topo.links[0]!.id], nodes: ['R005'] }, 'tilfa')
    const ms = performance.now() - start
    expect(all).toHaveLength(200)
    expect(all.filter((x) => 'down' in x).map((x) => x.source)).toEqual(['R005'])
    expect(ms).toBeLessThan(budget(2000))
  })
})

// TODO backlog: weakest spots fail all 600 links and 200 routers in turn, every router as
// the source. The backups are planned once (the coverage run, 2 s), then each failure is
// counted from them.
describe('weakest spots: speed', () => {
  for (const mode of ['lfa', 'rlfa', 'tilfa'] as const) {
    it(
      `200 routers, 600 links, every failure, ${mode}: under 4 s`,
      () => {
        const topo = bigTopology()
        const start = performance.now()
        const w = weakSpots(topo, mode)
        const ms = performance.now() - start
        expect(w.spots).toHaveLength(800)
        expect(w.flows).toBe(200 * 199)
        expect(ms).toBeLessThan(budget(4000))
      },
      budget(10_000),
    )
  }
})

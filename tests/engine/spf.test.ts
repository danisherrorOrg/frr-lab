import { describe, expect, it } from 'vitest'
import { buildGraph } from '../../src/engine/graph'
import { reverseSpf, spf, type SpfResult } from '../../src/engine/spf'
import type { Topology } from '../../src/engine/types'
import { loadFixture } from '../helpers'

/** Build a topology from `[a, b, metricAB, metricBA?]` tuples. */
function topo(links: [string, string, number, number?][], extraNodes: string[] = []): Topology {
  const ids = [...new Set([...links.flatMap(([a, b]) => [a, b]), ...extraNodes])]
  return {
    name: 't',
    srgbBase: 16000,
    nodes: ids.map((id, i) => ({ id, sidIndex: i + 1 })),
    links: links.map(([a, b, ab, ba]) => ({
      id: `${a}-${b}`,
      a,
      b,
      metricAB: ab,
      metricBA: ba ?? ab,
    })),
  }
}

const run = (t: Topology, root: string) => spf(buildGraph(t), root)
const dists = (r: SpfResult) => Object.fromEntries(r.dist)
const preds = (r: SpfResult) => Object.fromEntries(r.preds)
const firstHops = (r: SpfResult) => Object.fromEntries(r.firstHops)

describe('spf: small graphs', () => {
  it('line A–B–C', () => {
    const r = run(
      topo([
        ['A', 'B', 1],
        ['B', 'C', 2],
      ]),
      'A',
    )
    expect(dists(r)).toEqual({ A: 0, B: 1, C: 3 })
    expect(preds(r)).toEqual({ A: [], B: ['A'], C: ['B'] })
    expect(firstHops(r)).toEqual({ A: [], B: ['B'], C: ['B'] })
  })

  it('triangle where the two-hop path is cheaper than the direct link', () => {
    const r = run(
      topo([
        ['A', 'B', 1],
        ['B', 'C', 1],
        ['A', 'C', 5],
      ]),
      'A',
    )
    expect(dists(r)).toEqual({ A: 0, B: 1, C: 2 })
    expect(r.preds.get('C')).toEqual(['B'])
    expect(r.firstHops.get('C')).toEqual(['B'])
  })

  it('triangle with a tie keeps both predecessors and both first hops', () => {
    const r = run(
      topo([
        ['A', 'B', 1],
        ['B', 'C', 1],
        ['A', 'C', 2],
      ]),
      'A',
    )
    expect(r.dist.get('C')).toBe(2)
    expect(r.preds.get('C')).toEqual(['A', 'B'])
    expect(r.firstHops.get('C')).toEqual(['B', 'C'])
  })

  it('square with ECMP to the far corner', () => {
    const r = run(
      topo([
        ['S', 'A', 1],
        ['S', 'B', 1],
        ['A', 'D', 1],
        ['B', 'D', 1],
      ]),
      'S',
    )
    expect(r.dist.get('D')).toBe(2)
    expect(r.preds.get('D')).toEqual(['A', 'B'])
    expect(r.firstHops.get('D')).toEqual(['A', 'B'])
  })

  it('first hops are inherited through a longer ECMP chain', () => {
    // S has two equal paths to X, and Y hangs off X.
    const r = run(
      topo([
        ['S', 'A', 1],
        ['S', 'B', 1],
        ['A', 'X', 1],
        ['B', 'X', 1],
        ['X', 'Y', 1],
      ]),
      'S',
    )
    expect(r.preds.get('Y')).toEqual(['X'])
    expect(r.firstHops.get('Y')).toEqual(['A', 'B'])
  })

  it('uses the metric of the direction travelled (asymmetric metrics)', () => {
    // S→E costs 10, E→S costs 1; the detour via A is 3 each way.
    const t = topo([
      ['S', 'E', 10, 1],
      ['S', 'A', 3],
      ['A', 'E', 3],
    ])
    const fromS = run(t, 'S')
    expect(fromS.dist.get('E')).toBe(6)
    expect(fromS.firstHops.get('E')).toEqual(['A'])
    const fromE = run(t, 'E')
    expect(fromE.dist.get('S')).toBe(1)
    expect(fromE.firstHops.get('S')).toEqual(['S'])
  })

  it('leaves unreachable routers out (disconnected graph)', () => {
    const t = topo(
      [
        ['S', 'E', 1],
        ['X', 'Y', 1],
      ],
      ['Lonely'],
    )
    const r = run(t, 'S')
    expect(dists(r)).toEqual({ S: 0, E: 1 })
    expect(r.preds.has('X')).toBe(false)
    expect(r.firstHops.has('Lonely')).toBe(false)
  })

  it('two-node graph', () => {
    const r = run(topo([['S', 'E', 7]]), 'S')
    expect(dists(r)).toEqual({ S: 0, E: 7 })
    expect(firstHops(r)).toEqual({ S: [], E: ['E'] })
  })

  it('single router with no links', () => {
    const r = run(topo([], ['S']), 'S')
    expect(dists(r)).toEqual({ S: 0 })
  })

  it('rejects an unknown root', () => {
    expect(() => run(topo([['S', 'E', 1]]), 'X')).toThrow(/unknown router "X"/)
  })

  it('gives the same result whatever the order of the file', () => {
    const links: [string, string, number][] = [
      ['S', 'A', 1],
      ['S', 'B', 1],
      ['A', 'D', 1],
      ['B', 'D', 1],
      ['A', 'B', 1],
    ]
    const forward = run(topo(links), 'S')
    const reversed = run(topo([...links].reverse().map(([a, b, m]) => [b, a, m])), 'S')
    expect(preds(reversed)).toEqual(preds(forward))
    expect(firstHops(reversed)).toEqual(firstHops(forward))
    expect(dists(reversed)).toEqual(dists(forward))
  })
})

// Distances from the worked examples in docs/02-algorithms.md §6.
describe('spf: worked examples', () => {
  it('Example 1 (square)', () => {
    const g = buildGraph(loadFixture('01-square.yaml'))
    const fromS = spf(g, 'S')
    expect(fromS.dist.get('D')).toBe(20)
    expect(fromS.firstHops.get('D')).toEqual(['E'])
    const fromN = spf(g, 'N')
    expect(fromN.dist.get('D')).toBe(10)
    expect(fromN.dist.get('S')).toBe(15)
    expect(fromN.dist.get('E')).toBe(20)
    expect(spf(g, 'E').dist.get('D')).toBe(10)
  })

  it('Example 2 (5-node ring, metric 1)', () => {
    const g = buildGraph(loadFixture('02-ring5.yaml'))
    // Table: Y | dist(S,Y) | dist(E,Y) | dist(Y,E) | dist(Y,S)
    const table = {
      A: [1, 2, 2, 1],
      B: [2, 2, 2, 2],
      C: [2, 1, 1, 2],
    }
    for (const [y, [sy, ey, ye, ys]] of Object.entries(table)) {
      expect(spf(g, 'S').dist.get(y), `dist(S,${y})`).toBe(sy)
      expect(spf(g, 'E').dist.get(y), `dist(E,${y})`).toBe(ey)
      expect(spf(g, y).dist.get('E'), `dist(${y},E)`).toBe(ye)
      expect(spf(g, y).dist.get('S'), `dist(${y},S)`).toBe(ys)
    }
    expect(spf(g, 'A').dist.get('C')).toBe(2)
    expect(spf(g, 'S').dist.get('E')).toBe(1)
  })

  it('Example 3 (ring with high-metric B–C)', () => {
    const g = buildGraph(loadFixture('03-ring5-highmetric.yaml'))
    expect(dists(spf(g, 'S'))).toEqual({ S: 0, E: 1, A: 1, B: 2, C: 2 })
    expect(dists(spf(g, 'A'))).toEqual({ A: 0, S: 1, B: 1, E: 2, C: 3 })
    expect(dists(spf(g, 'E'))).toEqual({ E: 0, S: 1, C: 1, A: 2, B: 3 })
    // B's normal path to C goes the long way round (B-A-S-E-C, cost 4 < 10).
    const fromB = spf(g, 'B')
    expect(fromB.dist.get('C')).toBe(4)
    expect(fromB.firstHops.get('C')).toEqual(['A'])
  })
})

// Reverse SPF gives dist(Y, root) for every Y: docs/02-algorithms.md §1.2.
describe('reverseSpf', () => {
  const asym = topo([
    ['S', 'E', 10, 1],
    ['S', 'A', 3, 4],
    ['A', 'E', 3, 2],
  ])

  it('uses the metric of the direction towards the root', () => {
    // Towards E: S→E direct is 10, S→A→E is 3+3=6. A→E is 3.
    expect(Object.fromEntries(reverseSpf(buildGraph(asym), 'E').dist)).toEqual({ E: 0, S: 6, A: 3 })
    // Towards S: E→S is 1, A→S is min(4 direct, A→E→S = 3+1) = 4.
    expect(Object.fromEntries(reverseSpf(buildGraph(asym), 'S').dist)).toEqual({ S: 0, E: 1, A: 4 })
  })

  it('differs from forward SPF when metrics are asymmetric', () => {
    const g = buildGraph(asym)
    expect(spf(g, 'E').dist.get('S')).toBe(1)
    expect(reverseSpf(g, 'E').dist.get('S')).toBe(6)
  })

  it('matches a forward SPF from every router (random-ish asymmetric graph)', () => {
    const g = buildGraph(
      topo([
        ['A', 'B', 1, 9],
        ['B', 'C', 4, 2],
        ['C', 'D', 7, 1],
        ['D', 'A', 2, 8],
        ['A', 'C', 5, 3],
        ['B', 'E', 6, 6],
      ]),
    )
    for (const root of g.nodes) {
      const rev = reverseSpf(g, root)
      for (const y of g.nodes) {
        expect(rev.dist.get(y), `dist(${y},${root})`).toBe(spf(g, y).dist.get(root))
      }
    }
  })

  it('Example 2: dist(Y,E) and dist(Y,S) columns', () => {
    const g = buildGraph(loadFixture('02-ring5.yaml'))
    expect(Object.fromEntries(reverseSpf(g, 'E').dist)).toEqual({ E: 0, S: 1, A: 2, B: 2, C: 1 })
    expect(Object.fromEntries(reverseSpf(g, 'S').dist)).toEqual({ S: 0, E: 1, A: 1, B: 2, C: 2 })
  })

  it('leaves out routers that cannot reach the root', () => {
    const g = buildGraph(
      topo([
        ['S', 'E', 1],
        ['X', 'Y', 1],
      ]),
    )
    expect(Object.fromEntries(reverseSpf(g, 'S').dist)).toEqual({ S: 0, E: 1 })
  })

  it('rejects an unknown root', () => {
    expect(() => reverseSpf(buildGraph(topo([['S', 'E', 1]])), 'X')).toThrow(/unknown router "X"/)
  })
})

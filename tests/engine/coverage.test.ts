import { describe, expect, it } from 'vitest'
import { percent, summarizeSource } from '../../src/engine/coverage'
import { computeCoverage, computeForSource } from '../../src/engine/index'
import type { Topology } from '../../src/engine/types'
import { loadFixture } from '../helpers'

/** Topology from [a, b, metric] triples, symmetric metrics, SID index = position + 1. */
function topo(nodes: string[], links: [string, string, number][]): Topology {
  return {
    name: 't',
    srgbBase: 16000,
    nodes: nodes.map((id, i) => ({ id, sidIndex: i + 1 })),
    links: links.map(([a, b, m]) => ({ id: `${a}-${b}`, a, b, metricAB: m, metricBA: m })),
  }
}

// Numbers worked out by hand from docs/02-algorithms.md §2–§5 (see DECISIONS.md D19).
describe('coverage: one source', () => {
  it('01-square from S: every pair has an LFA', () => {
    const r = computeCoverage(loadFixture('01-square.yaml'), { sources: ['S'] })
    expect(r.sources).toEqual([
      { source: 'S', counts: { pairs: 3, ecmp: 0, lfa: 3, rlfa: 3, tilfa: 3, tooDeep: 0 } },
    ])
    expect(r.total).toEqual({ pairs: 3, ecmp: 0, lfa: 3, rlfa: 3, tilfa: 3, tooDeep: 0 })
    expect(r.unprotected).toEqual([])
  })

  it('02-ring5 from S: LFA protects C and B, RLFA also protects E and A', () => {
    const r = computeCoverage(loadFixture('02-ring5.yaml'), { sources: ['S'] })
    expect(r.total).toEqual({ pairs: 4, ecmp: 0, lfa: 2, rlfa: 4, tilfa: 4, tooDeep: 0 })
    expect(r.unprotected).toEqual([
      {
        source: 'S',
        dest: 'A',
        link: { from: 'S', to: 'A' },
        lfa: false,
        rlfa: true,
        tilfa: true,
        reason: 'no-lfa',
        text: 'No LFA for A over S–A; Remote LFA tunnels to PQ node C',
      },
      {
        source: 'S',
        dest: 'E',
        link: { from: 'S', to: 'E' },
        lfa: false,
        rlfa: true,
        tilfa: true,
        reason: 'no-lfa',
        text: 'No LFA for E over S–E; Remote LFA tunnels to PQ node B',
      },
    ])
  })

  it('03-ring5-highmetric from S: only TI-LFA protects anything', () => {
    const r = computeCoverage(loadFixture('03-ring5-highmetric.yaml'), { sources: ['S'] })
    expect(r.total).toEqual({ pairs: 4, ecmp: 0, lfa: 0, rlfa: 0, tilfa: 4, tooDeep: 0 })
    expect(r.unprotected.map((u) => [u.dest, u.link.to, u.reason])).toEqual([
      ['A', 'A', 'no-rlfa'],
      ['B', 'A', 'no-rlfa'],
      ['C', 'E', 'no-rlfa'],
      ['E', 'E', 'no-rlfa'],
    ])
    expect(r.unprotected[3]?.text).toBe(
      'No LFA and no PQ node for E over S–E; only TI-LFA protects (2 extra labels)',
    )
  })
})

describe('coverage: all sources', () => {
  it('01-square: 12 pairs, LFA 8, RLFA 12, TI-LFA 12', () => {
    const r = computeCoverage(loadFixture('01-square.yaml'))
    expect(r.sources.map((s) => [s.source, s.counts.lfa, s.counts.rlfa, s.counts.pairs])).toEqual([
      ['D', 1, 3, 3],
      ['E', 1, 3, 3],
      ['N', 3, 3, 3],
      ['S', 3, 3, 3],
    ])
    expect(r.total).toEqual({ pairs: 12, ecmp: 0, lfa: 8, rlfa: 12, tilfa: 12, tooDeep: 0 })
  })

  it('02-ring5: every router sees the same 4 pairs, LFA 2, RLFA 4', () => {
    const r = computeCoverage(loadFixture('02-ring5.yaml'))
    for (const s of r.sources)
      expect(s.counts).toEqual({ pairs: 4, ecmp: 0, lfa: 2, rlfa: 4, tilfa: 4, tooDeep: 0 })
    expect(r.total).toEqual({ pairs: 20, ecmp: 0, lfa: 10, rlfa: 20, tilfa: 20, tooDeep: 0 })
  })

  it('totals are the sum of the per-source rows', () => {
    const r = computeCoverage(loadFixture('03-ring5-highmetric.yaml'))
    const sum = r.sources.reduce((acc, s) => acc + s.counts.pairs, 0)
    expect(r.total.pairs).toBe(sum)
    expect(r.unprotected.every((u) => r.sources.some((s) => s.source === u.source))).toBe(true)
  })

  it('reports progress once per source, in order', () => {
    const calls: [number, number, string][] = []
    computeCoverage(loadFixture('02-ring5.yaml'), {
      onProgress: (done, total, source) => calls.push([done, total, source]),
    })
    expect(calls).toEqual([
      [1, 5, 'A'],
      [2, 5, 'B'],
      [3, 5, 'C'],
      [4, 5, 'E'],
      [5, 5, 'S'],
    ])
  })

  it('throws for an unknown source in the list', () => {
    expect(() => computeCoverage(loadFixture('01-square.yaml'), { sources: ['Z'] })).toThrow(/Z/)
  })
})

describe('coverage: details', () => {
  it('counts ECMP-protected pairs (they also count as LFA)', () => {
    const t = topo(
      ['S', 'A', 'B', 'D'],
      [
        ['S', 'A', 1],
        ['S', 'B', 1],
        ['A', 'D', 1],
        ['B', 'D', 1],
      ],
    )
    const { counts } = summarizeSource('S', computeForSource(t, 'S', { explain: false }))
    // D over S–A and S–B: the other next hop protects (ECMP). A and B: B is not
    // loop-free for A (dist(B,A)=2 < dist(B,S)+dist(S,A)=1+1 ✗), RLFA is.
    expect(counts).toEqual({ pairs: 4, ecmp: 2, lfa: 2, rlfa: 4, tilfa: 4, tooDeep: 0 })
  })

  it('a bridge link: partitioned, nothing protects', () => {
    const t = topo(
      ['S', 'A', 'E'],
      [
        ['S', 'A', 1],
        ['A', 'E', 1],
      ],
    )
    const r = computeCoverage(t, { sources: ['S'] })
    expect(r.total).toEqual({ pairs: 2, ecmp: 0, lfa: 0, rlfa: 0, tilfa: 0, tooDeep: 0 })
    expect(r.unprotected.map((u) => [u.dest, u.reason, u.text])).toEqual([
      ['A', 'partitioned', 'A can’t be reached once S–A fails: the link is a bridge'],
      ['E', 'partitioned', 'E can’t be reached once S–A fails: the link is a bridge'],
    ])
  })

  it('unreachable routers are not counted', () => {
    const t = topo(
      ['S', 'A', 'X', 'Y'],
      [
        ['S', 'A', 1],
        ['X', 'Y', 1],
      ],
    )
    expect(computeCoverage(t, { sources: ['S'] }).total.pairs).toBe(1)
  })

  it('percent: one decimal place, undefined when there is nothing to protect', () => {
    expect(percent(2, 3)).toBe(66.7)
    expect(percent(3, 3)).toBe(100)
    expect(percent(0, 0)).toBeUndefined()
  })
})

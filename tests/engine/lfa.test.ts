/// <reference types="node" />
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  chooseBestLfa,
  computeLfa,
  downstream,
  loopFree,
  nodeProtecting,
} from '../../src/engine/lfa'
import { allPairs } from '../../src/engine/spf'
import type { LfaCandidate, Topology } from '../../src/engine/types'
import { loadFixture } from '../helpers'

interface ExpectedLfa {
  results: {
    dest: string
    protections: {
      protectedLink: { from: string; to: string; id: string }
      lfa: { candidates: LfaCandidate[]; best: string | null }
    }[]
  }[]
}

function expectedLfa(file: string) {
  const name = file.replace(/\.yaml$/, '.expected.json')
  const raw = readFileSync(new URL(`../fixtures/${name}`, import.meta.url), 'utf8')
  const result = (JSON.parse(raw) as ExpectedLfa).results[0]!
  const protection = result.protections[0]!
  return { dest: result.dest, e: protection.protectedLink.to, lfa: protection.lfa }
}

// Inequalities from RFC 5286 §1 and §3.2 (docs/02-algorithms.md §2).
describe('LFA inequalities', () => {
  it('Inequality 1, loop-free: dist(N,D) < dist(N,S) + dist(S,D)', () => {
    expect(loopFree(10, 15, 20)).toBe(true)
    expect(loopFree(2, 1, 1)).toBe(false) // a tie is not loop-free
  })

  it('Inequality 2, downstream: dist(N,D) < dist(S,D)', () => {
    expect(downstream(10, 20)).toBe(true)
    expect(downstream(20, 20)).toBe(false)
  })

  it('Inequality 3, node-protecting: dist(N,D) < dist(N,E) + dist(E,D)', () => {
    expect(nodeProtecting(10, 20, 10)).toBe(true)
    expect(nodeProtecting(30, 20, 10)).toBe(false) // a tie may go through E (§3.2)
  })
})

describe('computeLfa', () => {
  it('Example 1: N is a node-protecting, downstream LFA with cost 15+10 = 25', () => {
    const file = '01-square.yaml'
    const { dest, e, lfa } = expectedLfa(file)
    const result = computeLfa(allPairs(loadFixture(file)), 'S', dest, e)
    expect(result.candidates).toEqual(lfa.candidates)
    expect(result.best).toBe(lfa.best ?? undefined)
  })

  it('Example 2: A is not loop-free, so there is no LFA', () => {
    const file = '02-ring5.yaml'
    const { dest, e, lfa } = expectedLfa(file)
    const result = computeLfa(allPairs(loadFixture(file)), 'S', dest, e)
    expect(result.candidates).toEqual(lfa.candidates)
    expect(result.best).toBeUndefined()
    expect(lfa.best).toBeNull()
  })

  it('Example 3: no LFA either', () => {
    const file = '03-ring5-highmetric.yaml'
    const { dest, e, lfa } = expectedLfa(file)
    const result = computeLfa(allPairs(loadFixture(file)), 'S', dest, e)
    expect(result.candidates).toEqual(lfa.candidates)
    expect(result.best).toBeUndefined()
  })

  it('keeps the numbers behind each check for the explain steps', () => {
    const result = computeLfa(allPairs(loadFixture('01-square.yaml')), 'S', 'D', 'E')
    expect(result.checks).toEqual([
      {
        neighbor: 'N',
        link: 'S-N',
        cSN: 15,
        distND: 10,
        distNS: 15,
        distSD: 20,
        distNE: 20,
        distED: 10,
      },
    ])
  })

  it('D = E: Inequality 3 can never hold, so no LFA is node-protecting', () => {
    const t = allPairs(triangle(1, 1, 5))
    const result = computeLfa(t, 'S', 'E', 'E')
    expect(result.candidates).toEqual([
      {
        neighbor: 'D',
        link: 'S-D',
        loopFree: true,
        downstream: false,
        nodeProtecting: false,
        cost: 6,
      },
    ])
    const toD = computeLfa(allPairs(triangle(1, 1, 1)), 'S', 'D', 'D')
    expect(toD.candidates).toEqual([
      {
        neighbor: 'E',
        link: 'S-E',
        loopFree: true,
        downstream: false,
        nodeProtecting: false,
        cost: 2,
      },
    ])
  })

  it('skips a neighbor whose link has the IS-IS maximum metric (RFC 5286 §3.5)', () => {
    const topo = triangle(1, 1, 1)
    const capped: Topology = {
      ...topo,
      links: topo.links.map((l) => (l.id === 'S-D' ? { ...l, metricBA: 16_777_215 } : l)),
    }
    const result = computeLfa(allPairs(capped), 'S', 'E', 'E')
    expect(result.candidates).toEqual([])
    expect(result.skipped).toEqual([{ neighbor: 'D', link: 'S-D', reason: 'max-metric' }])
  })

  it('rejects an E that is not a primary next hop for D', () => {
    const t = allPairs(loadFixture('01-square.yaml'))
    expect(() => computeLfa(t, 'S', 'D', 'N')).toThrow(/not a primary next hop/)
    expect(() => computeLfa(t, 'S', 'S', 'E')).toThrow(/its own destination/)
  })
})

// D7: node-protecting → downstream → lowest cost → lowest router ID.
describe('chooseBestLfa', () => {
  const lfa = (neighbor: string, flags: string, cost: number): LfaCandidate => ({
    neighbor,
    link: `S-${neighbor}`,
    loopFree: flags.includes('L'),
    downstream: flags.includes('D'),
    nodeProtecting: flags.includes('N'),
    cost,
  })

  it('ignores candidates that are not loop-free', () => {
    expect(chooseBestLfa([lfa('A', '', 1)])).toBeUndefined()
    expect(chooseBestLfa([])).toBeUndefined()
  })

  it('node-protecting beats downstream, even at a higher cost', () => {
    expect(chooseBestLfa([lfa('A', 'LD', 1), lfa('B', 'LN', 9)])).toBe('B')
  })

  it('then downstream beats not downstream', () => {
    expect(chooseBestLfa([lfa('A', 'LN', 1), lfa('B', 'LND', 9)])).toBe('B')
    expect(chooseBestLfa([lfa('A', 'L', 1), lfa('B', 'LD', 9)])).toBe('B')
  })

  it('then the lowest cost, then the lowest router ID', () => {
    expect(chooseBestLfa([lfa('A', 'LD', 5), lfa('B', 'LD', 4)])).toBe('B')
    expect(chooseBestLfa([lfa('B', 'LD', 4), lfa('A', 'LD', 4)])).toBe('A')
  })

  it('computeLfa picks the downstream LFA in a ring with two exits', () => {
    // S–E–D direct, plus S–A–D (A downstream) and S–B where B reaches D only far away.
    const topo: Topology = {
      name: 't',
      srgbBase: 16000,
      nodes: ['S', 'E', 'D', 'A', 'B'].map((id, i) => ({ id, sidIndex: i })),
      links: [
        { id: 'S-E', a: 'S', b: 'E', metricAB: 1, metricBA: 1 },
        { id: 'E-D', a: 'E', b: 'D', metricAB: 1, metricBA: 1 },
        { id: 'S-A', a: 'S', b: 'A', metricAB: 5, metricBA: 5 },
        { id: 'A-D', a: 'A', b: 'D', metricAB: 1, metricBA: 1 },
        { id: 'S-B', a: 'S', b: 'B', metricAB: 1, metricBA: 1 },
        { id: 'B-E', a: 'B', b: 'E', metricAB: 1, metricBA: 1 },
      ],
    }
    const result = computeLfa(allPairs(topo), 'S', 'D', 'E')
    // A: dist(A,D)=1 < 2 downstream, and 1 < dist(A,E)+dist(E,D) = 2+1 node-protecting, cost 6.
    // B: dist(B,D)=2 via E, loop-free (2 < 1+2) but not downstream or node-protecting, cost 3.
    expect(
      result.candidates.map((c) => [
        c.neighbor,
        c.loopFree,
        c.downstream,
        c.nodeProtecting,
        c.cost,
      ]),
    ).toEqual([
      ['A', true, true, true, 6],
      ['B', true, false, false, 3],
    ])
    expect(result.best).toBe('A')
  })
})

/** Triangle S–E–D with metrics S–E, E–D, S–D. */
function triangle(se: number, ed: number, sd: number): Topology {
  return {
    name: 'triangle',
    srgbBase: 16000,
    nodes: ['S', 'E', 'D'].map((id, i) => ({ id, sidIndex: i })),
    links: [
      { id: 'S-E', a: 'S', b: 'E', metricAB: se, metricBA: se },
      { id: 'E-D', a: 'E', b: 'D', metricAB: ed, metricBA: ed },
      { id: 'S-D', a: 'S', b: 'D', metricAB: sd, metricBA: sd },
    ],
  }
}

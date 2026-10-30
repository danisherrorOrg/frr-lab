import { describe, expect, it } from 'vitest'
import { computeLfa, ecmpProtectors } from '../../src/engine/lfa'
import { allPairs } from '../../src/engine/spf'
import type { Topology } from '../../src/engine/types'
import { loadFixture } from '../helpers'

/** Square S–E–D–A–S, all metrics 1: S has two equal paths to D. */
const square: Topology = {
  name: 'ECMP square',
  srgbBase: 16000,
  nodes: ['S', 'E', 'A', 'D'].map((id, i) => ({ id, sidIndex: i })),
  links: [
    { id: 'S-E', a: 'S', b: 'E', metricAB: 1, metricBA: 1 },
    { id: 'S-A', a: 'S', b: 'A', metricAB: 1, metricBA: 1 },
    { id: 'E-D', a: 'E', b: 'D', metricAB: 1, metricBA: 1 },
    { id: 'A-D', a: 'A', b: 'D', metricAB: 1, metricBA: 1 },
  ],
}

// ECMP-protected: another primary next hop avoids the failed link (§1.4, RFC 5286 §3.4).
describe('ecmpProtectors', () => {
  it('ECMP square: each primary next hop protects the other', () => {
    const t = allPairs(square)
    expect(t.from.get('S')?.firstHops.get('D')).toEqual(['A', 'E'])
    expect(ecmpProtectors(t, 'S', 'D', 'E')).toEqual(['A'])
    expect(ecmpProtectors(t, 'S', 'D', 'A')).toEqual(['E'])
  })

  it('ECMP square: the other primary next hop is also the best LFA', () => {
    const result = computeLfa(allPairs(square), 'S', 'D', 'E')
    // dist(A,D)=1 < dist(S,D)=2 downstream; 1 < dist(A,E)+dist(E,D) = 2+1 node-protecting.
    expect(result.candidates).toEqual([
      { neighbor: 'A', loopFree: true, downstream: true, nodeProtecting: true, cost: 2 },
    ])
    expect(result.best).toBe('A')
  })

  it('a single next hop is never ECMP-protected', () => {
    const t = allPairs(loadFixture('01-square.yaml'))
    expect(ecmpProtectors(t, 'S', 'D', 'E')).toEqual([])
    expect(ecmpProtectors(allPairs(loadFixture('02-ring5.yaml')), 'S', 'E', 'E')).toEqual([])
  })

  it('three-way ECMP: the other two protect', () => {
    const topo: Topology = {
      name: 'three paths',
      srgbBase: 16000,
      nodes: ['S', 'A', 'B', 'C', 'D'].map((id, i) => ({ id, sidIndex: i })),
      links: ['A', 'B', 'C'].flatMap((m) => [
        { id: `S-${m}`, a: 'S', b: m, metricAB: 2, metricBA: 2 },
        { id: `${m}-D`, a: m, b: 'D', metricAB: 3, metricBA: 3 },
      ]),
    }
    expect(ecmpProtectors(allPairs(topo), 'S', 'D', 'B')).toEqual(['A', 'C'])
  })
})

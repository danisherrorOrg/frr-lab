import { describe, expect, it } from 'vitest'
import { allPairs, avoidsLink } from '../../src/engine/spf'
import type { Topology } from '../../src/engine/types'
import { loadFixture } from '../helpers'

// "All shortest paths X→Y avoid link S→E", strict inequality: docs/02-algorithms.md §1.5, D6.
describe('avoidsLink', () => {
  it('Example 2: S→B avoids S–E, S→C does not', () => {
    const t = allPairs(loadFixture('02-ring5.yaml'))
    // dist(S,B)=2 < dist(S,S)+c(S,E)+dist(E,B) = 0+1+2 = 3
    expect(avoidsLink(t, 'S', 'B', 'S', 'E')).toBe(true)
    // dist(S,C)=2 < 0+1+1 = 2 ✗ (S's path to C goes over S–E)
    expect(avoidsLink(t, 'S', 'C', 'S', 'E')).toBe(false)
    // dist(B,E)=2 < dist(B,S)+1+0 = 3: B reaches E the other way round
    expect(avoidsLink(t, 'B', 'E', 'S', 'E')).toBe(true)
  })

  it("Example 3: B's normal path to C uses S–E", () => {
    const t = allPairs(loadFixture('03-ring5-highmetric.yaml'))
    // dist(B,C)=4 < dist(B,S)+c(S,E)+dist(E,C) = 2+1+1 = 4 ✗
    expect(avoidsLink(t, 'B', 'C', 'S', 'E')).toBe(false)
    expect(avoidsLink(t, 'C', 'E', 'S', 'E')).toBe(true)
  })

  it('an ECMP tie counts as using the link (safe choice, D6)', () => {
    const square: Topology = {
      name: 't',
      srgbBase: 16000,
      nodes: ['S', 'E', 'A', 'D'].map((id, i) => ({ id, sidIndex: i })),
      links: [
        { id: 'S-E', a: 'S', b: 'E', metricAB: 1, metricBA: 1 },
        { id: 'S-A', a: 'S', b: 'A', metricAB: 1, metricBA: 1 },
        { id: 'E-D', a: 'E', b: 'D', metricAB: 1, metricBA: 1 },
        { id: 'A-D', a: 'A', b: 'D', metricAB: 1, metricBA: 1 },
      ],
    }
    // S→D has two equal paths, one over S–E: 2 < 0+1+1 = 2 ✗
    expect(avoidsLink(allPairs(square), 'S', 'D', 'S', 'E')).toBe(false)
  })

  it('checks one direction only: E→S is a different link direction', () => {
    const t = allPairs(loadFixture('02-ring5.yaml'))
    // E→S direct uses E→S, not S→E: 1 < dist(E,S)+c(S,E)+dist(E,S) = 1+1+1
    expect(avoidsLink(t, 'E', 'S', 'S', 'E')).toBe(true)
    expect(avoidsLink(t, 'E', 'S', 'E', 'S')).toBe(false)
  })

  it('an unreachable destination never counts as avoiding', () => {
    const islands: Topology = {
      name: 't',
      srgbBase: 16000,
      nodes: ['S', 'E', 'X'].map((id, i) => ({ id, sidIndex: i })),
      links: [{ id: 'S-E', a: 'S', b: 'E', metricAB: 1, metricBA: 1 }],
    }
    expect(avoidsLink(allPairs(islands), 'S', 'X', 'S', 'E')).toBe(false)
  })

  it('rejects S and E that are not neighbors', () => {
    const t = allPairs(loadFixture('02-ring5.yaml'))
    expect(() => avoidsLink(t, 'S', 'B', 'S', 'C')).toThrow(/no link S→C/)
  })
})

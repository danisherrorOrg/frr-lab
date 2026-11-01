// Microloops (Later #6, D57, docs/02-algorithms.md §22). Worked out by hand first.
import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { microloops } from '../../src/engine/microloop'
import { allPairs } from '../../src/engine/spf'
import { connectedTopology } from '../arbitraries'
import { loadFixture } from '../helpers'

describe('microloops', () => {
  it('Example 2, S–E fails: S⇄A for E and E⇄C for S, both from a PLR updating early', () => {
    // To E: A still goes A-S-E (2 < A-B-C-E 3); S's new next hop is A. If S updates
    // first, S sends to A and A sends back to S. To S, the same between E and C.
    const r = microloops(loadFixture('02-ring5.yaml'), { links: ['S-E'] })
    expect(r.loops).toEqual([
      { dest: 'E', cycle: ['A', 'S', 'A'], updated: ['S'], waiting: ['A'], plrEarly: true },
      { dest: 'S', cycle: ['C', 'E', 'C'], updated: ['E'], waiting: ['C'], plrEarly: true },
    ])
  })

  it('Example 1, S–E fails: nothing to D; to S, E⇄D if E updates early', () => {
    // To D: N's path N-D never used S, so no loop. To S: D still goes D-E-S (20 < D-N-S 25),
    // and E's new next hop is D (E-D-N-S).
    expect(microloops(loadFixture('01-square.yaml'), { links: ['S-E'] }).loops).toEqual([
      { dest: 'S', cycle: ['D', 'E', 'D'], updated: ['E'], waiting: ['D'], plrEarly: true },
    ])
  })

  it('a loop between two routers away from the failure needs no PLR (square with a tail)', () => {
    const t = {
      name: 't',
      srgbBase: 16000,
      nodes: ['A', 'D', 'E', 'S'].map((id, i) => ({ id, sidIndex: i + 1 })),
      links: [
        { id: 'S-E', a: 'S', b: 'E', metricAB: 1, metricBA: 1 },
        { id: 'E-D', a: 'E', b: 'D', metricAB: 1, metricBA: 1 },
        { id: 'S-A', a: 'S', b: 'A', metricAB: 1, metricBA: 1 },
        { id: 'A-D', a: 'A', b: 'D', metricAB: 5, metricBA: 5 },
      ],
    }
    // To D, before: S→E, A→S (A-S-E-D 3 < A-D 5), E→D. After E–D fails: E→S, S→A, A→D.
    // E is the PLR. S updates (S→A) while A waits (A→S): S⇄A, no PLR in it.
    const r = microloops(t, { links: ['E-D'] })
    expect(r.loops.find((l) => l.dest === 'D')).toEqual({
      dest: 'D',
      cycle: ['A', 'S', 'A'],
      updated: ['S'],
      waiting: ['A'],
      plrEarly: false,
    })
  })

  it('property: every loop is a real cycle of old and new next hops, never through the destination', () => {
    fc.assert(
      fc.property(connectedTopology(), fc.nat(), (t, k) => {
        const link = t.links[k % t.links.length]!
        const r = microloops(t, { links: [link.id] })
        const before = allPairs(t)
        for (const l of r.loops) {
          expect(l.cycle[0]).toBe(l.cycle.at(-1))
          expect(l.cycle).not.toContain(l.dest)
          expect(l.updated.length).toBeGreaterThan(0)
          for (let i = 0; i + 1 < l.cycle.length; i++) {
            const [x, y] = [l.cycle[i]!, l.cycle[i + 1]!]
            // Each hop is a link between neighbors.
            expect(before.graph.out.get(x)!.some((e) => e.to === y)).toBe(true)
          }
        }
      }),
      { numRuns: 60 },
    )
  })
})

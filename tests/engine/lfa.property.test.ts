import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { computeLfa, ecmpProtectors } from '../../src/engine/lfa'
import { allPairs, type AllPairs } from '../../src/engine/spf'
import type { NodeId } from '../../src/engine/types'
import { connectedTopology } from '../arbitraries'

/**
 * Every router a packet can visit going from X to D when each router forwards
 * with its own normal (pre-failure) table, over every ECMP branch.
 */
function forwardingVisits(t: AllPairs, x: NodeId, d: NodeId): Set<NodeId> {
  const seen = new Set<NodeId>([x])
  const stack = [x]
  for (let cur = stack.pop(); cur !== undefined; cur = stack.pop()) {
    if (cur === d) continue
    const hops = t.from.get(cur)?.firstHops.get(d) ?? []
    expect(hops.length).toBeGreaterThan(0) // connected graph: never a dead end
    for (const h of hops) {
      if (!seen.has(h)) {
        seen.add(h)
        stack.push(h)
      }
    }
  }
  return seen
}

/** Calls `check` for every (S, D, primary next hop E) in the topology. */
function eachProtection(t: AllPairs, check: (s: NodeId, d: NodeId, e: NodeId) => void): void {
  for (const [s, fromS] of t.from) {
    for (const [d, hops] of fromS.firstHops) for (const e of hops) check(s, d, e)
  }
}

// docs/05-testing.md §3 item 2, on random connected graphs with asymmetric metrics.
describe('LFA properties', () => {
  it('item 2: every loop-free alternate reaches D without passing through S', () => {
    fc.assert(
      fc.property(connectedTopology(), (topo) => {
        const t = allPairs(topo)
        eachProtection(t, (s, d, e) => {
          const result = computeLfa(t, s, d, e)
          for (const c of result.candidates) {
            if (!c.loopFree) continue
            const visits = forwardingVisits(t, c.neighbor, d)
            expect(visits.has(d)).toBe(true)
            expect(visits.has(s)).toBe(false)
          }
          if (result.best !== undefined) {
            expect(result.candidates.find((c) => c.neighbor === result.best)?.loopFree).toBe(true)
          }
        })
      }),
      { numRuns: 50 },
    )
  })

  it('node-protecting alternates also never pass through E', () => {
    fc.assert(
      fc.property(connectedTopology(), (topo) => {
        const t = allPairs(topo)
        eachProtection(t, (s, d, e) => {
          for (const c of computeLfa(t, s, d, e).candidates) {
            if (c.nodeProtecting) expect(forwardingVisits(t, c.neighbor, d).has(e)).toBe(false)
            // Downstream implies loop-free with positive metrics.
            if (c.downstream) expect(c.loopFree).toBe(true)
          }
        })
      }),
      { numRuns: 50 },
    )
  })

  it('ECMP protectors are loop-free, downstream candidates', () => {
    fc.assert(
      fc.property(connectedTopology(), (topo) => {
        const t = allPairs(topo)
        eachProtection(t, (s, d, e) => {
          const candidates = computeLfa(t, s, d, e).candidates
          for (const n of ecmpProtectors(t, s, d, e)) {
            const c = candidates.find((x) => x.neighbor === n)
            expect(c?.loopFree).toBe(true)
            expect(c?.downstream).toBe(true)
            expect(forwardingVisits(t, n, d).has(s)).toBe(false)
          }
        })
      }),
      { numRuns: 50 },
    )
  })
})

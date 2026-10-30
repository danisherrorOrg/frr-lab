import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { computeLfa } from '../../src/engine/lfa'
import { computeRlfa, inExtPSpace } from '../../src/engine/rlfa'
import { allPairs, dist, type AllPairs } from '../../src/engine/spf'
import type { NodeId } from '../../src/engine/types'
import { connectedTopology } from '../arbitraries'

/**
 * Every directed hop a packet can take going from X to `target` when each
 * router forwards with its own normal (pre-failure) table, over every ECMP branch.
 */
function forwardingHops(t: AllPairs, x: NodeId, target: NodeId): [NodeId, NodeId][] {
  const hops: [NodeId, NodeId][] = []
  const seen = new Set<NodeId>([x])
  const stack = [x]
  for (let cur = stack.pop(); cur !== undefined; cur = stack.pop()) {
    if (cur === target) continue
    const next = t.from.get(cur)?.firstHops.get(target) ?? []
    expect(next.length).toBeGreaterThan(0) // connected graph: never a dead end
    for (const h of next) {
      hops.push([cur, h])
      if (!seen.has(h)) {
        seen.add(h)
        stack.push(h)
      }
    }
  }
  return hops
}

const usesLink = (hops: [NodeId, NodeId][], s: NodeId, e: NodeId) =>
  hops.some(([a, b]) => a === s && b === e)

/** Calls `check` for every directed link S→E. */
function eachLink(t: AllPairs, check: (s: NodeId, e: NodeId) => void): void {
  for (const [s, edges] of t.graph.out) for (const { to } of edges) check(s, to)
}

// docs/05-testing.md §3 item 3, on random connected graphs with asymmetric metrics.
describe('RLFA properties', () => {
  it('item 3: the tunnel to every PQ node and the PQ node’s path to E avoid S–E', () => {
    fc.assert(
      fc.property(connectedTopology(), (topo) => {
        const t = allPairs(topo)
        eachLink(t, (s, e) => {
          const r = computeRlfa(t, s, e)
          for (const p of r.pq) {
            const exit = r.exitVia[p]
            if (exit === undefined) {
              // Plain P-space: S's own normal path to P.
              expect(usesLink(forwardingHops(t, s, p), s, e)).toBe(false)
            } else {
              // Extended: sent to N, which forwards normally and never returns to S.
              const hops = forwardingHops(t, exit, p)
              expect(usesLink(hops, s, e)).toBe(false)
              expect(hops.some(([, b]) => b === s)).toBe(false)
            }
            expect(usesLink(forwardingHops(t, p, e), s, e)).toBe(false)
          }
        })
      }),
      { numRuns: 50 },
    )
  })

  it('plain PQ ⊆ extended PQ, and the best PQ node has the lowest cost', () => {
    fc.assert(
      fc.property(connectedTopology(), (topo) => {
        const t = allPairs(topo)
        eachLink(t, (s, e) => {
          const ext = computeRlfa(t, s, e)
          const plain = computeRlfa(t, s, e, { extended: false })
          for (const p of plain.pq) expect(ext.pq).toContain(p)
          expect(ext.pSpace.every((p) => ext.extPSpace.includes(p))).toBe(true)
          if (ext.pq.length === 0) {
            expect(ext.best).toBeUndefined()
            return
          }
          const min = Math.min(...ext.costs.map((c) => c.cost))
          expect(ext.costs.find((c) => c.node === ext.best)?.cost).toBe(min)
          for (const c of ext.costs) {
            // A plain-P node's cost is S's own distance; an extended one never beats it.
            expect(c.cost).toBeGreaterThanOrEqual(dist(t, s, c.node))
          }
        })
      }),
      { numRuns: 50 },
    )
  })

  // D17: E is left out of every space. If E were in some P(N), N would be an
  // LFA for every destination behind E, so RLFA would never run.
  it('if E is in some neighbor’s P-space, every destination using S–E has an LFA', () => {
    fc.assert(
      fc.property(connectedTopology(), (topo) => {
        const t = allPairs(topo)
        for (const [s, fromS] of t.from) {
          for (const [d, hops] of fromS.firstHops) {
            for (const e of hops) {
              const eInExtP = (t.graph.out.get(s) ?? []).some(
                ({ to: n }) => n !== e && inExtPSpace(dist(t, n, e), dist(t, n, s), dist(t, s, e)),
              )
              if (eInExtP) expect(computeLfa(t, s, d, e).best).toBeDefined()
            }
          }
        }
      }),
      { numRuns: 50 },
    )
  })
})

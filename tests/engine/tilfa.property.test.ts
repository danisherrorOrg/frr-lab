import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { linkMetric } from '../../src/engine/graph'
import { allPairs, dist, type AllPairs } from '../../src/engine/spf'
import { computeTilfa, type TilfaResult } from '../../src/engine/tilfa'
import type { NodeId, Topology } from '../../src/engine/types'
import { connectedTopology } from '../arbitraries'

/**
 * Every directed hop a packet can take from X to `target` when each router
 * forwards with its normal (pre-failure) table, over every ECMP branch.
 */
function forwardingHops(t: AllPairs, x: NodeId, target: NodeId): [NodeId, NodeId][] {
  const hops: [NodeId, NodeId][] = []
  const seen = new Set<NodeId>([x])
  const stack = [x]
  for (let cur = stack.pop(); cur !== undefined; cur = stack.pop()) {
    if (cur === target) continue
    for (const h of t.from.get(cur)?.firstHops.get(target) ?? []) {
      hops.push([cur, h])
      if (!seen.has(h)) {
        seen.add(h)
        stack.push(h)
      }
    }
  }
  return hops
}

/**
 * Sends a packet along the repair: S puts the segments on and sends out of the
 * first-hop link; every other router uses its pre-failure table. Returns where it
 * ends, every hop it may take, and its cost.
 */
function simulate(t: AllPairs, r: TilfaResult) {
  const path = r.path!
  const n1 = path[1]!
  const hops: [NodeId, NodeId][] = [[r.s, n1]]
  let cost = linkMetric(t.graph, r.s, n1)!
  let cur = n1
  for (const seg of r.segments!) {
    if (seg.kind === 'prefix') {
      hops.push(...forwardingHops(t, cur, seg.node))
      cost += dist(t, cur, seg.node) // every ECMP branch costs the same
      cur = seg.node
    } else {
      expect(cur).toBe(seg.from)
      hops.push([seg.from, seg.to])
      cost += linkMetric(t.graph, seg.from, seg.to)!
      cur = seg.to
    }
  }
  return { end: cur, hops, cost }
}

/** Routers reachable from S once link S–E is gone, found without the engine. */
function reachableWithout(topo: Topology, s: NodeId, e: NodeId): Set<NodeId> {
  const seen = new Set([s])
  const stack = [s]
  for (let cur = stack.pop(); cur !== undefined; cur = stack.pop()) {
    for (const l of topo.links) {
      if ((l.a === s && l.b === e) || (l.a === e && l.b === s)) continue
      const next = l.a === cur ? l.b : l.b === cur ? l.a : undefined
      if (next !== undefined && !seen.has(next)) {
        seen.add(next)
        stack.push(next)
      }
    }
  }
  return seen
}

/** Calls `check` for every directed link S→E and every destination D ≠ S. */
function eachCase(t: AllPairs, check: (s: NodeId, d: NodeId, e: NodeId) => void): void {
  for (const [s, edges] of t.graph.out) {
    for (const { to: e } of edges) for (const d of t.graph.nodes) if (d !== s) check(s, d, e)
  }
}

// docs/05-testing.md §3 items 4 and 5, roadmap Phase 4.
describe('TI-LFA properties', () => {
  it('item 4: the segment list reaches D, never uses S–E or comes back to S, at the post-convergence cost', () => {
    fc.assert(
      fc.property(connectedTopology(), (topo) => {
        const t = allPairs(topo)
        eachCase(t, (s, d, e) => {
          const r = computeTilfa(topo, s, d, e)
          if (r.partitioned) return
          const { end, hops, cost } = simulate(t, r)
          expect(end).toBe(d)
          expect(hops.some(([a, b]) => a === s && b === e)).toBe(false)
          expect(hops.slice(1).some(([, b]) => b === s)).toBe(false)
          expect(cost).toBe(r.cost)
          // Check (a) always holds when (b) does: paths that avoid S–E survive the
          // failure, so they cost the same as the post-convergence path (§4.2).
          for (const w of r.walk) {
            for (const c of [w.accepted, w.rejected]) if (c?.avoids) expect(c.onPath).toBe(true)
          }
          // Shape of the result.
          expect(r.segments!.at(-1)).toMatchObject({ kind: 'prefix', node: d })
          expect(r.labelStack).toEqual(r.segments!.map((x) => x.label))
          expect(r.extraLabels).toBe(r.segments!.length - 1)
        })
      }),
      { numRuns: 40 },
    )
  })

  it('item 5: a repair is found exactly when D can still be reached', () => {
    fc.assert(
      fc.property(connectedTopology(), (topo) => {
        const t = allPairs(topo)
        eachCase(t, (s, d, e) => {
          const r = computeTilfa(topo, s, d, e)
          expect(r.partitioned).toBe(!reachableWithout(topo, s, e).has(d))
        })
      }),
      { numRuns: 40 },
    )
  })

  it('same input in a different order gives the same answer', () => {
    fc.assert(
      fc.property(connectedTopology(), (topo) => {
        const shuffled: Topology = {
          ...topo,
          nodes: [...topo.nodes].reverse(),
          links: [...topo.links].reverse(),
        }
        const t = allPairs(topo)
        eachCase(t, (s, d, e) => {
          const a = computeTilfa(topo, s, d, e)
          const b = computeTilfa(shuffled, s, d, e)
          expect(b.path).toEqual(a.path)
          expect(b.segments).toEqual(a.segments)
        })
      }),
      { numRuns: 20 },
    )
  })
})

// Property tests on random networks with parallel links (Phase 9.4, D29):
// docs/05-testing.md §3 items 2, 4 and 5, checked per link instead of per neighbor.
import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import type { Edge } from '../../src/engine/graph'
import { computeForSource } from '../../src/engine/index'
import { hopLinks, protectionPaths } from '../../src/engine/paths'
import { simulateFailure, type RepairMode } from '../../src/engine/simulate'
import { allPairs, dist, firstLinks, type AllPairs } from '../../src/engine/spf'
import { computeTilfa } from '../../src/engine/tilfa'
import type { NodeId, Topology } from '../../src/engine/types'
import { connectedTopology } from '../arbitraries'

const parallel = connectedTopology({ parallel: true })

/**
 * Every link a packet may take from X to `target` on normal tables, over every
 * ECMP branch, bundles included: all links on some shortest path.
 */
function forwardingLinks(t: AllPairs, x: NodeId, target: NodeId): Edge[] {
  const out: Edge[] = []
  const seen = new Set([x])
  const stack = [x]
  for (let cur = stack.pop(); cur !== undefined; cur = stack.pop()) {
    if (cur === target) continue
    for (const e of firstLinks(t, cur, target)) {
      out.push(e)
      if (!seen.has(e.to)) {
        seen.add(e.to)
        stack.push(e.to)
      }
    }
  }
  return out
}

/** Routers reachable from S once one link is gone, found without the engine. */
function reachableWithout(topo: Topology, s: NodeId, linkId: string): Set<NodeId> {
  const seen = new Set([s])
  const stack = [s]
  for (let cur = stack.pop(); cur !== undefined; cur = stack.pop()) {
    for (const l of topo.links) {
      if (l.id === linkId) continue
      const next = l.a === cur ? l.b : l.b === cur ? l.a : undefined
      if (next !== undefined && !seen.has(next)) {
        seen.add(next)
        stack.push(next)
      }
    }
  }
  return seen
}

/** Calls `check` for every source S, destination D and primary next-hop link of D. */
function eachPrimaryLink(t: AllPairs, check: (s: NodeId, d: NodeId, link: Edge) => void): void {
  for (const s of t.graph.nodes) {
    for (const d of t.graph.nodes) {
      if (d === s) continue
      for (const link of firstLinks(t, s, d)) check(s, d, link)
    }
  }
}

describe('parallel links: properties on random networks', () => {
  it('generates bundles in most networks', () => {
    const hasBundle = (topo: Topology) => {
      const pairs = topo.links.map((l) => [l.a, l.b].sort().join('|'))
      return new Set(pairs).size < pairs.length
    }
    const samples = fc.sample(parallel, { numRuns: 100, seed: 1 })
    expect(samples.filter(hasBundle).length).toBeGreaterThan(70)
  })

  it('TI-LFA: the repair never takes the failed link, ends at D, at the post-convergence cost', () => {
    fc.assert(
      fc.property(parallel, (topo) => {
        const t = allPairs(topo)
        eachPrimaryLink(t, (s, d, link) => {
          const r = computeTilfa(topo, s, d, link.to, link.linkId)
          expect(r.partitioned).toBe(!reachableWithout(topo, s, link.linkId).has(d))
          if (r.partitioned) return
          // Out of the outgoing interface, then each segment on normal tables.
          const out = t.graph.out.get(s)!.find((e) => e.linkId === r.outLink)!
          expect(out.linkId).not.toBe(link.linkId)
          expect(out.to).toBe(r.path![1])
          const used: Edge[] = [out]
          let cost = out.metric
          let cur = out.to
          for (const seg of r.segments!) {
            if (seg.kind === 'prefix') {
              used.push(...forwardingLinks(t, cur, seg.node))
              cost += dist(t, cur, seg.node)
              cur = seg.node
            } else {
              const e = t.graph.out.get(seg.from)!.find((x) => x.linkId === seg.link)!
              expect([cur, e.to]).toEqual([seg.from, seg.to])
              used.push(e)
              cost += e.metric
              cur = e.to
            }
          }
          expect(cur).toBe(d)
          expect(cost).toBe(r.cost)
          expect(used.some((e) => e.linkId === link.linkId)).toBe(false)
        })
      }),
      { numRuns: 30 },
    )
  })

  it('LFA and ECMP: every loop-free alternate avoids the failed link and reaches D', () => {
    fc.assert(
      fc.property(parallel, (topo) => {
        const t = allPairs(topo)
        for (const s of t.graph.nodes) {
          for (const r of computeForSource(topo, s, { explain: false })) {
            for (const p of r.protections) {
              for (const c of p.lfa.candidates) {
                expect(c.link).not.toBe(p.protectedLink.id)
                if (!c.loopFree) continue
                const links = forwardingLinks(t, c.neighbor, r.dest)
                expect(links.some((e) => e.to === s)).toBe(false)
                expect(links.some((e) => e.linkId === p.protectedLink.id)).toBe(false)
              }
              // Another link to the same neighbor protects the link, never the node.
              for (const c of p.lfa.candidates)
                if (c.neighbor === p.protectedLink.to) expect(c.nodeProtecting).toBe(false)
              if (p.lfa.best !== undefined) {
                const best = p.lfa.candidates.find((c) => c.link === p.lfa.bestLink)
                expect(best?.neighbor).toBe(p.lfa.best)
                expect(best?.loopFree).toBe(true)
              }
            }
          }
        }
      }),
      { numRuns: 20 },
    )
  })

  const input = parallel.chain((t) =>
    fc.record({
      t: fc.constant(t),
      s: fc.constantFrom(...t.nodes.map((n) => n.id)),
      links: fc.uniqueArray(fc.constantFrom(...t.links.map((l) => l.id)), {
        minLength: 1,
        maxLength: 3,
      }),
      mode: fc.constantFrom<RepairMode>('lfa', 'rlfa', 'tilfa'),
    }),
  )

  it('simulation: traffic only takes links that are up, and its cost is theirs', () => {
    fc.assert(
      fc.property(input, ({ t, s, links, mode }) => {
        const down = new Set(links)
        const byId = new Map(t.links.map((l) => [l.id, l]))
        for (const f of simulateFailure(t, s, links, mode).flows) {
          if (!f.repair) continue
          const hops = f.repairLinks!
          expect(hops.length).toBe(f.repair.length - 1)
          let cost = 0
          hops.forEach((id, i) => {
            expect(down.has(id)).toBe(false)
            const l = byId.get(id)!
            const [x, y] = [f.repair![i]!, f.repair![i + 1]!]
            expect([l.a, l.b].sort()).toEqual([x, y].sort())
            cost += l.a === x ? l.metricAB : l.metricBA
          })
          expect(f.repairCost).toBe(cost)
          if (f.status === 'repaired' && f.afterCost !== undefined)
            expect(f.repairCost).toBeGreaterThanOrEqual(f.afterCost)
        }
      }),
      { numRuns: 200 },
    )
  })

  it('simulation, one failed link: one repair at most, never a loop; TI-LFA = final path', () => {
    fc.assert(
      fc.property(input, ({ t, s, links, mode }) => {
        for (const f of simulateFailure(t, s, [links[0]!], mode).flows) {
          if (!f.affected) continue
          expect(f.hitLink).toBe(links[0])
          expect(f.repairs!.length).toBeLessThanOrEqual(1)
          expect(f.loopAt).toBeUndefined()
          if (mode === 'tilfa') expect(f.repair !== undefined).toBe(f.plrAfter !== undefined)
          if (f.method === 'tilfa') {
            expect(f.match).toBe('same')
            expect(f.plrRepairCost).toBe(f.plrAfterCost)
          }
        }
      }),
      { numRuns: 200 },
    )
  })

  it('simulation, one failed link: the repair takes the links the canvas draws', () => {
    fc.assert(
      fc.property(input, ({ t, s, links, mode }) => {
        const failed = links[0]!
        for (const f of simulateFailure(t, s, [failed], mode).flows) {
          if (!f.repair || f.method === 'ecmp') continue
          const r = computeForSource(t, f.plr!, { explain: false }).find((x) => x.dest === f.dest)!
          const p = r.protections.find((x) => x.protectedLink.id === failed)!
          const drawn = protectionPaths(t, f.plr!, f.dest, p)[f.method!]!
          const at = f.before.indexOf(f.plr!)
          expect(f.repair.slice(at)).toEqual(drawn)
          const first =
            f.method === 'lfa' ? p.lfa.bestLink : f.method === 'tilfa' ? p.tilfa.outLink : undefined
          expect(f.repairLinks!.slice(at)).toEqual(
            hopLinks(t, drawn, { ...(first !== undefined && { first }), avoid: [failed] }),
          )
        }
      }),
      { numRuns: 200 },
    )
  })
})

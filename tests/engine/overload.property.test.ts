import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { computeForSource } from '../../src/engine/index'
import { packetWalk } from '../../src/engine/packet-walk'
import { shortestPath } from '../../src/engine/paths'
import { simulateFailure, type RepairMode } from '../../src/engine/simulate'
import { allPairs, dist } from '../../src/engine/spf'
import type { NodeId } from '../../src/engine/types'
import { connectedTopology } from '../arbitraries'

/** Routers strictly inside a path: the ones that carry transit traffic. */
const transit = (path: NodeId[]) => path.slice(1, -1)

describe('overload bit properties (random graphs, about 1 router in 4 overloaded)', () => {
  const nets = fc.oneof(
    connectedTopology({ overload: true }),
    connectedTopology({ overload: true, parallel: true }),
  )

  it('SPF: dist(X,Y) = min over X’s links to N (N = Y or not overloaded) of c(X,N) + dist(N,Y)', () => {
    fc.assert(
      fc.property(nets, (t) => {
        const table = allPairs(t)
        const g = table.graph
        for (const x of g.nodes)
          for (const y of g.nodes) {
            if (x === y) continue
            let best = Infinity
            for (const e of g.out.get(x)!)
              if (e.to === y || !g.overloaded.has(e.to))
                best = Math.min(best, e.metric + dist(table, e.to, y))
            expect(dist(table, x, y)).toBe(best)
            const path = shortestPath(table, x, y)
            if (path) expect(transit(path).filter((n) => g.overloaded.has(n))).toEqual([])
          }
      }),
      { numRuns: 60 },
    )
  })

  it('no backup uses an overloaded router as an LFA, exit, PQ node or transit hop', () => {
    fc.assert(
      fc.property(nets, (t) => {
        const table = allPairs(t)
        const ol = table.graph.overloaded
        for (const s of table.graph.nodes)
          for (const r of computeForSource(t, s, { explain: false }))
            for (const p of r.protections) {
              const e = p.protectedLink.to
              const n = p.lfa.best
              if (n !== undefined) {
                expect(ol.has(n)).toBe(false)
                // Loop-free: N's path never comes back through S.
                expect(shortestPath(table, n, r.dest)).not.toContain(s)
              }
              const pq = p.rlfa.best
              if (pq !== undefined) {
                expect(ol.has(pq)).toBe(false)
                const exit = p.rlfa.exitVia[pq]
                if (exit !== undefined) expect(ol.has(exit)).toBe(false)
              }
              const path = p.tilfa.path
              if (path) {
                expect(transit(path).filter((x) => ol.has(x))).toEqual([])
                // Every router can really send it on its normal table (packetWalk throws otherwise).
                const w = packetWalk(t, s, r.dest, e, { link: p.protectedLink.id })
                expect(w?.hops.map((h) => h.router)).toEqual(path)
              }
            }
      }),
      { numRuns: 40 },
    )
  })

  it('one failed link: repaired traffic never passes through an overloaded router', () => {
    const input = nets.chain((t) =>
      fc.record({
        t: fc.constant(t),
        s: fc.constantFrom(...t.nodes.map((n) => n.id)),
        link: fc.constantFrom(...t.links.map((l) => l.id)),
        mode: fc.constantFrom<RepairMode>('lfa', 'rlfa', 'tilfa'),
      }),
    )
    fc.assert(
      fc.property(input, ({ t, s, link, mode }) => {
        const ol = allPairs(t).graph.overloaded
        for (const f of simulateFailure(t, s, [link], mode).flows) {
          if (f.status !== 'repaired') continue
          expect(transit(f.repair!).filter((x) => ol.has(x))).toEqual([])
          expect(f.repairs).toHaveLength(1)
        }
      }),
      { numRuns: 100 },
    )
  })
})

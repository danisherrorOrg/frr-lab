import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { compareBackups } from '../../src/engine/compare'
import { edgeOf } from '../../src/engine/graph'
import { computeForSource } from '../../src/engine/index'
import { protectionPaths } from '../../src/engine/paths'
import { protectedBy } from '../../src/engine/rows'
import { allPairs } from '../../src/engine/spf'
import { connectedTopology } from '../arbitraries'

// docs/02-algorithms.md §10: the compare view only lines up what each method decided.
describe('compareBackups on random networks', () => {
  for (const parallel of [false, true]) {
    it(`agrees with the results and never uses the failed link${parallel ? ' (bundles)' : ''}`, () => {
      fc.assert(
        fc.property(connectedTopology({ parallel }), (t) => {
          const graph = allPairs(t).graph
          for (const s of graph.nodes.slice(0, 4)) {
            for (const r of computeForSource(t, s, { explain: false })) {
              for (const p of r.protections) {
                const link = p.protectedLink.id
                const c = compareBackups(t, s, r.dest, link)
                expect(c.e).toBe(p.protectedLink.to)
                expect(c.primary.cost).toBe(r.cost)
                expect(c.protectedBy).toBe(protectedBy(p))
                expect(c.ecmp).toBe(p.ecmpProtected)

                const [lfa, rlfa, ti] = c.options
                expect(lfa.via).toBe(p.lfa.best)
                expect(ti.path).toEqual(p.tilfa.path)
                expect(ti.segments?.map((x) => x.label)).toEqual(p.tilfa.labelStack)
                // Remote LFA's PQ is the same one, shown even when an LFA makes it unneeded.
                if (p.rlfa.needed) expect(rlfa.via).toBe(p.rlfa.best)
                // Paths the diagram draws are the ones compared.
                const drawn = protectionPaths(t, s, r.dest, p)
                expect(lfa.path).toEqual(drawn.lfa)
                if (p.rlfa.needed) expect(rlfa.path).toEqual(drawn.rlfa)

                for (const o of c.options) {
                  expect(o.used).toBe(o.method === c.protectedBy)
                  if (!o.found) continue
                  const path = o.path!
                  expect(path[0]).toBe(s)
                  expect(path.at(-1)).toBe(r.dest)
                  expect(o.links).toHaveLength(path.length - 1)
                  let cost = 0
                  o.links!.forEach((l, i) => {
                    const edge = edgeOf(graph, path[i]!, l)!
                    expect(edge.to).toBe(path[i + 1])
                    cost += edge.metric
                  })
                  expect(o.cost).toBe(cost)
                  // No backup crosses the failed link or comes back through S: TI-LFA by
                  // construction, LFA by Inequality 1, Remote LFA by P- and Q-space.
                  expect(o.links).not.toContain(link)
                  expect(path.slice(1)).not.toContain(s)
                  // Nothing beats the shortest path without S–E.
                  expect(o.cost).toBeGreaterThanOrEqual(c.final!.cost)
                  expect(o.vsFinal === 'longer').toBe(o.cost! > c.final!.cost)
                  expect(o.segments!.at(-1)).toMatchObject({ kind: 'prefix', node: r.dest })
                  expect(o.extraLabels).toBe(o.segments!.length - 1)
                }
                expect(ti.found ? ti.vsFinal : 'same').toBe('same')
                if (lfa.found) expect(lfa.extraLabels).toBe(0)
                if (rlfa.found) expect(rlfa.extraLabels).toBe(rlfa.via === r.dest ? 0 : 1)
              }
            }
          }
        }),
        { numRuns: 60 },
      )
    })
  }
})

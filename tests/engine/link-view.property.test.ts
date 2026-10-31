import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { edgeOf } from '../../src/engine/graph'
import { computeForSource } from '../../src/engine/index'
import { linkView } from '../../src/engine/link-view'
import { toRows } from '../../src/engine/rows'
import { allPairs, avoidsLink, dist } from '../../src/engine/spf'
import { connectedTopology } from '../arbitraries'

// docs/02-algorithms.md §11: the per-link view only regroups the results table.
describe('linkView on random networks', () => {
  for (const parallel of [false, true]) {
    it(`lists exactly the rows and flows over each link${parallel ? ' (bundles)' : ''}`, () => {
      fc.assert(
        fc.property(connectedTopology({ parallel }), (t) => {
          const table = allPairs(t)
          for (const l of t.links.slice(0, 6)) {
            const v = linkView(t, l.id)
            for (const d of v.directions) {
              // Rows are the repairing router's own rows for this link.
              const own = toRows(d.from, computeForSource(t, d.from, { explain: false }))
              expect(d.pairs.map((p) => p.row)).toEqual(own.filter((r) => r.link === l.id))

              // A flow (X, D) is listed iff some shortest path X→D uses from→to (§1.5).
              const metric = edgeOf(table.graph, d.from, l.id)!.metric
              const listed = new Set(
                d.pairs.flatMap((p) => p.sources.map((x) => `${x}>${p.row.dest}`)),
              )
              for (const x of table.graph.nodes)
                for (const y of table.graph.nodes) {
                  if (x === y || dist(table, x, y) === Infinity) continue
                  const uses = !avoidsLink(table, x, y, d.from, d.to, metric)
                  expect(listed.has(`${x}>${y}`)).toBe(uses)
                }
              for (const p of d.pairs) expect(p.sources).toContain(d.from)
              expect(d.flows).toBe(listed.size)
            }
          }
        }),
        { numRuns: 40 },
      )
    })
  }
})

import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { packetWalk } from '../../src/engine/packet-walk'
import { allPairs } from '../../src/engine/spf'
import { computeTilfa } from '../../src/engine/tilfa'
import { connectedTopology } from '../arbitraries'

// docs/02-algorithms.md §4.5. packetWalk throws if a router can't do what its top
// label says, so running it on every case already checks the segment list.
describe('packet walk properties', () => {
  it.each([
    ['asymmetric metrics', {}],
    ['parallel links', { parallel: true }],
  ])(
    '%s: follows the repair path to D at its cost, and the labels hand over hop to hop',
    (_, opts) => {
      fc.assert(
        fc.property(connectedTopology(opts), (topo) => {
          const t = allPairs(topo)
          for (const [s, edges] of t.graph.out) {
            for (const { to: e, linkId } of edges) {
              for (const d of t.graph.nodes) {
                if (d === s) continue
                const r = computeTilfa(topo, s, d, e, linkId)
                for (const php of [true, false]) {
                  const w = packetWalk(topo, s, d, e, { link: linkId, php })
                  if (r.partitioned) {
                    expect(w).toBeUndefined()
                    continue
                  }
                  expect(w!.hops.map((h) => h.router)).toEqual(r.path)
                  expect(w!.cost).toBe(r.cost)
                  // S sends out of the repair interface with the full label stack, minus a PHP pop.
                  expect(w!.hops[0]!.link).toBe(r.outLink)
                  const first = w!.hops[0]!.sent!.map((x) => x.label)
                  const popped = r.path!.length === 2 && php ? 1 : 0
                  expect(first).toEqual(r.labelStack!.slice(popped))
                  // The failed link is never used.
                  expect(w!.hops.some((h) => h.link === r.link)).toBe(false)
                  for (let i = 0; i + 1 < w!.hops.length; i++) {
                    expect(w!.hops[i + 1]!.received).toEqual(w!.hops[i]!.sent)
                  }
                  const last = w!.hops.at(-1)!
                  expect(last.actions.at(-1)).toEqual({ kind: 'deliver' })
                  // With PHP, D gets a plain packet; without, its own label, which it pops.
                  expect(last.received.map((x) => x.label)).toEqual(
                    php ? [] : [r.labelStack!.at(-1)],
                  )
                }
              }
            }
          }
        }),
        { numRuns: 25 },
      )
    },
  )
})

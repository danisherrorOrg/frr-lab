import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { flowWalk, packetWalk, primaryWalk } from '../../src/engine/packet-walk'
import { protectionPaths } from '../../src/engine/paths'
import { computeForSource } from '../../src/engine/index'
import { simulateFailure, type RepairMode } from '../../src/engine/simulate'
import { allPairs, dist } from '../../src/engine/spf'
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

  it('primary walk: follows the drawn normal path at its cost, PHP before D', () => {
    fc.assert(
      fc.property(connectedTopology({ parallel: true }), (topo) => {
        const t = allPairs(topo)
        for (const s of t.graph.nodes) {
          for (const r of computeForSource(topo, s, { explain: false })) {
            for (const p of r.protections) {
              const w = primaryWalk(topo, s, r.dest, p.protectedLink.to, {
                link: p.protectedLink.id,
              })!
              expect(w.hops.map((h) => h.router)).toEqual(
                protectionPaths(topo, s, r.dest, p).primary,
              )
              expect(w.hops[0]!.link).toBe(p.protectedLink.id)
              expect(w.cost).toBe(dist(t, s, r.dest))
              expect(w.hops.at(-2)!.sent).toEqual([])
            }
          }
        }
      }),
      { numRuns: 15 },
    )
  })

  it('flow walk: the simulated path, labels handed over hop to hop, and the right ending', () => {
    const input = connectedTopology({ parallel: true }).chain((t) =>
      fc.record({
        t: fc.constant(t),
        s: fc.constantFrom(...t.nodes.map((n) => n.id)),
        links: fc.uniqueArray(fc.constantFrom(...t.links.map((l) => l.id)), {
          minLength: 1,
          maxLength: 3,
        }),
        nodes: fc.uniqueArray(fc.constantFrom(...t.nodes.map((n) => n.id)), { maxLength: 1 }),
        mode: fc.constantFrom<RepairMode>('lfa', 'rlfa', 'tilfa'),
        php: fc.boolean(),
      }),
    )
    fc.assert(
      fc.property(input, ({ t, s, links, nodes, mode, php }) => {
        if (nodes.includes(s)) return
        // flowWalk throws if a router couldn't send the labels the simulation says.
        for (const f of simulateFailure(t, s, { links, nodes }, mode).flows) {
          const w = flowWalk(t, f, { php })
          if (f.destDown) {
            expect(w).toBeUndefined()
            continue
          }
          const routers = w!.hops.map((h) => h.router)
          if (f.repair) {
            expect(routers).toEqual(f.repair)
            expect(w!.hops.slice(0, -1).map((h) => h.link)).toEqual(f.repairLinks)
            expect(w!.cost).toBe(f.repairCost)
          } else if (!f.affected) expect(routers).toEqual(f.before)
          for (let i = 0; i + 1 < w!.hops.length; i++) {
            expect(w!.hops[i + 1]!.received).toEqual(w!.hops[i]!.sent)
          }
          const repairs = w!.hops.flatMap((h) => h.actions.filter((a) => a.kind === 'repair'))
          expect(repairs.length).toBe(f.repairs?.length ?? 0)
          const end = w!.hops.at(-1)!.actions.at(-1)!.kind
          expect(end).toBe(f.drop ? 'drop' : f.loopAt !== undefined ? 'loop' : 'deliver')
        }
      }),
      { numRuns: 150 },
    )
  })
})

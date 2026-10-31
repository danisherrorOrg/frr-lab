import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { computeForSource } from '../../src/engine/index'
import { protectionPaths } from '../../src/engine/paths'
import { simulateFailure, type RepairMode } from '../../src/engine/simulate'
import type { NodeId } from '../../src/engine/types'
import { connectedTopology } from '../arbitraries'

const usesLink = (path: NodeId[], a: NodeId, b: NodeId) =>
  path.some((x, i) => {
    const y = path[i + 1]
    return (x === a && y === b) || (x === b && y === a)
  })

describe('simulateFailure properties (random connected graphs)', () => {
  const input = connectedTopology().chain((t) =>
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

  it('traffic only moves over links that are up, and each status matches where it ends', () => {
    fc.assert(
      fc.property(input, ({ t, s, links, mode }) => {
        const sim = simulateFailure(t, s, links, mode)
        const crossesAny = (p: NodeId[]) => sim.links.some((l) => usesLink(p, l.a, l.b))
        for (const f of sim.flows) {
          expect(f.affected).toBe(crossesAny(f.before))
          if (!f.affected) {
            expect(f.after).toEqual(f.before)
            continue
          }
          const plrAt = f.before.indexOf(f.plr!)
          expect(crossesAny(f.before.slice(0, plrAt + 1))).toBe(false)
          if (f.repair) {
            expect(crossesAny(f.repair)).toBe(false)
            expect(f.repair.slice(0, plrAt + 1)).toEqual(f.before.slice(0, plrAt + 1))
            expect(f.repairs![0]!.at).toBe(f.plr)
            expect(f.method).toBe(f.repairs![0]!.method)
          } else {
            expect(f.repairs).toEqual([])
            expect(f.drop).toMatchObject({ at: f.plr, link: f.hitLink, reason: 'no-backup' })
          }
          if (f.after) {
            expect(crossesAny(f.after)).toBe(false)
            expect(f.after.at(-1)).toBe(f.dest)
          }
          const reached = f.repair?.at(-1) === f.dest && !f.drop && f.loopAt === undefined
          if (f.loopAt !== undefined) {
            // The shown path ends where traffic first comes back to a router.
            expect(f.repair!.at(-1)).toBe(f.loopAt)
            expect(f.repair!.indexOf(f.loopAt)).toBeLessThan(f.repair!.length - 1)
          }
          expect([f.drop, f.loopAt, reached || undefined].filter((x) => x).length).toBe(1)
          const status = !f.after
            ? 'unreachable'
            : reached
              ? 'repaired'
              : f.drop
                ? 'dropped'
                : 'looped'
          expect(f.status).toBe(status)
          expect(f.match !== undefined).toBe(reached && f.plrAfter !== undefined)
        }
      }),
      { numRuns: 200 },
    )
  })

  it('one failed link: one repair at most, never a loop, the same backup as the drawings', () => {
    fc.assert(
      fc.property(input, ({ t, s, links, mode }) => {
        const link = links[0]!
        for (const f of simulateFailure(t, s, [link], mode).flows) {
          if (!f.affected) continue
          expect(f.repairs!.length).toBeLessThanOrEqual(1)
          expect(f.loopAt).toBeUndefined()
          if (!f.repair || f.method === 'ecmp') continue
          const r = computeForSource(t, f.plr!, { explain: false }).find((x) => x.dest === f.dest)!
          const p = r.protections.find((x) => x.protectedLink.to === f.next)!
          const drawn = protectionPaths(t, f.plr!, f.dest, p)[f.method!]
          expect(f.repair.slice(f.before.indexOf(f.plr!))).toEqual(drawn)
        }
      }),
      { numRuns: 200 },
    )
  })

  it('ECMP never sends traffic onto a failed member while another member is up (D25)', () => {
    fc.assert(
      fc.property(input, ({ t, s, links, mode }) => {
        const sim = simulateFailure(t, s, links, mode)
        const down = (x: NodeId, y: NodeId) =>
          sim.links.some((l) => (l.a === x && l.b === y) || (l.a === y && l.b === x))
        for (const f of sim.flows) {
          if (f.drop?.reason !== 'backup-down') continue
          // backup-down is decided at the router that just repaired: the last step.
          const last = f.repairs!.at(-1)!
          expect(last.at).toBe(f.drop.at)
          if (last.method !== 'ecmp') continue
          const r = computeForSource(t, last.at, { explain: false }).find(
            (x) => x.dest === last.target,
          )!
          expect(r.nextHops.every((n) => down(last.at, n))).toBe(true)
        }
      }),
      { numRuns: 200 },
    )
  })

  it('TI-LFA: traffic repaired by one router follows its post-convergence path (RFC 9855 §3)', () => {
    fc.assert(
      fc.property(input, ({ t, s, links }) => {
        for (const f of simulateFailure(t, s, links, 'tilfa').flows) {
          if (!f.affected) continue
          if (links.length === 1) expect(f.repair !== undefined).toBe(f.plrAfter !== undefined)
          if (f.status === 'repaired' && f.repairs!.length === 1) expect(f.match).toBe('same')
        }
      }),
      { numRuns: 200 },
    )
  })
})

import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
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

  it('repair and final paths never cross the link they repair, and end at D', () => {
    fc.assert(
      fc.property(input, ({ t, s, links, mode }) => {
        const sim = simulateFailure(t, s, links, mode)
        const down = sim.links
        const crossesAny = (p: NodeId[]) => down.some((l) => usesLink(p, l.a, l.b))
        for (const f of sim.flows) {
          expect(f.affected).toBe(crossesAny(f.before))
          if (!f.affected) {
            expect(f.after).toEqual(f.before)
            continue
          }
          const hit = down.find((l) => l.id === f.hitLink)!
          // The part before the PLR is the normal path, and it is still up.
          const plrAt = f.before.indexOf(f.plr!)
          expect(crossesAny(f.before.slice(0, plrAt + 1))).toBe(false)
          if (f.repair) {
            const own = f.repair.slice(plrAt)
            expect(usesLink(own, hit.a, hit.b)).toBe(false)
            expect(f.repair.at(-1)).toBe(f.dest)
            // Broken exactly when the repair runs into another failed link.
            expect(f.brokenAt !== undefined).toBe(crossesAny(own))
          } else {
            expect(f.brokenAt).toBeUndefined()
          }
          if (f.after) {
            expect(crossesAny(f.after)).toBe(false)
            expect(f.after.at(-1)).toBe(f.dest)
          }
          const status = !f.after
            ? 'unreachable'
            : !f.repair
              ? 'dropped'
              : f.brokenAt
                ? 'broken'
                : 'repaired'
          expect(f.status).toBe(status)
        }
      }),
      { numRuns: 150 },
    )
  })

  it('TI-LFA: a repair that survives equals the PLR’s post-convergence path (RFC 9855 §3)', () => {
    fc.assert(
      fc.property(input, ({ t, s, links }) => {
        for (const f of simulateFailure(t, s, links, 'tilfa').flows) {
          if (!f.affected) continue
          if (links.length === 1) expect(f.repair !== undefined).toBe(f.plrAfter !== undefined)
          if (f.status === 'repaired') expect(f.match).toBe('same')
        }
      }),
      { numRuns: 150 },
    )
  })
})

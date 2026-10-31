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
      link: fc.constantFrom(...t.links.map((l) => l.id)),
      mode: fc.constantFrom<RepairMode>('lfa', 'rlfa', 'tilfa'),
    }),
  )

  it('repair and final paths never cross the failed link, and end at D', () => {
    fc.assert(
      fc.property(input, ({ t, s, link, mode }) => {
        const sim = simulateFailure(t, s, link, mode)
        const { a, b } = sim.link
        for (const f of sim.flows) {
          if (!f.affected) expect(f.after).toEqual(f.before)
          // The part after the PLR is the repair; the part before it is the normal path.
          if (f.repair) {
            const plrAt = f.before.indexOf(f.plr!)
            expect(usesLink(f.repair.slice(plrAt), a, b)).toBe(false)
            expect(f.repair.at(-1)).toBe(f.dest)
          }
          if (f.after) {
            expect(usesLink(f.after, a, b)).toBe(false)
            expect(f.after.at(-1)).toBe(f.dest)
          }
        }
      }),
      { numRuns: 150 },
    )
  })

  it('TI-LFA: the repair always equals the PLR’s post-convergence path (RFC 9855 §3)', () => {
    fc.assert(
      fc.property(input, ({ t, s, link }) => {
        for (const f of simulateFailure(t, s, link, 'tilfa').flows) {
          if (!f.affected) continue
          // Repaired exactly when D can still be reached after the failure.
          expect(f.repair !== undefined).toBe(f.plrAfter !== undefined)
          if (f.repair) expect(f.match).toBe('same')
        }
      }),
      { numRuns: 150 },
    )
  })
})

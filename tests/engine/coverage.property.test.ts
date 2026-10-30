import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { computeCoverage } from '../../src/engine/index'
import { connectedTopology } from '../arbitraries'

// docs/05-testing.md §3 item 6.
describe('coverage properties', () => {
  it('item 6: LFA ≤ (LFA or RLFA) ≤ TI-LFA ≤ pairs, for every source', () => {
    fc.assert(
      fc.property(connectedTopology(), (topo) => {
        const r = computeCoverage(topo)
        for (const { counts } of [...r.sources, { counts: r.total }]) {
          expect(counts.ecmp).toBeLessThanOrEqual(counts.lfa)
          expect(counts.lfa).toBeLessThanOrEqual(counts.rlfa)
          expect(counts.rlfa).toBeLessThanOrEqual(counts.tilfa)
          expect(counts.tilfa).toBeLessThanOrEqual(counts.pairs)
        }
      }),
      { numRuns: 40 },
    )
  })

  it('TI-LFA fails only when the network is partitioned', () => {
    fc.assert(
      fc.property(connectedTopology(), (topo) => {
        const r = computeCoverage(topo)
        for (const u of r.unprotected) {
          expect(u.tilfa).toBe(u.reason !== 'partitioned')
        }
        const partitioned = r.unprotected.filter((u) => u.reason === 'partitioned').length
        expect(r.total.tilfa).toBe(r.total.pairs - partitioned)
      }),
      { numRuns: 40 },
    )
  })

  it('every pair not protected by LFA is listed exactly once', () => {
    fc.assert(
      fc.property(connectedTopology(), (topo) => {
        const r = computeCoverage(topo)
        const n = topo.nodes.length
        // Connected: every source reaches every other router.
        expect(r.total.pairs).toBeGreaterThanOrEqual(n * (n - 1))
        expect(r.unprotected.length).toBe(r.total.pairs - r.total.lfa)
        const keys = r.unprotected.map((u) => `${u.source}>${u.dest}>${u.link.to}`)
        expect(new Set(keys).size).toBe(keys.length)
      }),
      { numRuns: 30 },
    )
  })
})

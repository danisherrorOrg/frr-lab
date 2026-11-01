import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { addCounts, emptyCounts } from '../../src/engine/coverage'
import { coverageMap, protectedIn } from '../../src/engine/heat-map'
import { computeCoverage } from '../../src/engine/index'
import { linkView } from '../../src/engine/link-view'
import { connectedTopology } from '../arbitraries'
import { loadFixture } from '../helpers'

const c = (pairs: number, ecmp: number, lfa: number, rlfa: number, tilfa: number) => ({
  pairs,
  ecmp,
  lfa,
  rlfa,
  tilfa,
  tooDeep: 0,
})

// Worked checks, docs/02-algorithms.md §12.
describe('coverageMap: worked examples', () => {
  it('02-ring5: every router and link is half LFA, all Remote LFA', () => {
    const m = coverageMap(loadFixture('02-ring5.yaml'))
    // S–E: S repairs C (LFA A) and E (RLFA B); E repairs A (LFA C) and S (RLFA), §11.
    expect(m.links['S-E']).toEqual(c(4, 0, 2, 4, 4))
    for (const counts of [...Object.values(m.links), ...Object.values(m.routers)])
      expect(counts).toEqual(c(4, 0, 2, 4, 4))
  })

  it('03-ring5-highmetric: S–E needs TI-LFA for all 5 repairs; C–B carries nothing', () => {
    const m = coverageMap(loadFixture('03-ring5-highmetric.yaml'))
    // S over S–E: E, C. E over E–S: S, A, B (E-S-A-B = 3 < E-C-B = 11).
    expect(m.links['S-E']).toEqual(c(5, 0, 0, 0, 5))
    expect(m.links['C-B']).toEqual(c(0, 0, 0, 0, 0))
    expect(m.routers.S).toEqual(c(4, 0, 0, 0, 4))
    expect(m.routers.B).toEqual(c(4, 0, 4, 4, 4))
  })

  it('07-parallel: the costlier link of a bundle carries nothing, the ECMP pair is covered', () => {
    const m = coverageMap(loadFixture('07-parallel.yaml'))
    expect(m.links['S-E#2']).toEqual(c(0, 0, 0, 0, 0))
    expect(m.links['E-D']).toEqual(c(4, 4, 4, 4, 4))
    expect(m.links['E-D#2']).toEqual(c(4, 4, 4, 4, 4))
  })

  it('keys every router and every link, in a fixed order', () => {
    const t = loadFixture('04-isp-core.yaml')
    const m = coverageMap(t)
    expect(Object.keys(m.routers)).toEqual(t.nodes.map((n) => n.id).sort())
    expect(Object.keys(m.links)).toEqual(t.links.map((l) => l.id).sort())
    expect(coverageMap(t)).toEqual(m)
  })

  it('protectedIn picks the count for each repair mode', () => {
    const counts = c(5, 1, 2, 3, 5)
    expect([
      protectedIn(counts, 'lfa'),
      protectedIn(counts, 'rlfa'),
      protectedIn(counts, 'tilfa'),
    ]).toEqual([2, 3, 5])
  })

  it('reports progress per router', () => {
    const seen: string[] = []
    coverageMap(loadFixture('01-square.yaml'), {
      onProgress: (d, t, s) => seen.push(`${d}/${t} ${s}`),
    })
    expect(seen).toEqual(['1/4 D', '2/4 E', '3/4 N', '4/4 S'])
  })
})

describe('coverageMap on random networks', () => {
  for (const parallel of [false, true]) {
    it(`routers match the coverage report, links match the per-link view${parallel ? ' (bundles)' : ''}`, () => {
      fc.assert(
        fc.property(connectedTopology({ parallel }), fc.boolean(), (t, extended) => {
          const m = coverageMap(t, { extended })
          const report = computeCoverage(t, { extended })
          for (const s of report.sources) expect(m.routers[s.source]).toEqual(s.counts)

          // Every pair belongs to exactly one link.
          const sum = Object.values(m.links).reduce(addCounts, emptyCounts())
          expect(sum).toEqual(report.total)

          for (const l of t.links.slice(0, 4)) {
            const v = linkView(t, l.id, { extended })
            const counts = m.links[l.id]!
            const rows = v.directions.flatMap((d) => d.pairs.map((p) => p.row))
            expect(counts.pairs).toBe(rows.length)
            expect(counts.lfa).toBe(rows.filter((r) => r.lfa !== undefined).length)
            expect(counts.tilfa).toBe(rows.filter((r) => r.tilfa !== undefined).length)
            expect(counts.lfa).toBeLessThanOrEqual(counts.rlfa)
            expect(counts.rlfa).toBeLessThanOrEqual(counts.tilfa)
          }
        }),
        { numRuns: 30 },
      )
    })
  }
})

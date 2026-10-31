// Phase 9.6: compact results rows for every router as the DUT (device under test).
import { describe, expect, it } from 'vitest'
import { computeAllSources, computeForSource } from '../../src/engine/index'
import { protectedBy, toRows } from '../../src/engine/rows'
import { loadFixture } from '../helpers'

describe('toRows', () => {
  const isp = loadFixture('04-isp-core.yaml')

  it('Example 4 from PE1: one row per (destination, primary link), as in the table', () => {
    const results = computeForSource(isp, 'PE1')
    const rows = toRows('PE1', results)
    expect(rows).toHaveLength(results.reduce((n, r) => n + r.protections.length, 0))
    expect(rows.every((r) => r.source === 'PE1')).toBe(true)

    // docs/05-testing.md §2: P1 over PE1–P1 has no LFA; Remote LFA PE2 via P2;
    // TI-LFA [Adj P2→P1, Prefix P1] with labels 24000 16001.
    const p1 = rows.find((r) => r.dest === 'P1')!
    expect(p1).toMatchObject({
      cost: 10,
      via: 'P1',
      link: 'PE1-P1',
      ecmp: false,
      rlfa: { needed: true, pq: 'PE2', via: 'P2' },
      protectedBy: 'rlfa',
    })
    expect(p1.lfa).toBeUndefined()
    expect(p1.tilfa?.labelStack).toEqual([24000, 16001])
    expect(p1.tilfa?.segments.map((s) => s.kind)).toEqual(['adj', 'prefix'])
    expect(p1.tilfa?.out).toBe('P2')

    // PE2 is ECMP-protected: two rows (via P1 and via P2), each protects the other.
    const pe2 = rows.filter((r) => r.dest === 'PE2')
    expect(pe2.map((r) => r.via)).toEqual(['P1', 'P2'])
    expect(pe2.every((r) => r.ecmp && r.protectedBy === 'ecmp')).toBe(true)

    // P4 has LFA P1 only because of the asymmetric P1–P4 link.
    const p4 = rows.find((r) => r.dest === 'P4')!
    expect(p4.lfa).toMatchObject({ neighbor: 'P1', link: 'PE1-P1' })
    expect(p4.protectedBy).toBe('lfa')
  })

  it('protectedBy is the simplest method, the order coverage counts them in', () => {
    for (const r of computeForSource(isp, 'P3')) {
      for (const p of r.protections) {
        const row = toRows('P3', [{ ...r, protections: [p] }])[0]!
        expect(row.protectedBy).toBe(protectedBy(p))
      }
    }
  })

  it('Example 7: the LFA over the other link of a bundle keeps its link id', () => {
    const rows = toRows('S', computeForSource(loadFixture('07-parallel.yaml'), 'S'))
    const e = rows.find((r) => r.dest === 'E')!
    expect(e.link).toBe('S-E')
    expect(e.lfa).toMatchObject({ neighbor: 'E', link: 'S-E#2', nodeProtecting: false })
  })
})

describe('computeAllSources', () => {
  it('Example 4: every router, sorted, each the same as computing it alone', () => {
    const isp = loadFixture('04-isp-core.yaml')
    const progress: string[] = []
    const all = computeAllSources(isp, {
      onProgress: (done, total, s) => progress.push(`${done}/${total} ${s}`),
    })
    expect(all.map((x) => x.source)).toEqual(['P1', 'P2', 'P3', 'P4', 'PE1', 'PE2'])
    expect(progress).toEqual(['1/6 P1', '2/6 P2', '3/6 P3', '4/6 P4', '5/6 PE1', '6/6 PE2'])
    for (const { source, rows } of all)
      expect(rows).toEqual(toRows(source, computeForSource(isp, source, { explain: false })))
  })

  it('plain P-space changes the Remote LFA column (Example 2, S: PQ B either way)', () => {
    const ring = loadFixture('02-ring5.yaml')
    const plain = computeAllSources(ring, { extended: false }).find((x) => x.source === 'S')!
    expect(plain.rows.find((r) => r.dest === 'E')!.rlfa).toMatchObject({ needed: true, pq: 'B' })
  })
})

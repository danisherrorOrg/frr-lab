// TODO backlog "Per-link view": every (source, destination) a link carries and how
// each is protected when it fails. Worked checks: docs/02-algorithms.md §11.
import { describe, expect, it } from 'vitest'
import { computeForSource } from '../../src/engine/index'
import { linkView } from '../../src/engine/link-view'
import { toRows } from '../../src/engine/rows'
import { parseTopology } from '../../src/io/yaml'
import { loadFixture } from '../helpers'

const brief = (v: ReturnType<typeof linkView>) =>
  v.directions.map((d) => ({
    dir: `${d.from}>${d.to}`,
    pairs: d.pairs.map(
      (p) => `${p.row.dest}:${p.row.protectedBy ?? 'none'}:${p.sources.join(',')}`,
    ),
  }))

describe('linkView', () => {
  it('Example 2, link S–E: S repairs C (LFA A) and E (Remote LFA); E repairs A and S', () => {
    const v = linkView(loadFixture('02-ring5.yaml'), 'S-E')
    expect(v).toMatchObject({ link: 'S-E', a: 'S', b: 'E' })
    // §11: A's traffic to E crosses S→E (A-S-E = 2 < A-B-C-E = 3); C's to S crosses E→S.
    expect(brief(v)).toEqual([
      { dir: 'S>E', pairs: ['C:lfa:S', 'E:rlfa:A,S'] },
      { dir: 'E>S', pairs: ['A:lfa:E', 'S:rlfa:C,E'] },
    ])
    expect(v.directions[0]!.pairs[0]!.row.lfa?.neighbor).toBe('A')
    expect(v.directions[0]!.pairs[1]!.row.rlfa.pq).toBe('B')
    expect(v.directions.map((d) => d.flows)).toEqual([3, 3])
    expect(v.directions[0]!.counts).toEqual({ ecmp: 0, lfa: 1, rlfa: 1, tilfa: 0, none: 0 })
  })

  it('Example 3, link S–E: E needs TI-LFA with an Adj-SID', () => {
    const v = linkView(loadFixture('03-ring5-highmetric.yaml'), 'S-E')
    const e = v.directions[0]!.pairs.find((p) => p.row.dest === 'E')!
    expect(e.row.protectedBy).toBe('tilfa')
    expect(e.row.tilfa?.labelStack).toEqual([16004, 24005, 16002])
  })

  it('Example 4, link PE1–P1: rows equal PE1’s own table, ECMP and asymmetric metrics', () => {
    const isp = loadFixture('04-isp-core.yaml')
    const v = linkView(isp, 'PE1-P1')
    const pe1 = v.directions[0]!
    expect(pe1.from).toBe('PE1')
    const own = toRows('PE1', computeForSource(isp, 'PE1', { explain: false })).filter(
      (r) => r.link === 'PE1-P1',
    )
    expect(pe1.pairs.map((p) => p.row)).toEqual(own)
    // docs/05-testing.md §2: P1 and P3 by Remote LFA, PE2 by ECMP. P4 goes via P2,
    // so it is not here (its LFA is P1, over this link: a backup, not a primary).
    const by = Object.fromEntries(pe1.pairs.map((p) => [p.row.dest, p.row.protectedBy]))
    expect(by).toEqual({ P1: 'rlfa', P3: 'rlfa', PE2: 'ecmp' })
    // Transit traffic, §11: P4→P1 goes P4-P2-PE1-P1 (30 < 40 direct, the asymmetric link);
    // P2→P3 goes P2-PE1-P1-P3 (30 < P2-P4-P3 = 40).
    expect(brief(v)).toEqual([
      { dir: 'PE1>P1', pairs: ['P1:rlfa:P2,P4,PE1', 'P3:rlfa:P2,PE1', 'PE2:ecmp:PE1'] },
      // PE2→PE1 ties (PE2-P3-P1-PE1 = PE2-P4-P2-PE1 = 30), so it counts as crossing.
      { dir: 'P1>PE1', pairs: ['P2:lfa:P1,P3', 'PE1:lfa:P1,P3,PE2'] },
    ])
    expect(v.directions.map((d) => d.flows)).toEqual([6, 5])
  })

  it('Example 7: each link of a bundle is its own view', () => {
    const par = loadFixture('07-parallel.yaml')
    // S-E (10) carries S→E and S→D; its backup for E is the other link S-E#2.
    const one = linkView(par, 'S-E')
    expect(brief(one)).toEqual([
      { dir: 'S>E', pairs: ['D:lfa:S', 'E:lfa:S'] },
      { dir: 'E>S', pairs: ['S:lfa:D,E'] },
    ])
    expect(one.directions[0]!.pairs[1]!.row.lfa).toMatchObject({ neighbor: 'E', link: 'S-E#2' })
    // S-E#2 (20) is never on a shortest path: it is only a backup.
    expect(linkView(par, 'S-E#2').directions.every((d) => d.flows === 0)).toBe(true)
    // E-D#2 is one of two equal links, so everything over it is ECMP-protected.
    const eq = linkView(par, 'E-D#2')
    expect(eq.directions[0]!.counts).toEqual({ ecmp: 2, lfa: 0, rlfa: 0, tilfa: 0, none: 0 })
  })

  it('a link no shortest path uses carries nothing', () => {
    // Example 4: P1→P2 costs 30, P1-PE1-P2 costs 20, so P1–P2 carries no traffic.
    const v = linkView(loadFixture('04-isp-core.yaml'), 'P1-P2')
    expect(v.directions.every((d) => d.pairs.length === 0 && d.flows === 0)).toBe(true)
  })

  it('a bridge: nothing protects the traffic over it', () => {
    const r = parseTopology(
      'nodes: [{ id: A, sid: 1 }, { id: B, sid: 2 }]\nlinks: [{ a: A, b: B, metric: 5 }]',
    )
    if (!r.ok) throw new Error(r.errors.join())
    const v = linkView(r.topology, 'A-B')
    expect(brief(v)).toEqual([
      { dir: 'A>B', pairs: ['B:none:A'] },
      { dir: 'B>A', pairs: ['A:none:B'] },
    ])
    expect(v.directions[0]!.counts.none).toBe(1)
  })

  it('an unknown link throws', () => {
    expect(() => linkView(loadFixture('01-square.yaml'), 'nope')).toThrow(/Unknown link/)
  })
})

import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { computeCoverage } from '../../src/engine/index'
import { strength, whatIf } from '../../src/engine/what-if'
import type { Topology } from '../../src/engine/types'
import { connectedTopology } from '../arbitraries'
import { loadFixture } from '../helpers'

const withMetric = (t: Topology, id: string, ab: number, ba = ab): Topology => ({
  ...t,
  links: t.links.map((l) => (l.id === id ? { ...l, metricAB: ab, metricBA: ba } : l)),
})

const c = (pairs: number, ecmp: number, lfa: number, rlfa: number, tilfa: number) => ({
  pairs,
  ecmp,
  lfa,
  rlfa,
  tilfa,
  tooDeep: 0,
})

// Worked checks, docs/02-algorithms.md §13.
describe('whatIf: worked examples', () => {
  it('03 → C–B metric 1 (= Example 2): LFA 40% → 50%, LFA + Remote LFA 40% → 100%', () => {
    const t3 = loadFixture('03-ring5-highmetric.yaml')
    const w = whatIf(t3, withMetric(t3, 'C-B', 1))
    expect(w.before).toEqual(c(20, 0, 8, 8, 20))
    expect(w.after).toEqual(c(20, 0, 10, 20, 20))
    // The after side is Example 2's coverage.
    expect(w.after).toEqual(computeCoverage(loadFixture('02-ring5.yaml')).total)

    const se = w.changes.find((x) => x.source === 'S' && x.dest === 'E')
    // §6 Examples 3 and 2: TI-LFA with an Adj-SID becomes Remote LFA via PQ node B.
    expect(se).toEqual({
      source: 'S',
      dest: 'E',
      before: [{ link: 'S-E', via: 'E', by: 'tilfa' }],
      after: [{ link: 'S-E', via: 'E', by: 'rlfa' }],
      effect: 'better',
    })
    // B to E moves from B–A to C–B and keeps its LFA.
    expect(w.changes.find((x) => x.source === 'B' && x.dest === 'E')?.effect).toBe('rerouted')
    // B to A loses its LFA (C is no longer loop-free: 2 = 1 + 1).
    expect(w.changes.find((x) => x.source === 'B' && x.dest === 'A')?.effect).toBe('worse')
    const count = (e: string) => w.changes.filter((x) => x.effect === e).length
    expect([count('better'), count('worse'), count('rerouted')]).toEqual([12, 4, 2])
    expect(w.sources.find((s) => s.source === 'S')).toEqual({
      source: 'S',
      before: c(4, 0, 0, 0, 4),
      after: c(4, 0, 2, 4, 4),
    })
  })

  it('02 → S–E metric 3: Remote LFA coverage drops from 100% to 80%', () => {
    const t2 = loadFixture('02-ring5.yaml')
    const w = whatIf(t2, withMetric(t2, 'S-E', 3))
    expect(w.before).toEqual(c(20, 0, 10, 20, 20))
    expect(w.after).toEqual(c(20, 0, 10, 16, 20))
    expect(
      w.changes.filter((x) => x.effect === 'worse').map((x) => `${x.source}>${x.dest}`),
    ).toEqual(['A>C', 'B>A', 'B>C', 'B>E', 'B>S', 'C>A'])
  })

  it('no change, no diff', () => {
    const t = loadFixture('04-isp-core.yaml')
    const w = whatIf(t, t)
    expect(w.changes).toEqual([])
    expect(w.before).toEqual(w.after)
  })

  it('a one-way metric change works (asymmetric metrics)', () => {
    const t3 = loadFixture('03-ring5-highmetric.yaml')
    // Only B→C gets cheap: C→B stays 10.
    const t = { ...t3, links: t3.links.map((l) => (l.id === 'C-B' ? { ...l, metricBA: 1 } : l)) }
    const w = whatIf(t3, t)
    // S's repair for E needs B→C cheap only (B's path to E), so it becomes Remote LFA.
    expect(w.changes.find((x) => x.source === 'S' && x.dest === 'E')?.after).toEqual([
      { link: 'S-E', via: 'E', by: 'rlfa' },
    ])
  })

  it('ranks methods like the repair modes', () => {
    expect([null, 'tilfa', 'rlfa', 'lfa', 'ecmp'].map((m) => strength(m as never))).toEqual([
      0, 1, 2, 3, 3,
    ])
  })

  it('reports progress per router', () => {
    const t = loadFixture('01-square.yaml')
    const seen: string[] = []
    whatIf(t, withMetric(t, 'S-E', 30), { onProgress: (d, n, s) => seen.push(`${d}/${n} ${s}`) })
    expect(seen).toEqual(['1/4 D', '2/4 E', '3/4 N', '4/4 S'])
  })
})

describe('whatIf on random networks', () => {
  for (const parallel of [false, true]) {
    it(`each side equals the coverage report; changes match the counts${parallel ? ' (bundles)' : ''}`, () => {
      fc.assert(
        fc.property(
          connectedTopology({ parallel }),
          fc.nat(),
          fc.integer({ min: 1, max: 30 }),
          fc.boolean(),
          (t, pick, metric, extended) => {
            const link = t.links[pick % t.links.length]!
            const after = withMetric(t, link.id, metric)
            const w = whatIf(t, after, { extended })
            const rb = computeCoverage(t, { extended })
            const ra = computeCoverage(after, { extended })
            expect(w.before).toEqual(rb.total)
            expect(w.after).toEqual(ra.total)
            expect(w.sources.map((s) => s.before)).toEqual(rb.sources.map((s) => s.counts))
            expect(w.sources.map((s) => s.after)).toEqual(ra.sources.map((s) => s.counts))

            // A source with no change listed has the same LFA / RLFA / TI-LFA counts.
            for (const s of w.sources) {
              if (w.changes.some((x) => x.source === s.source)) continue
              expect([s.after.pairs, s.after.lfa, s.after.rlfa, s.after.tilfa]).toEqual([
                s.before.pairs,
                s.before.lfa,
                s.before.rlfa,
                s.before.tilfa,
              ])
            }
            // Swapping the sides swaps better and worse.
            const back = whatIf(after, t, { extended })
            const flip = { better: 'worse', worse: 'better', rerouted: 'rerouted' } as const
            expect(back.changes.map((x) => `${x.source}>${x.dest}:${x.effect}`)).toEqual(
              w.changes.map((x) => `${x.source}>${x.dest}:${flip[x.effect]}`),
            )
          },
        ),
        { numRuns: 25 },
      )
    })
  }
})

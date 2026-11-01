import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { simulateAllSources, type RepairMode } from '../../src/engine/simulate'
import type { Topology } from '../../src/engine/types'
import { weakSpots, type SpotCounts, type WeakSpot } from '../../src/engine/weak-spots'
import { connectedTopology } from '../arbitraries'
import { loadFixture, overloaded } from '../helpers'

const short = (s: WeakSpot) =>
  `${s.kind === 'link' ? s.id : `router ${s.id}`}: ${s.unprotected} of ${s.counts.affected}`

const MODES: RepairMode[] = ['lfa', 'rlfa', 'tilfa']

/** The same failure from every router, added up: what weakSpots must equal. */
function simulated(t: Topology, failed: { links?: string[]; nodes?: string[] }, mode: RepairMode) {
  const c: SpotCounts & { destDown: number } = {
    affected: 0,
    repaired: 0,
    dropped: 0,
    looped: 0,
    unreachable: 0,
    destDown: 0,
  }
  for (const r of simulateAllSources(t, failed, mode)) {
    if (!('summary' in r)) continue
    for (const k of Object.keys(c) as (keyof typeof c)[]) c[k] += r.summary[k]
  }
  return c
}

// docs/02-algorithms.md §17 worked checks.
describe('weakSpots: worked examples', () => {
  it('Example 3, LFA only: links S–E and A–S each leave 12 flows unprotected, then router S', () => {
    const w = weakSpots(loadFixture('03-ring5-highmetric.yaml'), 'lfa')
    expect(w.flows).toBe(20)
    expect(w.spots.slice(0, 5).map(short)).toEqual([
      'A-S: 12 of 12',
      'S-E: 12 of 12',
      'router S: 8 of 8',
      'B-A: 4 of 8',
      'E-C: 4 of 8',
    ])
    expect(w.spots[2]).toMatchObject({ destDown: 4, counts: { dropped: 8, repaired: 0 } })
    // C–B (metric 10) carries no traffic: it can only be a backup.
    expect(w.spots.find((s) => s.id === 'C-B')?.counts.affected).toBe(0)
  })

  it('Example 3, TI-LFA: no single failure leaves anything unprotected', () => {
    const w = weakSpots(loadFixture('03-ring5-highmetric.yaml'), 'tilfa')
    expect(w.spots.every((s) => s.unprotected === 0)).toBe(true)
    // Ties: most affected first, links before routers.
    expect(w.spots.slice(0, 5).map(short)).toEqual([
      'A-S: 0 of 12',
      'S-E: 0 of 12',
      'B-A: 0 of 8',
      'E-C: 0 of 8',
      'router S: 0 of 8',
    ])
  })

  it('Example 6, TI-LFA: router E is the weakest spot, its failure makes traffic loop', () => {
    const w = weakSpots(loadFixture('06-link-protecting.yaml'), 'tilfa')
    expect(w.spots[0]).toMatchObject({
      kind: 'node',
      id: 'E',
      unprotected: 2,
      counts: { affected: 4, repaired: 2, looped: 2, dropped: 0 },
    })
    // LFA only, router E's failure is fully repaired (§8.1), and link E–D is the weakest.
    const lfa = weakSpots(loadFixture('06-link-protecting.yaml'), 'lfa')
    expect(short(lfa.spots[0]!)).toBe('E-D: 5 of 8')
    expect(lfa.spots.find((s) => s.id === 'E' && s.kind === 'node')?.unprotected).toBe(0)
  })

  it('Example 1 with N overloaded: link E–D cuts N off from E and S', () => {
    const w = weakSpots(overloaded(loadFixture('01-square.yaml'), 'N'), 'tilfa')
    expect(w.spots[0]).toMatchObject({ kind: 'link', id: 'E-D' })
    expect(w.spots[0]!.counts.unreachable).toBeGreaterThan(0)
  })

  it('reports progress once per link and router', () => {
    const t = loadFixture('02-ring5.yaml')
    const seen: number[] = []
    weakSpots(t, 'lfa', { onProgress: (done, total) => seen.push(done * 100 + total) })
    expect(seen).toEqual(Array.from({ length: 10 }, (_, i) => (i + 1) * 100 + 10))
  })
})

describe('weakSpots: equal to the failure simulation from every router', () => {
  it('every example, every mode: each link and router as simulateAllSources counts it', () => {
    for (const f of ['01-square', '02-ring5', '04-isp-core', '05-leaf-spine', '07-parallel']) {
      const t = loadFixture(`${f}.yaml`)
      for (const mode of MODES) {
        for (const s of weakSpots(t, mode).spots) {
          const sim = simulated(t, s.kind === 'link' ? { links: [s.id] } : { nodes: [s.id] }, mode)
          const { destDown, ...counts } = sim
          expect(s.counts, `${f} ${mode} ${s.id}`).toEqual(counts)
          if (s.kind === 'node') expect(s.destDown).toBe(destDown)
        }
      }
    }
  })

  it('random networks (bundles, overloaded routers)', () => {
    const nets = fc
      .oneof(
        connectedTopology({ overload: true }),
        connectedTopology({ overload: true, parallel: true }),
        connectedTopology(),
      )
      .filter((t) => t.nodes.length <= 12)
    fc.assert(
      fc.property(nets, fc.constantFrom(...MODES), (t, mode) => {
        const w = weakSpots(t, mode)
        expect(w.spots).toHaveLength(t.links.length + t.nodes.length)
        for (const s of w.spots) {
          const { destDown, ...counts } = simulated(
            t,
            s.kind === 'link' ? { links: [s.id] } : { nodes: [s.id] },
            mode,
          )
          expect(s.counts).toEqual(counts)
          if (s.kind === 'node') expect(s.destDown).toBe(destDown)
          expect(s.unprotected).toBe(counts.dropped + counts.looped + counts.unreachable)
          // One link down: one router repairs at most, so traffic never loops (§8).
          if (s.kind === 'link') expect(s.counts.looped).toBe(0)
        }
        for (let i = 1; i < w.spots.length; i++)
          expect(w.spots[i - 1]!.unprotected).toBeGreaterThanOrEqual(w.spots[i]!.unprotected)
      }),
      { numRuns: 60 },
    )
  })
})

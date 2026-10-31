// Phase 9.6: the failure view for every router as the DUT. Expected values for
// Example 6 were worked out by hand first; the reasoning is in the comments.
import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import {
  meetsDownRouter,
  simulateAllSources,
  simulateFailure,
  summarizeFlows,
  type Failures,
  type FailureSummary,
  type RepairMode,
  type SourceFailure,
} from '../../src/engine/simulate'
import { connectedTopology } from '../arbitraries'
import { loadFixture } from '../helpers'

const none: FailureSummary = {
  affected: 0,
  repaired: 0,
  relayed: 0,
  dropped: 0,
  looped: 0,
  unreachable: 0,
  destDown: 0,
  viaRouter: 0,
  survive: 0,
  breaks: 0,
  noBackup: 0,
}

/** The summary for one source, failing loudly if that source was down. */
function summaryOf(all: SourceFailure[], source: string): FailureSummary {
  const x = all.find((y) => y.source === source)
  if (!x || 'down' in x) throw new Error(`no summary for ${source}`)
  return x.summary
}

describe('simulateAllSources: Example 6, router E down', () => {
  const t = loadFixture('06-link-protecting.yaml')

  it('LFA only: per DUT, what is affected and which backups survive or break', () => {
    const all = simulateAllSources(t, { nodes: ['E'] }, 'lfa')
    expect(all.map((x) => x.source)).toEqual(['D', 'E', 'M', 'N', 'S'])

    // E itself is down: it sends nothing.
    expect(all.find((x) => x.source === 'E')).toEqual({ source: 'E', down: true })

    // S: only D crosses E (S-E-D). LFA N is link-protecting only (dist(N,D)=2 is not
    // < dist(N,E)+dist(E,D)=2), so it breaks at N; N then repairs with its own LFA M.
    expect(summaryOf(all, 'S')).toEqual({
      ...none,
      affected: 1,
      repaired: 1,
      relayed: 1,
      destDown: 1,
      viaRouter: 1,
      breaks: 1,
    })

    // N: D crosses E (N-E-D). N's LFA M is node-protecting (dist(M,D)=10 < 11+1), so it survives.
    expect(summaryOf(all, 'N')).toEqual({
      ...none,
      affected: 1,
      repaired: 1,
      destDown: 1,
      viaRouter: 1,
      survive: 1,
    })

    // M: its paths to D (M-D), N (M-N) and S (M-N-S, 11 < 12) never touch E.
    expect(summaryOf(all, 'M')).toEqual({ ...none, destDown: 1 })

    // D: S and N both cross E; LFA M is node-protecting for both (11 < 11+1).
    expect(summaryOf(all, 'D')).toEqual({
      ...none,
      affected: 2,
      repaired: 2,
      destDown: 1,
      viaRouter: 2,
      survive: 2,
    })
  })

  it('TI-LFA: S’s link-protecting repair breaks and loops between S and N', () => {
    const s = summaryOf(simulateAllSources(t, { nodes: ['E'] }, 'tilfa'), 'S')
    expect(s).toMatchObject({ affected: 1, looped: 1, repaired: 0, breaks: 1 })
  })
})

describe('summarizeFlows: a backup can meet a down router off the normal path (D32)', () => {
  it('Example 1, source E, router S and link E–D down, LFA only', () => {
    const t = loadFixture('01-square.yaml')
    const sim = simulateFailure(t, 'E', { links: ['E-D'], nodes: ['S'] }, 'lfa')
    // N: E-D-N never touches S, but E–D is down and E's LFA for N is S
    // (dist(S,N)=15 < dist(S,E)+dist(E,N) = 10+20): that backup breaks because S is down.
    const n = sim.flows.find((f) => f.dest === 'N')!
    expect(n.through).toEqual({ node: 'S', at: 'E', why: { method: 'lfa', via: 'S' } })
    // D: E-D, and E has no LFA (S: dist(S,D)=20 is not < 10+10). It never meets S.
    const d = sim.flows.find((f) => f.dest === 'D')!
    expect(d.method).toBeUndefined()
    // So the router check counts N (it breaks), not D: the same rows the panel marks.
    expect(summarizeFlows(sim.flows, ['S'])).toEqual({
      ...none,
      affected: 2,
      unreachable: 2,
      destDown: 1,
      viaRouter: 1,
      breaks: 1,
    })
  })

  it('every flow whose backup passes a down router is counted as "breaks" (random networks)', () => {
    const input = connectedTopology().chain((t) => {
      const ids = t.nodes.map((n) => n.id)
      return fc
        .record({
          s: fc.constantFrom(...ids),
          x: fc.constantFrom(...ids),
          link: fc.constantFrom(...t.links.map((l) => l.id)),
          mode: fc.constantFrom<RepairMode>('lfa', 'rlfa', 'tilfa'),
        })
        .filter(({ s, x }) => s !== x)
        .map((r) => ({ t, ...r }))
    })
    fc.assert(
      fc.property(input, ({ t, s, x, link, mode }) => {
        const flows = simulateFailure(t, s, { links: [link], nodes: [x] }, mode).flows
        const sum = summarizeFlows(flows, [x])
        const meets = flows.filter((f) => meetsDownRouter(f, [x]))
        expect(sum.breaks).toBe(flows.filter((f) => f.through).length)
        expect(sum.viaRouter).toBe(meets.length)
        expect(sum.survive + sum.breaks + sum.noBackup).toBe(sum.viaRouter)
      }),
      { numRuns: 200 },
    )
  })
})

describe('summarizeFlows', () => {
  it('matches each source’s own simulation on every example, mode and single failure', () => {
    const files = [
      '01-square.yaml',
      '02-ring5.yaml',
      '04-isp-core.yaml',
      '06-link-protecting.yaml',
      '07-parallel.yaml',
    ]
    for (const file of files) {
      const t = loadFixture(file)
      const failures: Failures[] = [
        ...t.links.map((l) => ({ links: [l.id] })),
        ...t.nodes.map((n) => ({ nodes: [n.id] })),
      ]
      for (const mode of ['lfa', 'rlfa', 'tilfa'] as RepairMode[]) {
        for (const failed of failures) {
          const all = simulateAllSources(t, failed, mode)
          expect(all).toHaveLength(t.nodes.length)
          for (const x of all) {
            if (failed.nodes?.includes(x.source)) {
              expect(x).toEqual({ source: x.source, down: true })
              continue
            }
            const sim = simulateFailure(t, x.source, failed, mode)
            const s = summarizeFlows(sim.flows, failed.nodes ?? [])
            expect(summaryOf(all, x.source)).toEqual(s)
            // Every affected destination ends one way, and the router checks add up.
            expect(s.repaired + s.dropped + s.looped + s.unreachable).toBe(s.affected)
            expect(s.survive + s.breaks + s.noBackup).toBe(s.viaRouter)
          }
        }
      }
    }
  })

  it('reports progress for every source', () => {
    const t = loadFixture('01-square.yaml')
    const seen: number[] = []
    simulateAllSources(t, { links: ['S-E'] }, 'lfa', { onProgress: (done) => seen.push(done) })
    expect(seen).toEqual([1, 2, 3, 4])
  })
})

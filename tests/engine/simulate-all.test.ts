// Phase 9.6: the failure view for every router as the DUT. Expected values for
// Example 6 were worked out by hand first; the reasoning is in the comments.
import { describe, expect, it } from 'vitest'
import {
  simulateAllSources,
  simulateFailure,
  summarizeFlows,
  type Failures,
  type FailureSummary,
  type RepairMode,
  type SourceFailure,
} from '../../src/engine/simulate'
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

import { describe, expect, it } from 'vitest'
import { simulateFailure, type Failures, type RepairMode } from '../../src/engine/simulate'
import { loadFixture } from '../helpers'

/** The flow to `d` from `s` in each repair mode: what the compare view shows under a failure. */
function byMode(file: string, s: string, d: string, failed: Failures) {
  const t = loadFixture(file)
  const modes: RepairMode[] = ['lfa', 'rlfa', 'tilfa']
  return Object.fromEntries(
    modes.map((m) => [m, simulateFailure(t, s, failed, m).flows.find((f) => f.dest === d)!]),
  ) as Record<RepairMode, ReturnType<typeof simulateFailure>['flows'][number]>
}

// docs/02-algorithms.md §10.1: the compare view with links or routers down.
describe('compare view under a failure (the three repair modes)', () => {
  it('Example 3, S–E down: only TI-LFA delivers', () => {
    const f = byMode('03-ring5-highmetric.yaml', 'S', 'E', { links: ['S-E'] })
    expect(f.lfa).toMatchObject({ status: 'dropped', drop: { at: 'S', reason: 'no-backup' } })
    expect(f.rlfa).toMatchObject({ status: 'dropped', drop: { at: 'S' } })
    expect(f.tilfa).toMatchObject({
      status: 'repaired',
      method: 'tilfa',
      repair: ['S', 'A', 'B', 'C', 'E'],
      repairCost: 13,
      match: 'same',
    })
    expect(f.tilfa.repairLabels![0]!.map((x) => x.label)).toEqual([16004, 24005, 16002])
  })

  it('Example 6, router E down: LFA delivers through N and M, TI-LFA loops S–N', () => {
    const f = byMode('06-link-protecting.yaml', 'S', 'D', { nodes: ['E'] })
    // S's LFA N reaches D through E, so the backup breaks; N then repairs with its own LFA M.
    expect(f.lfa).toMatchObject({
      status: 'repaired',
      repair: ['S', 'N', 'M', 'D'],
      repairCost: 21,
      through: { node: 'E' },
    })
    expect(f.lfa.repairs!.map((r) => r.at)).toEqual(['S', 'N'])
    expect(f.tilfa).toMatchObject({ status: 'looped', loopAt: 'S', through: { node: 'E' } })
  })

  it('Example 4, PE1–P1 and P2–P4 down: TI-LFA is relayed and costlier than Remote LFA', () => {
    const f = byMode('04-isp-core.yaml', 'PE1', 'P3', { links: ['PE1-P1', 'P2-P4'] })
    expect(f.lfa.status).toBe('dropped')
    expect(f.rlfa).toMatchObject({ status: 'repaired', repairCost: 70, match: 'longer' })
    expect(f.tilfa).toMatchObject({ status: 'repaired', repairCost: 100, match: 'longer' })
    expect(f.tilfa.repairs!.map((r) => r.at)).toEqual(['PE1', 'P2', 'PE1'])
    expect(f.tilfa.afterCost).toBe(50)
  })
})

import { describe, expect, it } from 'vitest'
import { compareBackups, type BackupOption } from '../../src/engine/compare'
import { loadFixture } from '../helpers'

const opt = (c: ReturnType<typeof compareBackups>, m: BackupOption['method']) =>
  c.options.find((o) => o.method === m)!
const labels = (o: BackupOption) => o.segments?.map((s) => s.label)

// docs/02-algorithms.md §10: the three backups for one (S, D, link S–E), side by side.
describe('compareBackups', () => {
  it('Example 1: all three work and take S-N-D; LFA is the one used', () => {
    const t = loadFixture('01-square.yaml')
    const c = compareBackups(t, 'S', 'D', 'S-E')
    expect(c.primary).toEqual({ path: ['S', 'E', 'D'], links: ['S-E', 'E-D'], cost: 20 })
    expect(c.final).toEqual({ path: ['S', 'N', 'D'], links: ['S-N', 'N-D'], cost: 25 })
    expect(c.protectedBy).toBe('lfa')
    expect(c.options.map((o) => o.method)).toEqual(['lfa', 'rlfa', 'tilfa'])

    const lfa = opt(c, 'lfa')
    expect(lfa).toMatchObject({
      found: true,
      used: true,
      via: 'N',
      nodeProtecting: true,
      path: ['S', 'N', 'D'],
      links: ['S-N', 'N-D'],
      cost: 25,
      extraLabels: 0,
      vsFinal: 'same',
    })
    // An LFA adds no label: the packet keeps D's own Prefix-SID.
    expect(labels(lfa)).toEqual([16004])

    // Remote LFA isn't run when an LFA exists (RFC 7490 §1), but its tunnel is shown:
    // PQ = {N, D}, N is cheapest (15 < 15+10), so the tunnel is to N.
    const rlfa = opt(c, 'rlfa')
    expect(rlfa).toMatchObject({
      found: true,
      used: false,
      via: 'N',
      path: ['S', 'N', 'D'],
      cost: 25,
      extraLabels: 1,
      vsFinal: 'same',
    })
    expect(rlfa.exitVia).toBeUndefined()
    expect(labels(rlfa)).toEqual([16003, 16004])

    const ti = opt(c, 'tilfa')
    expect(ti).toMatchObject({ found: true, used: false, path: ['S', 'N', 'D'], cost: 25 })
    expect(labels(ti)).toEqual([16004])
  })

  it('Example 2: no LFA; Remote LFA (PQ = B) and TI-LFA both take S-A-B-C-E', () => {
    const t = loadFixture('02-ring5.yaml')
    const c = compareBackups(t, 'S', 'E', 'S-E')
    expect(c.primary.cost).toBe(1)
    expect(c.final).toMatchObject({ path: ['S', 'A', 'B', 'C', 'E'], cost: 4 })
    expect(c.protectedBy).toBe('rlfa')

    expect(opt(c, 'lfa')).toMatchObject({ found: false, used: false })
    expect(opt(c, 'lfa').path).toBeUndefined()

    const rlfa = opt(c, 'rlfa')
    expect(rlfa).toMatchObject({
      found: true,
      used: true,
      via: 'B',
      path: ['S', 'A', 'B', 'C', 'E'],
      cost: 4,
      extraLabels: 1,
      vsFinal: 'same',
    })
    expect(labels(rlfa)).toEqual([16004, 16002])

    const ti = opt(c, 'tilfa')
    expect(ti).toMatchObject({ found: true, used: false, cost: 4, extraLabels: 1, vsFinal: 'same' })
    expect(labels(ti)).toEqual([16004, 16002])
  })

  it('Example 2 with plain P-space still picks B (PQ = {B})', () => {
    const t = loadFixture('02-ring5.yaml')
    const rlfa = opt(compareBackups(t, 'S', 'E', 'S-E', { extended: false }), 'rlfa')
    expect(rlfa).toMatchObject({ found: true, via: 'B', path: ['S', 'A', 'B', 'C', 'E'] })
  })

  it('Example 3: only TI-LFA works, with an Adj-SID (labels 16004, 24005, 16002)', () => {
    const t = loadFixture('03-ring5-highmetric.yaml')
    const c = compareBackups(t, 'S', 'E', 'S-E')
    expect(c.protectedBy).toBe('tilfa')
    expect(opt(c, 'lfa').found).toBe(false)
    expect(opt(c, 'rlfa').found).toBe(false)
    const ti = opt(c, 'tilfa')
    expect(ti).toMatchObject({
      found: true,
      used: true,
      path: ['S', 'A', 'B', 'C', 'E'],
      cost: 13,
      extraLabels: 2,
      vsFinal: 'same',
    })
    expect(labels(ti)).toEqual([16004, 24005, 16002])
  })

  it('Example 4: the Remote LFA tunnel is longer than the final path', () => {
    const t = loadFixture('04-isp-core.yaml')
    const c = compareBackups(t, 'PE1', 'P1', 'PE1-P1')
    expect(c.final).toMatchObject({ path: ['PE1', 'P2', 'P1'], cost: 40 })
    expect(opt(c, 'lfa').found).toBe(false)
    expect(opt(c, 'rlfa')).toMatchObject({
      used: true,
      via: 'PE2',
      exitVia: 'P2',
      path: ['PE1', 'P2', 'P4', 'PE2', 'P3', 'P1'],
      cost: 50,
      vsFinal: 'longer',
    })
    expect(opt(c, 'tilfa')).toMatchObject({ cost: 40, vsFinal: 'same' })
    expect(labels(opt(c, 'tilfa'))).toEqual([24000, 16001])
  })

  it('Example 7: the LFA is the other link of the bundle, and the path names it (D29)', () => {
    const t = loadFixture('07-parallel.yaml')
    const c = compareBackups(t, 'S', 'E', 'S-E')
    expect(c.primary).toMatchObject({ path: ['S', 'E'], links: ['S-E'], cost: 10 })
    const lfa = opt(c, 'lfa')
    expect(lfa).toMatchObject({
      found: true,
      used: true,
      via: 'E',
      viaLink: 'S-E#2',
      nodeProtecting: false,
      path: ['S', 'E'],
      links: ['S-E#2'],
      cost: 20,
      vsFinal: 'same',
    })
    expect(opt(c, 'tilfa')).toMatchObject({ links: ['S-E#2'], cost: 20 })
  })

  it('ECMP: another primary next hop protects first, so none of the three is used', () => {
    const t = loadFixture('07-parallel.yaml')
    const c = compareBackups(t, 'E', 'D', 'E-D')
    expect(c.ecmp).toBe(true)
    expect(c.protectedBy).toBe('ecmp')
    expect(c.options.every((o) => !o.used)).toBe(true)
  })

  it('says when a backup is longer than the final path', () => {
    // S-E 1, E-D 1, S-N 5, N-D 1, S-M 1, M-N 1. M and N are both node-protecting LFAs;
    // N is downstream (1 < 2) and M isn't (2 < 2 ✗), so N wins (D7) with cost 5+1 = 6.
    // After S–E fails, S itself goes S-M-N-D (cost 3).
    const t = {
      name: 't',
      srgbBase: 16000,
      nodes: ['S', 'E', 'N', 'D', 'M'].map((id, i) => ({ id, sidIndex: i + 1 })),
      links: (
        [
          ['S', 'E', 1],
          ['E', 'D', 1],
          ['S', 'N', 5],
          ['N', 'D', 1],
          ['S', 'M', 1],
          ['M', 'N', 1],
        ] as const
      ).map(([a, b, m]) => ({ id: `${a}-${b}`, a, b, metricAB: m, metricBA: m })),
    }
    const c = compareBackups(t, 'S', 'D', 'S-E')
    expect(c.final).toMatchObject({ path: ['S', 'M', 'N', 'D'], cost: 3 })
    expect(opt(c, 'lfa')).toMatchObject({
      via: 'N',
      path: ['S', 'N', 'D'],
      cost: 6,
      vsFinal: 'longer',
    })
    // TI-LFA uses the final path itself (RFC 9855 §3).
    expect(opt(c, 'tilfa')).toMatchObject({ cost: 3, vsFinal: 'same' })
  })

  it('throws for a link that is not a primary next hop to D', () => {
    const t = loadFixture('01-square.yaml')
    expect(() => compareBackups(t, 'S', 'D', 'S-N')).toThrow()
  })
})

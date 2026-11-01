/// <reference types="node" />
// Import from FRR `show isis database detail` (Later #2, D52).
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { computeForSource } from '../../src/engine/index'
import { importFrr, parseFrrDatabase } from '../../src/io/frr'
import { loadFixture } from '../helpers'

const sample = (file: string) =>
  readFileSync(new URL(`../fixtures/frr/${file}`, import.meta.url), 'utf8')

const ok = (r: ReturnType<typeof importFrr>) => {
  if (!r.ok) throw new Error(r.errors.join('; '))
  return r
}

describe('importFrr: Example 2 ring, hostname style (FRR 8+)', () => {
  const r = ok(importFrr(sample('ring5.txt')))

  it('reads every router, its Prefix-SID, SRGB and MSD', () => {
    expect(r.level).toBe(2)
    expect(r.topology.srgbBase).toBe(16000)
    expect(r.topology.nodes.map((n) => [n.id, n.sidIndex, n.msd])).toEqual([
      ['A', 3, 16],
      ['B', 4, 16],
      ['C', 5, 16],
      ['E', 2, 16],
      ['S', 1, 16],
    ])
    expect(r.warnings).toEqual([])
  })

  it('pairs both directions of each adjacency, with the primary (B:0) Adj-SID', () => {
    expect(r.topology.links).toHaveLength(5)
    const sa = r.topology.links.find((l) => l.id === 'A-S')!
    // A lists B then S (15000/15002 primary); S lists A then E.
    expect(sa).toMatchObject({
      a: 'A',
      b: 'S',
      metricAB: 1,
      metricBA: 1,
      adjSidAB: 15002,
      adjSidBA: 15000,
    })
  })

  it('gives the same backups as the hand-written Example 2', () => {
    const mine = computeForSource(r.topology, 'S', { explain: false })
    const want = computeForSource(loadFixture('02-ring5.yaml'), 'S', { explain: false })
    const strip = (x: typeof mine) =>
      x.map((d) => ({
        dest: d.dest,
        cost: d.cost,
        p: d.protections.map((p) => ({
          lfa: p.lfa.best,
          pq: p.rlfa.best,
          path: p.tilfa.path,
          // Prefix labels match; Adj-SIDs come from the routers, not auto-assigned.
          prefix: p.tilfa.segments?.filter((s) => s.kind === 'prefix'),
        })),
      }))
    expect(strip(mine)).toEqual(strip(want))
  })
})

describe('importFrr: system-id style, two levels, LAN, odd cases', () => {
  const text = sample('mixed.txt')

  it('finds both levels and imports Level-2 by default', () => {
    const parsed = parseFrrDatabase(text)
    expect(parsed.ok && parsed.databases.map((d) => d.level)).toEqual([1, 2])
    const r = ok(importFrr(text))
    expect(r.levels).toEqual([1, 2])
    expect(r.level).toBe(2)
    expect(r.topology.name).toBe('FRR import (Level-2)')
  })

  it('names routers by hostname, made safe, and reads SIDs from an index or a label', () => {
    const { topology: t } = ok(importFrr(text))
    expect(t.srgbBase).toBe(20000)
    expect(t.nodes).toEqual([
      // Overload bit from ATT/P/OL 0/0/1; SID from label 20002 - SRGB 20000.
      { id: 'p_2', name: 'p-2', sidIndex: 2, overload: true },
      // No Prefix-SID: the lowest free index.
      { id: 'p_3', name: 'p-3', sidIndex: 3 },
      // Algorithm 0 only (the algorithm-128 SID is a Flex-Algo SID); MSD 4.
      { id: 'pe_1', name: 'pe-1', sidIndex: 1, msd: 4 },
      { id: 'pe_4', name: 'pe-4', sidIndex: 4 },
    ])
  })

  it('makes parallel links from two adjacencies, merges LSP fragments, and a LAN from the pseudonode', () => {
    const { topology: t } = ok(importFrr(text))
    expect(t.links.map((l) => [l.id, l.metricAB, l.metricBA, l.adjSidAB, l.adjSidBA])).toEqual([
      // pe-1 lists p-2 twice (10 with the IPv4 Adj-SID 24101, then 20); p-2 lists 10 and 25.
      ['p_2-pe_1', 10, 10, 24200, 24101],
      ['p_2-pe_1#2', 25, 20, undefined, undefined],
      ['p_3-pe_1', 15, 15, undefined, undefined],
      ['p_3-pe_4', 30, 30, undefined, undefined],
      // From pe-1's fragment 01.
      ['pe_1-pe_4', 30, 30, undefined, undefined],
      // The pseudonode 0000.0000.0002.01 lists p-2 and p-3; both list it at metric 10.
      ['p_2.01:p_2-p_3', 10, 10, undefined, undefined],
    ])
    expect(t.lans).toEqual([
      {
        id: 'p_2.01',
        members: [
          { node: 'p_2', metric: 10 },
          { node: 'p_3', metric: 10 },
        ],
      },
    ])
  })

  it('imports both levels as one multi-level network', () => {
    const r = ok(importFrr(text, { level: 'all' }))
    expect(r.level).toBe('all')
    expect(r.topology.name).toBe('FRR import (Level-1 and Level-2)')
    expect(r.topology.nodes.map((n) => [n.id, n.level, n.area])).toEqual([
      ['p_2', undefined, '49.0001'],
      ['p_3', '2', undefined],
      ['pe_1', undefined, '49.0001'],
      ['pe_4', '2', undefined],
    ])
    // The same adjacency in both levels is one link; the rest are Level-2 only.
    expect(r.topology.links.filter((l) => !l.lan).map((l) => [l.id, l.level])).toEqual([
      ['p_2-pe_1', undefined],
      ['p_2-pe_1#2', '2'],
      ['p_3-pe_1', '2'],
      ['p_3-pe_4', '2'],
      ['pe_1-pe_4', '2'],
    ])
    expect(r.topology.lans![0]!.level).toBe('2')
  })

  it('says what it skipped', () => {
    const { warnings } = ok(importFrr(text))
    expect(warnings).toEqual([
      'Skipped 1 multi-topology (MT) reachability entry: only the default topology is imported.',
      'The text has 2 databases (Level-1, Level-2); imported Level-2.',
      'p_3: no Prefix-SID found; gave it index 3.',
      'Skipped links to 0000.0000.0009: no LSP for that router in this level.',
    ])
  })

  it('imports Level-1 on request, with a one-way-free pair of routers', () => {
    const r = ok(importFrr(text, { level: 1 }))
    expect(r.topology.nodes.map((n) => [n.id, n.sidIndex])).toEqual([
      ['p_2', 102],
      ['pe_1', 101],
    ])
    expect(r.topology.links).toHaveLength(1)
    expect(r.warnings).toContain('No SRGB found; using 16000. Is segment routing on?')
  })

  it('skips an adjacency only one side lists (the IS-IS two-way check)', () => {
    const oneWay = text.replace('  Extended Reachability: 0000.0000.0003.00 (Metric: 30)\n', '')
    const r = ok(importFrr(oneWay))
    expect(r.topology.links.map((l) => l.id)).not.toContain('p_3-pe_4')
    expect(r.warnings.some((w) => w.includes('p_3–pe_4 (p_3 lists 1, pe_4 lists 0)'))).toBe(true)
  })
})

describe('importFrr: errors', () => {
  it('says what to paste when there are no LSPs', () => {
    const r = importFrr('hello\nshow ip route\n')
    expect(r.ok).toBe(false)
    expect(!r.ok && r.errors[0]).toContain('show isis database detail')
  })

  it('a level that is not there', () => {
    const r = importFrr(sample('ring5.txt'), { level: 1 })
    expect(!r.ok && r.errors[0]).toBe('There is no Level-1 database in the text (found: 2).')
  })

  it('two routers whose names clash after making them safe', () => {
    const text = sample('ring5.txt')
      .replaceAll('Hostname: A', 'Hostname: x-1')
      .replaceAll('Hostname: B', 'Hostname: x_1')
    const r = ok(importFrr(text))
    expect(r.warnings).toContain('Two routers are both named "x_1"; the second is "x_1_2".')
  })
})

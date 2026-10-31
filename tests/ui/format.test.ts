import { describe, expect, it } from 'vitest'
import { computeForSource } from '../../src/engine/index'
import { protectionPaths } from '../../src/engine/paths'
import { adjLabel } from '../../src/engine/labels'
import { simulateAllSources, type FailureSummary } from '../../src/engine/simulate'
import {
  dutSummary,
  lfaTags,
  outcomeText,
  pickBackup,
  protectedBy,
  segmentsShort,
  throughText,
  tooltipLines,
} from '../../src/ui/format'
import { loadFixture } from '../helpers'

const first = (file: string, s: string, d: string) =>
  computeForSource(loadFixture(file), s).find((r) => r.dest === d)!.protections[0]!

describe('protectedBy', () => {
  it('names the simplest method that works, for each worked example', () => {
    expect(protectedBy(first('01-square.yaml', 'S', 'D'))).toBe('lfa')
    expect(protectedBy(first('02-ring5.yaml', 'S', 'E'))).toBe('rlfa')
    expect(protectedBy(first('03-ring5-highmetric.yaml', 'S', 'E'))).toBe('tilfa')
    expect(protectedBy(first('05-leaf-spine.yaml', 'L1', 'L2'))).toBe('ecmp')
  })
})

describe('text helpers', () => {
  it('writes segment lists in short form', () => {
    const p = first('03-ring5-highmetric.yaml', 'S', 'E')
    expect(segmentsShort(p.tilfa.segments!)).toBe('B · B→C · E')
  })

  it('tags LFA candidates', () => {
    expect(lfaTags({ loopFree: true, downstream: true, nodeProtecting: true })).toBe(
      'node-protecting, downstream',
    )
    expect(lfaTags({ loopFree: true, downstream: false, nodeProtecting: false })).toBe(
      'link-protecting',
    )
    expect(lfaTags({ loopFree: false, downstream: false, nodeProtecting: false })).toBe(
      'not loop-free',
    )
  })
})

describe('pickBackup', () => {
  it("'auto' takes LFA, then Remote LFA, then TI-LFA", () => {
    const t = loadFixture('02-ring5.yaml')
    const p = first('02-ring5.yaml', 'S', 'E')
    const paths = protectionPaths(t, 'S', 'E', p)
    expect(pickBackup(paths, 'auto')).toEqual({ kind: 'rlfa', path: ['S', 'A', 'B', 'C', 'E'] })
    expect(pickBackup(paths, 'lfa')).toBeNull()
    expect(pickBackup(paths, 'tilfa')?.kind).toBe('tilfa')
  })
})

describe('throughText (Phase 9.3)', () => {
  it('LFA: the failed node-protecting inequality with real numbers', () => {
    const text = throughText(
      {
        node: 'E',
        at: 'N',
        why: { method: 'lfa', via: 'N', check: { distND: 2, distNE: 1, distED: 1 } },
      },
      'S',
      'E',
      'D',
    )
    expect(text).toBe(
      'LFA N reaches D through E: dist(N,D) = 2 is not < dist(N,E) + dist(E,D) = 1+1 = 2, so N only protects the link S–E, not the router (RFC 5286 §3.2).',
    )
  })

  it('Remote LFA and TI-LFA name the part that goes through the router', () => {
    expect(
      throughText(
        { node: 'E', at: 'C', why: { method: 'rlfa', pq: 'B', leg: 'from-pq' } },
        'S',
        'E',
        'D',
      ),
    ).toMatch(/^PQ node B reaches D through E \(C→E\)\. .*RFC 8102 §2\.1/)
    expect(
      throughText(
        {
          node: 'E',
          at: 'X',
          why: { method: 'tilfa', segment: { kind: 'prefix', node: 'E', label: 16002 } },
        },
        'S',
        'E',
        'D',
      ),
    ).toMatch(/^the segment list holds Prefix-SID\(E\) \(label 16002\)/)
  })

  // D28: a failed router other than the PLR's protected neighbor is a second failure,
  // not something node protection of that neighbor would avoid.
  it('a router that is not the protected neighbor is called a second failure', () => {
    // Example 5, source SP1, TI-LFA, fail L2–SP1 and router L1: SP1's repair for L2 leaves via L1.
    const tilfa = throughText(
      { node: 'L1', at: 'SP1', why: { method: 'tilfa', segment: null } },
      'SP1',
      'L2',
      'L2',
    )
    expect(tilfa).toBe(
      "its first hop is L1. L1 is a second failure: SP1's backup was planned for the link SP1–L2 alone, and FRR plans for one failure at a time.",
    )
    expect(tilfa).not.toMatch(/SP1–L1|node protection/)
    // Example 4, source PE1, TI-LFA, fail routers P1 and PE2: the repair for P3 is planned around P1.
    expect(
      throughText(
        {
          node: 'PE2',
          at: 'P4',
          why: { method: 'tilfa', segment: { kind: 'prefix', node: 'P3', label: 16003 } },
        },
        'PE1',
        'P1',
        'P3',
      ),
    ).toBe(
      "segment Prefix-SID(P3) follows normal paths through PE2 (P4→PE2). PE2 is a second failure: PE1's backup was planned for the link PE1–P1 alone, and FRR plans for one failure at a time.",
    )
  })

  it('a backup whose own neighbor or PQ node is down says so', () => {
    // Example 4, source P1, fail P1–P4 and router P2: P1's LFA for P4 is P2.
    expect(
      throughText({ node: 'P2', at: 'P1', why: { method: 'lfa', via: 'P2' } }, 'P1', 'P4', 'P4'),
    ).toBe(
      "LFA P2 is itself down. P2 is a second failure: P1's backup was planned for the link P1–P4 alone, and FRR plans for one failure at a time.",
    )
    expect(
      throughText({ node: 'PE1', at: 'P2', why: { method: 'ecmp', via: 'PE1' } }, 'P2', 'P4', 'P3'),
    ).toMatch(/^the other ECMP next hop PE1 is itself down\. /)
    // Example 1, source S, Remote LFA, fail E–D and router N: E's PQ node is N.
    expect(
      throughText(
        { node: 'N', at: 'S', why: { method: 'rlfa', pq: 'N', leg: 'to-pq' } },
        'E',
        'D',
        'D',
      ),
    ).toBe(
      "PQ node N is itself down. N is a second failure: E's backup was planned for the link E–D alone, and FRR plans for one failure at a time.",
    )
  })
})

describe('tooltipLines (Phase 9.5)', () => {
  const none = { links: [], nodes: [] }

  it('router: id, name, Prefix-SID index and its label; a down router says so', () => {
    const isp = loadFixture('04-isp-core.yaml')
    expect(tooltipLines(isp, { kind: 'node', id: 'PE1' }, none)).toEqual([
      'Router PE1',
      'Prefix-SID index 11 · label 16011',
    ])
    const named = { ...isp, nodes: isp.nodes.map((n) => ({ ...n, name: 'Edge 1' })) }
    expect(tooltipLines(named, { kind: 'node', id: 'PE1' }, { links: [], nodes: ['PE1'] })).toEqual(
      [
        'Router PE1 · Edge 1',
        'Prefix-SID index 11 · label 16011',
        '✕ down: all its links are down',
      ],
    )
  })

  it('link: metric each way, Adj-SIDs (set or auto), and whether it is down', () => {
    const isp = loadFixture('04-isp-core.yaml')
    expect(tooltipLines(isp, { kind: 'link', id: 'P1-P4' }, none)).toEqual([
      'Link P1–P4',
      'Metric P1→P4 20 · P4→P1 40',
      `Adj-SID P1→P4 ${adjLabel(isp, 'P1', 'P4')} (auto) · P4→P1 ${adjLabel(isp, 'P4', 'P1')} (auto)`,
    ])
    // Example 3: B→C is set in the file (24005), so it isn't marked auto.
    const high = loadFixture('03-ring5-highmetric.yaml')
    expect(tooltipLines(high, { kind: 'link', id: 'C-B' }, { links: [], nodes: ['B'] })).toEqual([
      'Link C–B',
      'Metric 10 both ways',
      'Adj-SID C→B 24006 · B→C 24005',
      '✕ down (router B is down)',
    ])
    expect(
      tooltipLines(high, { kind: 'link', id: 'C-B' }, { links: ['C-B'], nodes: [] }).at(-1),
    ).toBe('✕ down')
  })

  it('names the link of a bundle (D29)', () => {
    const par = loadFixture('07-parallel.yaml')
    expect(tooltipLines(par, { kind: 'link', id: 'S-E#2' }, none).slice(0, 2)).toEqual([
      'Link S–E (S-E#2)',
      'Metric 20 both ways',
    ])
  })

  it('is empty for something that is gone', () => {
    expect(tooltipLines(loadFixture('01-square.yaml'), { kind: 'node', id: 'Z' }, none)).toEqual([])
  })
})

describe('per-DUT failure text (Phase 9.6)', () => {
  const zero: FailureSummary = {
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

  it('outcomeText lists the non-zero outcomes in a fixed order', () => {
    expect(
      outcomeText({ ...zero, affected: 4, repaired: 2, relayed: 1, dropped: 1, looped: 1 }),
    ).toBe(
      '2 repaired (1 by more than one router), 1 dropped until convergence, 1 looping until convergence',
    )
    expect(outcomeText({ ...zero, affected: 1, unreachable: 1 })).toBe('0 repaired, 1 unreachable')
  })

  it('Example 6, router E down, LFA only: one line per DUT', () => {
    const all = simulateAllSources(loadFixture('06-link-protecting.yaml'), { nodes: ['E'] }, 'lfa')
    const line = (s: string) =>
      dutSummary(
        all.find((x) => x.source === s)!,
        true,
      )
    expect(line('E')).toBe('down: sends no traffic')
    expect(line('M')).toBe('nothing affected')
    expect(line('S')).toBe(
      '1 affected, 1 repaired (1 by more than one router); 0 survive, 1 breaks',
    )
    expect(line('D')).toBe('2 affected, 2 repaired; 2 survive, 0 break')
  })

  it('without a router down, no survive / break part', () => {
    const all = simulateAllSources(loadFixture('02-ring5.yaml'), { links: ['S-E'] }, 'tilfa')
    expect(
      dutSummary(
        all.find((x) => x.source === 'S')!,
        false,
      ),
    ).toBe('2 affected, 2 repaired')
  })
})

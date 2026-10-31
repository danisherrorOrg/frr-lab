import { describe, expect, it } from 'vitest'
import { computeForSource } from '../../src/engine/index'
import { protectionPaths } from '../../src/engine/paths'
import { lfaTags, pickBackup, protectedBy, segmentsShort, throughText } from '../../src/ui/format'
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

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
        'D',
      ),
    ).toMatch(/^the segment list holds Prefix-SID\(E\) \(label 16002\)/)
  })
})

import { describe, expect, it } from 'vitest'
import { computeForSource } from '../../src/engine/index'
import { protectionPaths } from '../../src/engine/paths'
import { lfaTags, pickBackup, protectedBy, segmentsShort } from '../../src/ui/format'
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

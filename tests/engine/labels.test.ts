import { describe, expect, it } from 'vitest'
import { adjLabel, labelTable, prefixLabel } from '../../src/engine/labels'
import type { Topology } from '../../src/engine/types'
import { loadFixture } from '../helpers'

// docs/02-algorithms.md §4.3, D9, D18.
describe('prefixLabel', () => {
  it('is SRGB base + SID index (Example 3: B=4 → 16004, E=2 → 16002)', () => {
    const t = loadFixture('03-ring5-highmetric.yaml')
    expect(prefixLabel(t, 'B')).toBe(16004)
    expect(prefixLabel(t, 'E')).toBe(16002)
  })

  it('uses the topology SRGB base', () => {
    const t: Topology = { ...loadFixture('01-square.yaml'), srgbBase: 900000 }
    expect(prefixLabel(t, 'D')).toBe(900004)
  })

  it('rejects an unknown router', () => {
    expect(() => prefixLabel(loadFixture('01-square.yaml'), 'Z')).toThrow(/unknown router "Z"/)
  })
})

describe('adjLabel', () => {
  it('takes the Adj-SID from the file, per direction (Example 3: B→C = 24005, C→B = 24006)', () => {
    const t = loadFixture('03-ring5-highmetric.yaml')
    expect(adjLabel(t, 'B', 'C')).toBe(24005)
    expect(adjLabel(t, 'C', 'B')).toBe(24006)
  })

  it('auto-assigns per router from 24000 in neighbor-ID order', () => {
    const t = loadFixture('02-ring5.yaml')
    // S's neighbors: A, E. E's neighbors: C, S.
    expect(adjLabel(t, 'S', 'A')).toBe(24000)
    expect(adjLabel(t, 'S', 'E')).toBe(24001)
    expect(adjLabel(t, 'E', 'C')).toBe(24000)
    expect(adjLabel(t, 'E', 'S')).toBe(24001)
  })

  it('skips labels the router already uses', () => {
    // Example 3: B has explicit 24005 towards C, so B→A gets 24000.
    // Give S an explicit 24000 towards E: S→A must skip to 24001.
    const base = loadFixture('03-ring5-highmetric.yaml')
    const t: Topology = {
      ...base,
      links: base.links.map((l) => (l.a === 'S' && l.b === 'E' ? { ...l, adjSidAB: 24000 } : l)),
    }
    expect(adjLabel(t, 'B', 'A')).toBe(24000)
    expect(adjLabel(t, 'S', 'E')).toBe(24000)
    expect(adjLabel(t, 'S', 'A')).toBe(24001)
  })

  it('never auto-assigns a prefix-SID label', () => {
    const base = loadFixture('02-ring5.yaml')
    const t: Topology = { ...base, srgbBase: 23999 } // S=24000, E=24001, ...
    expect(adjLabel(t, 'S', 'A')).toBe(24005)
    expect(adjLabel(t, 'S', 'E')).toBe(24006)
  })

  it('rejects routers that are not neighbors', () => {
    expect(() => adjLabel(loadFixture('02-ring5.yaml'), 'S', 'C')).toThrow(/no link S→C/)
  })

  it('labelTable is cached per topology and deterministic', () => {
    const t = loadFixture('02-ring5.yaml')
    expect(labelTable(t)).toBe(labelTable(t))
    const reordered: Topology = { ...t, links: [...t.links].reverse() }
    expect([...labelTable(reordered).adj].sort()).toEqual([...labelTable(t).adj].sort())
  })
})

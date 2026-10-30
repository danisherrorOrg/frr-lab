import { describe, expect, it } from 'vitest'
import { allPairs, dist, spf } from '../../src/engine/spf'
import type { Topology } from '../../src/engine/types'
import { loadFixture } from '../helpers'

const twoIslands: Topology = {
  name: 't',
  srgbBase: 16000,
  nodes: [
    { id: 'S', sidIndex: 1 },
    { id: 'E', sidIndex: 2 },
    { id: 'X', sidIndex: 3 },
  ],
  links: [{ id: 'S-E', a: 'S', b: 'E', metricAB: 3, metricBA: 5 }],
}

describe('allPairs', () => {
  it('holds a forward SPF from every router', () => {
    const table = allPairs(loadFixture('02-ring5.yaml'))
    expect([...table.from.keys()]).toEqual(table.graph.nodes)
    for (const x of table.graph.nodes) {
      expect(table.from.get(x)).toEqual(spf(table.graph, x))
    }
  })

  it('dist(X,Y) per direction, 0 to itself, Infinity when unreachable', () => {
    const table = allPairs(twoIslands)
    expect(dist(table, 'S', 'E')).toBe(3)
    expect(dist(table, 'E', 'S')).toBe(5)
    expect(dist(table, 'X', 'X')).toBe(0)
    expect(dist(table, 'S', 'X')).toBe(Infinity)
    expect(dist(table, 'X', 'S')).toBe(Infinity)
  })

  it('Infinity keeps the strict RFC inequalities false', () => {
    const table = allPairs(twoIslands)
    // An unreachable router can never pass a "<" check.
    expect(dist(table, 'S', 'X') < dist(table, 'S', 'E') + dist(table, 'E', 'X')).toBe(false)
  })

  it('rejects unknown routers', () => {
    expect(() => dist(allPairs(twoIslands), 'Nope', 'S')).toThrow(/unknown router "Nope"/)
    expect(() => dist(allPairs(twoIslands), 'S', 'Nope')).toThrow(/unknown router "Nope"/)
  })

  it('Example 2 table (docs/02-algorithms.md §6)', () => {
    const table = allPairs(loadFixture('02-ring5.yaml'))
    const rows: Record<string, [number, number, number, number]> = {
      // Y: [dist(S,Y), dist(E,Y), dist(Y,E), dist(Y,S)]
      A: [1, 2, 2, 1],
      B: [2, 2, 2, 2],
      C: [2, 1, 1, 2],
    }
    for (const [y, [sy, ey, ye, ys]] of Object.entries(rows)) {
      expect([
        dist(table, 'S', y),
        dist(table, 'E', y),
        dist(table, y, 'E'),
        dist(table, y, 'S'),
      ]).toEqual([sy, ey, ye, ys])
    }
  })
})

describe('allPairs cache', () => {
  it('returns the same table for the same topology object', () => {
    const t = loadFixture('01-square.yaml')
    expect(allPairs(t)).toBe(allPairs(t))
  })

  it('computes a fresh table for an edited copy', () => {
    const t = loadFixture('01-square.yaml')
    const before = allPairs(t)
    // Edit the way the store will: a new object, old one untouched.
    const edited: Topology = {
      ...t,
      links: t.links.map((l) => (l.id === 'S-E' ? { ...l, metricAB: 100, metricBA: 100 } : l)),
    }
    const after = allPairs(edited)
    expect(after).not.toBe(before)
    expect(dist(before, 'S', 'D')).toBe(20)
    expect(dist(after, 'S', 'D')).toBe(25)
    expect(allPairs(t)).toBe(before)
  })
})

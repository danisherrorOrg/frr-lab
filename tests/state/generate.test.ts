// D50: the random topology generator. Pure and seeded, so its output can be pinned down.
import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { computeCoverage, computeForSource } from '../../src/engine'
import type { Topology } from '../../src/engine/types'
import { parseTopology, serializeTopology } from '../../src/io/yaml'
import { generateTopology, SHAPES, SIZE_RANGE, type Shape } from '../../src/state/generate'

const gen = (shape: Shape, routers: number, seed = 1, variedMetrics = false) =>
  generateTopology({ shape, routers, seed, variedMetrics })

const degrees = (t: Topology) => {
  const d = new Map(t.nodes.map((n) => [n.id, 0]))
  for (const l of t.links) {
    d.set(l.a, d.get(l.a)! + 1)
    d.set(l.b, d.get(l.b)! + 1)
  }
  return d
}

/** Every router can reach every other (breadth-first search from the first). */
function connected(t: Topology): boolean {
  const seen = new Set([t.nodes[0]!.id])
  const queue = [t.nodes[0]!.id]
  for (let i = 0; i < queue.length; i++)
    for (const l of t.links) {
      const other = l.a === queue[i] ? l.b : l.b === queue[i] ? l.a : undefined
      if (other !== undefined && !seen.has(other)) {
        seen.add(other)
        queue.push(other)
      }
    }
  return seen.size === t.nodes.length
}

describe('generateTopology', () => {
  it('ring: n routers, n links, two each', () => {
    const t = gen('ring', 6)
    expect(t.name).toBe('Ring of 6')
    expect(t.nodes.map((n) => n.id)).toEqual(['R1', 'R2', 'R3', 'R4', 'R5', 'R6'])
    expect(t.links.map((l) => l.id)).toEqual(['R1-R2', 'R2-R3', 'R3-R4', 'R4-R5', 'R5-R6', 'R6-R1'])
    expect([...degrees(t).values()].every((d) => d === 2)).toBe(true)
    expect(t.links.every((l) => l.metricAB === 10 && l.metricBA === 10)).toBe(true)
  })

  it('grid: 3 columns for 7 routers, links right and down only', () => {
    const t = gen('grid', 7)
    expect(t.name).toBe('Grid 3×3, last row 1')
    // R1 R2 R3 / R4 R5 R6 / R7
    expect(t.links.map((l) => l.id).sort()).toEqual(
      ['R1-R2', 'R1-R4', 'R2-R3', 'R2-R5', 'R3-R6', 'R4-R5', 'R4-R7', 'R5-R6'].sort(),
    )
    expect(t.nodes.find((n) => n.id === 'R5')!.pos).toEqual({ x: 140, y: 140 })
  })

  it('leaf-spine: every leaf to every spine, 2 spines up to 8 routers, then 4', () => {
    const small = gen('leaf-spine', 6)
    expect(small.name).toBe('Leaf-spine: 2 spines, 4 leaves')
    expect(small.links).toHaveLength(8)
    const big = gen('leaf-spine', 20)
    expect(big.name).toBe('Leaf-spine: 4 spines, 16 leaves')
    expect(big.links).toHaveLength(64)
    const d = degrees(big)
    expect(d.get('SP1')).toBe(16)
    expect(d.get('L1')).toBe(4)
  })

  it('mesh: connected, no parallel links, about 3 links per router', () => {
    const t = gen('mesh', 30, 7)
    expect(connected(t)).toBe(true)
    const pairs = new Set(t.links.map((l) => [l.a, l.b].sort().join('|')))
    expect(pairs.size).toBe(t.links.length)
    expect(t.links).toHaveLength(45)
  })

  it('same options → same network; another seed → another mesh', () => {
    expect(gen('mesh', 12, 3, true)).toEqual(gen('mesh', 12, 3, true))
    expect(gen('mesh', 12, 4).links).not.toEqual(gen('mesh', 12, 3).links)
  })

  it('varied metrics are 5 to 50 in steps of 5, the same both ways', () => {
    const t = gen('grid', 25, 9, true)
    const metrics = new Set(t.links.map((l) => l.metricAB))
    expect(metrics.size).toBeGreaterThan(3)
    for (const l of t.links) {
      expect(l.metricAB).toBe(l.metricBA)
      expect(l.metricAB % 5).toBe(0)
      expect(l.metricAB).toBeGreaterThanOrEqual(5)
      expect(l.metricAB).toBeLessThanOrEqual(50)
    }
  })

  it('clamps the size to the shape range', () => {
    expect(gen('ring', 1).nodes).toHaveLength(SIZE_RANGE.ring.min)
    expect(gen('grid', 500).nodes).toHaveLength(SIZE_RANGE.grid.max)
  })

  it('the engine runs on it: TI-LFA protects every pair of a generated grid', () => {
    const t = gen('grid', 9)
    const { total } = computeCoverage(t)
    expect(total.pairs).toBeGreaterThan(0)
    expect(total.tilfa).toBe(total.pairs)
    expect(computeForSource(t, 'R1')).toHaveLength(8)
  })

  it('property: every shape and size is connected, loads from its YAML and has unique SIDs', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...SHAPES.map((s) => s.key)),
        fc.integer({ min: 0, max: 60 }),
        fc.integer({ min: 0, max: 1_000_000 }),
        fc.boolean(),
        (shape, routers, seed, varied) => {
          const t = gen(shape, routers, seed, varied)
          expect(connected(t)).toBe(true)
          expect(new Set(t.nodes.map((n) => n.sidIndex)).size).toBe(t.nodes.length)
          expect(t.nodes.every((n) => n.pos !== undefined)).toBe(true)
          const back = parseTopology(serializeTopology(t))
          expect(back.ok && back.warnings).toEqual([])
          if (back.ok) expect(back.topology.links).toEqual(t.links)
        },
      ),
      { numRuns: 60 },
    )
  })
})

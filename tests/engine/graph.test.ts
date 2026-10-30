import { describe, expect, it } from 'vitest'
import { buildGraph, linkMetric } from '../../src/engine/graph'
import type { Topology } from '../../src/engine/types'
import { loadFixture } from '../helpers'

const asymmetric: Topology = {
  name: 'asym',
  srgbBase: 16000,
  nodes: [
    { id: 'S', sidIndex: 1 },
    { id: 'E', sidIndex: 2 },
    { id: 'C', sidIndex: 3 },
    { id: 'Lonely', sidIndex: 4 },
  ],
  links: [
    { id: 'S-E', a: 'S', b: 'E', metricAB: 10, metricBA: 20 },
    { id: 'C-S', a: 'C', b: 'S', metricAB: 5, metricBA: 7 },
  ],
}

describe('buildGraph', () => {
  it('lists node ids in sorted order', () => {
    expect(buildGraph(asymmetric).nodes).toEqual(['C', 'E', 'Lonely', 'S'])
  })

  it('turns each link into two directed edges with their own metric', () => {
    const g = buildGraph(asymmetric)
    expect(g.out.get('S')).toEqual([
      { from: 'S', to: 'C', metric: 7, linkId: 'C-S' },
      { from: 'S', to: 'E', metric: 10, linkId: 'S-E' },
    ])
    expect(g.out.get('E')).toEqual([{ from: 'E', to: 'S', metric: 20, linkId: 'S-E' }])
  })

  it('keeps incoming edges for reverse SPF', () => {
    const g = buildGraph(asymmetric)
    // Edges that end at S: E→S (20) and C→S (5), sorted by the far end.
    expect(g.in.get('S')).toEqual([
      { from: 'C', to: 'S', metric: 5, linkId: 'C-S' },
      { from: 'E', to: 'S', metric: 20, linkId: 'S-E' },
    ])
  })

  it('gives a router with no links empty edge lists', () => {
    const g = buildGraph(asymmetric)
    expect(g.out.get('Lonely')).toEqual([])
    expect(g.in.get('Lonely')).toEqual([])
  })

  it('does not depend on the order of nodes and links in the file', () => {
    const shuffled: Topology = {
      ...asymmetric,
      nodes: [...asymmetric.nodes].reverse(),
      links: [...asymmetric.links].reverse(),
    }
    expect(buildGraph(shuffled)).toEqual(buildGraph(asymmetric))
  })

  it('builds Example 1 (square)', () => {
    const g = buildGraph(loadFixture('01-square.yaml'))
    expect(g.out.get('S')?.map((e) => [e.to, e.metric])).toEqual([
      ['E', 10],
      ['N', 15],
    ])
    expect(g.out.get('D')?.map((e) => e.to)).toEqual(['E', 'N'])
  })

  it('rejects a link to a router that does not exist', () => {
    const bad: Topology = {
      ...asymmetric,
      links: [{ id: 'S-X', a: 'S', b: 'X', metricAB: 1, metricBA: 1 }],
    }
    expect(() => buildGraph(bad)).toThrow(/unknown router "X"/)
  })
})

describe('linkMetric', () => {
  it('returns c(X,Y) per direction, or undefined when not adjacent', () => {
    const g = buildGraph(asymmetric)
    expect(linkMetric(g, 'S', 'E')).toBe(10)
    expect(linkMetric(g, 'E', 'S')).toBe(20)
    expect(linkMetric(g, 'E', 'C')).toBeUndefined()
    expect(linkMetric(g, 'Nope', 'S')).toBeUndefined()
  })
})

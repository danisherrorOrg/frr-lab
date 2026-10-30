import { describe, expect, it } from 'vitest'
import { computeForSource } from '../../src/engine/index'
import { protectionPaths, shortestPath } from '../../src/engine/paths'
import { allPairs } from '../../src/engine/spf'
import type { Topology } from '../../src/engine/types'
import { loadFixture } from '../helpers'

/** Topology from [a, b, metric] triples, symmetric metrics, SID index = position + 1. */
function topo(nodes: string[], links: [string, string, number][]): Topology {
  return {
    name: 't',
    srgbBase: 16000,
    nodes: nodes.map((id, i) => ({ id, sidIndex: i + 1 })),
    links: links.map(([a, b, m]) => ({ id: `${a}-${b}`, a, b, metricAB: m, metricBA: m })),
  }
}

function pathsFor(file: string, s: string, d: string, e?: string) {
  const t = loadFixture(file)
  const r = computeForSource(t, s).find((x) => x.dest === d)!
  const p = r.protections.find((x) => e === undefined || x.protectedLink.to === e)!
  return protectionPaths(t, s, d, p)
}

describe('shortestPath', () => {
  it('breaks ECMP ties by the lowest router id, like the post-convergence path (§4.1)', () => {
    const t = topo(
      ['S', 'B', 'A', 'D'],
      [
        ['S', 'B', 1],
        ['S', 'A', 1],
        ['A', 'D', 1],
        ['B', 'D', 1],
      ],
    )
    expect(shortestPath(allPairs(t), 'S', 'D')).toEqual(['S', 'A', 'D'])
  })

  it('is just [X] from a router to itself, and undefined when Y is unreachable', () => {
    const t = topo(['S', 'A', 'X'], [['S', 'A', 1]])
    expect(shortestPath(allPairs(t), 'S', 'S')).toEqual(['S'])
    expect(shortestPath(allPairs(t), 'S', 'X')).toBeUndefined()
  })

  it('follows the metric of each direction', () => {
    const t = loadFixture('04-isp-core.yaml')
    // P1→P4 costs 20 on the diagonal; P4→P1 costs 40, so the way back goes round.
    expect(shortestPath(allPairs(t), 'P1', 'P4')).toEqual(['P1', 'P4'])
    expect(shortestPath(allPairs(t), 'P4', 'P1')).toEqual(['P4', 'P2', 'PE1', 'P1'])
  })
})

describe('protectionPaths', () => {
  it('Example 1: primary S-E-D, LFA S-N-D, no RLFA (not needed)', () => {
    expect(pathsFor('01-square.yaml', 'S', 'D')).toEqual({
      primary: ['S', 'E', 'D'],
      lfa: ['S', 'N', 'D'],
      tilfa: ['S', 'N', 'D'],
    })
  })

  it('Example 2: RLFA tunnels to PQ node B, then B goes on to E', () => {
    expect(pathsFor('02-ring5.yaml', 'S', 'E')).toEqual({
      primary: ['S', 'E'],
      rlfa: ['S', 'A', 'B', 'C', 'E'],
      tilfa: ['S', 'A', 'B', 'C', 'E'],
    })
  })

  it('Example 3: only TI-LFA has a path', () => {
    expect(pathsFor('03-ring5-highmetric.yaml', 'S', 'E')).toEqual({
      primary: ['S', 'E'],
      tilfa: ['S', 'A', 'B', 'C', 'E'],
    })
  })

  it('Example 4: an extended-P PQ node is reached through its exit neighbor (D11)', () => {
    expect(pathsFor('04-isp-core.yaml', 'PE1', 'P1').rlfa).toEqual([
      'PE1',
      'P2',
      'P4',
      'PE2',
      'P3',
      'P1',
    ])
  })

  it('ECMP: the primary path goes through the protected next hop', () => {
    expect(pathsFor('05-leaf-spine.yaml', 'L1', 'L2', 'SP2').primary).toEqual(['L1', 'SP2', 'L2'])
    expect(pathsFor('05-leaf-spine.yaml', 'L1', 'L2', 'SP2').lfa).toEqual(['L1', 'SP1', 'L2'])
  })
})

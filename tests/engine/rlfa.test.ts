/// <reference types="node" />
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { computeRlfa, rlfaForProtection } from '../../src/engine/rlfa'
import { allPairs } from '../../src/engine/spf'
import type { Topology } from '../../src/engine/types'
import { loadFixture } from '../helpers'

interface ExpectedRlfa {
  pSpace: string[]
  extPSpace: string[]
  qSpace: string[]
  pq: string[]
  exitVia?: Record<string, string>
  best: string | null
  plainPSpaceOnly?: { pq: string[]; best: string | null }
}

function expectedRlfa(file: string): ExpectedRlfa {
  const name = file.replace(/\.yaml$/, '.expected.json')
  const raw = readFileSync(new URL(`../fixtures/${name}`, import.meta.url), 'utf8')
  const json = JSON.parse(raw) as { results: { protections: { rlfa: ExpectedRlfa }[] }[] }
  return json.results[0]!.protections[0]!.rlfa
}

/** Ring S–E–C–B–A–S, metric 1 everywhere except the given directed overrides. */
function ring(overrides: Record<string, number> = {}): Topology {
  const pairs: [string, string][] = [
    ['S', 'E'],
    ['E', 'C'],
    ['C', 'B'],
    ['B', 'A'],
    ['A', 'S'],
  ]
  return {
    name: 'ring',
    srgbBase: 16000,
    nodes: ['S', 'E', 'A', 'B', 'C'].map((id, i) => ({ id, sidIndex: i + 1 })),
    links: pairs.map(([a, b]) => ({
      id: `${a}-${b}`,
      a,
      b,
      metricAB: overrides[`${a}>${b}`] ?? 1,
      metricBA: overrides[`${b}>${a}`] ?? 1,
    })),
  }
}

// RFC 7490 §5.2.1, numbers from docs/02-algorithms.md §6.
describe('computeRlfa', () => {
  it('Example 2: P={A,B}, ext P={A,B,C}, Q={B,C}, PQ={B,C}, chosen B', () => {
    const file = '02-ring5.yaml'
    const want = expectedRlfa(file)
    const r = computeRlfa(allPairs(loadFixture(file)), 'S', 'E')
    expect(r.pSpace).toEqual(want.pSpace)
    expect(r.extPSpace).toEqual(want.extPSpace)
    expect(r.qSpace).toEqual(want.qSpace)
    expect(r.pq).toEqual(want.pq)
    expect(r.exitVia).toEqual(want.exitVia)
    expect(r.best).toBe(want.best)
    expect(r.extended).toBe(true)
  })

  it('Example 2 with plain P-space only: PQ={B}, chosen B', () => {
    const file = '02-ring5.yaml'
    const want = expectedRlfa(file).plainPSpaceOnly!
    const r = computeRlfa(allPairs(loadFixture(file)), 'S', 'E', { extended: false })
    expect(r.pq).toEqual(want.pq)
    expect(r.best).toBe(want.best)
    expect(r.exitVia).toEqual({})
    expect(r.extended).toBe(false)
    // The spaces themselves are still all shown.
    expect(r.extPSpace).toEqual(['A', 'B', 'C'])
  })

  it('Example 3: P={A,B}, ext P={A,B}, Q={C}, no PQ', () => {
    const file = '03-ring5-highmetric.yaml'
    const want = expectedRlfa(file)
    const r = computeRlfa(allPairs(loadFixture(file)), 'S', 'E')
    expect(r.pSpace).toEqual(want.pSpace)
    expect(r.extPSpace).toEqual(want.extPSpace)
    expect(r.qSpace).toEqual(want.qSpace)
    expect(r.pq).toEqual([])
    expect(r.exitVia).toEqual({})
    expect(r.best).toBeUndefined()
    expect(want.best).toBeNull()
  })

  it('keeps the numbers behind each check for the explain steps', () => {
    const r = computeRlfa(allPairs(loadFixture('02-ring5.yaml')), 'S', 'E')
    expect(r.cSE).toBe(1)
    expect(r.pChecks.find((c) => c.node === 'C')).toEqual({
      node: 'C',
      distSY: 2,
      distEY: 1,
      viaLink: 2,
      inP: false,
    })
    expect(r.extChecks).toContainEqual({
      neighbor: 'A',
      node: 'C',
      cSN: 1,
      distNY: 2,
      distNS: 1,
      distSY: 2,
      viaS: 3,
      inP: true,
    })
    expect(r.qChecks.find((c) => c.node === 'A')).toEqual({
      node: 'A',
      distYE: 2,
      distYS: 1,
      viaLink: 2,
      inQ: false,
    })
    expect(r.costs).toEqual([
      { node: 'B', cost: 2 },
      { node: 'C', cost: 3, exitVia: 'A', cSN: 1, distNY: 2 },
    ])
  })

  it('leaves S and E out of every space', () => {
    // Square S–E–D–N: E is in P(N) (N is loop-free for E), but never listed.
    const r = computeRlfa(allPairs(loadFixture('01-square.yaml')), 'S', 'E')
    for (const space of [r.pSpace, r.extPSpace, r.qSpace, r.pq]) {
      expect(space).not.toContain('S')
      expect(space).not.toContain('E')
    }
  })

  // §5.2.1.3 / §5.3: Q-space needs distances TO E (reverse SPF), not from E.
  it('asymmetric metrics: Q-space uses distances towards E', () => {
    // E→C costs 10 but C→E costs 1.
    const r = computeRlfa(allPairs(ring({ 'E>C': 10 })), 'S', 'E')
    // dist(C,E)=1 < dist(C,S)+c(S,E) = 2+1 ✓. A forward-SPF answer would use
    // dist(E,C)=4 (E-S-A-B-C) and wrongly fail C: 4 < dist(S,C)+1 = 4 ✗.
    expect(r.qChecks.find((c) => c.node === 'C')).toEqual({
      node: 'C',
      distYE: 1,
      distYS: 2,
      viaLink: 3,
      inQ: true,
    })
    expect(r.qSpace).toEqual(['B', 'C'])
    expect(r.pSpace).toEqual(['A', 'B', 'C'])
    expect(r.pq).toEqual(['B', 'C'])
    expect(r.best).toBe('B')
  })

  it('picks the lowest cost from S, not the lowest router ID (RFC 7490 §5.2.2)', () => {
    // Six-ring S–E–D–C–B–A–S plus a shortcut S–C (metric 2).
    const topo: Topology = {
      name: 'six',
      srgbBase: 16000,
      nodes: ['S', 'E', 'A', 'B', 'C', 'D'].map((id, i) => ({ id, sidIndex: i + 1 })),
      links: [
        ['S', 'E', 1],
        ['E', 'D', 1],
        ['D', 'C', 1],
        ['C', 'B', 1],
        ['B', 'A', 1],
        ['A', 'S', 1],
        ['S', 'C', 2],
      ].map(([a, b, m]) => ({
        id: `${a}-${b}`,
        a: a as string,
        b: b as string,
        metricAB: m as number,
        metricBA: m as number,
      })),
    }
    const r = computeRlfa(allPairs(topo), 'S', 'E')
    // C (cost 2) and D (cost 3 via C) are both PQ nodes; C is closer.
    expect(r.pq).toEqual(['C', 'D'])
    expect(r.costs.map((c) => [c.node, c.cost])).toEqual([
      ['C', 2],
      ['D', 3],
    ])
    expect(r.best).toBe('C')
  })

  it('a cost tie goes to the lowest router ID', () => {
    // S–E (3) plus two equal routes S–X–Z–E and S–Y–Z–E: X and Y both cost 1.
    const topo: Topology = {
      name: 'diamond',
      srgbBase: 16000,
      nodes: ['S', 'E', 'X', 'Y', 'Z'].map((id, i) => ({ id, sidIndex: i + 1 })),
      links: [
        ['S', 'E', 3],
        ['S', 'Y', 1],
        ['S', 'X', 1],
        ['X', 'Z', 1],
        ['Y', 'Z', 1],
        ['Z', 'E', 1],
      ].map(([a, b, m]) => ({
        id: `${a}-${b}`,
        a: a as string,
        b: b as string,
        metricAB: m as number,
        metricBA: m as number,
      })),
    }
    const t = allPairs(topo)
    const r = computeRlfa(t, 'S', 'E')
    expect(r.pq).toEqual(['X', 'Y', 'Z'])
    expect(r.best).toBe('X')
  })

  it('uses the cheapest exit neighbor, then the lowest ID', () => {
    // C is only in extended P-space; it is reachable from A (cost 1+2) and from
    // F (cost 5+1), so the exit is A.
    const topo: Topology = {
      ...ring(),
      nodes: [...ring().nodes, { id: 'F', sidIndex: 9 }],
      links: [
        ...ring().links,
        { id: 'S-F', a: 'S', b: 'F', metricAB: 5, metricBA: 5 },
        { id: 'F-C', a: 'F', b: 'C', metricAB: 1, metricBA: 1 },
      ],
    }
    const r = computeRlfa(allPairs(topo), 'S', 'E')
    expect(r.pSpace).not.toContain('C')
    expect(r.exitVia['C']).toBe('A')
  })

  it('never uses a max-metric link as an exit (RFC 7490 §5.4)', () => {
    const r = computeRlfa(allPairs(ring({ 'A>S': 16_777_215 })), 'S', 'E')
    expect(r.skipped).toEqual([{ neighbor: 'A', link: 'A-S', reason: 'max-metric' }])
    expect(r.extChecks).toEqual([])
    expect(r.extPSpace).toEqual(r.pSpace)
  })

  it('rejects a protected link that does not exist', () => {
    const t = allPairs(loadFixture('02-ring5.yaml'))
    expect(() => computeRlfa(t, 'S', 'C')).toThrow(/no link S→C/)
  })
})

describe('rlfaForProtection', () => {
  it('Example 1: an LFA exists, so RLFA is not needed (spaces kept)', () => {
    const r = computeRlfa(allPairs(loadFixture('01-square.yaml')), 'S', 'E')
    const p = rlfaForProtection(r, 'N')
    expect(p.needed).toBe(false)
    expect(p.best).toBeUndefined()
    expect(p.pSpace).toEqual(r.pSpace)
    expect(p.qSpace).toEqual(r.qSpace)
  })

  it('Example 2: no LFA, so the chosen PQ node is B', () => {
    const r = computeRlfa(allPairs(loadFixture('02-ring5.yaml')), 'S', 'E')
    expect(rlfaForProtection(r, undefined)).toEqual({
      pSpace: ['A', 'B'],
      extPSpace: ['A', 'B', 'C'],
      qSpace: ['B', 'C'],
      pq: ['B', 'C'],
      exitVia: { C: 'A' },
      extended: true,
      needed: true,
      best: 'B',
    })
  })

  it('Example 3: needed, but there is no PQ node', () => {
    const r = computeRlfa(allPairs(loadFixture('03-ring5-highmetric.yaml')), 'S', 'E')
    const p = rlfaForProtection(r, undefined)
    expect(p.needed).toBe(true)
    expect(p.best).toBeUndefined()
    expect('best' in p).toBe(false)
  })
})

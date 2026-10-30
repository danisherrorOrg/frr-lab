/// <reference types="node" />
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { computeTilfa, postConvergence, tilfaForProtection } from '../../src/engine/tilfa'
import type { Protection, Topology } from '../../src/engine/types'
import { loadFixture } from '../helpers'

interface Expected {
  results: {
    dest: string
    protections: { protectedLink: { from: string; to: string }; tilfa: Protection['tilfa'] }[]
  }[]
}

function expectedTilfa(file: string) {
  const name = file.replace(/\.yaml$/, '.expected.json')
  const raw = readFileSync(new URL(`../fixtures/${name}`, import.meta.url), 'utf8')
  const result = (JSON.parse(raw) as Expected).results[0]!
  const p = result.protections[0]!
  return { d: result.dest, e: p.protectedLink.to, tilfa: p.tilfa }
}

/** Topology from [a, b, metric] triples, symmetric metrics, SID index = position + 1. */
function topo(nodes: string[], links: [string, string, number][]): Topology {
  return {
    name: 't',
    srgbBase: 16000,
    nodes: nodes.map((id, i) => ({ id, sidIndex: i + 1 })),
    links: links.map(([a, b, m]) => ({ id: `${a}-${b}`, a, b, metricAB: m, metricBA: m })),
  }
}

// docs/02-algorithms.md §6 and docs/05-testing.md §2.
describe('computeTilfa: worked examples', () => {
  it.each(['01-square.yaml', '02-ring5.yaml', '03-ring5-highmetric.yaml'])(
    '%s matches its expected segment list and label stack',
    (file) => {
      const { d, e, tilfa } = expectedTilfa(file)
      const r = computeTilfa(loadFixture(file), 'S', d, e)
      expect(tilfaForProtection(r)).toEqual(tilfa)
    },
  )

  it('Example 1: the walk gives [Prefix N, Prefix D]; clean-up drops Prefix N', () => {
    const r = computeTilfa(loadFixture('01-square.yaml'), 'S', 'D', 'E')
    expect(r.rawSegments?.map((x) => x.kind + ':' + ('node' in x ? x.node : x.to))).toEqual([
      'prefix:N',
      'prefix:D',
    ])
    expect(r.dropped).toEqual({ kind: 'prefix', node: 'N', label: 16003 })
    expect(r.cost).toBe(25)
  })

  it('Example 3: post-convergence cost 13, out via A', () => {
    const r = computeTilfa(loadFixture('03-ring5-highmetric.yaml'), 'S', 'E', 'E')
    expect(r.cost).toBe(13)
    expect(r.path?.[1]).toBe('A')
    expect(r.dropped).toBeUndefined()
  })
})

describe('computeTilfa: rules', () => {
  it('drops a first Adj-SID for S’s own link too (RFC 9855 §5.1)', () => {
    // Normal S→N goes via E (2 < 5), so the walk starts with Adj(S→N).
    const t = topo(
      ['S', 'E', 'N', 'D'],
      [
        ['S', 'E', 1],
        ['E', 'N', 1],
        ['S', 'N', 5],
        ['N', 'D', 1],
        ['E', 'D', 10],
      ],
    )
    const r = computeTilfa(t, 'S', 'D', 'E')
    expect(r.path).toEqual(['S', 'N', 'D'])
    expect(r.rawSegments?.map((x) => x.kind)).toEqual(['adj', 'prefix'])
    expect(r.dropped).toMatchObject({ kind: 'adj', from: 'S', to: 'N' })
    expect(r.segments).toEqual([{ kind: 'prefix', node: 'D', label: 16004 }])
    expect(r.extraLabels).toBe(0)
  })

  it('ends with Prefix-SID(D) even when the walk ends with an Adj-SID into D (RFC 9855 §7.1)', () => {
    // Example 3 with D = C: B's normal path to C uses S–E, so the walk ends Adj(B→C).
    const r = computeTilfa(loadFixture('03-ring5-highmetric.yaml'), 'S', 'C', 'E')
    expect(r.path).toEqual(['S', 'A', 'B', 'C'])
    expect(r.segments).toEqual([
      { kind: 'prefix', node: 'B', label: 16004 },
      { kind: 'adj', from: 'B', to: 'C', label: 24005 },
      { kind: 'prefix', node: 'C', label: 16005 },
    ])
    expect(r.labelStack).toEqual([16004, 24005, 16005])
    expect(r.extraLabels).toBe(2)
  })

  it('3-node graph: the other neighbor is enough, zero extra labels', () => {
    const t = topo(
      ['S', 'E', 'D'],
      [
        ['S', 'E', 1],
        ['E', 'D', 1],
        ['S', 'D', 1],
      ],
    )
    const r = computeTilfa(t, 'S', 'E', 'E')
    expect(r.path).toEqual(['S', 'D', 'E'])
    expect(r.segments).toEqual([{ kind: 'prefix', node: 'E', label: 16002 }])
    expect(r.extraLabels).toBe(0)
  })

  it('a first hop that is D itself: Prefix-SID(D) stays, Adj-SID(S→D) is dropped', () => {
    const t = topo(
      ['S', 'E', 'D'],
      [
        ['S', 'E', 1],
        ['E', 'D', 1],
        ['S', 'D', 3],
      ],
    )
    // Normal S→D goes via E (2 < 3), so the walk gives [Adj(S→D)]. S doesn't push
    // a label for its own link, and D's own label goes at the bottom.
    const r = computeTilfa(t, 'S', 'D', 'E')
    expect(r.path).toEqual(['S', 'D'])
    expect(r.dropped).toMatchObject({ kind: 'adj', from: 'S', to: 'D' })
    expect(r.segments).toEqual([{ kind: 'prefix', node: 'D', label: 16003 }])
    // With S–D the cheapest route anyway, the walk gives [Prefix D], which stays.
    const direct = computeTilfa(
      {
        ...t,
        links: t.links.map((l) => ({
          ...l,
          metricAB: l.id === 'S-D' ? 1 : 2,
          metricBA: l.id === 'S-D' ? 1 : 2,
        })),
      },
      'S',
      'D',
      'E',
    )
    expect(direct.dropped).toBeUndefined()
  })

  it('bridge link: D is unreachable after the failure, so it is unprotected', () => {
    const t = topo(
      ['S', 'E', 'A', 'F'],
      [
        ['S', 'E', 1],
        ['E', 'F', 1],
        ['S', 'A', 1],
      ],
    )
    for (const d of ['E', 'F']) {
      const r = computeTilfa(t, 'S', d, 'E')
      expect(r.partitioned).toBe(true)
      expect(r.path).toBeUndefined()
      expect(r.segments).toBeUndefined()
      expect(tilfaForProtection(r)).toEqual({})
    }
  })

  it('rejects bad input', () => {
    const t = loadFixture('02-ring5.yaml')
    expect(() => computeTilfa(t, 'S', 'S', 'E')).toThrow(/its own destination/)
    expect(() => computeTilfa(t, 'S', 'E', 'C')).toThrow(/no link S→C/)
  })
})

describe('postConvergence', () => {
  it('ties: the lowest router ID at the first difference wins', () => {
    // After S–E fails: S-A-Y-D and S-B-X-D both cost 3. Router by router from S,
    // A < B decides, even though X < Y at the end.
    const t = topo(
      ['S', 'E', 'A', 'B', 'X', 'Y', 'D'],
      [
        ['S', 'E', 1],
        ['E', 'D', 1],
        ['S', 'A', 1],
        ['A', 'Y', 1],
        ['Y', 'D', 1],
        ['S', 'B', 1],
        ['B', 'X', 1],
        ['X', 'D', 1],
      ],
    )
    expect(postConvergence(t, 'S', 'E').path.get('D')).toEqual(['S', 'A', 'Y', 'D'])
    // Same answer whatever order the file lists things in.
    const shuffled: Topology = {
      ...t,
      nodes: [...t.nodes].reverse(),
      links: [...t.links].reverse(),
    }
    expect(postConvergence(shuffled, 'S', 'E').path.get('D')).toEqual(['S', 'A', 'Y', 'D'])
  })

  it('removes the link in both directions', () => {
    const pc = postConvergence(loadFixture('02-ring5.yaml'), 'S', 'E')
    expect(pc.dist.get('E')).toBe(4)
    expect(pc.path.get('E')).toEqual(['S', 'A', 'B', 'C', 'E'])
  })

  it('is cached per topology and link', () => {
    const t = loadFixture('02-ring5.yaml')
    expect(postConvergence(t, 'S', 'E')).toBe(postConvergence(t, 'S', 'E'))
  })
})

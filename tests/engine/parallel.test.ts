// Parallel links between two routers (Phase 9.4, D29). Numbers worked out by hand
// in docs/02-algorithms.md §9.
import { describe, expect, it } from 'vitest'
import { computeForSource } from '../../src/engine/index'
import { adjLabel, labelTable } from '../../src/engine/labels'
import { computeLfa } from '../../src/engine/lfa'
import { hopLinks } from '../../src/engine/paths'
import { simulateFailure, type Flow } from '../../src/engine/simulate'
import { allPairs, firstLinks } from '../../src/engine/spf'
import { computeTilfa } from '../../src/engine/tilfa'
import type { Topology } from '../../src/engine/types'
import { loadFixture } from '../helpers'

const ex7 = () => loadFixture('07-parallel.yaml')

/** Topology from [id, a, b, metric] rows, symmetric metrics, SID index = position + 1. */
function topo(nodes: string[], links: [string, string, string, number][]): Topology {
  return {
    name: 't',
    srgbBase: 16000,
    nodes: nodes.map((id, i) => ({ id, sidIndex: i + 1 })),
    links: links.map(([id, a, b, m]) => ({ id, a, b, metricAB: m, metricBA: m })),
  }
}

const flow = (flows: Flow[], dest: string) => {
  const f = flows.find((x) => x.dest === dest)
  if (!f) throw new Error(`no flow to ${dest}`)
  return f
}

const result = (t: Topology, s: string, d: string) => {
  const r = computeForSource(t, s).find((x) => x.dest === d)
  if (!r) throw new Error(`no result for ${d}`)
  return r
}

describe('parallel links: SPF and ECMP', () => {
  it('two equal links to the next hop are two primary next-hop links', () => {
    const table = allPairs(ex7())
    expect(firstLinks(table, 'E', 'D').map((e) => e.linkId)).toEqual(['E-D', 'E-D#2'])
    // The costlier link of a bundle is not a primary link.
    expect(firstLinks(table, 'S', 'E').map((e) => e.linkId)).toEqual(['S-E'])
    expect(firstLinks(table, 'S', 'D').map((e) => e.linkId)).toEqual(['S-E'])
  })

  it('one protection per link; each equal link protects the other (ECMP)', () => {
    const r = result(ex7(), 'E', 'D')
    expect(r.nextHops).toEqual(['D'])
    expect(r.protections.map((p) => p.protectedLink)).toEqual([
      { from: 'E', to: 'D', id: 'E-D' },
      { from: 'E', to: 'D', id: 'E-D#2' },
    ])
    for (const p of r.protections) expect(p.ecmpProtected).toBe(true)
  })

  it('failing one link of an equal bundle is ECMP-protected; the other link is untouched', () => {
    const one = flow(simulateFailure(ex7(), 'E', ['E-D'], 'tilfa').flows, 'D')
    expect(one).toMatchObject({
      affected: true,
      plr: 'E',
      hitLink: 'E-D',
      status: 'repaired',
      method: 'ecmp',
      repair: ['E', 'D'],
      repairLinks: ['E-D#2'],
      repairCost: 10,
      match: 'same',
    })
    // One flow per destination: it uses the lowest-id link of the bundle (D22, D29).
    const other = flow(simulateFailure(ex7(), 'E', ['E-D#2'], 'tilfa').flows, 'D')
    expect(other.affected).toBe(false)
  })

  it('both links of an equal bundle down: dropped, the links are each other’s backup (D25)', () => {
    for (const mode of ['lfa', 'tilfa'] as const) {
      const f = flow(simulateFailure(ex7(), 'E', ['E-D', 'E-D#2'], mode).flows, 'D')
      expect(f).toMatchObject({
        status: 'dropped',
        method: 'ecmp',
        drop: { at: 'E', link: 'E-D#2', reason: 'backup-down' },
        after: ['E', 'S', 'A', 'D'],
      })
    }
  })
})

describe('parallel links: LFA (RFC 5286 §3.6)', () => {
  it('the other link to E is a link-protecting, downstream LFA, not node-protecting', () => {
    const t = ex7()
    const lfa = computeLfa(allPairs(t), 'S', 'E', 'E', 'S-E')
    expect(lfa.candidates).toEqual([
      // dist(A,E)=20 < dist(A,S)+dist(S,E) = 15+10 = 25
      {
        neighbor: 'A',
        link: 'S-A',
        loopFree: true,
        downstream: false,
        nodeProtecting: false,
        cost: 35,
      },
      // dist(E,E)=0 < dist(E,S)+dist(S,E) = 10+10; node-protecting can't hold: N is E.
      {
        neighbor: 'E',
        link: 'S-E#2',
        loopFree: true,
        downstream: true,
        nodeProtecting: false,
        cost: 20,
      },
    ])
    expect(lfa.best).toBe('E')
    expect(lfa.bestLink).toBe('S-E#2')
  })

  it('a node-protecting LFA beats the parallel link (D7)', () => {
    const p = result(ex7(), 'S', 'D').protections[0]!
    expect(p.protectedLink.id).toBe('S-E')
    expect(p.lfa.candidates.map((c) => [c.link, c.nodeProtecting])).toEqual([
      ['S-A', true],
      ['S-E#2', false],
    ])
    expect(p.lfa).toMatchObject({ best: 'A', bestLink: 'S-A' })
  })

  it('two links to one neighbor are two candidates; the cheaper wins', () => {
    const p = result(ex7(), 'S', 'A').protections[0]!
    expect(p.lfa.candidates.map((c) => [c.link, c.cost])).toEqual([
      ['S-E', 30],
      ['S-E#2', 40],
    ])
    expect(p.lfa).toMatchObject({ best: 'E', bestLink: 'S-E' })
  })

  it('LFA over the parallel link: repaired on S-E#2, the same as the final path', () => {
    const f = flow(simulateFailure(ex7(), 'S', ['S-E'], 'lfa').flows, 'E')
    expect(f).toMatchObject({
      status: 'repaired',
      method: 'lfa',
      repair: ['S', 'E'],
      repairLinks: ['S-E#2'],
      repairCost: 20,
      after: ['S', 'E'],
      afterCost: 20,
      match: 'same',
    })
  })

  it('router E down: the parallel-link LFA dies with E; A (node-protecting) survives', () => {
    const sim = simulateFailure(ex7(), 'S', { nodes: ['E'] }, 'lfa')
    expect(flow(sim.flows, 'E')).toMatchObject({ destDown: true, status: 'unreachable' })
    const d = flow(sim.flows, 'D')
    expect(d).toMatchObject({ status: 'repaired', repair: ['S', 'A', 'D'], repairCost: 25 })
    expect(d.through).toBeUndefined()
  })
})

describe('parallel links: TI-LFA and Adj-SIDs', () => {
  it('each link of a bundle gets its own Adj-SID, numbered per router (D18)', () => {
    const t = ex7()
    // S: A (S-A), then E by link id (S-E, S-E#2).
    expect(adjLabel(t, 'S', 'A')).toBe(24000)
    expect(adjLabel(t, 'S', 'E', 'S-E')).toBe(24001)
    expect(adjLabel(t, 'S', 'E', 'S-E#2')).toBe(24002)
    // E: D first (E-D, E-D#2), then S (S-E, S-E#2).
    expect(adjLabel(t, 'E', 'S', 'S-E#2')).toBe(24003)
    expect(labelTable(t).adj.size).toBe(12)
  })

  it('a bundle needs the link id to name an Adj-SID', () => {
    expect(() => adjLabel(ex7(), 'S', 'E')).toThrow(/2 links S–E/)
  })

  it('the repair leaves on the other link of the bundle (outgoing interface)', () => {
    const r = computeTilfa(ex7(), 'S', 'E', 'E', 'S-E')
    expect(r.path).toEqual(['S', 'E'])
    expect(r.outLink).toBe('S-E#2')
    expect(r.cost).toBe(20)
    // The walk forces the costlier link with its Adj-SID; clean-up drops it (RFC 9855 §5.1).
    expect(r.dropped).toEqual({ kind: 'adj', from: 'S', to: 'E', link: 'S-E#2', label: 24002 })
    expect(r.segments).toEqual([{ kind: 'prefix', node: 'E', label: 16002 }])
  })

  it('an Adj-SID in the middle of the list names the exact link, not just the neighbor', () => {
    // Example 3's ring, but B–C is a bundle: 12 (B-C) and 10 (B-C#2).
    const t = topo(
      ['S', 'E', 'A', 'B', 'C'],
      [
        ['S-E', 'S', 'E', 1],
        ['E-C', 'E', 'C', 1],
        ['B-C', 'B', 'C', 12],
        ['B-C#2', 'B', 'C', 10],
        ['A-B', 'A', 'B', 1],
        ['S-A', 'S', 'A', 1],
      ],
    )
    const r = computeTilfa(t, 'S', 'E', 'E')
    expect(r.path).toEqual(['S', 'A', 'B', 'C', 'E'])
    expect(r.cost).toBe(13)
    expect(r.segments).toEqual([
      { kind: 'prefix', node: 'B', label: 16004 },
      { kind: 'adj', from: 'B', to: 'C', link: 'B-C#2', label: adjLabel(t, 'B', 'C', 'B-C#2') },
      { kind: 'prefix', node: 'E', label: 16002 },
    ])
    // B numbers A first, then C by link id: B-C 24001, B-C#2 24002.
    expect(r.labelStack).toEqual([16004, 24002, 16002])
  })

  it('TI-LFA mode, fail S-E: repaired on the other link with [Prefix E]', () => {
    const f = flow(simulateFailure(ex7(), 'S', ['S-E'], 'tilfa').flows, 'E')
    expect(f).toMatchObject({ method: 'tilfa', repairLinks: ['S-E#2'], match: 'same' })
  })
})

describe('parallel links: drawing', () => {
  it('names the link of each hop: a given first link, else the cheapest that is up', () => {
    const t = ex7()
    expect(hopLinks(t, ['S', 'E', 'D'])).toEqual(['S-E', 'E-D'])
    expect(hopLinks(t, ['S', 'E', 'D'], { avoid: ['S-E', 'E-D'] })).toEqual(['S-E#2', 'E-D#2'])
    expect(hopLinks(t, ['S', 'E'], { first: 'S-E#2' })).toEqual(['S-E#2'])
    expect(hopLinks(t, ['S', 'D'])).toEqual([undefined])
  })
})

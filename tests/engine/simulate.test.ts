import { describe, expect, it } from 'vitest'
import { simulateFailure, type Flow } from '../../src/engine/simulate'
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

const flow = (flows: Flow[], dest: string) => {
  const f = flows.find((x) => x.dest === dest)
  if (!f) throw new Error(`no flow to ${dest}`)
  return f
}

describe('simulateFailure: Example 2 ring, S–E fails', () => {
  const ring = loadFixture('02-ring5.yaml')

  it('only destinations whose path crosses S–E are affected', () => {
    const sim = simulateFailure(ring, 'S', ['S-E'], 'tilfa')
    expect(sim.flows.map((f) => f.dest)).toEqual(['A', 'B', 'C', 'E'])
    expect(flow(sim.flows, 'A')).toMatchObject({ affected: false, before: ['S', 'A'] })
    expect(flow(sim.flows, 'B')).toMatchObject({ affected: false, before: ['S', 'A', 'B'] })
    expect(flow(sim.flows, 'C')).toMatchObject({ affected: true, plr: 'S', next: 'E' })
    expect(flow(sim.flows, 'E')).toMatchObject({ affected: true, plr: 'S', next: 'E' })
  })

  it('TI-LFA repairs onto the post-convergence path (RFC 9855 §3)', () => {
    const e = flow(simulateFailure(ring, 'S', ['S-E'], 'tilfa').flows, 'E')
    expect(e).toMatchObject({
      method: 'tilfa',
      repair: ['S', 'A', 'B', 'C', 'E'],
      repairCost: 4,
      after: ['S', 'A', 'B', 'C', 'E'],
      afterCost: 4,
      match: 'same',
    })
  })

  it('LFA only: no LFA for E, so traffic to E is dropped until convergence', () => {
    const sim = simulateFailure(ring, 'S', ['S-E'], 'lfa')
    const e = flow(sim.flows, 'E')
    expect(e.affected).toBe(true)
    expect(e.method).toBeUndefined()
    expect(e.repair).toBeUndefined()
    expect(e.match).toBeUndefined()
    expect(e.after).toEqual(['S', 'A', 'B', 'C', 'E'])
    // C has LFA A: dist(A,C)=2 < dist(A,S)+dist(S,C)=1+2.
    expect(flow(sim.flows, 'C')).toMatchObject({ method: 'lfa', repair: ['S', 'A', 'B', 'C'] })
  })

  it('LFA + Remote LFA: E is tunnelled to PQ node B', () => {
    const e = flow(simulateFailure(ring, 'S', ['S-E'], 'rlfa').flows, 'E')
    expect(e).toMatchObject({ method: 'rlfa', repair: ['S', 'A', 'B', 'C', 'E'], match: 'same' })
  })

  it('a failure further away is repaired by the router next to it (the PLR)', () => {
    // S→C goes S-E-C. Fail E–C: E is the point of local repair.
    const c = flow(simulateFailure(ring, 'S', ['E-C'], 'tilfa').flows, 'C')
    expect(c).toMatchObject({ affected: true, plr: 'E', next: 'C', method: 'tilfa' })
    // E's repair goes back through S: S-E, then E-S-A-B-C.
    expect(c.repair).toEqual(['S', 'E', 'S', 'A', 'B', 'C'])
    expect(c.plrAfter).toEqual(['E', 'S', 'A', 'B', 'C'])
    expect(c.match).toBe('same')
    // After convergence S itself goes the other way round.
    expect(c.after).toEqual(['S', 'A', 'B', 'C'])
    expect(c.afterCost).toBe(3)
  })

  it('a link nobody from S crosses affects nothing', () => {
    // B–C carries no traffic from S (C goes S-E-C, B goes S-A-B).
    const sim = simulateFailure(ring, 'S', ['C-B'], 'tilfa')
    expect(sim.flows.every((f) => !f.affected)).toBe(true)
    expect(sim.links).toEqual([{ id: 'C-B', a: 'C', b: 'B' }])
  })
})

describe('simulateFailure: repair vs post-convergence path', () => {
  // Best LFA is M (node-protecting beats link-protecting, D7), cost 6.
  // The post-convergence path is S-N-E-D, cost 3. So LFA's repair is longer.
  const t = topo(
    ['S', 'E', 'N', 'M', 'D'],
    [
      ['S', 'E', 1],
      ['E', 'D', 1],
      ['S', 'N', 1],
      ['N', 'E', 1],
      ['S', 'M', 5],
      ['M', 'D', 1],
    ],
  )

  it('LFA can repair onto a longer path than the final one', () => {
    const d = flow(simulateFailure(t, 'S', ['S-E'], 'lfa').flows, 'D')
    expect(d).toMatchObject({
      method: 'lfa',
      repair: ['S', 'M', 'D'],
      repairCost: 6,
      after: ['S', 'N', 'E', 'D'],
      afterCost: 3,
      plrRepairCost: 6,
      plrAfterCost: 3,
      match: 'longer',
    })
  })

  it('TI-LFA for the same failure follows the final path', () => {
    const d = flow(simulateFailure(t, 'S', ['S-E'], 'tilfa').flows, 'D')
    expect(d).toMatchObject({ method: 'tilfa', repair: ['S', 'N', 'E', 'D'], match: 'same' })
  })

  it('an equal-cost but different repair path is "same-cost"', () => {
    // First: the LFA path and the lowest-id post-convergence path are the same path.
    const u = topo(
      ['S', 'E', 'A', 'B', 'D'],
      [
        ['S', 'E', 1],
        ['E', 'D', 1],
        ['S', 'B', 1],
        ['B', 'E', 1],
        ['S', 'A', 2],
        ['A', 'D', 1],
      ],
    )
    // Post-convergence: S-A-D = 3 and S-B-E-D = 3; lowest id at the first difference: A.
    // Best LFA: A (node-protecting). B is only link-protecting.
    const d = flow(simulateFailure(u, 'S', ['S-E'], 'lfa').flows, 'D')
    expect(d.repair).toEqual(['S', 'A', 'D'])
    expect(d.after).toEqual(['S', 'A', 'D'])
    expect(d.match).toBe('same')
    // With metrics making the LFA path differ but tie in cost:
    const v = topo(
      ['S', 'E', 'A', 'Z', 'D'],
      [
        ['S', 'E', 1],
        ['E', 'D', 1],
        ['S', 'A', 1],
        ['A', 'E', 1],
        ['S', 'Z', 2],
        ['Z', 'D', 1],
      ],
    )
    // Post-convergence ties S-A-E-D = 3 and S-Z-D = 3 → S-A-E-D. Best LFA Z (node-protecting).
    const w = flow(simulateFailure(v, 'S', ['S-E'], 'lfa').flows, 'D')
    expect(w).toMatchObject({ repair: ['S', 'Z', 'D'], after: ['S', 'A', 'E', 'D'] })
    expect(w.match).toBe('same-cost')
  })

  it('ECMP: the other primary next hop carries the traffic', () => {
    const u = topo(
      ['S', 'A', 'B', 'D'],
      [
        ['S', 'A', 1],
        ['S', 'B', 1],
        ['A', 'D', 1],
        ['B', 'D', 1],
      ],
    )
    // Normal path uses the lowest id, A. Fail S–A: B is the other ECMP next hop.
    const d = flow(simulateFailure(u, 'S', ['S-A'], 'lfa').flows, 'D')
    expect(d).toMatchObject({ method: 'ecmp', repair: ['S', 'B', 'D'], match: 'same' })
  })
})

describe('simulateFailure: bridges and bad input', () => {
  const t = topo(
    ['S', 'E', 'X'],
    [
      ['S', 'E', 1],
      ['E', 'X', 1],
    ],
  )

  it('a bridge: nothing repairs it and D is unreachable after convergence', () => {
    const x = flow(simulateFailure(t, 'S', ['E-X'], 'tilfa').flows, 'X')
    expect(x.affected).toBe(true)
    expect(x.method).toBeUndefined()
    expect(x.repair).toBeUndefined()
    expect(x.after).toBeUndefined()
  })

  it('throws for an unknown link or source', () => {
    expect(() => simulateFailure(t, 'S', ['nope'], 'tilfa')).toThrow(/Unknown link/)
    expect(() => simulateFailure(t, 'Q', ['S-E'], 'tilfa')).toThrow(/Unknown source/)
  })

  it('is deterministic', () => {
    const ring = loadFixture('03-ring5-highmetric.yaml')
    expect(simulateFailure(ring, 'S', ['S-E'], 'tilfa')).toEqual(
      simulateFailure(ring, 'S', ['S-E'], 'tilfa'),
    )
  })
})

describe('simulateFailure: several failed links (Phase 9.2, D24)', () => {
  const ring = loadFixture('02-ring5.yaml')

  it('ring, S–E and E–C down: C’s repair survives; E is cut off and its traffic bounces', () => {
    const sim = simulateFailure(ring, 'S', ['S-E', 'E-C'], 'tilfa')
    expect(sim.links.map((l) => l.id)).toEqual(['S-E', 'E-C'])
    expect(flow(sim.flows, 'A').affected).toBe(false)
    expect(flow(sim.flows, 'A').status).toBeUndefined()
    // C: S-E-C hits S–E first; the TI-LFA repair S-A-B-C avoids E–C.
    expect(flow(sim.flows, 'C')).toMatchObject({
      affected: true,
      hitLink: 'S-E',
      plr: 'S',
      method: 'tilfa',
      repair: ['S', 'A', 'B', 'C'],
      repairs: [{ at: 'S', link: 'S-E', next: 'E', target: 'C', method: 'tilfa' }],
      status: 'repaired',
      after: ['S', 'A', 'B', 'C'],
      afterCost: 3,
      match: 'same',
    })
    // E: S's repair reaches C, finds C–E down, and C's own backup sends it back to B.
    const e = flow(sim.flows, 'E')
    expect(e).toMatchObject({
      hitLink: 'S-E',
      repair: ['S', 'A', 'B', 'C', 'B'],
      repairs: [
        { at: 'S', link: 'S-E', method: 'tilfa' },
        { at: 'C', link: 'E-C', next: 'E', target: 'E', method: 'tilfa' },
      ],
      loopAt: 'B',
      status: 'unreachable',
    })
    // Both of E's links are down: nothing reaches it, and repair = final has no meaning.
    expect(e.after).toBeUndefined()
    expect(e.match).toBeUndefined()
  })

  it('ring, S–E and C–B down: the network splits; B repairs too and sends traffic back', () => {
    const sim = simulateFailure(ring, 'S', ['S-E', 'C-B'], 'tilfa')
    for (const d of ['C', 'E']) {
      expect(flow(sim.flows, d)).toMatchObject({
        status: 'unreachable',
        repair: ['S', 'A', 'B', 'A'],
        loopAt: 'A',
      })
      expect(flow(sim.flows, d).repairs?.map((r) => r.at)).toEqual(['S', 'B'])
    }
    expect(flow(sim.flows, 'B')).toMatchObject({ affected: false, after: ['S', 'A', 'B'] })
  })

  // S-E-D is the normal path (cost 2). Without S–E the shortest is S-A-B-D (3);
  // S-D (10) is the only way left once A–B is down too.
  const t = topo(
    ['S', 'E', 'A', 'B', 'D'],
    [
      ['S', 'E', 1],
      ['E', 'D', 1],
      ['S', 'A', 1],
      ['A', 'B', 1],
      ['B', 'D', 1],
      ['S', 'D', 10],
    ],
  )

  it('TI-LFA: S’s backup goes to A, A’s backup comes back to S: a loop until convergence', () => {
    const d = flow(simulateFailure(t, 'S', ['S-E', 'A-B'], 'tilfa').flows, 'D')
    expect(d).toMatchObject({
      hitLink: 'S-E',
      method: 'tilfa',
      repair: ['S', 'A', 'S'],
      repairs: [
        { at: 'S', link: 'S-E' },
        { at: 'A', link: 'A-B' },
      ],
      loopAt: 'S',
      status: 'looped',
      after: ['S', 'D'],
      afterCost: 10,
    })
    expect(d.match).toBeUndefined()
    expect(d.drop).toBeUndefined()
  })

  it('the same failures with LFA only: LFA D (direct link) survives', () => {
    // Best LFA for D: neighbor D is node-protecting and downstream, A is not downstream (D7).
    const d = flow(simulateFailure(t, 'S', ['S-E', 'A-B'], 'lfa').flows, 'D')
    expect(d).toMatchObject({ method: 'lfa', repair: ['S', 'D'], status: 'repaired' })
    expect(d.match).toBe('same')
  })

  it('a router on the way with no backup drops the traffic', () => {
    // S→B goes S-A-B, so A repairs it. With LFA only, A has no LFA for B.
    const b = flow(simulateFailure(t, 'S', ['S-E', 'A-B'], 'lfa').flows, 'B')
    expect(b).toMatchObject({
      hitLink: 'A-B',
      plr: 'A',
      status: 'dropped',
      repairs: [],
      drop: { at: 'A', link: 'A-B', reason: 'no-backup' },
    })
    expect(b.repair).toBeUndefined()
    expect(b.method).toBeUndefined()
  })

  it('one repair can lead into another: A tunnels to E, S then uses its LFA', () => {
    // A's Remote LFA for B tunnels to PQ node E over S–E; S finds S–E down and
    // uses its own LFA (D) for E. Traffic reaches B, on a long way round.
    const b = flow(simulateFailure(t, 'S', ['S-E', 'A-B'], 'rlfa').flows, 'B')
    expect(b).toMatchObject({
      plr: 'A',
      method: 'rlfa',
      repair: ['S', 'A', 'S', 'D', 'E', 'D', 'B'],
      repairs: [
        { at: 'A', link: 'A-B', target: 'B', method: 'rlfa' },
        { at: 'S', link: 'S-E', target: 'E', method: 'lfa' },
      ],
      status: 'repaired',
      after: ['S', 'D', 'B'],
      match: 'longer',
    })
  })

  it('a third path: when the backup hits a second failure, the next router repairs again', () => {
    // Normal S-E-D (20). S's backup S-A-D (25) runs into A–D; A's own backup
    // A-B-D (20) beats A-S-E-D (30) and avoids every failed link.
    const third = topo(
      ['S', 'E', 'A', 'B', 'D'],
      [
        ['S', 'E', 10],
        ['E', 'D', 10],
        ['S', 'A', 10],
        ['A', 'D', 15],
        ['A', 'B', 10],
        ['B', 'D', 10],
      ],
    )
    const d = flow(simulateFailure(third, 'S', ['S-E', 'A-D'], 'tilfa').flows, 'D')
    expect(d).toMatchObject({
      plr: 'S',
      repair: ['S', 'A', 'B', 'D'],
      repairCost: 30,
      repairs: [
        { at: 'S', link: 'S-E', method: 'tilfa' },
        { at: 'A', link: 'A-D', method: 'tilfa' },
      ],
      status: 'repaired',
      after: ['S', 'A', 'B', 'D'],
      match: 'same',
    })
  })

  it('a single failure is repaired by one router at most; repeats are ignored; none is an error', () => {
    const one = simulateFailure(t, 'S', ['S-E'], 'tilfa')
    expect(one.flows.every((f) => (f.repairs?.length ?? 0) <= 1)).toBe(true)
    expect(simulateFailure(t, 'S', ['S-E', 'S-E'], 'tilfa')).toEqual(one)
    expect(() => simulateFailure(t, 'S', [], 'tilfa')).toThrow(/No failed link/)
  })
})

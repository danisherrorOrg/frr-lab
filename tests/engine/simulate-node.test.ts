// Router failure (Phase 9.3, D27). Every expected value below was worked out by hand
// first; the reasoning is in the comments.
import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { simulateFailure, type Flow, type RepairMode } from '../../src/engine/simulate'
import type { NodeId, Topology } from '../../src/engine/types'
import { connectedTopology } from '../arbitraries'
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

const failRouter = (t: Topology, s: NodeId, node: NodeId, mode: RepairMode) =>
  simulateFailure(t, s, { nodes: [node] }, mode)

describe('router failure: Example 1 square, E fails', () => {
  const square = loadFixture('01-square.yaml')

  it('E itself is unreachable, as expected, and is not walked as a repair', () => {
    const sim = failRouter(square, 'S', 'E', 'lfa')
    expect(sim.nodes).toEqual(['E'])
    expect(sim.links).toEqual([])
    const e = flow(sim.flows, 'E')
    expect(e).toMatchObject({ affected: true, destDown: true, status: 'unreachable' })
    expect(e.repair).toBeUndefined()
    expect(e.repairs).toBeUndefined()
    expect(e.after).toBeUndefined()
  })

  it('the node-protecting LFA N survives: N→D never touches E', () => {
    for (const mode of ['lfa', 'rlfa'] as const) {
      const d = flow(failRouter(square, 'S', 'E', mode).flows, 'D')
      expect(d).toMatchObject({
        affected: true,
        plr: 'S',
        next: 'E',
        method: 'lfa',
        repair: ['S', 'N', 'D'],
        repairCost: 25,
        status: 'repaired',
        after: ['S', 'N', 'D'],
        match: 'same',
      })
      expect(d.through).toBeUndefined()
      expect(d.destDown).toBeUndefined()
    }
  })

  it('TI-LFA survives too: the post-convergence path S-N-D avoids E', () => {
    const d = flow(failRouter(square, 'S', 'E', 'tilfa').flows, 'D')
    expect(d).toMatchObject({ method: 'tilfa', repair: ['S', 'N', 'D'], status: 'repaired' })
    expect(d.through).toBeUndefined()
  })

  it('N is not affected: S→N never went through E', () => {
    expect(flow(failRouter(square, 'S', 'E', 'tilfa').flows, 'N').affected).toBe(false)
  })
})

describe('router failure: Examples 2 and 3 rings, E fails', () => {
  it('Example 2: C uses LFA A, node-protecting (dist(A,C)=2 < dist(A,E)+dist(E,C)=3)', () => {
    const sim = failRouter(loadFixture('02-ring5.yaml'), 'S', 'E', 'lfa')
    expect(flow(sim.flows, 'C')).toMatchObject({
      method: 'lfa',
      repair: ['S', 'A', 'B', 'C'],
      status: 'repaired',
    })
    expect(flow(sim.flows, 'C').through).toBeUndefined()
    expect(flow(sim.flows, 'E')).toMatchObject({ destDown: true, status: 'unreachable' })
    expect(flow(sim.flows, 'A').affected).toBe(false)
    expect(flow(sim.flows, 'B').affected).toBe(false)
  })

  it('Example 3: C has no LFA (dist(A,C)=3, not < 1+2); TI-LFA S-A-B-C avoids E', () => {
    const t = loadFixture('03-ring5-highmetric.yaml')
    const lfa = flow(failRouter(t, 'S', 'E', 'lfa').flows, 'C')
    expect(lfa).toMatchObject({ status: 'dropped', drop: { at: 'S', reason: 'no-backup' } })
    expect(lfa.method).toBeUndefined()
    expect(lfa.through).toBeUndefined()
    const ti = flow(failRouter(t, 'S', 'E', 'tilfa').flows, 'C')
    expect(ti).toMatchObject({
      method: 'tilfa',
      repair: ['S', 'A', 'B', 'C'],
      repairCost: 12,
      status: 'repaired',
    })
    expect(ti.through).toBeUndefined()
  })
})

describe('router failure: link-protecting backups break', () => {
  // Example 6: S–E 1, E–D 1, S–N 1, N–E 1, N–M 10, M–D 10. S→D goes S-E-D (2).
  // S's only other neighbor is N, and N reaches D through E: a link-protecting LFA.
  const tri = loadFixture('06-link-protecting.yaml')

  it('LFA N breaks: dist(N,D)=2 is not < dist(N,E)+dist(E,D)=1+1 (RFC 5286 §3.2)', () => {
    const d = flow(failRouter(tri, 'S', 'E', 'lfa').flows, 'D')
    expect(d.method).toBe('lfa')
    expect(d.through).toEqual({
      node: 'E',
      at: 'N',
      why: { method: 'lfa', via: 'N', check: { distND: 2, distNE: 1, distED: 1 } },
    })
    // N then finds N–E down itself and uses its own node-protecting LFA M (D24).
    expect(d.repairs!.map((r) => [r.at, r.method])).toEqual([
      ['S', 'lfa'],
      ['N', 'lfa'],
    ])
    expect(d).toMatchObject({ repair: ['S', 'N', 'M', 'D'], repairCost: 21, status: 'repaired' })
    expect(d.after).toEqual(['S', 'N', 'M', 'D'])
  })

  it('TI-LFA link protection breaks: segment Prefix D goes N→E; N sends it back to S (loop)', () => {
    const d = flow(failRouter(tri, 'S', 'E', 'tilfa').flows, 'D')
    // Post-convergence path without S–E: S-N-E-D (3). Segment list [Prefix D], out via N.
    expect(d.through).toEqual({
      node: 'E',
      at: 'N',
      why: { method: 'tilfa', segment: { kind: 'prefix', node: 'D', label: 16005 } },
    })
    // N's own TI-LFA for D without N–E is N-S-E-D: back to S with the same packet.
    expect(d).toMatchObject({ status: 'looped', loopAt: 'S', repair: ['S', 'N', 'S'] })
  })

  // Ring S-E-C-B-A-S (all 1) plus D on E (1) and on C (4). S→D goes S-E-D (2).
  // No LFA: dist(A,D)=3 is not < dist(A,S)+dist(S,D)=1+2. PQ node B (cost 2).
  const ringD = topo(
    ['S', 'E', 'A', 'B', 'C', 'D'],
    [
      ['S', 'E', 1],
      ['E', 'C', 1],
      ['C', 'B', 1],
      ['B', 'A', 1],
      ['A', 'S', 1],
      ['E', 'D', 1],
      ['C', 'D', 4],
    ],
  )

  it('Remote LFA breaks: PQ node B reaches D on B-C-E-D (RFC 8102 §2.1)', () => {
    const d = flow(failRouter(ringD, 'S', 'E', 'rlfa').flows, 'D')
    expect(d.method).toBe('rlfa')
    expect(d.through).toEqual({
      node: 'E',
      at: 'C',
      why: { method: 'rlfa', pq: 'B', leg: 'from-pq' },
    })
    // C finds C–E down and uses its LFA D: traffic still gets through.
    expect(d).toMatchObject({
      repair: ['S', 'A', 'B', 'C', 'D'],
      repairCost: 7,
      status: 'repaired',
      after: ['S', 'A', 'B', 'C', 'D'],
    })
    expect(d.repairs!.map((r) => r.at)).toEqual(['S', 'C'])
  })

  it('TI-LFA breaks on the same ring: segment Prefix D from B goes via E', () => {
    const d = flow(failRouter(ringD, 'S', 'E', 'tilfa').flows, 'D')
    expect(d.through).toEqual({
      node: 'E',
      at: 'C',
      why: { method: 'tilfa', segment: { kind: 'prefix', node: 'D', label: 16006 } },
    })
    expect(d.status).toBe('repaired')
  })

  it('a failed router plus a failed link combine', () => {
    const sim = simulateFailure(ringD, 'S', { links: ['C-D'], nodes: ['E'] }, 'rlfa')
    expect(sim.links.map((l) => l.id)).toEqual(['C-D'])
    expect(sim.nodes).toEqual(['E'])
    // Without E and C–D, D has no links left.
    expect(flow(sim.flows, 'D').status).toBe('unreachable')
    expect(flow(sim.flows, 'C').after).toEqual(['S', 'A', 'B', 'C'])
  })
})

describe('router failure: bad input', () => {
  const t = loadFixture('01-square.yaml')
  it('rejects an unknown router, a failed source and an empty failure', () => {
    expect(() => failRouter(t, 'S', 'Q', 'tilfa')).toThrow(/Unknown router/)
    expect(() => failRouter(t, 'S', 'S', 'tilfa')).toThrow(/source router S is down/)
    expect(() => simulateFailure(t, 'S', { links: [], nodes: [] }, 'tilfa')).toThrow(
      /Nothing failed/,
    )
  })
})

describe('router failure properties (random connected graphs)', () => {
  const input = connectedTopology().chain((t) => {
    const ids = t.nodes.map((n) => n.id)
    return fc
      .record({
        s: fc.constantFrom(...ids),
        e: fc.constantFrom(...ids),
        mode: fc.constantFrom<RepairMode>('lfa', 'rlfa', 'tilfa'),
      })
      .filter(({ s, e }) => s !== e)
      .map((r) => ({ t, ...r }))
  })

  it('a backup that avoids E survives; one through E is caught by the router before E', () => {
    fc.assert(
      fc.property(input, ({ t, s, e, mode }) => {
        const sim = failRouter(t, s, e, mode)
        for (const f of sim.flows) {
          expect(f.destDown === true).toBe(f.dest === e)
          expect(f.affected).toBe(f.before.includes(e))
          if (!f.affected || f.destDown) continue
          expect(f.next).toBe(e)
          if (f.method === undefined) {
            expect(f.through).toBeUndefined()
            continue
          }
          if (f.through === undefined) {
            // The backup never meets a link of E, so it works exactly as planned.
            expect(f.status).toBe('repaired')
            expect(f.repairs!.length).toBe(1)
            expect(f.repair!.includes(e)).toBe(false)
          } else {
            expect(f.through.node).toBe(e)
            // A broken backup never delivers on the PLR's repair alone.
            expect(f.status === 'repaired' && f.repairs!.length === 1).toBe(false)
            // When labels keep piling up, the 255-hop cut trims the shown path where
            // traffic first comes back to a router, which can hide what follows (D24).
            if (f.loopAt !== undefined) continue
            // Up to the router before E the walk follows the plan; that router then
            // finds its own link to E down and repairs or drops (D24).
            const second = f.repairs![1]?.at ?? f.drop?.at
            expect(second).toBe(f.through.at)
          }
        }
      }),
      { numRuns: 200 },
    )
  })

  it('the LFA check numbers are the failed node-protecting inequality', () => {
    fc.assert(
      fc.property(input, ({ t, s, e, mode }) => {
        for (const f of failRouter(t, s, e, mode).flows) {
          const why = f.through?.why
          if (why?.method !== 'lfa' || !why.check) continue
          const { distND, distNE, distED } = why.check
          expect(distND).toBeGreaterThanOrEqual(distNE + distED)
        }
      }),
      { numRuns: 200 },
    )
  })
})

describe('router failure: the backup checked is the one the PLR really uses (D28)', () => {
  it('ECMP skips every member that is down, so the check does too (Example 5)', () => {
    // SP1 reaches SP2 through all four leaves; L1 and L2 are down. SP1 drops both from
    // its ECMP set and uses L3 (D25), which never meets a failed router.
    const sp2 = flow(
      simulateFailure(loadFixture('05-leaf-spine.yaml'), 'SP1', { nodes: ['L1', 'L2'] }, 'lfa')
        .flows,
      'SP2',
    )
    expect(sp2).toMatchObject({ status: 'repaired', method: 'ecmp', plr: 'SP1', next: 'L1' })
    expect(sp2.repair).toEqual(['SP1', 'L3', 'SP2'])
    expect(sp2.through).toBeUndefined()
  })

  it('with every ECMP member down, the member it falls back to is the router that is down', () => {
    // Example 4, P2→P3: 30 via P4 (P4-PE2-P3) and 30 via PE1 (PE1-P1-P3). P2–P4 and
    // router PE1 are down, so no member is left: dropped at P2 (D25).
    const p3 = flow(
      simulateFailure(
        loadFixture('04-isp-core.yaml'),
        'P2',
        { links: ['P2-P4'], nodes: ['PE1'] },
        'lfa',
      ).flows,
      'P3',
    )
    expect(p3).toMatchObject({ status: 'dropped', method: 'ecmp', drop: { reason: 'backup-down' } })
    expect(p3.through).toEqual({ node: 'PE1', at: 'P2', why: { method: 'ecmp', via: 'PE1' } })
  })

  it('one router that delivers alone never "breaks" (random networks, two routers down)', () => {
    const two = connectedTopology().chain((t) => {
      const ids = t.nodes.map((n) => n.id)
      return fc
        .record({
          s: fc.constantFrom(...ids),
          x: fc.constantFrom(...ids),
          y: fc.constantFrom(...ids),
          mode: fc.constantFrom<RepairMode>('lfa', 'rlfa', 'tilfa'),
        })
        .filter(({ s, x, y }) => s !== x && s !== y)
        .map((r) => ({ t, ...r }))
    })
    fc.assert(
      fc.property(two, ({ t, s, x, y, mode }) => {
        for (const f of simulateFailure(t, s, { nodes: [x, y] }, mode).flows) {
          if (f.status === 'repaired' && f.repairs!.length === 1) {
            expect(f.through).toBeUndefined()
          }
        }
      }),
      { numRuns: 200 },
    )
  })
})

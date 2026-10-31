import { describe, expect, it } from 'vitest'
import {
  convergedWalk,
  flowWalk,
  packetWalk,
  primaryWalk,
  type PacketWalk,
} from '../../src/engine/packet-walk'
import { simulateFailure, type Failures, type RepairMode } from '../../src/engine/simulate'
import type { Segment, Topology } from '../../src/engine/types'
import { loadFixture } from '../helpers'

const labels = (segs: Segment[] | undefined) => segs?.map((x) => x.label)

/** Each hop as "router: in → actions → out", easy to compare with docs/02-algorithms.md §4.5. */
const brief = (w: PacketWalk | undefined) =>
  w?.hops.map((h) => ({
    router: h.router,
    in: labels(h.received),
    do: h.actions.map((a) => a.kind),
    out: labels(h.sent),
    to: h.to,
  }))

// docs/02-algorithms.md §4.5 (worked examples from §6).
describe('packetWalk: worked examples', () => {
  it('Example 1: no extra labels; N pops D’s label with PHP, D gets a plain packet', () => {
    const w = packetWalk(loadFixture('01-square.yaml'), 'S', 'D', 'E')
    expect(brief(w)).toEqual([
      { router: 'S', in: [16004], do: ['push', 'repair-out'], out: [16004], to: 'N' },
      { router: 'N', in: [16004], do: ['forward', 'php'], out: [], to: 'D' },
      { router: 'D', in: [], do: ['deliver'], out: undefined, to: undefined },
    ])
    expect(w?.hops[0]!.actions[0]).toEqual({ kind: 'push', segments: [] })
    expect(w?.cost).toBe(25)
  })

  it('Example 2: S pushes Prefix-SID(B); A pops it (PHP), B forwards on E’s label', () => {
    const w = packetWalk(loadFixture('02-ring5.yaml'), 'S', 'E', 'E')
    expect(brief(w)).toEqual([
      { router: 'S', in: [16002], do: ['push', 'repair-out'], out: [16004, 16002], to: 'A' },
      { router: 'A', in: [16004, 16002], do: ['forward', 'php'], out: [16002], to: 'B' },
      { router: 'B', in: [16002], do: ['forward'], out: [16002], to: 'C' },
      { router: 'C', in: [16002], do: ['forward', 'php'], out: [], to: 'E' },
      { router: 'E', in: [], do: ['deliver'], out: undefined, to: undefined },
    ])
    expect(w?.cost).toBe(4)
  })

  it('Example 3, PHP on: labels 16004, 24005, 16002; B pops its Adj-SID and uses the metric-10 link', () => {
    const w = packetWalk(loadFixture('03-ring5-highmetric.yaml'), 'S', 'E', 'E')
    expect(brief(w)).toEqual([
      {
        router: 'S',
        in: [16002],
        do: ['push', 'repair-out'],
        out: [16004, 24005, 16002],
        to: 'A',
      },
      {
        router: 'A',
        in: [16004, 24005, 16002],
        do: ['forward', 'php'],
        out: [24005, 16002],
        to: 'B',
      },
      { router: 'B', in: [24005, 16002], do: ['pop-adj'], out: [16002], to: 'C' },
      { router: 'C', in: [16002], do: ['forward', 'php'], out: [], to: 'E' },
      { router: 'E', in: [], do: ['deliver'], out: undefined, to: undefined },
    ])
    expect(w?.hops.map((h) => h.metric)).toEqual([1, 1, 10, 1, undefined])
    expect(w?.cost).toBe(13)
    // A forwards to B because B is on A's normal shortest path to B: 1 + 0 = 1.
    expect(w?.hops[1]!.actions[0]).toMatchObject({
      kind: 'forward',
      to: 'B',
      metric: 1,
      distRY: 1,
      distNextY: 0,
    })
  })

  it('Example 3, PHP off: each segment end pops its own label', () => {
    const w = packetWalk(loadFixture('03-ring5-highmetric.yaml'), 'S', 'E', 'E', { php: false })
    expect(w?.php).toBe(false)
    expect(brief(w)).toEqual([
      {
        router: 'S',
        in: [16002],
        do: ['push', 'repair-out'],
        out: [16004, 24005, 16002],
        to: 'A',
      },
      {
        router: 'A',
        in: [16004, 24005, 16002],
        do: ['forward'],
        out: [16004, 24005, 16002],
        to: 'B',
      },
      { router: 'B', in: [16004, 24005, 16002], do: ['pop-end', 'pop-adj'], out: [16002], to: 'C' },
      { router: 'C', in: [16002], do: ['forward'], out: [16002], to: 'E' },
      { router: 'E', in: [16002], do: ['pop-end', 'deliver'], out: undefined, to: undefined },
    ])
  })

  it('Example 7: a repair over the other link of a bundle names that link', () => {
    const w = packetWalk(loadFixture('07-parallel.yaml'), 'S', 'E', 'E', { link: 'S-E' })
    expect(brief(w)).toEqual([
      { router: 'S', in: [16002], do: ['push', 'repair-out', 'php'], out: [], to: 'E' },
      { router: 'E', in: [], do: ['deliver'], out: undefined, to: undefined },
    ])
    expect(w?.hops[0]).toMatchObject({ link: 'S-E#2', metric: 20 })
  })

  it('S sends the first hop’s Adj-SID on top without reading it (clean-up dropped Prefix-SID(N))', () => {
    // R1's normal path to R2 ties with R1→R0→R2, which uses the failed link, so the
    // walk gives [Prefix R1, Adj R1→R2, Prefix R2] and clean-up drops Prefix R1.
    const t: Topology = {
      name: 't',
      srgbBase: 16000,
      nodes: ['R0', 'R1', 'R2'].map((id, i) => ({ id, sidIndex: i })),
      links: [
        { id: 'R0-R1', a: 'R0', b: 'R1', metricAB: 1, metricBA: 1 },
        { id: 'R0-R2', a: 'R0', b: 'R2', metricAB: 1, metricBA: 1 },
        { id: 'R2-R1', a: 'R2', b: 'R1', metricAB: 1, metricBA: 2 },
      ],
    }
    const w = packetWalk(t, 'R0', 'R2', 'R2')
    expect(brief(w)).toEqual([
      { router: 'R0', in: [16002], do: ['push', 'repair-out'], out: [24001, 16002], to: 'R1' },
      { router: 'R1', in: [24001, 16002], do: ['pop-adj', 'php'], out: [], to: 'R2' },
      { router: 'R2', in: [], do: ['deliver'], out: undefined, to: undefined },
    ])
  })

  it('gives nothing when D is cut off by the failure', () => {
    const t = loadFixture('01-square.yaml')
    const line = { ...t, links: t.links.filter((l) => l.a !== 'S' || l.b !== 'N') }
    expect(packetWalk(line, 'S', 'E', 'E')).toBeUndefined()
  })
})

// docs/02-algorithms.md §4.5: the normal path, for comparison with the repair.
describe('primaryWalk', () => {
  const ring = loadFixture('02-ring5.yaml')

  it('Example 2, S→C through E: every router forwards on C’s label; E pops it (PHP)', () => {
    const w = primaryWalk(ring, 'S', 'C', 'E')
    expect(w?.kind).toBe('primary')
    expect(brief(w)).toEqual([
      { router: 'S', in: [16005], do: ['forward'], out: [16005], to: 'E' },
      { router: 'E', in: [16005], do: ['forward', 'php'], out: [], to: 'C' },
      { router: 'C', in: [], do: ['deliver'], out: undefined, to: undefined },
    ])
    expect(w?.cost).toBe(2)
    // S forwards to E because c(S,E) + dist(E,C) = 1 + 1 = 2 = dist(S,C).
    expect(w?.hops[0]!.actions[0]).toMatchObject({ metric: 1, distNextY: 1, distRY: 2 })
  })

  it('PHP off: C gets its own label and pops it', () => {
    const w = primaryWalk(ring, 'S', 'C', 'E', { php: false })
    expect(brief(w)?.at(-1)).toEqual({
      router: 'C',
      in: [16005],
      do: ['pop-end', 'deliver'],
      out: undefined,
      to: undefined,
    })
  })

  it('Example 7: follows the row’s link of a bundle', () => {
    const t = loadFixture('07-parallel.yaml')
    const w = primaryWalk(t, 'S', 'E', 'E', { link: 'S-E' })
    expect(w?.hops[0]).toMatchObject({ link: 'S-E', to: 'E' })
  })
})

// docs/02-algorithms.md §8.3: the labels of the simulated traffic.
describe('flowWalk', () => {
  const ring = loadFixture('02-ring5.yaml')
  const high = loadFixture('03-ring5-highmetric.yaml')
  const walkOf = (
    t: Topology,
    failed: Failures,
    mode: RepairMode,
    d: string,
    php = true,
  ): PacketWalk | undefined => {
    const f = simulateFailure(t, 'S', failed, mode).flows.find((x) => x.dest === d)!
    return flowWalk(t, f, { php })
  }

  it('one failed link, TI-LFA: the same labels as the packet walk of the repair', () => {
    const w = walkOf(high, { links: ['S-E'] }, 'tilfa', 'E')
    expect(w).toMatchObject({ kind: 'flow', status: 'repaired', cost: 13 })
    expect(brief(w)).toEqual(
      brief(packetWalk(high, 'S', 'E', 'E'))!.map((h, i) =>
        i === 0 ? { ...h, do: ['repair'] } : h,
      ),
    )
    expect(w?.hops[0]!.actions[0]).toMatchObject({
      kind: 'repair',
      step: { at: 'S', method: 'tilfa' },
      before: [{ label: 16002 }],
      after: [{ label: 16004 }, { label: 24005 }, { label: 16002 }],
    })
  })

  it('a second router repairs: E’s TI-LFA sends the packet back through S', () => {
    const w = walkOf(ring, { links: ['E-C'] }, 'tilfa', 'C')
    expect(brief(w)).toEqual([
      { router: 'S', in: [16005], do: ['forward'], out: [16005], to: 'E' },
      { router: 'E', in: [16005], do: ['repair'], out: [16003, 16005], to: 'S' },
      { router: 'S', in: [16003, 16005], do: ['forward', 'php'], out: [16005], to: 'A' },
      { router: 'A', in: [16005], do: ['forward'], out: [16005], to: 'B' },
      { router: 'B', in: [16005], do: ['forward', 'php'], out: [], to: 'C' },
      { router: 'C', in: [], do: ['deliver'], out: undefined, to: undefined },
    ])
  })

  it('two repairs send the packet round in a loop with the same labels', () => {
    const w = walkOf(ring, { links: ['S-E', 'E-C'] }, 'tilfa', 'E')
    expect(w?.status).toBe('unreachable')
    expect(w?.hops.map((h) => h.router)).toEqual(['S', 'A', 'B', 'C', 'B', 'A', 'S'])
    expect(w?.hops[3]!.actions).toMatchObject([{ kind: 'repair', step: { at: 'C' } }])
    expect(w?.hops.at(-1)!.actions).toEqual([{ kind: 'loop', exact: true }])
  })

  it('a failed Adj-SID is repaired towards its far end; labels pile up in a loop', () => {
    const w = walkOf(high, { links: ['S-E', 'C-B'] }, 'tilfa', 'E')
    // B's Adj-SID 24005 (B→C) is down: B swaps it for C's Prefix-SID and sends back to A.
    expect(brief(w)?.[2]).toEqual({
      router: 'B',
      in: [24005, 16002],
      do: ['repair'],
      out: [16005, 16002],
      to: 'A',
    })
    expect(w?.hops.at(-1)).toMatchObject({ router: 'A', actions: [{ kind: 'loop', exact: false }] })
  })

  it('Remote LFA pushes the PQ node’s label; LFA only with no backup drops at S', () => {
    expect(brief(walkOf(ring, { links: ['S-E'] }, 'rlfa', 'E'))?.[0]).toEqual({
      router: 'S',
      in: [16002],
      do: ['repair'],
      out: [16004, 16002],
      to: 'A',
    })
    const lfa = walkOf(ring, { links: ['S-E'] }, 'lfa', 'E')
    expect(lfa?.status).toBe('dropped')
    expect(brief(lfa)).toEqual([
      { router: 'S', in: [16002], do: ['drop'], out: undefined, to: undefined },
    ])
  })

  it('a failed router: S repairs around it; a flow to the failed router itself has no walk', () => {
    const w = walkOf(ring, { nodes: ['E'] }, 'tilfa', 'C')
    expect(w?.hops.map((h) => h.router)).toEqual(['S', 'A', 'B', 'C'])
    expect(walkOf(ring, { nodes: ['E'] }, 'tilfa', 'E')).toBeUndefined()
  })

  it('PHP off: D pops its own label', () => {
    const w = walkOf(ring, { links: ['S-E'] }, 'tilfa', 'C', false)
    expect(w?.hops.at(-1)!.actions.map((a) => a.kind)).toEqual(['pop-end', 'deliver'])
  })
})

// docs/02-algorithms.md §8.3: after convergence, plain forwarding on D's label.
describe('convergedWalk', () => {
  const ring = loadFixture('02-ring5.yaml')

  it('Example 2, S–E down, to E: S→A→B→C→E on 16002 only; C pops it (PHP)', () => {
    const f = simulateFailure(ring, 'S', ['S-E'], 'tilfa').flows.find((x) => x.dest === 'E')!
    const w = convergedWalk(ring, f, ['S-E'])
    expect(w).toMatchObject({ kind: 'converged', cost: 4 })
    expect(brief(w)).toEqual([
      { router: 'S', in: [16002], do: ['forward'], out: [16002], to: 'A' },
      { router: 'A', in: [16002], do: ['forward'], out: [16002], to: 'B' },
      { router: 'B', in: [16002], do: ['forward'], out: [16002], to: 'C' },
      { router: 'C', in: [16002], do: ['forward', 'php'], out: [], to: 'E' },
      { router: 'E', in: [], do: ['deliver'], out: undefined, to: undefined },
    ])
    // S's new table: c(S,A) + dist(A,E) = 1 + 3 = 4 = dist(S,E) without S–E.
    expect(w?.hops[0]!.actions[0]).toMatchObject({ metric: 1, distNextY: 3, distRY: 4 })
  })

  it('nothing to walk when D is cut off', () => {
    const f = simulateFailure(ring, 'S', ['S-E', 'E-C'], 'tilfa').flows.find((x) => x.dest === 'E')!
    expect(convergedWalk(ring, f, ['S-E', 'E-C'])).toBeUndefined()
  })
})

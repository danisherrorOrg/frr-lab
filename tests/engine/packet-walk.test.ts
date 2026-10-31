import { describe, expect, it } from 'vitest'
import { packetWalk, type PacketWalk } from '../../src/engine/packet-walk'
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

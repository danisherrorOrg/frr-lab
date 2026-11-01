// Flex-Algo (D58, docs/02-algorithms.md §23) and SRv6 (D59, §24). Worked out by hand first.
import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { flexSidIndex, flexTopology, meetsConstraints } from '../../src/engine/flex-algo'
import { computeForSource } from '../../src/engine/index'
import { endSid, endXSid, locatorOf, srv6RepairList } from '../../src/engine/srv6'
import type { Topology } from '../../src/engine/types'
import { parseTopology, serializeTopology } from '../../src/io/yaml'
import { connectedTopology } from '../arbitraries'
import { loadFixture } from '../helpers'

const ex11 = loadFixture('11-flex-algo.yaml')

describe('Flex-Algo (RFC 9350)', () => {
  it('builds the algorithm’s topology: no red link, delay as the metric, its own SIDs', () => {
    const t = flexTopology(ex11, 128)
    expect(t.links.map((l) => [l.id, l.metricAB])).toEqual([
      ['E-D', 100],
      ['S-A', 10],
      ['A-D', 10],
      ['S-B', 50],
      ['B-D', 50],
    ])
    // Algorithm-0 index + 1000 for the first Flex-Algo.
    expect(t.nodes.map((n) => [n.id, n.sidIndex])).toEqual([
      ['S', 1001],
      ['E', 1002],
      ['A', 1003],
      ['B', 1004],
      ['D', 1005],
    ])
  })

  it('S → D in algorithm 128: S-A-D; the backup stays inside it (RFC 9350 §6.1)', () => {
    const r = computeForSource(flexTopology(ex11, 128), 'S').find((x) => x.dest === 'D')!
    expect(r).toMatchObject({ cost: 20, nextHops: ['A'] })
    const p = r.protections[0]!
    // B: 50 < dist(B,S)+dist(S,D) = 50+20 ✓; node-protecting 50 < dist(B,A)+dist(A,D) = 60+10 ✓.
    expect(p.lfa.best).toBe('B')
    expect(p.tilfa).toMatchObject({ path: ['S', 'B', 'D'], labelStack: [17005] })
  })

  it('constraints: exclude-any, include-any, include-all', () => {
    const l = { id: 'x', a: 'A', b: 'B', metricAB: 1, metricBA: 1, affinity: ['gold', 'red'] }
    expect(meetsConstraints({ algo: 128, excludeAny: ['red'] }, l)).toBe(false)
    expect(meetsConstraints({ algo: 128, includeAny: ['blue', 'gold'] }, l)).toBe(true)
    expect(meetsConstraints({ algo: 128, includeAll: ['gold', 'blue'] }, l)).toBe(false)
    expect(meetsConstraints({ algo: 128, includeAll: ['gold'] }, { ...l, affinity: [] })).toBe(
      false,
    )
  })

  it('a router outside the algorithm, an own algo SID, TE metric', () => {
    const t: Topology = {
      ...ex11,
      flexAlgos: [{ algo: 129, metric: 'te' }],
      nodes: ex11.nodes.map((n) =>
        n.id === 'E' ? { ...n, algos: [] } : n.id === 'D' ? { ...n, algoSids: { 129: 77 } } : n,
      ),
      links: ex11.links.map((l) => (l.id === 'S-B' || l.id === 'B-D' ? { ...l, teMetric: 5 } : l)),
    }
    const v = flexTopology(t, 129)
    expect(v.nodes.map((n) => n.id)).toEqual(['S', 'A', 'B', 'D'])
    // Only links with a TE metric take part.
    expect(v.links.map((l) => [l.id, l.metricAB])).toEqual([
      ['S-B', 5],
      ['B-D', 5],
    ])
    expect(
      flexSidIndex(
        t,
        t.nodes.find((n) => n.id === 'D')!,
        129,
      ),
    ).toBe(77)
  })

  it('YAML: round-trips, and rejects a clash of algorithm SIDs', () => {
    const back = parseTopology(serializeTopology(ex11))
    expect(back.ok && back.topology).toEqual(ex11)
    // B's algorithm-0 index 1001 is A's index in algorithm 128 (1 + 1000).
    const clash = parseTopology(
      'flex_algo: [{ algo: 128 }]\nnodes: [{ id: A, sid: 1 }, { id: B, sid: 1001, algo_sids: { 128: 7 } }]\n',
    )
    expect(!clash.ok && clash.errors).toEqual([
      'Prefix-SID index 1001 is used by both B and A in Flex-Algo 128; set algo_sids.',
    ])
  })

  it('property: a Flex-Algo with no constraints on the IGP metric gives algorithm 0’s paths', () => {
    fc.assert(
      fc.property(connectedTopology(), (t0) => {
        const t = { ...t0, flexAlgos: [{ algo: 128 }] }
        const s = t.nodes[0]!.id
        const strip = (x: Topology) =>
          computeForSource(x, s, { explain: false }).map((r) => ({
            dest: r.dest,
            cost: r.cost,
            path: r.protections.map((p) => p.tilfa.path),
          }))
        expect(strip(flexTopology(t, 128))).toEqual(strip(t))
      }),
      { numRuns: 30 },
    )
  })
})

describe('SRv6 (RFC 8986, RFC 9855 §7.2)', () => {
  const ex3 = { ...loadFixture('03-ring5-highmetric.yaml'), dataplane: 'srv6' as const }

  it('locators, End and End.X SIDs', () => {
    expect(locatorOf(ex3, 'B')).toBe('fc00:0:4::/48')
    expect(endSid(ex3, 'B')).toBe('fc00:0:4::1')
    // B's links in Adj-SID order: to A (B-A), then to C (C-B): the second gets 0x41.
    expect(endXSid(ex3, 'B', 'C-B')).toBe('fc00:0:4::41')
  })

  it('Example 3, S → E: [End(B), End.X(B→C)]; E stays the inner destination', () => {
    const p = computeForSource(ex3, 'S').find((r) => r.dest === 'E')!.protections[0]!
    expect(p.tilfa.srv6).toEqual(['fc00:0:4::1', 'fc00:0:4::41'])
    expect(p.explain.map((x) => x.text)).toContain(
      'SRv6: S encapsulates with SID list [fc00:0:4::1, fc00:0:4::41] (2 SIDs); E stays the inner destination',
    )
  })

  it('MSD counts SIDs: 2 fit an MSD of 2, where 3 MPLS labels don’t', () => {
    const p = computeForSource({ ...ex3, msd: 2 }, 'S').find((r) => r.dest === 'E')!.protections[0]!
    expect(p.tilfa.tooDeep).toBeUndefined()
    const mpls = computeForSource({ ...ex3, dataplane: undefined, msd: 2 }, 'S').find(
      (r) => r.dest === 'E',
    )!.protections[0]!
    expect(mpls.tilfa.tooDeep).toBe(true)
  })

  it('an LFA-like repair needs no SID; a set locator is used', () => {
    const ex1 = { ...loadFixture('01-square.yaml'), dataplane: 'srv6' as const }
    expect(
      computeForSource(ex1, 'S').find((r) => r.dest === 'D')!.protections[0]!.tilfa.srv6,
    ).toEqual([])
    const own = {
      ...ex3,
      nodes: ex3.nodes.map((n) => (n.id === 'B' ? { ...n, locator: '2001:db8:b::/48' } : n)),
    }
    expect(
      srv6RepairList(own, [
        { kind: 'prefix', node: 'B', label: 0 },
        { kind: 'prefix', node: 'E', label: 0 },
      ]),
    ).toEqual(['2001:db8:b::1'])
  })

  it('YAML: dataplane and locator round-trip; a bad locator is an error', () => {
    const t = {
      ...ex3,
      nodes: ex3.nodes.map((n) => (n.id === 'B' ? { ...n, locator: '2001:db8:b::/48' } : n)),
    }
    const back = parseTopology(serializeTopology(t))
    expect(back.ok && back.topology.dataplane).toBe('srv6')
    expect(back.ok && back.topology.nodes.find((n) => n.id === 'B')!.locator).toBe(
      '2001:db8:b::/48',
    )
    const bad = parseTopology('nodes: [{ id: A, sid: 1, locator: "10.0.0.1/32" }]\n')
    expect(!bad.ok && bad.errors[0]).toContain('"locator" must be an IPv6 prefix')
  })
})

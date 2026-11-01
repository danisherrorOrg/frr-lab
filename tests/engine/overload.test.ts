import { describe, expect, it } from 'vitest'
import { computeForSource } from '../../src/engine/index'
import { linkView } from '../../src/engine/link-view'
import { computeLfa } from '../../src/engine/lfa'
import { shortestPath } from '../../src/engine/paths'
import { computeRlfa } from '../../src/engine/rlfa'
import { simulateFailure } from '../../src/engine/simulate'
import { allPairs, avoidsLink, dist, reverseSpf } from '../../src/engine/spf'
import { computeTilfa } from '../../src/engine/tilfa'
import type { NodeId, Topology } from '../../src/engine/types'
import { whatIf } from '../../src/engine/what-if'
import { loadFixture, overloaded } from '../helpers'

/** docs/02-algorithms.md §16: N–S 1, S–E 1, E–D 1, N–D 10. */
const kite = (overload: boolean): Topology => ({
  name: 'kite',
  srgbBase: 16000,
  nodes: [
    { id: 'S', sidIndex: 1, ...(overload && { overload: true }) },
    { id: 'E', sidIndex: 2 },
    { id: 'N', sidIndex: 3 },
    { id: 'D', sidIndex: 4 },
  ],
  links: [
    { id: 'N-S', a: 'N', b: 'S', metricAB: 1, metricBA: 1 },
    { id: 'S-E', a: 'S', b: 'E', metricAB: 1, metricBA: 1 },
    { id: 'E-D', a: 'E', b: 'D', metricAB: 1, metricBA: 1 },
    { id: 'N-D', a: 'N', b: 'D', metricAB: 10, metricBA: 10 },
  ],
})

const texts = (t: Topology, s: NodeId, d: NodeId) =>
  computeForSource(t, s)
    .find((r) => r.dest === d)!
    .protections[0]!.explain.map((x) => x.text)

// docs/02-algorithms.md §16 worked checks.
describe('overload bit: SPF never passes through the router', () => {
  it('Example 2, B overloaded: A reaches C the long way, B itself is still reached and routes', () => {
    const t = allPairs(overloaded(loadFixture('02-ring5.yaml'), 'B'))
    // A-B-C (2) would pass through B.
    expect(dist(t, 'A', 'C')).toBe(3)
    expect(shortestPath(t, 'A', 'C')).toEqual(['A', 'S', 'E', 'C'])
    // B is still a destination, and B's own traffic uses its links.
    expect(dist(t, 'S', 'B')).toBe(2)
    expect(dist(t, 'B', 'C')).toBe(1)
    expect(dist(t, 'B', 'S')).toBe(2)
    // Reverse SPF follows the same rule: C can't get to A through B.
    expect(reverseSpf(t.graph, 'A').dist.get('C')).toBe(3)
  })

  it('an overloaded router as the source still uses all its links', () => {
    const t = allPairs(overloaded(loadFixture('02-ring5.yaml'), 'S'))
    expect(dist(t, 'S', 'C')).toBe(2)
    // A-S-E (2) would pass through S: A goes round the other way.
    expect(shortestPath(t, 'A', 'E')).toEqual(['A', 'B', 'C', 'E'])
  })

  it('avoidsLink: a link next to an overloaded router is never on a path through it', () => {
    const t = allPairs(kite(true))
    // N's path to D can't go N-S-E-D: all of N's shortest paths avoid S→E.
    expect(avoidsLink(t, 'N', 'D', 'S', 'E')).toBe(true)
    // S's own traffic still uses S→E.
    expect(avoidsLink(t, 'S', 'D', 'S', 'E')).toBe(false)
  })
})

describe('overload bit: LFA (RFC 5286 §3.5)', () => {
  it('Example 1, N overloaded: N is never an alternate, so D has no LFA', () => {
    const t = overloaded(loadFixture('01-square.yaml'), 'N')
    const lfa = computeLfa(allPairs(t), 'S', 'D', 'E')
    expect(lfa.skipped).toEqual([{ neighbor: 'N', link: 'S-N', reason: 'overload' }])
    expect(lfa.candidates).toEqual([])
    expect(lfa.best).toBeUndefined()
    expect(texts(t, 'S', 'D')).toContain(
      'Via N: skipped, N has the overload bit set, so it is never an alternate',
    )
  })

  it('S overloaded: N can’t send traffic back through S, so N becomes loop-free', () => {
    // Without the bit: dist(N,D) = 3 (N-S-E-D), not < 1 + 2.
    expect(computeLfa(allPairs(kite(false)), 'S', 'D', 'E').best).toBeUndefined()
    const lfa = computeLfa(allPairs(kite(true)), 'S', 'D', 'E')
    expect(lfa.checks[0]).toMatchObject({ distND: 10, distNS: 1, distSD: 2, viaS: Infinity })
    expect(lfa.candidates[0]).toMatchObject({ loopFree: true, downstream: false })
    expect(lfa.best).toBe('N')
    expect(texts(kite(true), 'S', 'D')).toContain(
      'Via N: dist(N,D)=10 < dist(N,S)+dist(S,D) = ∞ (S has the overload bit: no transit through it) ✓',
    )
  })
})

describe('overload bit: Remote LFA (RFC 7490 §5.4)', () => {
  it('Example 1, N overloaded: N is no tunnel exit and no PQ node', () => {
    const t = overloaded(loadFixture('01-square.yaml'), 'N')
    const r = computeRlfa(allPairs(t), 'S', 'E')
    expect(r.skipped).toEqual([{ neighbor: 'N', link: 'S-N', reason: 'overload' }])
    expect(r.pSpace).toEqual(['N'])
    expect(r.qSpace).toEqual(['D', 'N'])
    expect(r.pq).toEqual([])
    expect(r.overloadedPq).toEqual(['N'])
    expect(r.best).toBeUndefined()
    expect(texts(t, 'S', 'D')).toEqual(
      expect.arrayContaining([
        'Via N: not used as a tunnel exit, N has the overload bit set',
        "N is in both spaces but has the overload bit set, so it can't be a tunnel end",
        'No PQ node: the only routers in both extended P-space and Q-space have the overload bit ✗',
      ]),
    )
  })

  it('Example 2, C overloaded: C stays in the spaces but is not a PQ node; B leaves Q-space', () => {
    const r = computeRlfa(allPairs(overloaded(loadFixture('02-ring5.yaml'), 'C')), 'S', 'E')
    expect(r.extPSpace).toEqual(['A', 'B', 'C'])
    // dist(B,E) = 3 (B-A-S-E: B-C-E passes through C), not < 2 + 1.
    expect(r.qSpace).toEqual(['C'])
    expect(r.pq).toEqual([])
    expect(r.overloadedPq).toEqual(['C'])
  })

  it('without the bit nothing changes (Example 2: PQ B)', () => {
    const r = computeRlfa(allPairs(loadFixture('02-ring5.yaml')), 'S', 'E')
    expect(r.overloadedPq).toBeUndefined()
    expect(r.best).toBe('B')
  })
})

describe('overload bit: TI-LFA', () => {
  it('Example 1, N overloaded: the only path left passes through N, so D is cut off', () => {
    const t = overloaded(loadFixture('01-square.yaml'), 'N')
    expect(computeTilfa(t, 'S', 'D', 'E').partitioned).toBe(true)
    // N itself is still protected: S-E-D-N ends at N.
    expect(computeTilfa(t, 'S', 'N', 'N').path).toEqual(['S', 'E', 'D', 'N'])
  })

  it('S overloaded: a prefix segment from N may run through nothing but N’s own path', () => {
    const r = computeTilfa(kite(true), 'S', 'D', 'E')
    expect(r.path).toEqual(['S', 'N', 'D'])
    expect(r.segments?.map((x) => x.kind === 'prefix' && x.node)).toEqual(['D'])
    expect(texts(kite(true), 'S', 'D')).toContain(
      'From N, D: dist(N,D)=10 matches path cost 10 ✓; avoids S–E: dist(N,D)=10 < dist(N,S)+c(S,E)+dist(E,D) = ∞ (S has the overload bit: no transit through it) ✓ → Prefix-SID(D)',
    )
  })
})

describe('overload bit: the rest of the engine', () => {
  it('simulation, Example 1 with N overloaded, S–E down: D is cut off, N still reached', () => {
    const t = overloaded(loadFixture('01-square.yaml'), 'N')
    const sim = simulateFailure(t, 'S', ['S-E'], 'tilfa')
    expect(sim.flows.find((f) => f.dest === 'D')).toMatchObject({ status: 'unreachable' })
    expect(sim.flows.find((f) => f.dest === 'E')).toMatchObject({
      status: 'unreachable', // S-N-D-E would pass through N
    })
    expect(sim.flows.find((f) => f.dest === 'N')).toMatchObject({ affected: false })
  })

  it('per-link view: traffic never crosses a link through an overloaded router', () => {
    const plain = linkView(loadFixture('02-ring5.yaml'), 'C-B')
    const t = overloaded(loadFixture('02-ring5.yaml'), 'B')
    const v = linkView(t, 'C-B')
    // C→B: before, C sent traffic to A over it (C-B-A); now only to B itself.
    expect(plain.directions[0]!.pairs.map((p) => p.row.dest)).toEqual(['A', 'B'])
    expect(v.directions[0]!.pairs.map((p) => p.row.dest)).toEqual(['B'])
  })

  // §16: Example 4, P1 overloaded, every router as the source.
  it('what-if, Example 4 with P1 overloaded: LFA 27/35 → 13/31, TI-LFA 35/35 → 21/31', () => {
    const t = loadFixture('04-isp-core.yaml')
    const w = whatIf(t, overloaded(t, 'P1'))
    expect(w.before).toMatchObject({ pairs: 35, lfa: 27, rlfa: 35, tilfa: 35 })
    expect(w.after).toMatchObject({ pairs: 31, lfa: 13, rlfa: 15, tilfa: 21 })
    const effects = (e: string) => w.changes.filter((c) => c.effect === e).length
    expect([effects('worse'), effects('better'), effects('rerouted')]).toEqual([16, 0, 2])
  })
})

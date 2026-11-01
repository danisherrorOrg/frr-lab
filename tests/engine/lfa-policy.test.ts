import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { computeCoverage, computeForSource, protectedBy } from '../../src/engine/index'
import { computeLfa } from '../../src/engine/lfa'
import {
  DEFAULT_LFA_POLICY,
  hasLfaPolicy,
  isDefaultLfaPolicy,
  lfaPolicyEffect,
  lfaPolicyOf,
  withoutLfaPolicy,
} from '../../src/engine/lfa-policy'
import { allPairs } from '../../src/engine/spf'
import type { LfaPolicy, NodeId, Topology } from '../../src/engine/types'
import { connectedTopology } from '../arbitraries'

/**
 * Worked example, docs/02-algorithms.md §15. S → D goes via E (11).
 * A is downstream but its path to D goes through E; B is node-protecting but not downstream.
 *
 *   A ─1─ E ─1─ D
 *    \    |     |
 *    10   10    11
 *      \  |     |
 *        S ──2── B
 */
const policyNet = (
  lfaPolicy?: LfaPolicy,
  exclude: Partial<Record<NodeId, NodeId[]>> = {},
): Topology => ({
  name: 'LFA policy',
  srgbBase: 16000,
  ...(lfaPolicy && { lfaPolicy }),
  nodes: ['S', 'E', 'D', 'A', 'B'].map((id, i) => ({
    id,
    sidIndex: i + 1,
    ...(exclude[id] && { lfaExclude: exclude[id] }),
  })),
  links: [
    { id: 'S-E', a: 'S', b: 'E', metricAB: 10, metricBA: 10 },
    { id: 'E-D', a: 'E', b: 'D', metricAB: 1, metricBA: 1 },
    { id: 'S-A', a: 'S', b: 'A', metricAB: 10, metricBA: 10 },
    { id: 'A-E', a: 'A', b: 'E', metricAB: 1, metricBA: 1 },
    { id: 'S-B', a: 'S', b: 'B', metricAB: 2, metricBA: 2 },
    { id: 'B-D', a: 'B', b: 'D', metricAB: 11, metricBA: 11 },
  ],
})

const lfaFor = (t: Topology, d = 'D', e = 'E') =>
  computeLfa(allPairs(t), 'S', d, e, undefined, lfaPolicyOf(t, 'S'))

const protectionOf = (t: Topology, d = 'D') =>
  computeForSource(t, 'S').find((r) => r.dest === d)!.protections[0]!

describe('lfaPolicyOf', () => {
  it('defaults to D7: prefer node-protecting, then downstream, nothing excluded', () => {
    expect(lfaPolicyOf(policyNet(), 'S')).toEqual(DEFAULT_LFA_POLICY)
    expect(DEFAULT_LFA_POLICY).toEqual({
      nodeProtecting: 'prefer',
      downstream: 'prefer',
      exclude: [],
    })
    expect(isDefaultLfaPolicy(DEFAULT_LFA_POLICY)).toBe(true)
  })

  it("fills in the network's policy and the router's own exclude list", () => {
    const t = policyNet({ downstream: 'require' }, { S: ['B', 'A'] })
    expect(lfaPolicyOf(t, 'S')).toEqual({
      nodeProtecting: 'prefer',
      downstream: 'require',
      exclude: ['A', 'B'],
    })
    expect(lfaPolicyOf(t, 'A').exclude).toEqual([])
    expect(isDefaultLfaPolicy(lfaPolicyOf(t, 'S'))).toBe(false)
  })
})

// docs/02-algorithms.md §15 worked checks.
describe('LFA policy: worked example', () => {
  it('the two candidates, as RFC 5286 sees them', () => {
    const r = lfaFor(policyNet())
    expect(r.candidates).toEqual([
      {
        neighbor: 'A',
        link: 'S-A',
        loopFree: true,
        downstream: true,
        nodeProtecting: false,
        cost: 12,
      },
      {
        neighbor: 'B',
        link: 'S-B',
        loopFree: true,
        downstream: false,
        nodeProtecting: true,
        cost: 13,
      },
    ])
  })

  it.each<[string, LfaPolicy | undefined, string | undefined]>([
    ['default: node-protecting first', undefined, 'B'],
    ['node-protecting ignored: downstream wins', { nodeProtecting: 'ignore' }, 'A'],
    ['both ignored: lowest cost wins', { nodeProtecting: 'ignore', downstream: 'ignore' }, 'A'],
    ['downstream required', { downstream: 'require' }, 'A'],
    ['node-protecting required', { nodeProtecting: 'require' }, 'B'],
    [
      'both required: nothing passes',
      { nodeProtecting: 'require', downstream: 'require' },
      undefined,
    ],
  ])('%s → %s', (_, policy, best) => {
    expect(lfaFor(policyNet(policy)).best).toBe(best)
  })

  it('a "require" marks the loop-free candidates it rules out', () => {
    const r = lfaFor(policyNet({ downstream: 'require' }))
    expect(r.candidates.find((c) => c.neighbor === 'B')?.policyRejected).toBe('not-downstream')
    expect(r.candidates.find((c) => c.neighbor === 'A')).not.toHaveProperty('policyRejected')
  })

  it('excluding B: skipped before any check, A is chosen', () => {
    const r = lfaFor(policyNet(undefined, { S: ['B'] }))
    expect(r.skipped).toEqual([{ neighbor: 'B', link: 'S-B', reason: 'excluded' }])
    expect(r.candidates.map((c) => c.neighbor)).toEqual(['A'])
    expect(r.best).toBe('A')
  })

  it('excluding both: no LFA, so Remote LFA is used instead', () => {
    const p = protectionOf(policyNet(undefined, { S: ['A', 'B'] }))
    expect(p.lfa.best).toBeUndefined()
    expect(p.lfa.excluded).toEqual(['A', 'B'])
    expect(p.rlfa.needed).toBe(true)
    expect(protectedBy(p)).not.toBe('lfa')
  })

  it("another router's exclude list doesn't touch S", () => {
    expect(lfaFor(policyNet(undefined, { A: ['B'] })).best).toBe('B')
  })

  it('node protection is not required when D is E itself (it cannot apply)', () => {
    // To E, A is only link-protecting (Inequality 3 can never hold for D = E).
    const r = lfaFor(policyNet({ nodeProtecting: 'require' }), 'E')
    expect(r.best).toBe('A')
    expect(r.candidates.every((c) => c.policyRejected === undefined)).toBe(true)
  })

  it('explains the policy with the real reasons', () => {
    const p = protectionOf(policyNet({ downstream: 'require' }, { S: ['A'] }))
    const steps = p.explain.filter(
      (s) => s.rule.startsWith('LFA policy') || s.rule === 'LFA skipped' || s.rule === 'Best LFA',
    )
    expect(steps).toEqual([
      {
        rule: 'LFA policy',
        text: "S's LFA policy: node-protecting preferred, downstream required, never use A",
        ok: true,
        rfc: 'RFC 7916 §6.2',
      },
      {
        rule: 'LFA skipped',
        text: "Via A: skipped, S's policy never uses A as an alternate",
        ok: false,
        rfc: 'RFC 7916 §6.2.4.4',
      },
      {
        rule: 'LFA policy',
        text: 'Via B: loop-free, but not downstream, and the policy requires downstream ✗',
        ok: false,
        rfc: 'RFC 7916 §6.2.3',
      },
      {
        rule: 'Best LFA',
        text: 'No LFA: the loop-free neighbors of S for D are ruled out by the LFA policy',
        ok: false,
        rfc: 'RFC 7916 §6.2',
      },
    ])
  })

  it('the default policy adds no policy step', () => {
    expect(protectionOf(policyNet()).explain.some((s) => s.rule === 'LFA policy')).toBe(false)
  })

  it('coverage: both required drops LFA for S→D and Remote LFA or TI-LFA takes over', () => {
    const before = computeCoverage(policyNet(), { sources: ['S'] }).total
    const after = computeCoverage(policyNet({ nodeProtecting: 'require', downstream: 'require' }), {
      sources: ['S'],
    }).total
    expect(after.lfa).toBeLessThan(before.lfa)
    expect(after.tilfa).toBe(before.tilfa)
  })
})

describe('lfaPolicyEffect: what the policy changes for one source', () => {
  const effect = (t: Topology) =>
    lfaPolicyEffect(
      computeForSource(withoutLfaPolicy(t), 'S', { explain: false }),
      computeForSource(t, 'S', { explain: false }),
    )

  it('withoutLfaPolicy and hasLfaPolicy', () => {
    const t = policyNet({ downstream: 'require' }, { S: ['A'] })
    expect(hasLfaPolicy(t)).toBe(true)
    expect(hasLfaPolicy(withoutLfaPolicy(t))).toBe(false)
    expect(withoutLfaPolicy(t).nodes[0]).not.toHaveProperty('lfaExclude')
    expect(hasLfaPolicy(policyNet())).toBe(false)
  })

  it('lists each destination whose LFA changes, with the old and new neighbor', () => {
    const e = effect(policyNet({ nodeProtecting: 'ignore' }))
    expect(e.pairs).toBe(4)
    expect(e.changes).toEqual([{ dest: 'D', link: 'S-E', before: 'B', after: 'A' }])
  })

  it('"none" when the policy leaves no LFA', () => {
    const e = effect(policyNet(undefined, { S: ['A', 'B'] }))
    expect(e.changes).toContainEqual({ dest: 'D', link: 'S-E', before: 'B' })
  })

  it('no changes when every LFA already passes', () => {
    // S already picks a node-protecting LFA wherever it can (B for D; to A, B and E there is no E to avoid).
    expect(effect(policyNet({ nodeProtecting: 'require' })).changes).toEqual([])
  })
})

describe('LFA policy: properties', () => {
  const policies = fc.record({
    nodeProtecting: fc.constantFrom('prefer', 'require', 'ignore'),
    downstream: fc.constantFrom('prefer', 'require', 'ignore'),
  }) as fc.Arbitrary<LfaPolicy>

  it('the chosen LFA is always loop-free, passes every "require" and is never excluded', () => {
    fc.assert(
      fc.property(connectedTopology(), policies, fc.nat(), (topo, policy, k) => {
        const s = topo.nodes[0]!.id
        const banned = topo.nodes[1 + (k % (topo.nodes.length - 1))]!.id
        const t: Topology = {
          ...topo,
          lfaPolicy: policy,
          nodes: topo.nodes.map((n) => (n.id === s ? { ...n, lfaExclude: [banned] } : n)),
        }
        for (const r of computeForSource(t, s, { explain: false })) {
          for (const p of r.protections) {
            if (p.lfa.best === undefined) continue
            const c = p.lfa.candidates.find((x) => x.link === p.lfa.bestLink)!
            expect(c.loopFree).toBe(true)
            expect(c.policyRejected).toBeUndefined()
            expect(c.neighbor).not.toBe(banned)
            if (policy.downstream === 'require') expect(c.downstream).toBe(true)
            if (policy.nodeProtecting === 'require' && r.dest !== p.protectedLink.to)
              expect(c.nodeProtecting).toBe(true)
          }
        }
      }),
      { numRuns: 50 },
    )
  })

  it('"require" only takes LFAs away; "prefer" and "ignore" never do', () => {
    fc.assert(
      fc.property(connectedTopology(), policies, (topo, policy) => {
        const base = computeCoverage(topo).total
        const withPolicy = computeCoverage({ ...topo, lfaPolicy: policy }).total
        const anyRequire = policy.nodeProtecting === 'require' || policy.downstream === 'require'
        if (anyRequire) expect(withPolicy.lfa).toBeLessThanOrEqual(base.lfa)
        else expect(withPolicy.lfa).toBe(base.lfa)
        // TI-LFA follows the post-convergence path: the LFA policy never changes it.
        expect(withPolicy.tilfa).toBe(base.tilfa)
      }),
      { numRuns: 30 },
    )
  })
})

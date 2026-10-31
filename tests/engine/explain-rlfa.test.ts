import { describe, expect, it } from 'vitest'
import { explainRlfa } from '../../src/engine/explain'
import { computeRlfa } from '../../src/engine/rlfa'
import { allPairs } from '../../src/engine/spf'
import type { Topology } from '../../src/engine/types'
import { loadFixture } from '../helpers'

function explain(file: string, opts: { extended?: boolean; lfaBest?: string } = {}) {
  const r = computeRlfa(allPairs(loadFixture(file)), 'S', 'E', { extended: opts.extended ?? true })
  return explainRlfa(r, { d: 'E', lfaBest: opts.lfaBest })
}

describe('explainRlfa', () => {
  it('Example 2: numbers from docs/02-algorithms.md §6', () => {
    const steps = explain('02-ring5.yaml')
    expect(steps.map((x) => x.text)).toEqual([
      'P-space: A: dist(S,A)=1 < c(S,E)+dist(E,A) = 1+2 = 3 ✓',
      'P-space: B: dist(S,B)=2 < c(S,E)+dist(E,B) = 1+2 = 3 ✓',
      'P-space: C: dist(S,C)=2 < c(S,E)+dist(E,C) = 1+1 = 2 ✗',
      'Extended P-space: C via A: dist(A,C)=2 < dist(A,S)+dist(S,C) = 1+2 = 3 ✓',
      'Q-space: A: dist(A,E)=2 < dist(A,S)+c(S,E) = 1+1 = 2 ✗',
      'Q-space: B: dist(B,E)=2 < dist(B,S)+c(S,E) = 2+1 = 3 ✓',
      'Q-space: C: dist(C,E)=1 < dist(C,S)+c(S,E) = 2+1 = 3 ✓',
      'PQ = extended P ∩ Q = {B, C}',
      'Best PQ node: B (cost dist(S,B) = 2, lowest). Tunnel to B, which forwards normally to E',
    ])
    expect(steps.map((x) => x.ok)).toEqual([true, true, false, true, false, true, true, true, true])
    expect(steps.map((x) => x.rule)).toEqual([
      'P-space',
      'P-space',
      'P-space',
      'Extended P-space',
      'Q-space',
      'Q-space',
      'Q-space',
      'PQ nodes',
      'Best PQ node',
    ])
  })

  it('every step cites an RFC 7490 section', () => {
    for (const step of explain('02-ring5.yaml')) {
      expect(step.rfc).toMatch(/^RFC 7490 §5\.[234]/)
    }
  })

  it('Example 2 with plain P-space only', () => {
    const steps = explain('02-ring5.yaml', { extended: false })
    expect(steps.at(-2)?.text).toBe('PQ = P ∩ Q = {B}')
  })

  it('Example 3: no PQ node, so no Remote LFA', () => {
    const steps = explain('03-ring5-highmetric.yaml')
    expect(steps).toContainEqual({
      rule: 'Extended P-space',
      text: 'Extended P-space: C via A: dist(A,C)=3 < dist(A,S)+dist(S,C) = 1+2 = 3 ✗',
      ok: false,
      rfc: 'RFC 7490 §5.2.1.2',
    })
    expect(steps).toContainEqual({
      rule: 'Q-space',
      text: 'Q-space: B: dist(B,E)=3 < dist(B,S)+c(S,E) = 2+1 = 3 ✗',
      ok: false,
      rfc: 'RFC 7490 §5.2.1.3',
    })
    expect(steps.slice(-2)).toEqual([
      {
        rule: 'PQ nodes',
        text: 'No PQ node: no router is in both extended P-space and Q-space ✗',
        ok: false,
        rfc: 'RFC 7490 §5.2.1',
      },
      {
        rule: 'Best PQ node',
        text: 'No Remote LFA for link S–E',
        ok: false,
        rfc: 'RFC 7490 §5.2.2',
      },
    ])
  })

  it('Example 1: an LFA exists, so RLFA is not needed', () => {
    const r = computeRlfa(allPairs(loadFixture('01-square.yaml')), 'S', 'E')
    const steps = explainRlfa(r, { d: 'D', lfaBest: 'N' })
    expect(steps.at(-1)).toEqual({
      rule: 'Best PQ node',
      text: 'Remote LFA not needed: LFA N already protects D',
      ok: true,
      rfc: 'RFC 7490 §5.2.2',
    })
  })

  it('names the exit neighbor when the best PQ node is only in extended P-space', () => {
    // RFC 7490 Figure 1: ring S–E–D–C–B–A–S, all metrics 1. P = {A, B},
    // Q = {C, D}, and C joins through A's P-space (§5.2.1.2).
    const ring = ['S', 'E', 'D', 'C', 'B', 'A']
    const topo: Topology = {
      name: 'rfc7490-fig1',
      srgbBase: 16000,
      nodes: ring.map((id, i) => ({ id, sidIndex: i + 1 })),
      links: ring.map((a, i) => {
        const b = ring[(i + 1) % ring.length]!
        return { id: `${a}-${b}`, a, b, metricAB: 1, metricBA: 1 }
      }),
    }
    const r = computeRlfa(allPairs(topo), 'S', 'E')
    expect(r.pSpace).toEqual(['A', 'B'])
    expect(r.qSpace).toEqual(['C', 'D'])
    expect(r.pq).toEqual(['C'])
    const steps = explainRlfa(r, { d: 'E' })
    expect(steps.at(-1)?.text).toBe(
      'Best PQ node: C via A (cost c(S,A)+dist(A,C) = 1+2 = 3). Tunnel to C, sent out through A',
    )
  })

  it('names neighbors skipped because of the maximum metric', () => {
    const steps = explainRlfa(
      {
        ...computeRlfa(allPairs(loadFixture('02-ring5.yaml')), 'S', 'E'),
        skipped: [{ neighbor: 'X', link: 'S-X', reason: 'max-metric' }],
      },
      { d: 'E' },
    )
    expect(steps).toContainEqual({
      rule: 'Extended P-space skipped',
      text: 'Via X: not used as a tunnel exit, link S–X has the maximum metric 16777215',
      ok: false,
      rfc: 'RFC 7490 §5.4',
    })
  })
})

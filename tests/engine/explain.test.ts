import { describe, expect, it } from 'vitest'
import { explainLfa } from '../../src/engine/explain'
import { computeLfa, ecmpProtectors } from '../../src/engine/lfa'
import { DEFAULT_LFA_POLICY } from '../../src/engine/lfa-policy'
import { allPairs } from '../../src/engine/spf'
import { loadFixture } from '../helpers'

function explain(file: string, s: string, d: string, e: string) {
  const t = allPairs(loadFixture(file))
  return explainLfa(computeLfa(t, s, d, e), { s, d, e, ecmpProtectors: ecmpProtectors(t, s, d, e) })
}

describe('explainLfa', () => {
  it('Example 1: numbers from docs/02-algorithms.md §6', () => {
    expect(explain('01-square.yaml', 'S', 'D', 'E')).toEqual([
      {
        rule: 'LFA loop-free (Inequality 1)',
        text: 'Via N: dist(N,D)=10 < dist(N,S)+dist(S,D) = 15+20 = 35 ✓',
        ok: true,
        rfc: 'RFC 5286 §3.1',
      },
      {
        rule: 'LFA downstream (Inequality 2)',
        text: 'Via N: dist(N,D)=10 < dist(S,D)=20 ✓',
        ok: true,
        rfc: 'RFC 5286 §1',
      },
      {
        rule: 'LFA node-protecting (Inequality 3)',
        text: 'Via N: dist(N,D)=10 < dist(N,E)+dist(E,D) = 20+10 = 30 ✓',
        ok: true,
        rfc: 'RFC 5286 §3.2',
      },
      {
        rule: 'ECMP-protected',
        text: 'No other primary next hop to D avoids S–E ✗',
        ok: false,
        rfc: 'RFC 5286 §3.4',
      },
      {
        rule: 'Best LFA',
        text: 'Best LFA: N (node-protecting, downstream, cost c(S,N)+dist(N,D) = 15+10 = 25)',
        ok: true,
        rfc: 'RFC 5286 §3.6',
      },
    ])
  })

  it('Example 2: A fails Inequality 1 with a tie, so no LFA', () => {
    const steps = explain('02-ring5.yaml', 'S', 'E', 'E')
    expect(steps.map((x) => x.text)).toEqual([
      'Via A: dist(A,E)=2 < dist(A,S)+dist(S,E) = 1+1 = 2 ✗',
      'Via A: dist(A,E)=2 < dist(S,E)=1 ✗',
      'Via A: dist(A,E)=2 < dist(A,E)+dist(E,E) = 2+0 = 2 ✗',
      'No other primary next hop to E avoids S–E ✗',
      'No LFA: no neighbor of S passes Inequality 1 for E',
    ])
    expect(steps.every((x) => !x.ok)).toBe(true)
  })

  it('every step cites an RFC section', () => {
    for (const step of explain('03-ring5-highmetric.yaml', 'S', 'E', 'E')) {
      expect(step.rfc).toMatch(/^RFC 5286 §\d/)
    }
  })

  it('names skipped max-metric neighbors', () => {
    const steps = explainLfa(
      {
        candidates: [],
        checks: [],
        skipped: [{ neighbor: 'X', link: 'S-X', reason: 'max-metric' }],
        policy: DEFAULT_LFA_POLICY,
      },
      { s: 'S', d: 'D', e: 'E', ecmpProtectors: [] },
    )
    expect(steps[0]).toEqual({
      rule: 'LFA skipped',
      text: 'Via X: skipped, link S–X has the maximum metric 16777215',
      ok: false,
      rfc: 'RFC 5286 §3.5',
    })
  })

  it('ECMP step lists the protecting next hops', () => {
    const steps = explainLfa(
      { candidates: [], checks: [], skipped: [], policy: DEFAULT_LFA_POLICY },
      { s: 'S', d: 'D', e: 'E', ecmpProtectors: ['A', 'C'] },
    )
    expect(steps[0]?.text).toBe(
      'Other primary next hop A, C to D avoids S–E, so traffic keeps flowing ✓',
    )
  })
})

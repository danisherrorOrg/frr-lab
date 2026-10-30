import { describe, expect, it } from 'vitest'
import { explainTilfa } from '../../src/engine/explain'
import { computeTilfa } from '../../src/engine/tilfa'
import type { Topology } from '../../src/engine/types'
import { loadFixture } from '../helpers'

const explain = (file: string, d: string, e: string) =>
  explainTilfa(computeTilfa(loadFixture(file), 'S', d, e))

describe('explainTilfa', () => {
  it('Example 3: numbers from docs/02-algorithms.md §6', () => {
    const steps = explain('03-ring5-highmetric.yaml', 'E', 'E')
    expect(steps.map((x) => x.text)).toEqual([
      'Post-convergence path with S–E removed: S → A → B → C → E (cost 13)',
      'From S, C: dist(S,C)=2 matches path cost 12 ✗; avoids S–E: dist(S,C)=2 < dist(S,S)+c(S,E)+dist(E,C) = 0+1+1 = 2 ✗',
      'From S, B: dist(S,B)=2 matches path cost 2 ✓; avoids S–E: dist(S,B)=2 < dist(S,S)+c(S,E)+dist(E,B) = 0+1+3 = 4 ✓ → Prefix-SID(B)',
      'From B, C: dist(B,C)=4 matches path cost 10 ✗; avoids S–E: dist(B,C)=4 < dist(B,S)+c(S,E)+dist(E,C) = 2+1+1 = 4 ✗',
      'From B: no router further along can be reached with a prefix-SID, so Adj-SID(B→C) forces the link B→C',
      'From C, E: dist(C,E)=1 matches path cost 1 ✓; avoids S–E: dist(C,E)=1 < dist(C,S)+c(S,E)+dist(E,E) = 2+1+0 = 3 ✓ → Prefix-SID(E)',
      'Segment list [Prefix-SID(B), Adj-SID(B→C), Prefix-SID(E)] → labels 16004, 24005, 16002 (top first, before PHP): 2 extra labels, sent out via A',
    ])
    expect(steps.map((x) => x.ok)).toEqual([true, false, true, false, true, true, true])
    for (const step of steps) expect(step.rfc).toMatch(/^RFC 9855 §\d/)
  })

  it('Example 2: one extra label', () => {
    const steps = explain('02-ring5.yaml', 'E', 'E')
    expect(steps.at(-1)?.text).toBe(
      'Segment list [Prefix-SID(B), Prefix-SID(E)] → labels 16004, 16002 (top first, before PHP): 1 extra label, sent out via A',
    )
  })

  it('Example 1: explains the clean-up rule', () => {
    const steps = explain('01-square.yaml', 'D', 'E')
    expect(steps.slice(-2)).toEqual([
      {
        rule: 'TI-LFA clean-up',
        text: 'Dropped Prefix-SID(N): N is the first hop, so sending out of S–N already gets there',
        ok: true,
        rfc: 'RFC 9855 §5.1',
      },
      {
        rule: 'TI-LFA segment list',
        text: 'Segment list [Prefix-SID(D)] → labels 16004 (top first, before PHP): 0 extra labels, sent out via N',
        ok: true,
        rfc: 'RFC 9855 §5',
      },
    ])
  })

  it('explains adding the destination label after a final Adj-SID', () => {
    const steps = explain('03-ring5-highmetric.yaml', 'C', 'E')
    expect(steps).toContainEqual({
      rule: 'TI-LFA destination label',
      text: 'Added Prefix-SID(C): the destination’s own label stays under the repair list',
      ok: true,
      rfc: 'RFC 9855 §7.1',
    })
  })

  it('bridge link: unprotected, network partitioned', () => {
    const t: Topology = {
      name: 'line',
      srgbBase: 16000,
      nodes: ['S', 'E', 'A'].map((id, i) => ({ id, sidIndex: i + 1 })),
      links: [
        { id: 'S-E', a: 'S', b: 'E', metricAB: 1, metricBA: 1 },
        { id: 'S-A', a: 'S', b: 'A', metricAB: 1, metricBA: 1 },
      ],
    }
    expect(explainTilfa(computeTilfa(t, 'S', 'E', 'E'))).toEqual([
      {
        rule: 'Post-convergence path',
        text: 'E can’t be reached once S–E fails: unprotected (the network is partitioned)',
        ok: false,
        rfc: 'RFC 9855 §3',
      },
    ])
  })
})

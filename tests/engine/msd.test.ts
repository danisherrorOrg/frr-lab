import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { compareBackups } from '../../src/engine/compare'
import { computeCoverage, computeForSource, msdOf, protectedBy } from '../../src/engine/index'
import { coverageMap } from '../../src/engine/heat-map'
import { toRows } from '../../src/engine/rows'
import { simulateFailure } from '../../src/engine/simulate'
import type { Topology } from '../../src/engine/types'
import { connectedTopology } from '../arbitraries'
import { loadFixture } from '../helpers'

const ring3 = (msd?: number): Topology => {
  const t = loadFixture('03-ring5-highmetric.yaml')
  return msd === undefined ? t : { ...t, msd }
}

const protectionOf = (t: Topology, s: string, d: string, link: string) => {
  const r = computeForSource(t, s).find((x) => x.dest === d)!
  return r.protections.find((p) => p.protectedLink.id === link)!
}

describe('msdOf', () => {
  it("uses the router's own value, else the network's, else no limit", () => {
    const t = ring3(3)
    const withS: Topology = {
      ...t,
      nodes: t.nodes.map((n) => (n.id === 'S' ? { ...n, msd: 2 } : n)),
    }
    expect(msdOf(withS, 'S')).toBe(2)
    expect(msdOf(withS, 'A')).toBe(3)
    expect(msdOf(ring3(), 'S')).toBeUndefined()
  })
})

// Worked checks, docs/02-algorithms.md §14.
describe('max SID depth: Example 3', () => {
  it('no MSD: nothing changes, no msd field on the result', () => {
    const p = protectionOf(ring3(), 'S', 'E', 'S-E')
    expect(p.tilfa.labelStack).toEqual([16004, 24005, 16002])
    expect(p.tilfa).not.toHaveProperty('msd')
    expect(p.tilfa).not.toHaveProperty('tooDeep')
    expect(protectedBy(p)).toBe('tilfa')
  })

  it('MSD 3: the 3-label stack fits', () => {
    const p = protectionOf(ring3(3), 'S', 'E', 'S-E')
    expect(p.tilfa).toMatchObject({ msd: 3, labelStack: [16004, 24005, 16002] })
    expect(p.tilfa.tooDeep).toBeUndefined()
    expect(protectedBy(p)).toBe('tilfa')
    expect(p.explain.at(-1)).toMatchObject({
      rule: 'TI-LFA max SID depth',
      ok: true,
      text: '3 labels (1 swapped + 2 pushed) ≤ MSD 3 of S ✓',
      rfc: 'RFC 8491 §5',
    })
  })

  it('MSD 2: S → E over S–E is too deep, kept but not counted', () => {
    const p = protectionOf(ring3(2), 'S', 'E', 'S-E')
    // The repair is still worked out, so the UI can show what didn't fit.
    expect(p.tilfa).toMatchObject({ msd: 2, tooDeep: true, labelStack: [16004, 24005, 16002] })
    expect(protectedBy(p)).toBeNull()
    expect(p.explain.at(-1)).toMatchObject({
      ok: false,
      text: '3 labels (1 swapped + 2 pushed) > MSD 2 of S ✗: S’s hardware can’t impose this stack, so no TI-LFA backup is installed',
    })
  })

  it('MSD 2: coverage counts the deep repairs apart', () => {
    const r = computeCoverage(ring3(2))
    // Every TI-LFA repair in Example 3 that isn't an LFA needs 3 labels: S has 4, A and E 1 each.
    expect(r.total).toEqual({ pairs: 20, ecmp: 0, lfa: 8, rlfa: 8, tilfa: 14, tooDeep: 6 })
    expect(r.sources.find((s) => s.source === 'S')!.counts).toEqual({
      pairs: 4,
      ecmp: 0,
      lfa: 0,
      rlfa: 0,
      tilfa: 0,
      tooDeep: 4,
    })
    const deep = r.unprotected.filter((u) => u.reason === 'too-deep')
    expect(deep).toHaveLength(6)
    expect(deep.find((u) => u.source === 'S' && u.dest === 'E')!.text).toBe(
      'No LFA and no PQ node for E over S–E; the TI-LFA stack needs 3 labels, more than S’s MSD of 2',
    )
    expect(deep.every((u) => !u.tilfa)).toBe(true)
  })

  it("a router's own MSD overrides the network's", () => {
    const t = ring3(3)
    const sOnly: Topology = {
      ...t,
      nodes: t.nodes.map((n) => (n.id === 'S' ? { ...n, msd: 2 } : n)),
    }
    expect(computeCoverage(sOnly).total).toMatchObject({ tilfa: 16, tooDeep: 4 })
  })

  it('rows, heat map and compare view read the same flag', () => {
    const t = ring3(2)
    const row = toRows('S', computeForSource(t, 'S')).find((r) => r.dest === 'E')!
    expect(row.protectedBy).toBeNull()
    expect(row.tilfa).toMatchObject({ msd: 2, tooDeep: true })
    expect(coverageMap(t).routers.S).toMatchObject({ tilfa: 0, tooDeep: 4 })
    const c = compareBackups(t, 'S', 'E', 'S-E')
    expect(c.protectedBy).toBeNull()
    expect(c.options[2]).toMatchObject({ found: true, used: false, msd: 2, tooDeep: true })
  })

  it('TI-LFA mode: S has no backup installed for S–E, so the traffic is dropped', () => {
    const sim = simulateFailure(ring3(2), 'S', ['S-E'], 'tilfa')
    for (const d of ['C', 'E']) {
      const f = sim.flows.find((x) => x.dest === d)!
      expect(f.status).toBe('dropped')
      expect(f.drop).toEqual({ at: 'S', link: 'S-E', next: 'E', reason: 'too-deep' })
    }
    // With room for 3 labels the same failure is repaired.
    const ok = simulateFailure(ring3(3), 'S', ['S-E'], 'tilfa')
    expect(ok.flows.every((f) => f.status !== 'dropped')).toBe(true)
  })
})

describe('max SID depth: properties', () => {
  it('only moves pairs from TI-LFA to too deep, exactly those with a longer stack', () => {
    fc.assert(
      fc.property(connectedTopology(), fc.integer({ min: 2, max: 4 }), (topo, msd) => {
        const free = computeCoverage(topo).total
        const capped = computeCoverage({ ...topo, msd }).total
        expect(capped.tilfa + capped.tooDeep).toBe(free.tilfa)
        expect({ ...capped, tilfa: 0, tooDeep: 0 }).toEqual({ ...free, tilfa: 0, tooDeep: 0 })
        const source = topo.nodes[0]!.id
        for (const r of computeForSource({ ...topo, msd }, source, { explain: false }))
          for (const p of r.protections)
            if (p.tilfa.labelStack)
              expect(p.tilfa.tooDeep === true).toBe(p.tilfa.labelStack.length > msd)
      }),
      { numRuns: 30 },
    )
  })
})

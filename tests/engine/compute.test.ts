/// <reference types="node" />
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { computeForSource } from '../../src/engine/index'
import type { Topology } from '../../src/engine/types'
import { loadFixture } from '../helpers'

const FIXTURES = [
  '01-square.yaml',
  '02-ring5.yaml',
  '03-ring5-highmetric.yaml',
  '04-isp-core.yaml',
  '05-leaf-spine.yaml',
  '06-link-protecting.yaml',
  '07-parallel.yaml',
  '08-node-protection.yaml',
  '09-srlg.yaml',
  '10-lan-levels.yaml',
  '11-flex-algo.yaml',
]

/** JSON null means "none": drop it here, and list where it was so the test can check it's absent. */
function splitNulls(x: unknown, path: string[] = [], nulls: string[][] = []): unknown {
  if (Array.isArray(x)) return x.map((v, i) => splitNulls(v, [...path, String(i)], nulls))
  if (x !== null && typeof x === 'object') {
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(x)) {
      if (v === null) nulls.push([...path, k])
      else out[k] = splitNulls(v, [...path, k], nulls)
    }
    return out
  }
  return x
}

const at = (x: unknown, path: string[]): unknown =>
  path.reduce<unknown>((o, k) => (o as Record<string, unknown> | undefined)?.[k], x)

interface ExpectedFile {
  source: string
  results: {
    dest: string
    protections: { rlfa: Record<string, unknown> }[]
  }[]
}

function expected(file: string): ExpectedFile {
  const name = file.replace(/\.yaml$/, '.expected.json')
  const raw = readFileSync(new URL(`../fixtures/${name}`, import.meta.url), 'utf8')
  return JSON.parse(raw) as ExpectedFile
}

/** Topology from [a, b, metric] triples, symmetric metrics, SID index = position + 1. */
function topo(nodes: string[], links: [string, string, number][]): Topology {
  return {
    name: 't',
    srgbBase: 16000,
    nodes: nodes.map((id, i) => ({ id, sidIndex: i + 1 })),
    links: links.map(([a, b, m]) => ({ id: `${a}-${b}`, a, b, metricAB: m, metricBA: m })),
  }
}

// docs/02-algorithms.md §6 and docs/05-testing.md §2: the whole pipeline, end to end.
describe('computeForSource: worked examples', () => {
  it.each(FIXTURES)('%s matches every field in its expected file', (file) => {
    const exp = expected(file)
    const results = computeForSource(loadFixture(file), exp.source)
    for (const want of exp.results) {
      // plainPSpaceOnly is a second run with { extended: false }, tested below.
      const rlfa = { ...want.protections[0]!.rlfa }
      delete rlfa.plainPSpaceOnly
      const cleaned = {
        ...want,
        protections: [{ ...want.protections[0], rlfa }, ...want.protections.slice(1)],
      }
      const got = results.find((r) => r.dest === want.dest)
      const nulls: string[][] = []
      expect(got).toMatchObject(splitNulls(cleaned, [], nulls) as object)
      for (const path of nulls) expect(at(got, path), path.join('.')).toBeUndefined()
    }
  })

  it('02-ring5: plain P-space option gives PQ = {B}', () => {
    const [r] = computeForSource(loadFixture('02-ring5.yaml'), 'S', { extended: false }).filter(
      (x) => x.dest === 'E',
    )
    expect(r?.protections[0]?.rlfa).toMatchObject({ extended: false, pq: ['B'], best: 'B' })
  })

  it.each([
    ['04-isp-core.yaml', 'PE1', 'P1'],
    ['05-leaf-spine.yaml', 'L1', 'SP1'],
  ])('%s: plain P-space finds no PQ node, extended P-space does', (file, s, d) => {
    const r = computeForSource(loadFixture(file), s, { extended: false }).find((x) => x.dest === d)
    expect(r?.protections[0]?.rlfa.pq).toEqual([])
    expect(r?.protections[0]?.rlfa.best).toBeUndefined()
  })

  it('01-square: RLFA is not needed when an LFA exists, so no PQ node is chosen', () => {
    const r = computeForSource(loadFixture('01-square.yaml'), 'S').find((x) => x.dest === 'D')
    expect(r?.protections[0]?.rlfa.needed).toBe(false)
    expect(r?.protections[0]?.rlfa.best).toBeUndefined()
  })
})

describe('computeForSource: shape', () => {
  it('lists every other router once, sorted, with cost and sorted next hops', () => {
    const results = computeForSource(loadFixture('02-ring5.yaml'), 'S')
    expect(results.map((r) => [r.dest, r.cost, r.nextHops])).toEqual([
      ['A', 1, ['A']],
      ['B', 2, ['A']],
      ['C', 2, ['E']],
      ['E', 1, ['E']],
    ])
  })

  it('gives one protection per primary next hop (ECMP square)', () => {
    const t = topo(
      ['S', 'A', 'B', 'D'],
      [
        ['S', 'A', 1],
        ['S', 'B', 1],
        ['A', 'D', 1],
        ['B', 'D', 1],
      ],
    )
    const d = computeForSource(t, 'S').find((r) => r.dest === 'D')!
    expect(d.nextHops).toEqual(['A', 'B'])
    expect(d.protections.map((p) => [p.protectedLink.to, p.ecmpProtected, p.lfa.best])).toEqual([
      ['A', true, 'B'],
      ['B', true, 'A'],
    ])
  })

  it('joins LFA, RLFA and TI-LFA explain steps in that order', () => {
    const [p] = computeForSource(loadFixture('02-ring5.yaml'), 'S').find(
      (r) => r.dest === 'E',
    )!.protections
    const rules = p!.explain.map((s) => s.rule)
    const firstRlfa = rules.findIndex((r) => r.startsWith('P-space'))
    const firstTilfa = rules.findIndex((r) => r.startsWith('Post-convergence'))
    expect(rules[0]).toMatch(/^LFA/)
    expect(firstRlfa).toBeGreaterThan(0)
    expect(firstTilfa).toBeGreaterThan(firstRlfa)
  })

  it('skips explain steps when asked (coverage runs)', () => {
    const results = computeForSource(loadFixture('03-ring5-highmetric.yaml'), 'S', {
      explain: false,
    })
    expect(results.flatMap((r) => r.protections.flatMap((p) => p.explain))).toEqual([])
  })

  it('leaves out routers that can’t be reached', () => {
    const t = topo(
      ['S', 'A', 'X', 'Y'],
      [
        ['S', 'A', 1],
        ['X', 'Y', 1],
      ],
    )
    expect(computeForSource(t, 'S').map((r) => r.dest)).toEqual(['A'])
  })

  it('a bridge link: TI-LFA is empty, nothing protects', () => {
    const t = topo(['S', 'E'], [['S', 'E', 1]])
    const [r] = computeForSource(t, 'S')
    expect(r?.protections[0]).toMatchObject({
      ecmpProtected: false,
      lfa: { candidates: [] },
      rlfa: { pq: [], needed: true },
      tilfa: {},
    })
    expect(r?.protections[0]?.lfa.best).toBeUndefined()
    expect(r?.protections[0]?.rlfa.best).toBeUndefined()
  })

  it('throws for an unknown source', () => {
    expect(() => computeForSource(loadFixture('01-square.yaml'), 'Z')).toThrow(/Z/)
  })

  it('is deterministic: same input, same output', () => {
    const t = loadFixture('03-ring5-highmetric.yaml')
    expect(computeForSource(t, 'B')).toEqual(computeForSource(structuredClone(t), 'B'))
  })
})

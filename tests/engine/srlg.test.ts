// SRLG (Later #3, D53, docs/02-algorithms.md §18). Every expected value was worked
// out by hand first (the example file has the reasoning).
import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { compareBackups } from '../../src/engine/compare'
import { computeCoverage, computeForSource } from '../../src/engine/index'
import { packetWalk } from '../../src/engine/packet-walk'
import { lfaPath } from '../../src/engine/paths'
import { simulateFailure } from '../../src/engine/simulate'
import { allPairs } from '../../src/engine/spf'
import { srlgGroups, srlgShared } from '../../src/engine/srlg'
import type { NodeId, Protection, Topology } from '../../src/engine/types'
import { parseTopology, serializeTopology } from '../../src/io/yaml'
import { updateLink } from '../../src/state/edit'
import { connectedTopology } from '../arbitraries'
import { loadFixture } from '../helpers'

const ex9 = loadFixture('09-srlg.yaml')
const withGoal = (t: Topology, goal: Topology['protection']): Topology => {
  const next = { ...t }
  if (goal === undefined) delete next.protection
  else next.protection = goal
  return next
}

const protection = (t: Topology, s: NodeId, d: NodeId): Protection =>
  computeForSource(t, s).find((x) => x.dest === d)!.protections[0]!

describe('SRLG lookups', () => {
  it('lists each group and the links that share one', () => {
    expect(srlgGroups(ex9)).toEqual([{ group: 'duct-1', links: ['A-B', 'S-E'] }])
    expect(srlgShared(ex9, 'S-E')).toEqual(['A-B'])
    expect(srlgShared(ex9, 'A-B')).toEqual(['S-E'])
    expect(srlgShared(ex9, 'S-A')).toEqual([])
  })
})

describe('Example 9: one duct, two links', () => {
  it('link mode picks LFA A and TI-LFA through A–B; no SRLG fields', () => {
    const p = protection(withGoal(ex9, undefined), 'S', 'D')
    expect(p.lfa.best).toBe('A')
    expect(p.lfa.candidates.every((c) => c.srlgDisjoint === undefined)).toBe(true)
    expect(p.srlg).toBeUndefined()
    expect(p.tilfa).toMatchObject({ path: ['S', 'A', 'B', 'D'], labelStack: [16004, 16006] })
  })

  it('explains the SRLG checks', () => {
    const texts = protection(ex9, 'S', 'D').explain.map((x) => x.text)
    expect(texts).toContain(
      'Via A: the link or its path to D may use a link of the protected link’s SRLG ✗',
    )
    expect(texts).toContain(
      'Via C: the link and its path to D avoid every link of the protected link’s SRLG ✓',
    )
    expect(texts).toContain(
      'Post-convergence path with S–E and link A-B (same SRLG) removed: S → C → D (cost 6)',
    )
  })

  it('node + SRLG: E and A–B removed gives the same path, protects both', () => {
    const p = protection(withGoal(ex9, 'node-srlg'), 'S', 'D')
    expect(p.tilfa).toMatchObject({ path: ['S', 'C', 'D'], protects: 'node-srlg' })
    expect(p.tilfa.fallback).toBeUndefined()
  })

  it('S → E: node + SRLG falls back to SRLG (E is the destination)', () => {
    // E removed is impossible; S–E and A–B removed: S-C-D-E (7).
    const p = protection(withGoal(ex9, 'node-srlg'), 'S', 'E')
    expect(p.tilfa).toMatchObject({
      path: ['S', 'C', 'D', 'E'],
      protects: 'srlg',
      fallback: 'dest-is-next-hop',
    })
  })

  it('a bridge in the SRLG: falls back to link protection and says so', () => {
    // C–D also in the duct: without S–E, A–B and C–D, D is cut off from S.
    const t: Topology = {
      ...ex9,
      links: ex9.links.map((l) => (l.id === 'C-D' ? { ...l, srlg: ['duct-1'] } : l)),
    }
    const p = protection(t, 'S', 'D')
    expect(p.tilfa).toMatchObject({
      path: ['S', 'A', 'B', 'D'],
      protects: 'link',
      fallback: 'none',
    })
    expect(p.explain.map((x) => x.text)).toContain(
      'D can’t be reached once the links of its SRLG fail: no repair for that, link protection only ✗',
    )
  })

  it('the duct is cut: the SRLG-disjoint repair gets through on its own', () => {
    for (const mode of ['lfa', 'tilfa'] as const) {
      const f = simulateFailure(ex9, 'S', ['S-E', 'A-B'], mode).flows.find((x) => x.dest === 'D')!
      expect(f).toMatchObject({ status: 'repaired', repair: ['S', 'C', 'D'], repairCost: 6 })
      expect(f.repairs).toHaveLength(1)
    }
    // Link mode: S's backup runs into A–B, and A has to repair again.
    const old = simulateFailure(withGoal(ex9, undefined), 'S', ['S-E', 'A-B'], 'tilfa')
    expect(old.flows.find((x) => x.dest === 'D')!.repairs!.length).toBeGreaterThan(1)
  })

  it('compare view and coverage count SRLG-safe backups', () => {
    const c = compareBackups(ex9, 'S', 'D', 'S-E')
    expect(c.options[2]).toMatchObject({ protects: 'srlg', cost: 6 })
    // S's pairs over S–E: E and D (S-E-D 2 < S-A-B-D 3). D: LFA C is SRLG-disjoint.
    // E: no LFA (A: 2 < 1+1 ✗, C: 4 < 3+1 ✗); Remote LFA PQ B (cost 2) is reached over
    // S-A-B, through the duct, so it doesn't count. TI-LFA S-C-D-E avoids the duct for both.
    const total = computeCoverage(ex9, { sources: ['S'] }).total
    expect(total.srlg).toEqual({ pairs: 2, rlfa: 1, tilfa: 2 })
  })
})

describe('YAML and editing', () => {
  it('round-trips srlg on links and protection: srlg', () => {
    const back = parseTopology(serializeTopology(ex9))
    expect(back.ok && back.topology).toEqual(ex9)
    expect(serializeTopology(ex9)).toContain('srlg: [duct-1]')
  })

  it('rejects names with spaces', () => {
    const r = parseTopology(
      'nodes: [{ id: S, sid: 1 }, { id: E, sid: 2 }]\nlinks: [{ a: S, b: E, metric: 1, srlg: ["a b"] }]\n',
    )
    expect(!r.ok && r.errors[0]).toContain('"srlg" must be a list of names')
  })

  it('edits sort and dedupe the names; an empty list removes them', () => {
    const r = updateLink(ex9, 'S-A', { srlg: ['z', 'duct-1', 'z', ' '] })
    expect(r.ok && r.topology.links.find((l) => l.id === 'S-A')!.srlg).toEqual(['duct-1', 'z'])
    const off = updateLink(ex9, 'S-E', { srlg: [] })
    expect(off.ok && off.topology.links.find((l) => l.id === 'S-E')).not.toHaveProperty('srlg')
    expect(updateLink(ex9, 'S-E', { srlg: ['bad name!'] }).ok).toBe(false)
  })
})

/** Random networks with each link in group g0 or g1 (or none), protection: srlg. */
const withSrlgs = connectedTopology().chain((t) =>
  fc
    .array(fc.integer({ min: 0, max: 3 }), {
      minLength: t.links.length,
      maxLength: t.links.length,
    })
    .map((gs): Topology => ({
      ...t,
      protection: 'srlg',
      links: t.links.map((l, i) => (gs[i]! < 2 ? { ...l, srlg: [`g${gs[i]}`] } : l)),
    })),
)

describe('property: SRLG-safe backups avoid every link of the SRLG', () => {
  it('holds for TI-LFA and the chosen LFA', () => {
    fc.assert(
      fc.property(withSrlgs, (t) => {
        const table = allPairs(t)
        const s = t.nodes[0]!.id
        for (const r of computeForSource(t, s, { explain: false })) {
          for (const p of r.protections) {
            const e = p.protectedLink.to
            const shared = new Set(p.srlg ?? [])
            const usesShared = (path: NodeId[]) =>
              path.some((x, i) => {
                const y = path[i + 1]
                if (y === undefined) return false
                // Any link between x and y in the group counts: the walk takes the cheapest.
                const l = t.links.find(
                  (k) => ((k.a === x && k.b === y) || (k.a === y && k.b === x)) && shared.has(k.id),
                )
                return l !== undefined
              })
            if (p.tilfa.protects === 'srlg') {
              expect(usesShared(p.tilfa.path!)).toBe(false)
              const w = packetWalk(t, s, r.dest, e, { link: p.protectedLink.id })!
              expect(w.hops.at(-1)!.router).toBe(r.dest)
            }
            const best = p.lfa.candidates.find((c) => c.link === p.lfa.bestLink)
            if (best?.srlgDisjoint === true) {
              expect(shared.has(best.link)).toBe(false)
              expect(usesShared(lfaPath(table, s, best.neighbor, r.dest)!.slice(1))).toBe(false)
            }
          }
        }
      }),
      { numRuns: 60 },
    )
  })
})

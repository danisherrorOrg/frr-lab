// Node protection (Later #1, D51): Remote LFA per RFC 8102, TI-LFA with router E
// removed (docs/02-algorithms.md §3.1, §4.4). Every expected value was worked out
// by hand first; the reasoning is in the comments and in the example files.
import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { compareBackups } from '../../src/engine/compare'
import { computeCoverage, computeForSource, shortestPath } from '../../src/engine/index'
import { packetWalk } from '../../src/engine/packet-walk'
import { rlfaPath } from '../../src/engine/paths'
import { simulateFailure } from '../../src/engine/simulate'
import { allPairs } from '../../src/engine/spf'
import type { NodeId, Protection, Topology } from '../../src/engine/types'
import { parseTopology, serializeTopology } from '../../src/io/yaml'
import { connectedTopology } from '../arbitraries'
import { loadFixture } from '../helpers'

const node = (t: Topology): Topology => ({ ...t, protection: 'node' })
const link = (t: Topology): Topology => {
  const rest = { ...t }
  delete rest.protection
  return rest
}

const protection = (t: Topology, s: NodeId, d: NodeId): Protection => {
  const r = computeForSource(t, s).find((x) => x.dest === d)
  if (!r) throw new Error(`no result for ${d}`)
  return r.protections[0]!
}

const flowTo = (
  t: Topology,
  s: NodeId,
  failed: NodeId,
  mode: 'lfa' | 'rlfa' | 'tilfa',
  d: NodeId,
) => simulateFailure(t, s, { nodes: [failed] }, mode).flows.find((f) => f.dest === d)!

describe('Example 8: node-protecting Remote LFA and TI-LFA', () => {
  const ex8 = loadFixture('08-node-protection.yaml')

  it('loads with protection: node', () => {
    expect(ex8.protection).toBe('node')
  })

  it('link mode picks PQ node B, whose path to D goes through E', () => {
    const p = protection(link(ex8), 'S', 'D')
    expect(p.rlfa).toMatchObject({ best: 'B', exitVia: { B: 'N' } })
    expect(p.rlfa.node).toBeUndefined()
    expect(p.rlfa.protects).toBeUndefined()
    expect(shortestPath(allPairs(ex8), 'B', 'D')).toEqual(['B', 'E', 'D'])
    // Link TI-LFA: S-N-B-E-D (8); from N, D ties with N-S-E-D, so Prefix-SID(B) first.
    expect(p.tilfa).toMatchObject({ path: ['S', 'N', 'B', 'E', 'D'], labelStack: [16004, 16006] })
    expect(p.tilfa.protects).toBeUndefined()
  })

  it('explains each node-protecting check with the numbers', () => {
    const texts = protection(ex8, 'S', 'D').explain.map((x) => x.text)
    expect(texts).toContain(
      'Node-protecting P-space: B via N: dist(N,B)=3 < dist(N,E)+dist(E,B) = 4+1 = 5 ✓',
    )
    expect(texts).toContain('B’s path to D avoids E: dist(B,D)=3 < dist(B,E)+dist(E,D) = 1+2 = 3 ✗')
    expect(texts).toContain('C’s path to D avoids E: dist(C,D)=3 < dist(C,E)+dist(E,D) = 4+2 = 6 ✓')
    expect(texts).toContain(
      'Best node-protecting PQ node: C via N (cost 8). The tunnel and C’s path to D both avoid router E',
    )
    expect(texts).toContain(
      'Post-convergence path with router E (and all its links) removed: S → N → B → C → D (cost 11)',
    )
    expect(texts).toContain(
      'From N, D: dist(N,D)=6 matches path cost 9 ✗; avoids router E: dist(N,D)=6 < dist(N,E)+dist(E,D) = 4+2 = 6 ✗',
    )
    expect(texts).toContain(
      'From N, C: dist(N,C)=6 matches path cost 6 ✓; avoids router E: dist(N,C)=6 < dist(N,E)+dist(E,C) = 4+4 = 8 ✓ → Prefix-SID(C)',
    )
  })

  it('S → E: D is the next hop, so both fall back to link protection', () => {
    const p = protection(ex8, 'S', 'E')
    expect(p.rlfa).toMatchObject({ best: 'B', protects: 'link', fallback: 'dest-is-next-hop' })
    expect(p.tilfa).toMatchObject({ protects: 'link', fallback: 'dest-is-next-hop' })
    expect(p.explain.map((x) => x.text)).toContain(
      'E is the next hop E itself, so router E can’t be avoided: link protection only',
    )
  })

  it('router E fails: the node-protecting repairs get through, the link ones break', () => {
    for (const mode of ['rlfa', 'tilfa'] as const) {
      const f = flowTo(ex8, 'S', 'E', mode, 'D')
      expect(f).toMatchObject({
        status: 'repaired',
        repair: ['S', 'N', 'B', 'C', 'D'],
        repairCost: 11,
      })
      expect(f.through).toBeUndefined()
      expect(f.repairs).toHaveLength(1)

      const old = flowTo(link(ex8), 'S', 'E', mode, 'D')
      expect(old.through?.node).toBe('E')
    }
  })

  it('compare view: node-protecting TI-LFA is longer than the final path after a link failure', () => {
    const c = compareBackups(ex8, 'S', 'D', 'S-E')
    expect(c.final?.cost).toBe(8)
    const [, rlfa, ti] = c.options
    expect(rlfa).toMatchObject({ via: 'C', exitVia: 'N', protects: 'node', cost: 11 })
    expect(ti).toMatchObject({ protects: 'node', cost: 11, vsFinal: 'longer', used: false })
    expect(c.protectedBy).toBe('rlfa')
  })

  it('the packet walk follows the node-protecting segments on normal tables', () => {
    const w = packetWalk(ex8, 'S', 'D', 'E')!
    expect(w.hops.map((h) => h.router)).toEqual(['S', 'N', 'B', 'C', 'D'])
    expect(w.cost).toBe(11)
  })

  it('coverage counts how many backups avoid the next-hop router', () => {
    const c = computeCoverage(ex8, { sources: ['S'] }).total
    // S's pairs: E and N (each its own next hop, so node protection doesn't apply),
    // then B, C (S-E-B-C 6 < S-N-B-C 8) and D, all via E. B and C: LFA N is
    // node-protecting (3 < 4+1, 6 < 4+4); D: node PQ C. TI-LFA avoids E for all three.
    expect(c.node).toEqual({ pairs: 3, rlfa: 3, tilfa: 3 })
    expect(computeCoverage(link(ex8), { sources: ['S'] }).total.node).toBeUndefined()
  })
})

describe('Example 6: node protection fixes the router-failure loop', () => {
  const ex6 = node(loadFixture('06-link-protecting.yaml'))

  it('TI-LFA with E removed: S→N→M→D, [Prefix-SID(M), Prefix-SID(D)]', () => {
    // From S: M is 11 = path cost and avoids E (11 < 1+11); from M: D (10 < 11+1).
    const p = protection(ex6, 'S', 'D')
    expect(p.tilfa).toMatchObject({
      path: ['S', 'N', 'M', 'D'],
      labelStack: [16004, 16005],
      protects: 'node',
    })
    // An LFA (link-protecting N) exists, so Remote LFA isn't used; the sets are still shown.
    expect(p.rlfa.needed).toBe(false)
    expect(p.rlfa.node).toEqual({ pSpace: ['M', 'N'], pq: ['M'], best: 'M' })
  })

  it('router E fails, TI-LFA: delivered on S→N→M→D (21) instead of looping', () => {
    const f = flowTo(ex6, 'S', 'E', 'tilfa', 'D')
    expect(f).toMatchObject({ status: 'repaired', repair: ['S', 'N', 'M', 'D'], repairCost: 21 })
    expect(f.through).toBeUndefined()
    expect(flowTo(link(ex6), 'S', 'E', 'tilfa', 'D').status).toBe('looped')
  })
})

describe('Example 1: the node-protecting repair is the link one', () => {
  it('S → D: E removed gives S-N-D, [Prefix-SID(D)]', () => {
    const p = protection(node(loadFixture('01-square.yaml')), 'S', 'D')
    expect(p.tilfa).toMatchObject({ path: ['S', 'N', 'D'], labelStack: [16004], protects: 'node' })
  })
})

describe('link mode is unchanged', () => {
  it.each(['02-ring5.yaml', '04-isp-core.yaml', '07-parallel.yaml'])(
    '%s: protection: link gives the same results as no setting',
    (file) => {
      const t = loadFixture(file)
      const s = t.nodes[0]!.id
      expect(computeForSource({ ...t, protection: 'link' }, s)).toEqual(computeForSource(t, s))
    },
  )
})

describe('YAML', () => {
  it('round-trips protection: node and drops the default', () => {
    const t = loadFixture('08-node-protection.yaml')
    const back = parseTopology(serializeTopology(t))
    expect(back.ok && back.topology.protection).toBe('node')
    expect(serializeTopology(link(t))).not.toMatch(/^protection:/m)
    expect(serializeTopology(t)).toMatch(/^protection: node$/m)
  })

  it('rejects other values and suggests the key for a typo', () => {
    const bad = parseTopology('protection: srlgx\nnodes: [{ id: S, sid: 1 }]\n')
    expect(bad.ok).toBe(false)
    expect(!bad.ok && bad.errors[0]).toContain('"protection" must be one of link, node')
    const typo = parseTopology('protect: node\nnodes: [{ id: S, sid: 1 }]\n')
    expect(!typo.ok && typo.errors[0]).toContain('Did you mean "protection"?')
  })
})

describe('property: a node-protecting backup never goes through E', () => {
  it('holds for TI-LFA and Remote LFA, and survives router E failing', () => {
    fc.assert(
      fc.property(connectedTopology(), (t0) => {
        const t = node(t0)
        const table = allPairs(t)
        const s = t.nodes[0]!.id
        const results = computeForSource(t, s, { explain: false })
        for (const r of results) {
          for (const p of r.protections) {
            const e = p.protectedLink.to
            if (p.tilfa.protects === 'node') {
              expect(p.tilfa.path).not.toContain(e)
              // Segments follow normal tables (throws if a hop isn't a normal next hop).
              const w = packetWalk(t, s, r.dest, e, { link: p.protectedLink.id })!
              expect(w.hops.at(-1)!.router).toBe(r.dest)
            }
            const pq = p.rlfa.best
            if (p.rlfa.needed && pq !== undefined && p.rlfa.protects === 'node') {
              expect(rlfaPath(table, s, pq, p.rlfa.exitVia[pq], r.dest)).not.toContain(e)
            }
          }
        }
        // Fail each of S's neighbors alone: a flow S itself repairs with a node-protecting
        // TI-LFA backup never meets the failed router.
        for (const e of new Set(
          t.links.flatMap((l) => (l.a === s ? [l.b] : l.b === s ? [l.a] : [])),
        )) {
          for (const f of simulateFailure(t, s, { nodes: [e] }, 'tilfa').flows) {
            if (f.destDown || f.plr !== s || f.method !== 'tilfa') continue
            const p = results
              .find((x) => x.dest === f.dest)!
              .protections.find((x) => x.protectedLink.id === f.hitLink)!
            if (p.tilfa.protects === 'node') {
              expect(f.through).toBeUndefined()
              expect(f.status).toBe('repaired')
            }
          }
        }
      }),
      { numRuns: 60 },
    )
  })
})

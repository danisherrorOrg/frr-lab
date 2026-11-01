// LANs (D55, docs/02-algorithms.md §20) and multi-level IS-IS (D56, §21).
// Expected values were worked out by hand first; see examples/10-lan-levels.yaml.
import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { computeForSource } from '../../src/engine/index'
import { expandLans, lanLinks, lanShared } from '../../src/engine/lan'
import { isMultiLevel, levelTopology, levelViews, mergeLevel } from '../../src/engine/levels'
import { packetWalk } from '../../src/engine/packet-walk'
import { simulateFailure } from '../../src/engine/simulate'
import type { Protection, Topology } from '../../src/engine/types'
import { parseTopology, serializeTopology } from '../../src/io/yaml'
import { deleteLink, deleteRouter, updateLink, updateRouter } from '../../src/state/edit'
import { connectedTopology } from '../arbitraries'
import { loadFixture } from '../helpers'

const ex10 = loadFixture('10-lan-levels.yaml')
const row = (t: Topology, s: string, d: string): Protection =>
  computeForSource(t, s).find((x) => x.dest === d)!.protections[0]!

describe('LAN links (D55)', () => {
  it('a LAN is a link per pair: A→B costs A’s metric to the LAN (pseudonode → B is 0)', () => {
    expect(
      lanLinks({
        id: 'L',
        members: [
          { node: 'B', metric: 20 },
          { node: 'A', metric: 10 },
          { node: 'C', metric: 5 },
        ],
      }),
    ).toEqual([
      { id: 'L:A-B', a: 'A', b: 'B', metricAB: 10, metricBA: 20, lan: 'L' },
      { id: 'L:A-C', a: 'A', b: 'C', metricAB: 10, metricBA: 5, lan: 'L' },
      { id: 'L:B-C', a: 'B', b: 'C', metricAB: 20, metricBA: 5, lan: 'L' },
    ])
    expect(lanShared(ex10, 'LAN1:R2-R4', 'R2')).toEqual(['LAN1:R2-R3'])
    expect(lanShared(ex10, 'R2-R3', 'R2')).toEqual([])
  })

  it('R2 → R4: the alternate across the same LAN is skipped (RFC 5286 §3.6)', () => {
    const p = row(ex10, 'R2', 'R4')
    expect(p.explain.map((x) => x.text)).toContain(
      'Via R3 over LAN1:R2-R3: skipped, it is on the same LAN as the protected link, so it fails with R2’s interface to that LAN',
    )
    // Without the LAN (the same links as plain point-to-point ones), the cheaper R3 over
    // the LAN (10 + 10 = 20) would win, and it would go down with R2's interface.
    const flat: Topology = {
      ...ex10,
      links: ex10.links.map((l) => {
        const x = { ...l }
        delete x.lan
        return x
      }),
    }
    delete flat.lans
    expect(row(flat, 'R2', 'R4').lfa).toMatchObject({ best: 'R3', bestLink: 'LAN1:R2-R3' })
  })

  it('TI-LFA avoids R2’s whole LAN interface and says so', () => {
    const p = row(ex10, 'R2', 'R4')
    expect(p.explain.map((x) => x.text)).toContain(
      'Post-convergence path with R2–R4 and R2’s other link on the same LAN (LAN1:R2-R3) removed: R2 → R3 → R4 (cost 25)',
    )
    expect(packetWalk(ex10, 'R2', 'R4', 'R4', { link: 'LAN1:R2-R4' })!.cost).toBe(25)
  })

  it('R2’s LAN interface fails: one repair, over R2–R3 then the LAN', () => {
    for (const mode of ['lfa', 'tilfa'] as const) {
      const f = simulateFailure(ex10, 'R2', ['LAN1:R2-R3', 'LAN1:R2-R4'], mode).flows.find(
        (x) => x.dest === 'R4',
      )!
      expect(f).toMatchObject({ status: 'repaired', repair: ['R2', 'R3', 'R4'], repairCost: 25 })
      expect(f.repairs).toHaveLength(1)
    }
  })

  it('round-trips through YAML as a LAN, with a member’s own metric', () => {
    const back = parseTopology(serializeTopology(ex10))
    expect(back.ok && back.topology).toEqual(ex10)
    expect(serializeTopology(ex10)).toContain(
      'lans:\n  - {id: LAN1, metric: 10, members: [R2, R3, R4]}',
    )
    const own = parseTopology(
      'nodes: [{ id: A, sid: 1 }, { id: B, sid: 2 }]\nlans: [{ id: L, members: [A, { node: B, metric: 7 }] }]\n',
    )
    expect(!own.ok && own.errors).toEqual([
      'LAN #1 (L): A has no metric: give the LAN a "metric" or the member its own.',
    ])
  })

  it('rejects a LAN with one member, an unknown router, or a taken id', () => {
    const errs = (lans: string) => {
      const r = parseTopology(`nodes: [{ id: A, sid: 1 }, { id: B, sid: 2 }]\nlans: ${lans}\n`)
      return r.ok ? [] : r.errors
    }
    expect(errs('[{ id: L, metric: 1, members: [A] }]')).toEqual([
      'LAN #1 (L): "members" must list at least two routers.',
    ])
    expect(errs('[{ id: L, metric: 1, members: [A, Z] }]')).toEqual([
      'LAN #1 (L): member "Z" is not a router in nodes.',
    ])
    expect(errs('[{ id: A, metric: 1, members: [A, B] }]')).toEqual([
      'LAN #1 (A): id "A" is already used by a router or LAN.',
    ])
  })

  it('edits keep the LAN in step', () => {
    // A LAN link's metric is the member's metric to the LAN, for all its neighbors there.
    const m = updateLink(ex10, 'LAN1:R2-R4', { metricAB: 12 })
    expect(m.ok && m.topology.lans![0]!.members).toEqual([
      { node: 'R2', metric: 12 },
      { node: 'R3', metric: 10 },
      { node: 'R4', metric: 10 },
    ])
    expect(m.ok && m.topology.links.find((l) => l.id === 'LAN1:R2-R3')!.metricAB).toBe(12)
    // Rename: the LAN and its links follow.
    const r = updateRouter(ex10, 'R4', { id: 'R9' })
    expect(r.ok && r.topology.links.filter((l) => l.lan).map((l) => l.id)).toEqual([
      'LAN1:R2-R3',
      'LAN1:R2-R9',
      'LAN1:R3-R9',
    ])
    // Delete a member: two are left. Delete a LAN link: the LAN goes.
    expect(deleteRouter(ex10, 'R4').lans![0]!.members.map((x) => x.node)).toEqual(['R2', 'R3'])
    const gone = deleteLink(ex10, 'LAN1:R2-R3')
    expect(gone.lans).toBeUndefined()
    expect(gone.links.some((l) => l.lan)).toBe(false)
  })
})

describe('multi-level IS-IS (D56)', () => {
  it('lists the levels and areas', () => {
    expect(isMultiLevel(ex10)).toBe(true)
    expect(isMultiLevel(loadFixture('02-ring5.yaml'))).toBe(false)
    expect(levelViews(ex10)).toEqual([
      { key: '2', title: 'Level-2', routers: 3 },
      { key: '1:49.0001', title: 'Level-1, area 49.0001', routers: 3 },
      { key: '1:49.0002', title: 'Level-1, area 49.0002', routers: 2 },
    ])
  })

  it('Level-2: the L2-capable routers, L2 links and the LAN', () => {
    const l2 = levelTopology(ex10, '2')
    expect(l2.nodes.map((n) => n.id)).toEqual(['R2', 'R3', 'R4'])
    expect(l2.links.map((l) => l.id)).toEqual([
      'R2-R3',
      'R3-R4',
      'LAN1:R2-R3',
      'LAN1:R2-R4',
      'LAN1:R3-R4',
    ])
    // Same answer as the whole network for R2 → R4: the LAN rule still holds.
    expect(row(l2, 'R2', 'R4').lfa).toMatchObject({ best: 'R3', bestLink: 'R2-R3' })
  })

  it('Level-1 of an area: its L1 routers and links; the LAN keeps the members in the area', () => {
    const a1 = levelTopology(ex10, '1:49.0001')
    expect(a1.nodes.map((n) => n.id)).toEqual(['R1', 'R2', 'R3'])
    expect(a1.links.map((l) => l.id)).toEqual(['R1-R2', 'R1-R3', 'R2-R3', 'LAN1:R2-R3'])
    // R4's L1 adjacency can't form across areas, so area 49.0002 has no LAN.
    const a2 = levelTopology(ex10, '1:49.0002')
    expect(a2.links.map((l) => l.id)).toEqual(['R4-R5'])
    expect(a2.lans).toBeUndefined()
  })

  it('edits in a level view merge back into the whole network', () => {
    const view = levelTopology(ex10, '2')
    const edited = updateLink(view, 'R2-R3', { metricAB: 7, metricBA: 7 })
    if (!edited.ok) throw new Error(edited.error)
    const merged = mergeLevel(ex10, '2', edited.topology)
    expect(merged.links.find((l) => l.id === 'R2-R3')).toMatchObject({ metricAB: 7, metricBA: 7 })
    // Untouched: the Level-1 links and routers outside the view.
    expect(merged.links.filter((l) => l.level === '1').map((l) => l.id)).toEqual([
      'R1-R2',
      'R1-R3',
      'R4-R5',
    ])
    expect(merged.name).toBe(ex10.name)
    expect(mergeLevel(ex10, '2', view)).toEqual(ex10)
    // A LAN member's metric changed in the view.
    const lanEdit = updateLink(view, 'LAN1:R3-R4', { metricBA: 4 })
    if (!lanEdit.ok) throw new Error(lanEdit.error)
    expect(mergeLevel(ex10, '2', lanEdit.topology).lans![0]!.members[2]).toEqual({
      node: 'R4',
      metric: 4,
    })
  })
})

/** Random networks with one LAN of 3 routers (ids R0..R2), metric 1 to 5 each. */
const withLan = connectedTopology().chain((t) =>
  fc.array(fc.integer({ min: 1, max: 5 }), { minLength: 3, maxLength: 3 }).map((ms) =>
    expandLans({
      ...t,
      lans: [{ id: 'LAN', members: ms.map((metric, i) => ({ node: `R${i}`, metric })) }],
    }),
  ),
)

describe('property: protecting a LAN link avoids the whole interface', () => {
  it('no LFA, ECMP member or TI-LFA path uses S’s other links on that LAN', () => {
    fc.assert(
      fc.property(withLan, (t) => {
        for (const s of ['R0', 'R1']) {
          for (const r of computeForSource(t, s, { explain: false })) {
            for (const p of r.protections) {
              const others = new Set(lanShared(t, p.protectedLink.id, s))
              if (others.size === 0) continue
              if (p.lfa.bestLink !== undefined) expect(others.has(p.lfa.bestLink)).toBe(false)
              if (p.tilfa.outLink !== undefined) {
                expect(others.has(p.tilfa.outLink)).toBe(false)
                const w = packetWalk(t, s, r.dest, p.protectedLink.to, {
                  link: p.protectedLink.id,
                })!
                expect(w.hops.at(-1)!.router).toBe(r.dest)
              }
            }
          }
        }
      }),
      { numRuns: 40 },
    )
  })
})

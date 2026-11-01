import { describe, expect, it } from 'vitest'
import type { Topology } from '../../src/engine/types'
import {
  addLink,
  addRouter,
  deleteLink,
  deleteRouter,
  freePosition,
  moveRouter,
  nextRouterId,
  nextSidIndex,
  updateLink,
  updateRouter,
  updateTopology,
  withPositions,
} from '../../src/state/edit'
import { loadFixture } from '../helpers'

const square = () => loadFixture('01-square.yaml')

const ok = (r: ReturnType<typeof addLink>): Topology => {
  if (!r.ok) throw new Error(r.error)
  return r.topology
}

describe('adding and removing routers', () => {
  it('freePosition puts a keyboard-added router right of the others', () => {
    // Square: x 0..250, y 0,0,250,250 → middle height 125.
    expect(freePosition(square())).toEqual({ x: 370, y: 125 })
    expect(freePosition({ ...square(), nodes: [] })).toEqual({ x: 0, y: 0 })
  })

  it('picks the first free R<n> id and SID index', () => {
    const t: Topology = {
      ...square(),
      nodes: [...square().nodes, { id: 'R1', sidIndex: 5 }],
    }
    expect(nextRouterId(t)).toBe('R2')
    expect(nextSidIndex(t)).toBe(6)
    const { topology, id } = addRouter(t, { x: 10.4, y: 20.6 })
    expect(id).toBe('R2')
    expect(topology.nodes.at(-1)).toEqual({ id: 'R2', sidIndex: 6, pos: { x: 10, y: 21 } })
  })

  it('never changes its input (the engine caches by object, D15)', () => {
    const t = square()
    const before = structuredClone(t)
    addRouter(t, { x: 0, y: 0 })
    moveRouter(t, 'S', { x: 5, y: 5 })
    deleteRouter(t, 'E')
    updateRouter(t, 'S', { id: 'X' })
    expect(t).toEqual(before)
  })

  it('deleting a router removes its links', () => {
    const t = deleteRouter(square(), 'E')
    expect(t.nodes.map((n) => n.id)).toEqual(['S', 'N', 'D'])
    expect(t.links.map((l) => l.id)).toEqual(['S-N', 'N-D'])
  })

  it('moves a router to a rounded position', () => {
    expect(moveRouter(square(), 'S', { x: 1.6, y: 2.2 }).nodes[0]?.pos).toEqual({ x: 2, y: 2 })
  })
})

describe('links', () => {
  it('adds a link with the same metric both ways', () => {
    const t = ok(addLink(square(), 'S', 'D', 7))
    expect(t.links.at(-1)).toEqual({ id: 'S-D', a: 'S', b: 'D', metricAB: 7, metricBA: 7 })
  })

  it('refuses self-loops and unknown routers', () => {
    expect(addLink(square(), 'S', 'S')).toMatchObject({ ok: false, error: /itself/ })
    expect(addLink(square(), 'S', 'Z')).toMatchObject({ ok: false })
  })

  it('adds a parallel link with the next free id, in either direction (D29)', () => {
    const once = ok(addLink(square(), 'S', 'E', 20))
    expect(once.links.at(-1)).toEqual({ id: 'S-E#2', a: 'S', b: 'E', metricAB: 20, metricBA: 20 })
    const twice = ok(addLink(once, 'E', 'S'))
    expect(twice.links.at(-1)?.id).toBe('E-S')
    expect(ok(addLink(twice, 'S', 'E')).links.at(-1)?.id).toBe('S-E#3')
  })

  it('renaming a router keeps parallel link ids unique', () => {
    const t = ok(addLink(square(), 'S', 'E', 20))
    const renamed = ok(updateRouter(t, 'S', { id: 'X' }))
    expect(renamed.links.filter((l) => l.a === 'X' && l.b === 'E').map((l) => l.id)).toEqual([
      'X-E',
      'X-E#2',
    ])
  })

  it('deletes a link by id', () => {
    expect(deleteLink(square(), 'S-E').links.map((l) => l.id)).toEqual(['E-D', 'S-N', 'N-D'])
  })

  it('edits metrics and Adj-SIDs with range checks', () => {
    const t = ok(updateLink(square(), 'S-E', { metricBA: 40, adjSidAB: 24100 }))
    expect(t.links[0]).toMatchObject({ metricAB: 10, metricBA: 40, adjSidAB: 24100 })
    expect(ok(updateLink(t, 'S-E', { adjSidAB: null })).links[0]?.adjSidAB).toBeUndefined()
    expect(updateLink(t, 'S-E', { metricAB: 0 })).toMatchObject({
      ok: false,
      error: /1 to 16,777,215/,
    })
    expect(updateLink(t, 'S-E', { metricAB: 2.5 })).toMatchObject({ ok: false })
    expect(updateLink(t, 'S-E', { adjSidBA: 1_048_576 })).toMatchObject({ ok: false })
  })
})

describe('updateRouter', () => {
  it('renames a router and the links that touch it', () => {
    const t = ok(updateRouter(square(), 'E', { id: 'E1' }))
    expect(t.nodes.map((n) => n.id)).toEqual(['S', 'E1', 'N', 'D'])
    expect(t.links.slice(0, 2)).toMatchObject([
      { id: 'S-E1', a: 'S', b: 'E1' },
      { id: 'E1-D', a: 'E1', b: 'D' },
    ])
  })

  it('refuses a used id, a bad id, or a used SID index', () => {
    expect(updateRouter(square(), 'E', { id: 'S' })).toMatchObject({ ok: false, error: /already/ })
    expect(updateRouter(square(), 'E', { id: 'a b' })).toMatchObject({ ok: false })
    expect(updateRouter(square(), 'E', { sidIndex: 1 })).toMatchObject({
      ok: false,
      error: 'SID index 1 is used by S.',
    })
  })

  it('sets and clears the display name', () => {
    const named = ok(updateRouter(square(), 'S', { name: ' Core-1 ' }))
    expect(named.nodes[0]?.name).toBe('Core-1')
    expect(ok(updateRouter(named, 'S', { name: '' })).nodes[0]).not.toHaveProperty('name')
  })
})

describe('updateTopology', () => {
  it('checks the SRGB base range', () => {
    expect(ok(updateTopology(square(), { srgbBase: 20000 })).srgbBase).toBe(20000)
    expect(updateTopology(square(), { srgbBase: -1 })).toMatchObject({ ok: false })
  })

  it('sets and clears the max SID depth, 2 to 255 (D44)', () => {
    const t = ok(updateTopology(square(), { msd: 3 }))
    expect(t.msd).toBe(3)
    expect(ok(updateTopology(t, { msd: null }))).not.toHaveProperty('msd')
    for (const bad of [1, 256, 2.5])
      expect(updateTopology(square(), { msd: bad })).toMatchObject({ ok: false })
  })
})

describe('updateRouter: max SID depth', () => {
  it("sets a router's own MSD and clears it back to the network's (D44)", () => {
    const t = ok(updateRouter(square(), 'S', { msd: 2 }))
    expect(t.nodes.find((n) => n.id === 'S')!.msd).toBe(2)
    const cleared = ok(updateRouter(t, 'S', { msd: null }))
    expect(cleared.nodes.find((n) => n.id === 'S')).not.toHaveProperty('msd')
    expect(updateRouter(square(), 'S', { msd: 0 })).toMatchObject({ ok: false })
  })
})

describe('LFA policy edits (D45)', () => {
  it('stores only what differs from "prefer"', () => {
    const t = ok(updateTopology(square(), { lfaPolicy: { nodeProtecting: 'require' } }))
    expect(t.lfaPolicy).toEqual({ nodeProtecting: 'require' })
    const both = ok(updateTopology(t, { lfaPolicy: { downstream: 'ignore' } }))
    expect(both.lfaPolicy).toEqual({ nodeProtecting: 'require', downstream: 'ignore' })
    const back = ok(
      updateTopology(both, { lfaPolicy: { nodeProtecting: 'prefer', downstream: 'prefer' } }),
    )
    expect(back).not.toHaveProperty('lfaPolicy')
  })

  it("sets a router's exclude list: sorted, no duplicates, empty clears it", () => {
    const t = ok(updateRouter(square(), 'S', { lfaExclude: ['N', ' E ', 'N', ''] }))
    expect(t.nodes.find((n) => n.id === 'S')!.lfaExclude).toEqual(['E', 'N'])
    const cleared = ok(updateRouter(t, 'S', { lfaExclude: [''] }))
    expect(cleared.nodes.find((n) => n.id === 'S')).not.toHaveProperty('lfaExclude')
  })

  it('rejects unknown routers and the router itself', () => {
    expect(updateRouter(square(), 'S', { lfaExclude: ['X'] })).toEqual({
      ok: false,
      error: 'No router called X.',
    })
    expect(updateRouter(square(), 'S', { lfaExclude: ['S'] })).toMatchObject({ ok: false })
  })

  it("renaming or deleting a router updates the other routers' lists", () => {
    const t = ok(updateRouter(square(), 'S', { lfaExclude: ['N', 'E'] }))
    const renamed = ok(updateRouter(t, 'N', { id: 'Z' }))
    expect(renamed.nodes.find((n) => n.id === 'S')!.lfaExclude).toEqual(['E', 'Z'])
    const gone = deleteRouter(deleteRouter(renamed, 'Z'), 'E')
    expect(gone.nodes.find((n) => n.id === 'S')).not.toHaveProperty('lfaExclude')
  })
})

describe('withPositions', () => {
  it('places routers without a position on a circle and keeps the others', () => {
    const t: Topology = {
      name: 't',
      srgbBase: 16000,
      nodes: [
        { id: 'A', sidIndex: 1 },
        { id: 'B', sidIndex: 2, pos: { x: 1, y: 2 } },
        { id: 'C', sidIndex: 3 },
      ],
      links: [],
    }
    const out = withPositions(t)
    expect(out.nodes[1]?.pos).toEqual({ x: 1, y: 2 })
    expect(out.nodes.every((n) => n.pos !== undefined)).toBe(true)
    expect(out.nodes[0]?.pos).not.toEqual(out.nodes[2]?.pos)
    expect(withPositions(out)).toBe(out)
  })
})

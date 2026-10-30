import { describe, expect, it } from 'vitest'
import type { Topology } from '../../src/engine/types'
import {
  addLink,
  addRouter,
  deleteLink,
  deleteRouter,
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

  it('refuses self-loops and parallel links in either direction (D4)', () => {
    expect(addLink(square(), 'S', 'S')).toMatchObject({ ok: false, error: /itself/ })
    expect(addLink(square(), 'E', 'S')).toMatchObject({ ok: false, error: /already linked/ })
    expect(addLink(square(), 'S', 'Z')).toMatchObject({ ok: false })
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

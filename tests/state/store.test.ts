import { beforeEach, describe, expect, it } from 'vitest'
import { initialState, useStore } from '../../src/state/store'
import { EXAMPLES, exampleTopology } from '../../src/state/examples'

const s = () => useStore.getState()

beforeEach(() => useStore.setState(initialState, true))

describe('store', () => {
  it('starts on the ring example with source S', () => {
    expect(s().topology.name).toBe('Five-node ring - RLFA works')
    expect(s().source).toBe('S')
    expect(s().past).toEqual([])
  })

  it('every built-in example loads and has its documented source', () => {
    for (const ex of EXAMPLES) {
      const t = exampleTopology(ex)
      expect(t.nodes.map((n) => n.id)).toContain(ex.source)
      s().loadExample(ex.key)
      expect(s().source).toBe(ex.source)
      expect(s().topology.nodes.every((n) => n.pos !== undefined)).toBe(true)
    }
  })

  it('undo and redo walk through edits', () => {
    const t0 = s().topology
    s().addRouter({ x: 1, y: 1 })
    const t1 = s().topology
    expect(t1.nodes).toHaveLength(6)
    expect(s().selection).toEqual({ kind: 'node', id: 'R1' })
    s().undo()
    expect(s().topology).toBe(t0)
    s().redo()
    expect(s().topology).toBe(t1)
    s().redo() // nothing left: no change
    expect(s().topology).toBe(t1)
  })

  it('a new edit clears the redo stack', () => {
    s().addRouter({ x: 1, y: 1 })
    s().undo()
    expect(s().future).toHaveLength(1)
    s().addRouter({ x: 2, y: 2 })
    expect(s().future).toEqual([])
  })

  it('loading an example can be undone', () => {
    const before = s().topology
    s().loadExample('square')
    expect(s().topology.name).toBe('Square - LFA works')
    s().undo()
    expect(s().topology).toBe(before)
  })

  it('add-link tool: two clicks make a link, a bad link shows a notice', () => {
    s().linkClick('S')
    expect(s().linkStart).toBe('S')
    s().linkClick('B')
    expect(s().topology.links.at(-1)).toMatchObject({ a: 'S', b: 'B', metricAB: 10 })
    expect(s().selection).toEqual({ kind: 'link', id: 'S-B' })
    s().linkClick('S')
    s().linkClick('E')
    expect(s().notice).toMatchObject({ kind: 'error', lines: ['S and E are already linked.'] })
    expect(s().linkStart).toBeNull()
  })

  it('deleting the source router picks another source and drops stale state', () => {
    s().selectRow({ dest: 'E', via: 'E' })
    s().failLink('S-E')
    s().select({ kind: 'node', id: 'S' })
    s().deleteSelection()
    expect(s().source).toBe('E') // first router in the file
    expect(s().row).toBeNull()
    expect(s().failedLink).toBeNull()
    expect(s().selection).toBeNull()
  })

  it('fails one link at a time; failing it again restores it', () => {
    s().failLink('S-E')
    s().setConverged(true)
    s().setSimDest('E')
    expect(s()).toMatchObject({ failedLink: 'S-E', converged: true, simDest: 'E' })
    // Another link moves the failure and starts again from the repair view.
    s().failLink('A-S')
    expect(s()).toMatchObject({ failedLink: 'A-S', converged: false, simDest: null })
    s().failLink('A-S')
    expect(s().failedLink).toBeNull()
  })

  it('changing the repair mode goes back to the repair view', () => {
    s().failLink('S-E')
    s().setConverged(true)
    s().setSimMode('lfa')
    expect(s()).toMatchObject({ simMode: 'lfa', converged: false })
  })

  it('loading a topology clears the failure', () => {
    s().failLink('S-E')
    s().loadExample('square')
    expect(s().failedLink).toBeNull()
  })

  it('adds a link between two routers from the keyboard form', () => {
    expect(s().addLinkBetween('S', 'B')).toBeNull()
    expect(s().selection).toEqual({ kind: 'link', id: 'S-B' })
    expect(s().addLinkBetween('S', 'B')).toBe('S and B are already linked.')
  })

  it('renaming the source router keeps it as the source', () => {
    s().select({ kind: 'node', id: 'S' })
    expect(s().updateRouter('S', { id: 'S1' })).toBeNull()
    expect(s().source).toBe('S1')
    expect(s().selection).toEqual({ kind: 'node', id: 'S1' })
    expect(s().updateRouter('S1', { sidIndex: 2 })).toBe('SID index 2 is used by E.')
  })

  it('moving a router to the same place adds no history', () => {
    s().moveRouter('S', { x: 0.2, y: 100.4 })
    expect(s().past).toEqual([])
    s().moveRouter('S', { x: 50, y: 50 })
    expect(s().past).toHaveLength(1)
  })

  it('keeps at most 100 undo steps', () => {
    for (let i = 0; i < 120; i++) s().moveRouter('S', { x: i + 1, y: 0 })
    expect(s().past).toHaveLength(100)
  })
})

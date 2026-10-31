// @vitest-environment jsdom
// Phase 9.5: the canvas's right-click menu and in-place metric editor. They are
// plain React, so they are tested here; Cytoscape itself needs a real <canvas>.
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { initialState, useStore } from '../../src/state/store'
import { CanvasMenu } from '../../src/ui/CanvasMenu'
import { MetricEditor } from '../../src/ui/MetricEditor'

const s = () => useStore.getState()

beforeEach(() => useStore.setState(initialState, true))
afterEach(cleanup)

describe('CanvasMenu', () => {
  it('router: set as source (DUT), fail / restore, delete; each closes the menu', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    const menu = (id: string) =>
      render(
        <CanvasMenu
          target={{ kind: 'node', id }}
          x={0}
          y={0}
          onClose={onClose}
          onEditMetric={vi.fn()}
        />,
      )

    const { unmount } = menu('C')
    expect(screen.getByRole('menu', { name: 'Router C' })).toBeTruthy()
    // The first item has focus, so the keyboard works at once; ↓ moves on.
    expect(document.activeElement?.textContent).toBe('◎ Set C as source (DUT)')
    await user.keyboard('{ArrowDown}')
    expect(document.activeElement?.textContent).toBe('✕ Fail router C')
    await user.click(screen.getByRole('menuitem', { name: '◎ Set C as source (DUT)' }))
    expect(s().source).toBe('C')
    expect(onClose).toHaveBeenCalledTimes(1)
    unmount()

    menu('C')
    expect(
      (screen.getByRole('menuitem', { name: '◎ C is the source (DUT)' }) as HTMLButtonElement)
        .disabled,
    ).toBe(true)
    await user.click(screen.getByRole('menuitem', { name: '✕ Fail router C' }))
    expect(s().failedNodes).toEqual(['C'])
    cleanup()
    menu('C')
    await user.click(screen.getByRole('menuitem', { name: '↺ Restore router C' }))
    expect(s().failedNodes).toEqual([])
    cleanup()
    menu('B')
    await user.click(screen.getByRole('menuitem', { name: '🗑 Delete router B' }))
    expect(s().topology.nodes.map((n) => n.id)).not.toContain('B')
  })

  it('link: fail / restore, edit metric, delete', async () => {
    const user = userEvent.setup()
    const onEdit = vi.fn()
    const menu = () =>
      render(
        <CanvasMenu
          target={{ kind: 'link', id: 'S-E' }}
          x={0}
          y={0}
          onClose={vi.fn()}
          onEditMetric={onEdit}
        />,
      )
    menu()
    expect(screen.getByRole('menu', { name: 'Link S–E' })).toBeTruthy()
    await user.click(screen.getByRole('menuitem', { name: '✕ Fail link S–E' }))
    expect(s().failedLinks).toEqual(['S-E'])
    cleanup()
    menu()
    await user.click(screen.getByRole('menuitem', { name: '✎ Edit metric…' }))
    expect(onEdit).toHaveBeenCalledWith('S-E')
    await user.click(screen.getByRole('menuitem', { name: '↺ Restore link S–E' }))
    expect(s().failedLinks).toEqual([])
    cleanup()
    menu()
    await user.click(screen.getByRole('menuitem', { name: '🗑 Delete link S–E' }))
    expect(s().topology.links.map((l) => l.id)).not.toContain('S-E')
  })

  it('a link of a down router can’t be failed on its own (it is down already)', () => {
    s().toggleFailedNode('E')
    render(
      <CanvasMenu
        target={{ kind: 'link', id: 'S-E' }}
        x={0}
        y={0}
        onClose={vi.fn()}
        onEditMetric={vi.fn()}
      />,
    )
    const fail = screen.getByRole('menuitem', { name: '✕ Fail link S–E' }) as HTMLButtonElement
    expect(fail.disabled).toBe(true)
    expect(document.activeElement?.textContent).toBe('✎ Edit metric…')
  })
})

describe('MetricEditor', () => {
  it('same metric both ways: one box; Enter saves both directions as one undo step', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    render(<MetricEditor link="S-E" x={0} y={0} onClose={onClose} />)
    const box = screen.getByLabelText('Metric (both ways)')
    expect(document.activeElement).toBe(box)
    await user.clear(box)
    await user.type(box, '7{Enter}')
    expect(s().topology.links.find((l) => l.id === 'S-E')).toMatchObject({
      metricAB: 7,
      metricBA: 7,
    })
    expect(s().past).toHaveLength(1)
    expect(onClose).toHaveBeenCalled()
  })

  it('a bad value shows the reason and keeps the old metric', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    render(<MetricEditor link="S-E" x={0} y={0} onClose={onClose} />)
    const box = screen.getByLabelText('Metric (both ways)')
    await user.clear(box)
    await user.type(box, '0{Enter}')
    expect(screen.getByRole('alert').textContent).toContain('Metric must be a whole number')
    expect(s().topology).toBe(initialState.topology)
    expect(onClose).not.toHaveBeenCalled()
    await user.keyboard('{Escape}')
    expect(onClose).toHaveBeenCalled()
  })

  it('different metrics: one box per direction', async () => {
    const user = userEvent.setup()
    s().updateLink('S-E', { metricBA: 5 })
    render(<MetricEditor link="S-E" x={0} y={0} onClose={vi.fn()} />)
    const ba = screen.getByLabelText('E→S')
    await user.clear(ba)
    await user.type(ba, '9')
    await user.click(screen.getByRole('button', { name: 'Save' }))
    expect(s().topology.links.find((l) => l.id === 'S-E')).toMatchObject({
      metricAB: 1,
      metricBA: 9,
    })
  })
})

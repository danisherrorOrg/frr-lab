// @vitest-environment jsdom
// Hide / show and resize the tools panel and the results panel.
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { App } from '../../src/App'
import { initialState, useStore } from '../../src/state/store'
import {
  autoResultsHeight,
  clampResults,
  clampSidebar,
  DEFAULT_PANELS,
  parsePanels,
  RESULTS_MIN,
  SIDEBAR_MIN,
  usePanels,
} from '../../src/ui/panels'

// jsdom has no <canvas>; the diagram itself isn't part of these tests.
vi.mock('../../src/ui/GraphCanvas', () => ({ GraphCanvas: () => null }))

beforeEach(() => {
  useStore.setState(initialState, true)
  usePanels.getState().reset()
})
afterEach(cleanup)

describe('panel sizes', () => {
  it('keep the sidebar between its minimum and what leaves the diagram room', () => {
    expect(clampSidebar(50, 1400)).toBe(SIDEBAR_MIN)
    expect(clampSidebar(300, 1400)).toBe(300)
    expect(clampSidebar(5000, 1400)).toBe(560)
    // A 700 px window leaves 320 px for the diagram.
    expect(clampSidebar(5000, 700)).toBe(380)
    // A window too small for both still gets the minimum, never less.
    expect(clampSidebar(300, 400)).toBe(SIDEBAR_MIN)
  })

  it('keep the results panel between its minimum and what leaves the diagram room', () => {
    expect(clampResults(10, 900)).toBe(RESULTS_MIN)
    expect(clampResults(340, 900)).toBe(340)
    // 900 px tall: 200 for the top bar and legend, 200 for the diagram, 500 left.
    expect(clampResults(5000, 900)).toBe(500)
    expect(clampResults(300, 300)).toBe(RESULTS_MIN)
  })

  it('read saved panels field by field, and fall back to the defaults', () => {
    expect(parsePanels(null)).toEqual(DEFAULT_PANELS)
    expect(parsePanels('not json')).toEqual(DEFAULT_PANELS)
    expect(parsePanels('[1,2]')).toEqual(DEFAULT_PANELS)
    expect(parsePanels('{"sidebarOpen":false,"sidebarWidth":"wide","resultsHeight":400}')).toEqual({
      ...DEFAULT_PANELS,
      sidebarOpen: false,
      resultsHeight: 400,
    })
    expect(parsePanels('{"resultsHeight":null}').resultsHeight).toBeNull()
    expect(autoResultsHeight(820)).toBe(287)
  })
})

describe('hide and show panels', () => {
  it('hides and shows the tools panel and the results panel from the top bar', async () => {
    const user = userEvent.setup()
    render(<App />)
    expect(screen.getByRole('complementary', { name: 'Tools and settings' })).toBeTruthy()
    expect(screen.getByRole('main', { name: 'Results' })).toBeTruthy()

    await user.click(screen.getByRole('button', { name: 'Hide tools' }))
    expect(screen.queryByRole('complementary', { name: 'Tools and settings' })).toBeNull()
    expect(screen.queryByRole('separator', { name: 'Tools panel width' })).toBeNull()

    await user.click(screen.getByRole('button', { name: 'Hide results' }))
    expect(screen.queryByRole('main', { name: 'Results' })).toBeNull()

    await user.click(screen.getByRole('button', { name: 'Show tools' }))
    await user.click(screen.getByRole('button', { name: 'Show results' }))
    expect(screen.getByRole('complementary', { name: 'Tools and settings' })).toBeTruthy()
    expect(screen.getByRole('main', { name: 'Results' })).toBeTruthy()
  })

  it('remembers the choice in this browser', async () => {
    const user = userEvent.setup()
    render(<App />)
    await user.click(screen.getByRole('button', { name: 'Hide results' }))
    expect(parsePanels(localStorage.getItem('lfa-lab-panels')).resultsOpen).toBe(false)
  })
})

describe('resize panels', () => {
  it('resizes the tools panel with the arrow keys and resets it on double-click', () => {
    render(<App />)
    const bar = screen.getByRole('separator', { name: 'Tools panel width' })
    fireEvent.keyDown(bar, { key: 'ArrowRight' })
    expect(usePanels.getState().sidebarWidth).toBe(DEFAULT_PANELS.sidebarWidth + 16)
    fireEvent.keyDown(bar, { key: 'Home' })
    expect(usePanels.getState().sidebarWidth).toBe(SIDEBAR_MIN)
    fireEvent.doubleClick(bar)
    expect(usePanels.getState().sidebarWidth).toBe(DEFAULT_PANELS.sidebarWidth)
  })

  it('starts the results panel at about a third of the window, and grows it when its bar moves up', () => {
    render(<App />)
    const bar = screen.getByRole('separator', { name: 'Results panel height' })
    const start = autoResultsHeight(window.innerHeight)
    expect(Number(bar.getAttribute('aria-valuenow'))).toBe(start)
    fireEvent.keyDown(bar, { key: 'ArrowUp' })
    expect(usePanels.getState().resultsHeight).toBe(start + 16)
    fireEvent.keyDown(bar, { key: 'ArrowDown' })
    fireEvent.keyDown(bar, { key: 'ArrowDown' })
    expect(usePanels.getState().resultsHeight).toBe(start - 16)
    // Double-click: back to the share of the window, which follows later window sizes.
    fireEvent.doubleClick(bar)
    expect(usePanels.getState().resultsHeight).toBeNull()
  })
})

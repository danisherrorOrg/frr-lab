// @vitest-environment jsdom
// Bug: fail a router, restore it, and the "back up" notice opens above the diagram.
// Cytoscape remembers where its box was and only looks again when the box changes
// size, so clicks landed one notice-height off and the router couldn't be failed
// again until the notice was closed. The canvas must re-measure when the notice
// changes and before each click. jsdom has no <canvas>, so Cytoscape is faked here.
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { initialState, useStore } from '../../src/state/store'
import { GraphCanvas } from '../../src/ui/GraphCanvas'
import { NoticeBox } from '../../src/ui/NoticeBox'

const cy = vi.hoisted(() => ({
  resize: vi.fn(),
  on: vi.fn(),
  autounselectify: vi.fn(),
  fit: vi.fn(),
  destroy: vi.fn(),
}))
vi.mock('cytoscape', () => ({ default: () => cy }))
vi.mock('../../src/ui/canvas', () => ({
  STYLE: [],
  sync: vi.fn(),
  decorate: vi.fn(),
  stepFlow: vi.fn(),
}))

const s = () => useStore.getState()
const noHighlight = { source: null }

beforeEach(() => {
  useStore.setState(initialState, true)
  cy.resize.mockClear()
})
afterEach(cleanup)

describe('GraphCanvas re-measures its box', () => {
  it('when a router comes back and its notice opens, and before every click', () => {
    render(
      <>
        <NoticeBox />
        <GraphCanvas highlight={noHighlight} />
      </>,
    )
    act(() => s().toggleFailedNode('C'))
    cy.resize.mockClear()

    act(() => s().toggleFailedNode('C'))
    expect(screen.getByText('Router C is back up')).toBeTruthy()
    expect(cy.resize).toHaveBeenCalled()

    // Something else may have moved the box: a click re-measures first.
    cy.resize.mockClear()
    fireEvent.pointerDown(screen.getByRole('img', { name: /Network diagram/ }))
    expect(cy.resize).toHaveBeenCalledTimes(1)

    // Closing the notice moves the box back up.
    cy.resize.mockClear()
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }))
    expect(cy.resize).toHaveBeenCalled()
  })
})

// @vitest-environment jsdom
import { act, cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { App } from '../../src/App'
import { EXAMPLES, exampleTopology } from '../../src/state/examples'
import { initialState, useStore } from '../../src/state/store'

// jsdom has no <canvas>; the diagram isn't needed here.
vi.mock('../../src/ui/GraphCanvas', () => ({ GraphCanvas: () => null }))

beforeEach(() => {
  useStore.setState(initialState, true)
  // Seen the tour already, so it doesn't open over the guide.
  localStorage.setItem('lfa-lab-tour-seen', '1')
})
afterEach(() => {
  cleanup()
  localStorage.clear()
  window.history.replaceState(null, '', '/')
})

const guide = () => screen.getByRole('complementary', { name: 'Learn guide' })

describe('Learn guide', () => {
  it('opens from the top bar at the start, and turns pages', async () => {
    const user = userEvent.setup()
    render(<App />)
    act(() => useStore.getState().setTour(null))
    await user.click(screen.getByRole('button', { name: '📖 Learn' }))
    expect(within(guide()).getByRole('heading', { level: 2, name: 'Start here' })).toBeTruthy()
    // Its diagrams are drawn in the browser, from the engine.
    const img = within(guide()).getAllByRole('img')[0] as HTMLImageElement
    expect(img.src).toMatch(/^data:image\/svg\+xml/)

    await user.click(within(guide()).getByRole('button', { name: /Next/ }))
    expect(within(guide()).getByRole('heading', { name: '1 · IS-IS in 10 minutes' })).toBeTruthy()

    // A chapter link in the text.
    await user.click(within(guide()).getAllByRole('button', { name: /2 Shortest paths/ })[0]!)
    expect(useStore.getState().learn.slug).toBe('02-shortest-paths')

    // Esc closes it; the button opens it again at the same chapter.
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('complementary', { name: 'Learn guide' })).toBeNull()
    await user.click(screen.getByRole('button', { name: '📖 Learn' }))
    expect(within(guide()).getByRole('heading', { name: '2 · Shortest paths (SPF)' })).toBeTruthy()
  })

  it('"Try it" loads the example, opens the row and fails the link', async () => {
    const user = userEvent.setup()
    useStore.getState().loadExample('square')
    render(<App />)
    act(() => {
      useStore.getState().setTour(null)
      useStore.getState().setLearn(true, '09-router-and-multiple-failures')
    })
    const btn = await within(guide()).findByRole('button', {
      name: /Open Example 6 with router E down/,
    })
    await user.click(btn)
    const s = useStore.getState()
    expect(s.topology.name).toBe(
      exampleTopology(EXAMPLES.find((e) => e.key === 'link-protecting')!).name,
    )
    expect(s.source).toBe('S')
    expect(s.row).toMatchObject({ dest: 'D', via: 'E' })
    expect(s.failedNodes).toEqual(['E'])
    expect(s.simMode).toBe('lfa')
    // The guide stays open beside the diagram.
    expect(guide()).toBeTruthy()
  })
})

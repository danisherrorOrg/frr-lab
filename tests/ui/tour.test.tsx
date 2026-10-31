// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { App } from '../../src/App'
import { shareHash } from '../../src/io/share-url'
import { EXAMPLES, exampleTopology } from '../../src/state/examples'
import { initialState, useStore } from '../../src/state/store'
import { tourFacts } from '../../src/ui/tour-steps'

// jsdom has no <canvas>; the diagram isn't needed here.
vi.mock('../../src/ui/GraphCanvas', () => ({ GraphCanvas: () => null }))

beforeEach(() => {
  useStore.setState(initialState, true)
  localStorage.clear()
})
afterEach(() => {
  cleanup()
  window.history.replaceState(null, '', '/')
})

const tour = () => screen.getByRole('dialog', { name: 'Guided tour' })
const click = (user: ReturnType<typeof userEvent.setup>, name: string) =>
  user.click(within(tour()).getByRole('button', { name }))

describe('tourFacts', () => {
  // docs/02-algorithms.md §6 Example 2: TI-LFA [Prefix B, Prefix E] -> 16004, 16002.
  it('reads Example 2: no LFA, TI-LFA path S A B C E with labels 16004, 16002', () => {
    const f = tourFacts(exampleTopology(EXAMPLES[1]!))!
    expect(f.hasLfa).toBe(false)
    expect(f.cost).toBe(1)
    expect(f.neighbor).toEqual({ id: 'A', toD: 2, viaS: 2 })
    expect(f.path).toEqual(['S', 'A', 'B', 'C', 'E'])
    expect(f.labels).toEqual([16004, 16002])
  })
})

describe('Guided tour', () => {
  it('is offered on the first visit and walks through Example 2, S–E down, the TI-LFA stack', async () => {
    const user = userEvent.setup()
    // Start somewhere else, so the tour has to load Example 2 itself.
    useStore.getState().loadExample('square')
    render(<App />)
    expect(tour().textContent).toContain('Welcome to LFA Lab')

    await click(user, 'Start tour')
    const s = () => useStore.getState()
    expect(s().topology.name).toBe(exampleTopology(EXAMPLES[1]!).name)
    expect(s().row).toMatchObject({ dest: 'E', via: 'E' })
    expect(s().failedLinks).toEqual([])
    expect(tour().textContent).toContain('dist(A,E)=2 < dist(A,S)+dist(S,E)=2 ✗')

    await click(user, 'Next')
    expect(s().failedLinks).toEqual([s().row!.link])
    expect(s().simMode).toBe('tilfa')
    expect(tour().textContent).toContain('S → A → B → C → E')
    expect(screen.getByRole('region', { name: 'Failure simulation' })).toBeTruthy()

    await click(user, 'Next')
    const text = tour().textContent
    expect(text).toContain('16004, 16002')
    expect(text).toContain(
      '16004 = Prefix-SID of B (SRGB 16000 + index 4): shortest path, S → A → B',
    )
    expect(text).toContain(
      '16002 = Prefix-SID of E (SRGB 16000 + index 2): shortest path, B → C → E',
    )
    // The same stack is in the details panel.
    expect(screen.getByRole('region', { name: 'Details' }).textContent).toContain('16004, 16002')

    // Back restores the link; Next fails it again.
    await click(user, 'Back')
    await click(user, 'Back')
    expect(s().failedLinks).toEqual([])
    await click(user, 'Next')
    await click(user, 'Next')
    await click(user, 'Next')
    expect(tour().textContent).toContain('Your turn')
    await click(user, 'Finish')
    expect(screen.queryByRole('dialog', { name: 'Guided tour' })).toBeNull()
  })

  it('is not offered again once seen, and the Tour button opens it', async () => {
    const user = userEvent.setup()
    render(<App />)
    await click(user, 'No thanks')
    cleanup()

    render(<App />)
    expect(screen.queryByRole('dialog', { name: 'Guided tour' })).toBeNull()
    await user.click(screen.getByRole('button', { name: /Tour/ }))
    expect(tour().textContent).toContain('Welcome to LFA Lab')
  })

  it('is not offered when the page opens from a share link', () => {
    const t = exampleTopology(EXAMPLES[0]!)
    window.history.replaceState(null, '', shareHash(t, 'S'))
    render(<App />)
    expect(screen.queryByRole('dialog', { name: 'Guided tour' })).toBeNull()
  })
})

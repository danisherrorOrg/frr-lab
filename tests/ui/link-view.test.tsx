// @vitest-environment jsdom
// Per-link view (TODO backlog, docs/02-algorithms.md §11).
import { act, cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { App } from '../../src/App'
import { initialState, useStore } from '../../src/state/store'

// jsdom has no <canvas>; the diagram is tested headless in canvas.test.ts.
vi.mock('../../src/ui/GraphCanvas', () => ({ GraphCanvas: () => null }))

beforeEach(() => useStore.setState(initialState, true))
afterEach(cleanup)

const view = () => screen.getByRole('region', { name: 'Per-link view' })
const pickLink = () => within(view()).getByLabelText('Link') as HTMLSelectElement

async function openRing(user: ReturnType<typeof userEvent.setup>) {
  render(<App />)
  await user.selectOptions(screen.getByLabelText('Load an example'), 'ring5')
  await user.click(screen.getByRole('button', { name: 'Per-link view' }))
}

describe('Per-link view', () => {
  it('Example 2, link S–E: both directions, the traffic and how each is repaired', async () => {
    const user = userEvent.setup()
    await openRing(user)
    expect(within(view()).getByText(/Pick a link here/)).toBeTruthy()

    await user.selectOptions(pickLink(), 'S-E')
    const out = await within(view()).findByRole('table', { name: /over S→E/ })
    const rows = within(out).getAllByRole('row').slice(1)
    expect(rows.map((r) => [...r.querySelectorAll('td')].map((td) => td.textContent))).toEqual([
      ['C', '2', 'S', '✓ LFA', 'LFA A (node-protecting)'],
      ['E', '1', 'A, S', '✓ Remote LFA', 'Remote LFA: tunnel to PQ node B'],
    ])
    expect(within(view()).getByRole('table', { name: /over E→S/ })).toBeTruthy()
    expect(within(view()).getByText(/carries 6 flows/)).toBeTruthy()

    // A row opens in the results, with its router as the DUT.
    await user.click(rows[1]!)
    expect(useStore.getState()).toMatchObject({
      source: 'S',
      row: { dest: 'E', via: 'E', link: 'S-E' },
    })
    expect(rows[1]!.getAttribute('aria-selected')).toBe('true')
  })

  it('a row of the other direction makes that router the DUT', async () => {
    const user = userEvent.setup()
    await openRing(user)
    await user.selectOptions(pickLink(), 'S-E')
    const back = await within(view()).findByRole('table', { name: /over E→S/ })
    const s = within(back)
      .getAllByRole('row')
      .find((r) => r.querySelector('td')?.textContent === 'S')!
    await user.click(s)
    expect(useStore.getState()).toMatchObject({ source: 'E', row: { dest: 'S', link: 'S-E' } })
    expect(await screen.findByRole('table', { name: 'Results for E' })).toBeTruthy()
  })

  it('follows a link clicked on the diagram, and forgets a deleted link', async () => {
    const user = userEvent.setup()
    await openRing(user)
    act(() => useStore.getState().select({ kind: 'link', id: 'C-B' }))
    expect(pickLink().value).toBe('C-B')
    act(() => useStore.getState().deleteSelection())
    expect(pickLink().value).toBe('')
    expect(within(view()).getByText(/Pick a link here/)).toBeTruthy()
  })

  it('opens from the link’s properties, and warns that it shows the plan while links are down', async () => {
    const user = userEvent.setup()
    render(<App />)
    await user.selectOptions(screen.getByLabelText('Load an example'), 'ring5')
    act(() => useStore.getState().select({ kind: 'link', id: 'S-E' }))
    await user.click(screen.getByRole('button', { name: 'What uses this link?' }))
    expect(pickLink().value).toBe('S-E')
    act(() => useStore.getState().toggleFailedLink('E-C'))
    expect(await within(view()).findByText(/planned for this link failing alone/)).toBeTruthy()
    await user.click(within(view()).getByRole('button', { name: 'Hide' }))
    expect(useStore.getState().linkView).toBeNull()
  })

  it('a link on no shortest path needs no repair (Example 4, P1–P2)', async () => {
    const user = userEvent.setup()
    render(<App />)
    await user.selectOptions(screen.getByLabelText('Load an example'), 'isp-core')
    act(() => useStore.getState().openLinkView('P1-P2'))
    expect(await within(view()).findByText(/is on no shortest path/)).toBeTruthy()
    expect(within(view()).getAllByText(/nothing needs a repair this way/)).toHaveLength(2)
  })
})

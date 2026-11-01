// @vitest-environment jsdom
// Weakest spots and the overload bit (TODO backlog, docs/02-algorithms.md §16, §17).
import { act, cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { App } from '../../src/App'
import { initialState, useStore } from '../../src/state/store'

// jsdom has no <canvas>; the diagram is tested headless in canvas.test.ts.
vi.mock('../../src/ui/GraphCanvas', () => ({ GraphCanvas: () => null }))

beforeEach(() => useStore.setState(initialState, true))
afterEach(cleanup)

const region = (name: string) => within(screen.getByRole('region', { name }))

describe('Weakest spots', () => {
  it('Example 3, LFA only: link A–S first; "Fail it" fails just that link in that mode', async () => {
    const user = userEvent.setup()
    render(<App />)
    await user.selectOptions(screen.getByLabelText('Load an example'), 'ring5-high')
    act(() => useStore.getState().toggleFailedNode('B'))
    await user.click(screen.getByRole('button', { name: 'Weakest spots' }))
    const panel = () => region('Weakest spots')
    await user.selectOptions(panel().getByLabelText('Repair mode'), 'lfa')
    const status = await panel().findByRole('status', { name: 'Weakest spot' })
    expect(status.textContent).toContain('Link A–S')
    expect(status.textContent).toContain('12 of 12 (100%)')
    expect(
      panel().getByRole('row', { name: 'Link A–S: 12 of 12 (100%) flows unprotected' }),
    ).toBeTruthy()
    expect(
      panel().getByRole('row', { name: 'Router S: 8 of 8 (100%) flows unprotected' }),
    ).toBeTruthy()
    // Something is down already: the ranking says it is about each failure alone.
    expect(panel().getByText(/what is down now is not included/)).toBeTruthy()

    await user.click(panel().getByRole('button', { name: 'Fail link a–s' }))
    const s = useStore.getState()
    expect([s.failedLinks, s.failedNodes, s.simMode]).toEqual([['A-S'], [], 'lfa'])
  })

  it('TI-LFA: says when no single failure leaves traffic unprotected; filters routers', async () => {
    const user = userEvent.setup()
    render(<App />)
    await user.selectOptions(screen.getByLabelText('Load an example'), 'ring5-high')
    await user.click(screen.getByRole('button', { name: 'Weakest spots' }))
    const panel = () => region('Weakest spots')
    const status = await panel().findByRole('status', { name: 'Weakest spot' })
    expect(status.textContent).toMatch(
      /no single link or router failure leaves traffic unprotected/,
    )
    await user.selectOptions(panel().getByLabelText('Show'), 'node')
    const rows = panel().getAllByRole('row').slice(1)
    expect(rows.every((r) => r.getAttribute('aria-label')?.startsWith('Router '))).toBe(true)
    await user.click(panel().getByRole('button', { name: 'Fail router s' }))
    expect(useStore.getState().failedNodes).toEqual(['S'])
  })
})

describe('Overload bit', () => {
  it('the router panel sets it as one undo step, and the what-if shows the coverage change', async () => {
    const user = userEvent.setup()
    render(<App />)
    await user.selectOptions(screen.getByLabelText('Load an example'), 'isp-core')
    act(() => useStore.getState().select({ kind: 'node', id: 'P1' }))
    await user.click(screen.getByRole('button', { name: 'What if it is overloaded?' }))
    const panel = () => region('What-if diff')
    expect((panel().getByLabelText('Router') as HTMLSelectElement).value).toBe('P1')
    // §16: LFA 27/35 → 13/31; TI-LFA 35/35 → 21/31.
    expect(await panel().findByRole('row', { name: 'LFA 77.1% → 41.9%' })).toBeTruthy()
    expect(panel().getByRole('row', { name: 'TI-LFA 100% → 67.7%' })).toBeTruthy()
    expect(panel().getByText(/P1 overload bit off → on/)).toBeTruthy()
    // Nothing is edited until Apply.
    const p1 = () => useStore.getState().topology.nodes.find((n) => n.id === 'P1')!
    expect(p1().overload).toBeUndefined()
    await user.click(panel().getByRole('button', { name: 'Set the overload bit on P1' }))
    expect(p1().overload).toBe(true)
    act(() => useStore.getState().undo())
    expect(p1().overload).toBeUndefined()

    // The checkbox in the router's properties does the same.
    await user.click(screen.getByLabelText('Overload bit (no transit)'))
    expect(p1().overload).toBe(true)
    // A router clicked on the diagram becomes the one tried.
    act(() => useStore.getState().select({ kind: 'node', id: 'P2' }))
    expect((panel().getByLabelText('Router') as HTMLSelectElement).value).toBe('P2')
  })

  it('switching the what-if between a metric and a router keeps the panel open', async () => {
    const user = userEvent.setup()
    render(<App />)
    await user.selectOptions(screen.getByLabelText('Load an example'), 'ring5')
    await user.click(screen.getByRole('button', { name: 'What-if: overload a router' }))
    const panel = () => region('What-if diff')
    expect(panel().getByText(/Pick a router here/)).toBeTruthy()
    await user.selectOptions(panel().getByLabelText('Try'), 'metric')
    expect(panel().getByLabelText('Link')).toBeTruthy()
    expect(useStore.getState().whatIf).toEqual({ kind: 'metric', link: null })
  })
})

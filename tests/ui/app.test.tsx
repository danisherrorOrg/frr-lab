// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { App } from '../../src/App'
import { shareHash } from '../../src/io/share-url'
import { EXAMPLES, exampleTopology } from '../../src/state/examples'
import { initialState, useStore } from '../../src/state/store'

// jsdom has no <canvas>, so Cytoscape can't draw here; tests/ui/canvas.test.ts
// checks the drawing logic with headless Cytoscape instead.
vi.mock('../../src/ui/GraphCanvas', () => ({ GraphCanvas: () => null }))

beforeEach(() => useStore.setState(initialState, true))
afterEach(() => {
  cleanup()
  window.history.replaceState(null, '', '/')
})

/** The results row for one destination (first next hop). */
async function rowFor(dest: string) {
  const table = await screen.findByRole('table', { name: /Results for/ })
  const rows = within(table).getAllByRole('row')
  const row = rows.find((r) => r.querySelector('td')?.textContent === dest)
  if (!row) throw new Error(`No row for ${dest}`)
  return row
}

// docs/05-testing.md §1 UI smoke test: load an example, pick a source, see the table.
describe('App smoke test', () => {
  it('loads an example, picks a source and shows a result with its details', async () => {
    const user = userEvent.setup()
    render(<App />)

    await user.selectOptions(screen.getByLabelText('Load an example'), 'square')
    expect(await screen.findByRole('table', { name: 'Results for S' })).toBeTruthy()

    // Example 1: N is the LFA for D, so plain LFA protects it.
    const d = await rowFor('D')
    expect(d.textContent).toContain('N')
    expect(d.textContent).toContain('✓ LFA')

    await user.click(d)
    const details = screen.getByRole('region', { name: 'Details' })
    expect(details.textContent).toContain('S → D, protecting link S–E')
    expect(details.textContent).toContain('dist(N,D)=10')

    // Pick another source: the table follows.
    await user.selectOptions(screen.getByLabelText('Source router (S)'), 'N')
    expect(await screen.findByRole('table', { name: 'Results for N' })).toBeTruthy()
  })

  it('Example 3 shows the TI-LFA label stack 16004 24005 16002', async () => {
    const user = userEvent.setup()
    render(<App />)
    await user.selectOptions(screen.getByLabelText('Load an example'), 'ring5-high')
    const e = await rowFor('E')
    expect(e.textContent).toContain('B · B→C · E')
    expect(e.textContent).toContain('16004 24005 16002')
    expect(e.textContent).toContain('✓ TI-LFA')
    await user.click(e)
    expect(screen.getByRole('region', { name: 'Details' }).textContent).toContain(
      '[Prefix B, Adj B→C, Prefix E]',
    )
  })

  it('editing a metric updates the results, and undo puts it back', async () => {
    const user = userEvent.setup()
    render(<App />)
    await user.selectOptions(screen.getByLabelText('Load an example'), 'ring5')
    expect((await rowFor('E')).textContent).toContain('✓ Remote LFA')

    // Make the ring look like Example 3: B–C metric 10.
    useStore.getState().select({ kind: 'link', id: 'C-B' })
    const metric = await screen.findByLabelText('Metric C→B')
    await user.clear(metric)
    await user.type(metric, '10{Enter}')
    const back = screen.getByLabelText('Metric B→C')
    await user.clear(back)
    await user.type(back, '10{Enter}')
    expect((await rowFor('E')).textContent).toContain('✓ TI-LFA')

    await user.click(screen.getByRole('button', { name: /Undo/ }))
    await user.click(screen.getByRole('button', { name: /Undo/ }))
    expect((await rowFor('E')).textContent).toContain('✓ Remote LFA')
  })

  it('shows a clear message for a bad metric and keeps the old value', async () => {
    const user = userEvent.setup()
    render(<App />)
    useStore.getState().select({ kind: 'link', id: 'S-E' })
    const metric = await screen.findByLabelText('Metric S→E')
    await user.clear(metric)
    await user.type(metric, '0{Enter}')
    expect(screen.getByRole('alert').textContent).toBe(
      'Metric must be a whole number from 1 to 16,777,215.',
    )
    expect(useStore.getState().topology.links[0]?.metricAB).toBe(1)
  })

  it('imports a YAML file and lists every error in a bad one', async () => {
    const user = userEvent.setup()
    render(<App />)
    const input = screen.getByTestId('import-file')
    const bad = new File(['nodes:\n  - { id: A, sid: 1 }\n  - { id: A, sid: 1 }\n'], 'bad.yaml')
    await user.upload(input, bad)
    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toContain("Can't load bad.yaml")
    expect(alert.textContent).toContain('id "A" is already used')

    const good = new File(
      [
        'name: Pair\nnodes:\n  - { id: X, sid: 1 }\n  - { id: Y, sid: 2 }\nlinks:\n  - { a: X, b: Y, metric: 5 }\n',
      ],
      'pair.yaml',
    )
    await user.upload(input, good)
    expect(await screen.findByRole('table', { name: 'Results for X' })).toBeTruthy()
    expect((await rowFor('Y')).textContent).toContain('✗ none')
  })
})

describe('Phase 7: failure simulation, coverage, sharing, keyboard', () => {
  it('fails S–E on the ring: TI-LFA repair, then the converged path', async () => {
    const user = userEvent.setup()
    render(<App />)
    // Keyboard path of the fail-link tool: F, then pick the link.
    await user.keyboard('f')
    expect(useStore.getState().tool).toBe('fail-link')
    await user.selectOptions(screen.getByLabelText('Failed link'), 'S-E')

    const panel = await screen.findByRole('region', { name: 'Failure simulation' })
    expect(panel.textContent).toContain('Link S–E failed')
    await within(panel).findByText(/2 of 4 destinations cross S–E/)
    expect(panel.textContent).toContain('S switches at once')
    expect(panel.textContent).toContain('S→A→B→C→E')

    await user.click(within(panel).getByRole('button', { name: /Converge/ }))
    expect(panel.textContent).toContain('After the network reconverges')
    expect(panel.textContent).toContain('nothing moves again')

    // LFA only: E has no LFA, so its traffic is dropped.
    await user.click(within(panel).getByLabelText('LFA only'))
    await within(panel).findByText(/1 repaired, 1 dropped/)

    await user.click(within(panel).getByRole('button', { name: 'Restore link' }))
    expect(screen.queryByRole('region', { name: 'Failure simulation' })).toBeNull()
  })

  it('C toggles the converged view while a link is failed', async () => {
    const user = userEvent.setup()
    render(<App />)
    useStore.getState().failLink('S-E')
    await screen.findByRole('region', { name: 'Failure simulation' })
    await user.keyboard('c')
    expect(useStore.getState().converged).toBe(true)
    await user.keyboard('c')
    expect(useStore.getState().converged).toBe(false)
  })

  it('coverage report: one source, then all sources (ring: LFA 10 of 20)', async () => {
    const user = userEvent.setup()
    render(<App />)
    await user.click(screen.getByRole('button', { name: 'Coverage report' }))
    const report = screen.getByRole('region', { name: 'Coverage report' })
    await within(report).findByRole('img', { name: 'TI-LFA: 100%' })
    await user.click(within(report).getByLabelText(/All sources/))
    // D19: 02-ring5 all sources = 20 pairs, LFA 10, RLFA 20, TI-LFA 20.
    expect(await within(report).findByText('10/20 · 50%')).toBeTruthy()
    expect(within(report).getAllByText('20/20 · 100%')).toHaveLength(2)
    expect(within(report).getByRole('button', { name: /Unprotected list/ })).toBeTruthy()
  })

  it('opens a topology from a share link, with its source and no undo history', async () => {
    const square = exampleTopology(EXAMPLES.find((e) => e.key === 'square')!)
    window.history.replaceState(null, '', `/${shareHash(square, 'N')}`)
    render(<App />)
    expect(await screen.findByRole('table', { name: 'Results for N' })).toBeTruthy()
    expect(useStore.getState().topology.name).toBe(square.name)
    expect(useStore.getState().past).toEqual([])
  })

  it('a broken share link shows a clear error', async () => {
    window.history.replaceState(null, '', '/#t=garbage!!')
    render(<App />)
    expect((await screen.findByRole('alert')).textContent).toContain(
      'The shared link is damaged or incomplete.',
    )
  })

  it('adds a router and a link without the mouse', async () => {
    const user = userEvent.setup()
    render(<App />)
    await user.keyboard('r')
    await user.click(screen.getByRole('button', { name: /Add a router now/ }))
    expect(useStore.getState().topology.nodes.map((n) => n.id)).toContain('R1')
    await user.keyboard('{Escape}l')
    await user.selectOptions(screen.getByLabelText('From'), 'R1')
    await user.selectOptions(screen.getByLabelText('To'), 'S')
    await user.click(screen.getByRole('button', { name: 'Add' }))
    expect(useStore.getState().topology.links.some((l) => l.id === 'R1-S')).toBe(true)
  })

  it('arrow keys move between results rows', async () => {
    const user = userEvent.setup()
    render(<App />)
    const a = await rowFor('A')
    a.focus()
    await user.keyboard('{ArrowDown}')
    expect(document.activeElement?.querySelector('td')?.textContent).toBe('B')
    await user.keyboard('{Enter}')
    expect(useStore.getState().row?.dest).toBe('B')
  })
})

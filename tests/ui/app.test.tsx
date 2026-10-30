// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { App } from '../../src/App'
import { initialState, useStore } from '../../src/state/store'

// jsdom has no <canvas>, so Cytoscape can't draw here; tests/ui/canvas.test.ts
// checks the drawing logic with headless Cytoscape instead.
vi.mock('../../src/ui/GraphCanvas', () => ({ GraphCanvas: () => null }))

beforeEach(() => useStore.setState(initialState, true))
afterEach(cleanup)

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

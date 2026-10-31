// @vitest-environment jsdom
// What-if diff (TODO backlog, docs/02-algorithms.md §13).
import { act, cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { App } from '../../src/App'
import { initialState, useStore } from '../../src/state/store'

// jsdom has no <canvas>; the diagram is tested headless in canvas.test.ts.
vi.mock('../../src/ui/GraphCanvas', () => ({ GraphCanvas: () => null }))

beforeEach(() => useStore.setState(initialState, true))
afterEach(cleanup)

const panel = () => screen.getByRole('region', { name: 'What-if diff' })
const inPanel = () => within(panel())

async function open(user: ReturnType<typeof userEvent.setup>, example: string) {
  render(<App />)
  await user.selectOptions(screen.getByLabelText('Load an example'), example)
  await user.click(screen.getByRole('button', { name: 'What-if: change a metric' }))
}

/** Type into the metric boxes shown: one "both ways" box, or one per direction. */
async function tryMetric(user: ReturnType<typeof userEvent.setup>, ...values: string[]) {
  const boxes = inPanel().getAllByRole('textbox')
  expect(boxes).toHaveLength(values.length)
  for (const [i, box] of boxes.entries()) {
    await user.clear(box)
    await user.type(box, values[i]!)
  }
  await user.click(inPanel().getByRole('button', { name: 'Compare' }))
}

const metrics = (id: string) => {
  const l = useStore.getState().topology.links.find((x) => x.id === id)!
  return [l.metricAB, l.metricBA]
}

describe('What-if diff', () => {
  it('Example 3, C–B 10 → 1: LFA 40% → 50%, Remote LFA 40% → 100%; Apply is one undo step', async () => {
    const user = userEvent.setup()
    await open(user, 'ring5-high')
    expect(inPanel().getByText(/Pick a link here/)).toBeTruthy()
    await user.selectOptions(inPanel().getByLabelText('Link'), 'C-B')
    // One box for both ways, starting at the link's metric.
    expect((inPanel().getByLabelText('New metric (both ways)') as HTMLInputElement).value).toBe(
      '10',
    )
    await tryMetric(user, '1')

    expect(await inPanel().findByRole('row', { name: 'LFA 40% → 50%' })).toBeTruthy()
    expect(inPanel().getByRole('row', { name: 'LFA + Remote LFA 40% → 100%' })).toBeTruthy()
    expect(inPanel().getByRole('row', { name: 'TI-LFA 100% → 100%' })).toBeTruthy()
    expect(inPanel().getByText('▲ +60 points')).toBeTruthy()
    expect(inPanel().getByText(/4 worse · 12 better · 2 rerouted/)).toBeTruthy()
    // Nothing is edited yet.
    expect(useStore.getState().topology.links.find((l) => l.id === 'C-B')?.metricAB).toBe(10)

    // Worse first; S to E goes from TI-LFA to Remote LFA (§6 Examples 3 and 2).
    const rows = inPanel()
      .getAllByRole('row')
      .filter((r) => r.querySelectorAll('td').length === 5)
    const cells = (r: Element) => [...r.querySelectorAll('td')].map((td) => td.textContent)
    expect(cells(rows[0]!)[4]).toBe('▼ worse')
    expect(rows.map(cells)).toContainEqual([
      'S',
      'E',
      'via E: TI-LFA',
      'via E: Remote LFA',
      '▲ better',
    ])

    await user.click(inPanel().getByRole('button', { name: 'Apply this metric' }))
    const link = () => useStore.getState().topology.links.find((l) => l.id === 'C-B')!
    expect([link().metricAB, link().metricBA]).toEqual([1, 1])
    expect(inPanel().getByText(/Applied: C–B metric 10 → 1/)).toBeTruthy()
    act(() => useStore.getState().undo())
    expect(link().metricAB).toBe(10)
  })

  it('rejects a bad metric with the editor’s message', async () => {
    const user = userEvent.setup()
    await open(user, 'ring5')
    await user.selectOptions(inPanel().getByLabelText('Link'), 'S-E')
    await tryMetric(user, '0')
    expect(inPanel().getByRole('alert').textContent).toMatch(/whole number from 1/)
  })

  it('Small ISP core, PE1–P1 10 → 1 in the one box: Apply sets both directions', async () => {
    const user = userEvent.setup()
    await open(user, 'isp-core')
    await user.selectOptions(inPanel().getByLabelText('Link'), 'PE1-P1')
    await tryMetric(user, '1')
    await inPanel().findByRole('row', { name: /^TI-LFA / })
    expect(panel().textContent).toContain('PE1–P1 metric 10 → 1, every router')
    await user.click(inPanel().getByRole('button', { name: 'Apply this metric' }))
    expect(metrics('PE1-P1')).toEqual([1, 1])
  })

  it('a one-way change needs "Each direction", and names both directions', async () => {
    const user = userEvent.setup()
    await open(user, 'ring5')
    await user.selectOptions(inPanel().getByLabelText('Link'), 'S-E')
    await user.click(inPanel().getByLabelText('Each direction'))
    await tryMetric(user, '3', '1')
    expect(await inPanel().findByText(/S→E 1 → 3, E→S 1 → 1/)).toBeTruthy()
    await user.click(inPanel().getByRole('button', { name: 'Apply this metric' }))
    expect(metrics('S-E')).toEqual([3, 1])
  })

  it('a link that already differs per direction starts with one box each way', async () => {
    const user = userEvent.setup()
    await open(user, 'isp-core')
    await user.selectOptions(inPanel().getByLabelText('Link'), 'P1-P4')
    expect(
      inPanel()
        .getAllByRole('textbox')
        .map((b) => (b as HTMLInputElement).value),
    ).toEqual(['20', '40'])
    expect((inPanel().getByLabelText('Each direction') as HTMLInputElement).checked).toBe(true)
  })

  it('the same metric shows no change and can’t be applied', async () => {
    const user = userEvent.setup()
    await open(user, 'ring5')
    await user.selectOptions(inPanel().getByLabelText('Link'), 'S-E')
    await user.click(inPanel().getByRole('button', { name: 'Compare' }))
    expect(await inPanel().findByText(/nothing changes/)).toBeTruthy()
    expect(inPanel().getByText(/No router’s primary links or backups change/)).toBeTruthy()
    expect(
      (inPanel().getByRole('button', { name: 'Apply this metric' }) as HTMLButtonElement).disabled,
    ).toBe(true)
  })

  it('opens from the link’s properties and follows a link clicked on the diagram', async () => {
    const user = userEvent.setup()
    render(<App />)
    await user.selectOptions(screen.getByLabelText('Load an example'), 'ring5')
    act(() => useStore.getState().select({ kind: 'link', id: 'S-E' }))
    await user.click(screen.getByRole('button', { name: 'What if the metric changes?' }))
    const pick = () => inPanel().getByLabelText('Link') as HTMLSelectElement
    expect(pick().value).toBe('S-E')
    act(() => useStore.getState().select({ kind: 'link', id: 'C-B' }))
    expect(pick().value).toBe('C-B')
    act(() => useStore.getState().deleteSelection())
    expect(pick().value).toBe('')
  })
})

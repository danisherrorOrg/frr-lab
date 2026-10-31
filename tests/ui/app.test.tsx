// @vitest-environment jsdom
import { act, cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { App } from '../../src/App'
import { shareHash } from '../../src/io/share-url'
import { EXAMPLES, exampleTopology } from '../../src/state/examples'
import { initialState, useStore } from '../../src/state/store'
import type { Highlight } from '../../src/ui/canvas'

// jsdom has no <canvas>, so Cytoscape can't draw here; tests/ui/canvas.test.ts
// checks the drawing logic with headless Cytoscape instead.
// The mock keeps the last highlight it was given, so tests can check what would be drawn.
// It also keeps onRouterTap, so tests can "click" a router on the diagram.
const canvas = vi.hoisted(() => ({
  highlight: null as Highlight | null,
  tap: undefined as ((id: string) => void) | undefined,
}))
vi.mock('../../src/ui/GraphCanvas', () => ({
  GraphCanvas: ({
    highlight,
    onRouterTap,
  }: {
    highlight: Highlight
    onRouterTap?: (id: string) => void
  }) => {
    canvas.highlight = highlight
    canvas.tap = onRouterTap
    return null
  },
}))

/** Click router `id` on the diagram (the canvas mock passes it to the app). */
const tapRouter = (id: string) => act(() => canvas.tap!(id))

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

  it('Example 3 packet walk: steps router by router with the label stack, PHP on and off', async () => {
    const user = userEvent.setup()
    render(<App />)
    await user.selectOptions(screen.getByLabelText('Load an example'), 'ring5-high')
    await user.click(await rowFor('E'))
    const walk = screen.getByRole('group', { name: 'Packet walk' })

    await user.click(within(walk).getByRole('button', { name: /Start packet walk/ }))
    expect(walk.textContent).toContain('Router 1 of 5: S')
    expect(walk.textContent).toContain('Pushes 16004 (Prefix-SID(B)), 24005 (Adj-SID(B→C))')
    // The canvas draws the TI-LFA path and marks where the packet is.
    expect(canvas.highlight).toMatchObject({
      backup: ['S', 'A', 'B', 'C', 'E'],
      packetAt: 'S',
      packetLink: 'A-S',
    })

    await user.click(within(walk).getByRole('button', { name: 'Next router' }))
    expect(walk.textContent).toContain('Router 2 of 5: A')
    expect(walk.textContent).toContain('c(A,B) + dist(B,B) = 1 + 0 = 1 = dist(A,B)')
    expect(walk.textContent).toContain('PHP: B is the end of the segment Prefix-SID(B)')

    await user.click(within(walk).getByRole('button', { name: 'Next router' }))
    expect(walk.textContent).toContain("24005 is B's own Adj-SID for link B–C")
    expect(canvas.highlight).toMatchObject({ packetAt: 'B', packetLink: 'C-B' })

    // PHP off: B pops its own Prefix-SID first, then the Adj-SID.
    await user.click(within(walk).getByLabelText('PHP (penultimate-hop popping)'))
    expect(walk.textContent).toContain("16004 is B's own Prefix-SID: this segment ends here")

    // The stacks are drawn on the diagram, top first, current hop marked; they can be hidden.
    expect(canvas.highlight?.packetStacks).toEqual([
      { link: 'A-S', lines: ['16004 B', '24005 B→C', '16002 E'], current: false },
      { link: 'B-A', lines: ['16004 B', '24005 B→C', '16002 E'], current: false },
      { link: 'C-B', lines: ['16002 E'], current: true },
      { link: 'E-C', lines: ['16002 E'], current: false },
    ])
    await user.click(within(walk).getByLabelText('Show labels on the diagram'))
    expect(canvas.highlight?.packetStacks).toBeUndefined()
    expect(canvas.highlight?.packetAt).toBe('B')

    await user.click(within(walk).getByRole('button', { name: 'Stop' }))
    expect(canvas.highlight?.packetAt).toBeUndefined()
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
    await user.selectOptions(screen.getByLabelText('Fail or restore a link'), 'S-E')

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

  it('two links down on the ring: C’s repair survives, C repairs E’s traffic again (Phase 9.2)', async () => {
    const user = userEvent.setup()
    render(<App />)
    await user.keyboard('f')
    const pick = screen.getByLabelText('Fail or restore a link')
    await user.selectOptions(pick, 'S-E')
    await user.selectOptions(pick, 'E-C')
    expect(useStore.getState().failedLinks).toEqual(['S-E', 'E-C'])

    const panel = await screen.findByRole('region', { name: 'Failure simulation' })
    expect(panel.textContent).toContain('2 links failed: S–E, E–C')
    await within(panel).findByText(/2 of 4 destinations cross a failed link/)
    expect(panel.textContent).toContain('1 repaired, 1 unreachable')
    const rows = within(panel).getAllByRole('row')
    const rowOf = (d: string) => rows.find((r) => r.querySelector('td')?.textContent === d)!
    expect(rowOf('C').textContent).toContain('S · TI-LFA')
    expect(rowOf('E').textContent).toContain('S · TI-LFA, then C · TI-LFA ✗ loops back to S')

    // E's story names the other failed link and the router that repairs again.
    await user.click(rowOf('E'))
    expect(panel.textContent).toContain(
      'At C it finds C–E down too, and C switches to its own TI-LFA backup.',
    )
    expect(panel.textContent).toContain('S→A→B→C→B→A→S…')

    // Restore one link: back to a single failure, E's repair works again.
    await user.click(within(panel).getByRole('button', { name: 'Restore E–C' }))
    await within(panel).findByText(/2 of 4 destinations cross S–E\. 2 repaired\./)

    await user.selectOptions(pick, 'C-B')
    await user.click(await within(panel).findByRole('button', { name: 'Restore all' }))
    expect(screen.queryByRole('region', { name: 'Failure simulation' })).toBeNull()
  })

  it('a failure away from S: E’s repair is E’s final path, but S itself moves (ring, E–C)', async () => {
    const user = userEvent.setup()
    render(<App />)
    useStore.getState().toggleFailedLink('E-C')
    const panel = await screen.findByRole('region', { name: 'Failure simulation' })
    await within(panel).findByText(/1 of 4 destinations cross E–C/)
    const row = within(panel)
      .getAllByRole('row')
      .find((r) => r.querySelector('td')?.textContent === 'C')!
    // Repair S→E→S→A→B→C; E's part is E's final path, S's own final path is S→A→B→C.
    expect(row.textContent).toContain('✓ same path from E')

    await user.click(within(panel).getByRole('button', { name: /Converge/ }))
    expect(panel.textContent).toContain('S→A→B→C (cost 3)')
    expect(panel.textContent).not.toContain('nothing moves again')
    expect(panel.textContent).toContain(
      "From E on, the repair already followed E's final path, but S now sends the traffic another way.",
    )
  })

  it('a router that meets the same failed link twice says "again" (square, E–D and S–N)', async () => {
    const user = userEvent.setup()
    render(<App />)
    await user.selectOptions(screen.getByLabelText('Load an example'), 'square')
    useStore.getState().toggleFailedLink('E-D')
    useStore.getState().toggleFailedLink('S-N')
    const panel = await screen.findByRole('region', { name: 'Failure simulation' })
    await user.click(within(panel).getByLabelText('LFA + Remote LFA'))
    const row = (await within(panel).findAllByRole('row')).find(
      (r) => r.querySelector('td')?.textContent === 'D',
    )!
    await user.click(row)
    // E tunnels towards N, S's LFA for N sends it back to E, E repairs E–D a second time.
    expect(panel.textContent).toContain('At S it finds S–N down too')
    expect(panel.textContent).toContain('At E it finds E–D down again')
    expect(panel.textContent).toContain('The backups send it back to S')
  })

  it('a loop closed after one router’s repair says "the backup", not "the backups"', async () => {
    const user = userEvent.setup()
    render(<App />)
    await user.selectOptions(screen.getByLabelText('Load an example'), 'isp-core')
    // PE1→PE2 goes PE1-P1-P3-PE2; P3 repairs and its backup heads back through P1.
    useStore.getState().toggleFailedLink('P1-P4')
    useStore.getState().toggleFailedLink('P3-PE2')
    const panel = await screen.findByRole('region', { name: 'Failure simulation' })
    const row = (await within(panel).findAllByRole('row')).find(
      (r) => r.querySelector('td')?.textContent === 'PE2',
    )!
    await user.click(row)
    expect(panel.textContent).toContain('The backup sends it back to P1')
  })

  it('"same cost" and "costlier" cells name the PLR when it isn’t S (isp-core, from PE1)', async () => {
    const user = userEvent.setup()
    render(<App />)
    await user.selectOptions(screen.getByLabelText('Load an example'), 'isp-core')
    const cellOf = async (panel: HTMLElement, dest: string) =>
      (await within(panel).findAllByRole('row'))
        .find((r) => r.querySelector('td')?.textContent === dest)!
        .querySelectorAll('td')[4]!.textContent
    // P3 repairs PE2 on P3→P4→PE2 (40), P3's final path P3→P1→P4→PE2 also costs 40,
    // while the row shows the whole repair (60) next to S's final path (40).
    for (const id of ['PE1-P2', 'P1-P2', 'P3-PE2']) useStore.getState().toggleFailedLink(id)
    let panel = await screen.findByRole('region', { name: 'Failure simulation' })
    await user.click(within(panel).getByLabelText('LFA only'))
    await within(panel).findByText(/LFA only/)
    expect(await cellOf(panel, 'PE2')).toBe('≈ same cost from P3, other path')

    // P2 repairs P4 and the repair from P2 costs 70; P2's final path costs 50.
    // The row shows 80 and 60, so the cell must say whose costs it compares.
    useStore.getState().restoreAll()
    for (const id of ['PE1-P1', 'P2-P4']) useStore.getState().toggleFailedLink(id)
    panel = await screen.findByRole('region', { name: 'Failure simulation' })
    await user.click(within(panel).getByLabelText('TI-LFA'))
    expect(await cellOf(panel, 'P4')).toBe('✗ costlier from P2 (70 vs 50)')
  })

  it('a backup that leaves on a link the traffic already met doesn’t call it "down too"', async () => {
    const user = userEvent.setup()
    render(<App />)
    await user.selectOptions(screen.getByLabelText('Load an example'), 'isp-core')
    await user.selectOptions(screen.getByLabelText('Source router (S)'), 'P4')
    for (const id of ['P1-P3', 'P2-P4', 'P3-PE2']) useStore.getState().toggleFailedLink(id)
    const panel = await screen.findByRole('region', { name: 'Failure simulation' })
    const row = (await within(panel).findAllByRole('row')).find(
      (r) => r.querySelector('td')?.textContent === 'P2',
    )!
    await user.click(row)
    // PE2 finds PE2–P3 down first; later P3's backup leaves on that same link.
    expect(panel.textContent).toContain('At PE2 it finds PE2–P3 down too')
    expect(panel.textContent).toContain(
      'But that backup leaves P3 on P3–PE2, a failed link the traffic already met: traffic is dropped.',
    )
  })

  it('when S itself repairs, the story doesn’t say traffic "reaches S" (ring, S–E)', async () => {
    const user = userEvent.setup()
    render(<App />)
    useStore.getState().toggleFailedLink('S-E')
    const panel = await screen.findByRole('region', { name: 'Failure simulation' })
    await within(panel).findByText(/2 of 4 destinations cross S–E/)
    expect(panel.textContent).not.toContain('reaches S')
    expect(panel.textContent).toContain('Traffic to C starts at S, finds S–E down')
    // A PLR further along is still "reached" (ring, E–C: E repairs C).
    await user.click(within(panel).getByRole('button', { name: 'Restore link' }))
    useStore.getState().toggleFailedLink('E-C')
    const again = await screen.findByRole('region', { name: 'Failure simulation' })
    await within(again).findByText(/1 of 4 destinations cross E–C/)
    expect(again.textContent).toContain('Traffic to C reaches E, finds E–C down')
  })

  it('C toggles the converged view while a link is failed', async () => {
    const user = userEvent.setup()
    render(<App />)
    useStore.getState().toggleFailedLink('S-E')
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

describe('Phase 9.1: close the detail panel', () => {
  const details = () => screen.queryByRole('region', { name: 'Details' })

  it('✕ closes the panel and clears the path highlight', async () => {
    const user = userEvent.setup()
    render(<App />)
    await user.click(await rowFor('E'))
    expect(details()).toBeTruthy()
    expect(canvas.highlight?.primary).toEqual(['S', 'E'])

    await user.click(screen.getByRole('button', { name: 'Close details' }))
    expect(details()).toBeNull()
    expect(useStore.getState().row).toBeNull()
    expect(canvas.highlight).toEqual({ source: 'S' })
  })

  it('Escape closes it, even from a control inside the panel', async () => {
    const user = userEvent.setup()
    render(<App />)
    await user.click(await rowFor('E'))
    await user.keyboard('{Escape}')
    expect(details()).toBeNull()

    await user.click(await rowFor('E'))
    await user.click(screen.getByLabelText('Auto'))
    await user.keyboard('{Escape}')
    expect(details()).toBeNull()
  })

  it('clicking the same row again closes it', async () => {
    const user = userEvent.setup()
    render(<App />)
    await user.click(await rowFor('E'))
    expect(details()).toBeTruthy()
    await user.click(await rowFor('E'))
    expect(details()).toBeNull()
    expect(canvas.highlight).toEqual({ source: 'S' })
  })
})

describe('Phase 9.3: router failure', () => {
  it('square, fail E: the node-protecting LFA survives; E itself is expected to be unreachable', async () => {
    const user = userEvent.setup()
    render(<App />)
    await user.selectOptions(screen.getByLabelText('Load an example'), 'square')
    // Keyboard path of the fail-router tool: D, then pick the router.
    ;(document.activeElement as HTMLElement).blur()
    await user.keyboard('d')
    expect(useStore.getState().tool).toBe('fail-router')
    await user.selectOptions(screen.getByLabelText('Fail or restore a router'), 'E')

    const panel = await screen.findByRole('region', { name: 'Failure simulation' })
    expect(panel.textContent).toContain('Router E down')
    await within(panel).findByText(/1 of 2 destinations cross router E/)
    expect(panel.textContent).toContain(
      'E down: 1 destination affected, 1 repair survives, 0 break.',
    )
    expect(panel.textContent).toContain("E can't be reached: it is the failed router itself.")
    const row = within(panel)
      .getAllByRole('row')
      .find((r) => r.querySelector('td')?.textContent === 'D')!
    expect(row.textContent).toContain('✓ survives')
    expect(panel.textContent).toContain('finds S–E down (router E is down)')
    expect(canvas.highlight).toMatchObject({ dest: 'D', backup: ['S', 'N', 'D'], flowing: true })

    // Bring it back: the panel goes and a notice says the old paths return.
    await user.click(within(panel).getByRole('button', { name: 'Restore router' }))
    expect(screen.queryByRole('region', { name: 'Failure simulation' })).toBeNull()
    expect(useStore.getState().notice).toMatchObject({ title: 'Router E is back up' })
  })

  it('Example 6, fail E: link-protecting LFA N breaks, with the numbers; TI-LFA loops', async () => {
    const user = userEvent.setup()
    render(<App />)
    await user.selectOptions(screen.getByLabelText('Load an example'), 'link-protecting')
    useStore.getState().toggleFailedNode('E')
    const panel = await screen.findByRole('region', { name: 'Failure simulation' })
    await user.click(within(panel).getByLabelText('LFA only'))
    await within(panel).findByText(/E down: 1 destination affected, 0 repairs survive, 1 breaks\./)
    const rowOf = (d: string) =>
      within(panel)
        .getAllByRole('row')
        .find((r) => r.querySelector('td')?.textContent === d)!
    expect(rowOf('D').textContent).toContain('✗ breaks: via E at N')
    expect(rowOf('D').textContent).toContain('S · LFA, then N · LFA')
    await user.click(rowOf('D'))
    expect(panel.textContent).toContain(
      'But that backup goes through E, which is down: LFA N reaches D through E: dist(N,D) = 2 is not < dist(N,E) + dist(E,D) = 1+1 = 2, so N only protects the link S–E, not the router (RFC 5286 §3.2).',
    )
    expect(panel.textContent).toContain('At N it finds N–E down too')

    await user.click(within(panel).getByLabelText('TI-LFA'))
    await within(panel).findByText(/1 looping until convergence/)
    expect(panel.textContent).toContain(
      'segment Prefix-SID(D) follows normal paths through E (N→E)',
    )
  })

  it('a backup through a down router counts as broken even off the normal path (D32)', async () => {
    const user = userEvent.setup()
    render(<App />)
    await user.selectOptions(screen.getByLabelText('Load an example'), 'link-protecting')
    useStore.getState().toggleFailedNode('D')
    useStore.getState().toggleFailedLink('S-N')
    const panel = await screen.findByRole('region', { name: 'Failure simulation' })
    await user.click(within(panel).getByLabelText('LFA only'))
    await within(panel).findByText(/D down: 1 destination affected, 0 repairs survive, 1 breaks\./)
    const rowOf = (d: string) =>
      within(panel)
        .getAllByRole('row')
        .find((r) => r.querySelector('td')?.textContent === d)!
    // M: S's LFA E reaches M through D.
    expect(rowOf('M').textContent).toContain('✗ breaks: via D at E')
    // N: S's LFA E reaches N directly; D plays no part, so the column has nothing to say.
    expect(rowOf('N').querySelectorAll('td')[2]?.textContent).toBe('–')
  })

  it('names the link of a bundle the broken backup was planned for (D33)', async () => {
    const user = userEvent.setup()
    render(<App />)
    await user.selectOptions(screen.getByLabelText('Load an example'), 'parallel')
    useStore.getState().toggleFailedLink('S-E')
    useStore.getState().toggleFailedNode('A')
    const panel = await screen.findByRole('region', { name: 'Failure simulation' })
    await user.click(within(panel).getByLabelText('LFA only'))
    const row = (await within(panel).findAllByRole('row')).find(
      (r) => r.querySelector('td')?.textContent === 'D',
    )!
    await user.click(row)
    expect(panel.textContent).toContain(
      "LFA A is itself down. A is a second failure: S's backup was planned for the link S–E (S-E) alone",
    )
  })

  it('the failed router as source sends nothing', async () => {
    render(<App />)
    useStore.getState().toggleFailedNode('S')
    const panel = await screen.findByRole('region', { name: 'Failure simulation' })
    expect(panel.textContent).toContain('The source router S is down, so it sends no traffic.')
  })
})

// Phase 9.4 (D29): a bundle of two links between routers.
describe('App: parallel links', () => {
  it('Example 7: names the bundle link, draws it, and fails each link on its own', async () => {
    const user = userEvent.setup()
    render(<App />)
    await user.selectOptions(screen.getByLabelText('Load an example'), 'parallel')

    // From S to E the LFA is the other link of the bundle.
    const e = await rowFor('E')
    expect(e.textContent).toContain('E (S-E#2)')
    expect(e.textContent).toContain('✓ LFA')
    await user.click(e)
    const details = screen.getByRole('region', { name: 'Details' })
    expect(details.textContent).toContain('protecting link S–E (S-E)')
    expect(details.textContent).toContain('link-protecting, downstream')
    expect(details.textContent).toContain('Via E over S-E#2')
    expect(canvas.highlight).toMatchObject({ primaryLinks: ['S-E'], backupLinks: ['S-E#2'] })

    // Source E: the equal bundle E–D gives two rows for each destination behind it
    // (A and D), and each link protects the other (ECMP).
    await user.selectOptions(screen.getByLabelText('Source router (S)'), 'E')
    const table = await screen.findByRole('table', { name: 'Results for E' })
    const dRows = within(table)
      .getAllByRole('row')
      .filter((r) => /^D \(E-D(#2)?\)$/.test(r.querySelectorAll('td')[1]?.textContent ?? ''))
    expect(dRows.map((r) => r.querySelectorAll('td')[1]?.textContent)).toEqual([
      'D (E-D)',
      'D (E-D#2)',
      'D (E-D)',
      'D (E-D#2)',
    ])
    for (const r of dRows) expect(r.textContent).toContain('✓ ECMP')

    // Fail one link of the bundle: E repairs onto the other one.
    useStore.getState().toggleFailedLink('E-D')
    const panel = await screen.findByRole('region', { name: 'Failure simulation' })
    expect(await within(panel).findByText(/E–D \(E-D\) failed/)).toBeTruthy()
    // The first affected flow (to A) is drawn: E→D on the other link, then D→A.
    expect(canvas.highlight).toMatchObject({ dest: 'A', backupLinks: ['E-D#2', 'A-D'] })
  })
})

describe('Phase 9.5: canvas usability', () => {
  it('clicking a router opens its row as the destination, and draws it', async () => {
    render(<App />)
    await rowFor('C')
    tapRouter('C')
    const details = await screen.findByRole('region', { name: 'Details' })
    expect(details.textContent).toContain('S → C')
    expect(useStore.getState().row).toMatchObject({ dest: 'C' })
    expect(canvas.highlight).toMatchObject({ dest: 'C' })
    // The source itself has no row: nothing opens or changes.
    tapRouter('S')
    expect(useStore.getState().row).toMatchObject({ dest: 'C' })
  })

  it('with a link failed, clicking a router also draws its simulated traffic', async () => {
    render(<App />)
    await rowFor('C')
    useStore.getState().toggleFailedLink('S-E')
    await screen.findByRole('region', { name: 'Failure simulation' })
    tapRouter('C')
    expect(useStore.getState().simDest).toBe('C')
  })
})

describe('Phase 9.6: every router as the DUT', () => {
  it('Example 4, "All routers": a section for every router; a row click makes it the DUT', async () => {
    const user = userEvent.setup()
    render(<App />)
    await user.selectOptions(screen.getByLabelText('Load an example'), 'isp-core')
    await user.selectOptions(
      screen.getByLabelText('Source router (S)'),
      'All routers (6), each as the DUT',
    )
    const view = await screen.findByRole('region', { name: 'Results for every router' })
    for (const id of ['P1', 'P2', 'P3', 'P4', 'PE1', 'PE2'])
      expect(await within(view).findByRole('table', { name: `Results for ${id}` })).toBeTruthy()
    expect(within(view).getAllByRole('button', { expanded: true })).toHaveLength(6)

    // docs/05-testing.md §2: PE1 to P1 is Remote LFA PE2 via P2, TI-LFA 24000 16001.
    const pe1 = within(view).getByRole('table', { name: 'Results for PE1' })
    const p1 = within(pe1)
      .getAllByRole('row')
      .find((r) => r.querySelector('td')?.textContent === 'P1')!
    expect(p1.textContent).toContain('★ PE2(via P2)')
    expect(p1.textContent).toContain('24000 16001')

    // A row in P3's section: P3 becomes the DUT, the row opens with its details.
    const p3 = within(view).getByRole('table', { name: 'Results for P3' })
    const toPE1 = within(p3)
      .getAllByRole('row')
      .find((r) => r.querySelector('td')?.textContent === 'PE1')!
    await user.click(toPE1)
    expect(useStore.getState()).toMatchObject({ source: 'P3', allSources: true })
    const details = await screen.findByRole('region', { name: 'Details' })
    expect(details.textContent).toContain('P3 → PE1')
    expect(toPE1.getAttribute('aria-selected')).toBe('true')

    // Clicking a router on the diagram switches the DUT.
    tapRouter('P2')
    expect(useStore.getState().source).toBe('P2')

    // Sections close and open; filters narrow the list.
    await user.click(within(view).getByRole('button', { name: /DUT P4/ }))
    expect(within(view).queryByRole('table', { name: 'Results for P4' })).toBeNull()
    await user.selectOptions(within(view).getByLabelText('DUT'), 'PE2')
    expect(within(view).getAllByRole('button', { name: /^DUT / })).toHaveLength(1)
    await user.selectOptions(within(view).getByLabelText('DUT'), '')
    await user.selectOptions(within(view).getByLabelText('Show'), 'Unprotected (✗)')
    // TI-LFA protects every pair here, so nothing is left.
    expect(within(view).getByText(/No row matches/)).toBeTruthy()

    // Back to one router.
    await user.selectOptions(screen.getByLabelText('Source router (S)'), 'PE1')
    expect(screen.queryByRole('region', { name: 'Results for every router' })).toBeNull()
    expect(await screen.findByRole('table', { name: 'Results for PE1' })).toBeTruthy()
  })

  it('failure view per DUT: Example 6, router E down, LFA only', async () => {
    const user = userEvent.setup()
    render(<App />)
    await user.selectOptions(screen.getByLabelText('Load an example'), 'link-protecting')
    useStore.getState().setAllSources(true)
    useStore.getState().setSimMode('lfa')
    useStore.getState().toggleFailedNode('E')
    const byDut = await screen.findByRole('region', { name: 'Failure by DUT' })
    await within(byDut).findByText(/routers have traffic/)
    const line = (id: string) => within(byDut).getByRole('button', { name: new RegExp(`^${id}:`) })
    expect(line('S').textContent).toBe(
      'S: 1 affected, 1 repaired (1 by more than one router); 0 survive, 1 breaks',
    )
    expect(line('D').textContent).toBe('D: 2 affected, 2 repaired; 2 survive, 0 break')
    expect(line('M').textContent).toBe('M: nothing affected')
    expect((line('E') as HTMLButtonElement).disabled).toBe(true)
    expect(byDut.textContent).toContain('3 of 4 routers have traffic that crosses something down.')

    // Pick D: the failure panel below now follows D's traffic.
    await user.click(line('D'))
    expect(useStore.getState().source).toBe('D')
    const panel = screen.getByRole('region', { name: 'Failure simulation' })
    await within(panel).findByText(/From D:/)
  })
})

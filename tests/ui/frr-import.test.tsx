// @vitest-environment jsdom
/// <reference types="node" />
// D52: the "Import FRR…" dialog loads a network from `show isis database detail`.
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { readFileSync } from 'node:fs'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { initialState, useStore } from '../../src/state/store'
import { FrrImportDialog } from '../../src/ui/FrrImportDialog'
import { Toolbar } from '../../src/ui/Toolbar'

const s = () => useStore.getState()
const sample = (file: string) => readFileSync(`${process.cwd()}/tests/fixtures/frr/${file}`, 'utf8')

beforeEach(() => useStore.setState(initialState, true))
afterEach(cleanup)

describe('FRR import dialog', () => {
  it('pastes the ring output, shows what it found, and loads it as one undo step', async () => {
    const user = userEvent.setup()
    render(
      <>
        <Toolbar />
        <FrrImportDialog />
      </>,
    )
    const before = s().topology
    await user.click(screen.getByRole('button', { name: 'Import FRR…' }))
    const dialog = screen.getByRole('dialog', { name: 'Import from FRR' })
    const load = within(dialog).getByRole('button', { name: 'Load network' })
    expect((load as HTMLButtonElement).disabled).toBe(true)

    fireEvent.change(screen.getByLabelText('FRR output'), {
      target: { value: sample('ring5.txt') },
    })
    expect(dialog.textContent).toContain('5 routers, 5 links, SRGB 16000')
    await user.click(load)
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(s().topology.name).toBe('FRR import (Level-2)')
    expect(s().topology.nodes.map((n) => n.id)).toEqual(['A', 'B', 'C', 'E', 'S'])
    // Placed by the auto layout.
    expect(s().topology.nodes.every((n) => n.pos !== undefined)).toBe(true)
    s().undo()
    expect(s().topology).toBe(before)
  })

  it('lists warnings, lets you pick the level, and shows errors for other text', async () => {
    const user = userEvent.setup()
    s().setFrrImport(true)
    render(<FrrImportDialog />)
    const box = screen.getByLabelText('FRR output')
    fireEvent.change(box, { target: { value: sample('mixed.txt') } })
    expect(screen.getByLabelText('FRR import warnings').textContent).toContain(
      'no LSP for that router',
    )
    expect(screen.getByRole('dialog').textContent).toMatch(
      /4 routers, 5 links, 1 LAN, SRGB 20000, overloaded: p_2/,
    )
    await user.selectOptions(screen.getByLabelText('IS-IS level'), '1')
    expect(screen.getByRole('dialog').textContent).toMatch(/2 routers, 1 links, SRGB/)
    await user.selectOptions(screen.getByLabelText('IS-IS level'), 'all')
    expect(screen.getByRole('dialog').textContent).toMatch(/4 routers, 5 links, 1 LAN/)

    fireEvent.change(box, { target: { value: 'show ip route' } })
    expect(screen.getByLabelText('FRR import problems').textContent).toContain(
      'show isis database detail',
    )
    await user.click(box)
    await user.keyboard('{Escape}')
    expect(s().frrImport).toBe(false)
  })
})

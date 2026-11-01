// @vitest-environment jsdom
// D50: the "Generate…" dialog loads a new network, one undo step.
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { initialState, useStore } from '../../src/state/store'
import { GenerateDialog } from '../../src/ui/GenerateDialog'
import { Toolbar } from '../../src/ui/Toolbar'

const s = () => useStore.getState()

beforeEach(() => useStore.setState(initialState, true))
afterEach(cleanup)

describe('Generate dialog', () => {
  it('builds a grid of the chosen size, and undo brings the old network back', async () => {
    const user = userEvent.setup()
    render(
      <>
        <Toolbar />
        <GenerateDialog />
      </>,
    )
    const before = s().topology
    await user.click(screen.getByRole('button', { name: 'Generate…' }))
    const dialog = screen.getByRole('dialog', { name: 'Generate a network' })
    expect(dialog).toBeTruthy()

    await user.click(screen.getByRole('radio', { name: 'Grid' }))
    fireEvent.change(screen.getByLabelText(/Routers:/), { target: { value: '12' } })
    expect(screen.getByText(/12 routers, 17 links/)).toBeTruthy()
    // A grid with equal metrics has no seed to pick.
    expect(screen.queryByLabelText('Seed')).toBeNull()

    await user.click(screen.getByRole('button', { name: 'Generate' }))
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(s().topology.name).toBe('Grid 3×4')
    expect(s().topology.nodes).toHaveLength(12)
    expect(s().source).toBe('R1')

    s().undo()
    expect(s().topology).toBe(before)
  })

  it('a mesh shows the seed; "Another one" changes the network', async () => {
    const user = userEvent.setup()
    s().setGenerator(true)
    render(<GenerateDialog />)
    await user.click(screen.getByRole('radio', { name: 'Random mesh' }))
    expect(screen.getByText(/Random mesh of 8 \(seed 1\)/)).toBeTruthy()
    await user.click(screen.getByRole('button', { name: 'Another one' }))
    expect(screen.getByText(/Random mesh of 8 \(seed 2\)/)).toBeTruthy()
    expect((screen.getByLabelText('Seed') as HTMLInputElement).value).toBe('2')
  })

  it('Escape closes it without changing anything', async () => {
    const user = userEvent.setup()
    const before = s().topology
    s().setGenerator(true)
    render(<GenerateDialog />)
    await user.keyboard('{Escape}')
    expect(s().generator).toBe(false)
    expect(s().topology).toBe(before)
  })
})

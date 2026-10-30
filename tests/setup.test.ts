import fc from 'fast-check'
import { describe, expect, it } from 'vitest'

// Checks that Vitest and fast-check are wired up. Remove once real engine tests exist.
describe('test setup', () => {
  it('runs a plain test', () => {
    expect(1 + 1).toBe(2)
  })

  it('runs a property test', () => {
    fc.assert(fc.property(fc.integer(), fc.integer(), (a, b) => a + b === b + a))
  })
})

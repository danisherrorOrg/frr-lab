/// <reference types="node" />
import { readdirSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

// tests/fixtures holds copies of examples/*.yaml. If someone edits one copy,
// this fails so the docs examples and the tests can't drift apart.
const examplesDir = new URL('../examples/', import.meta.url)
const fixturesDir = new URL('./fixtures/', import.meta.url)
const examples = readdirSync(examplesDir).filter((f) => f.endsWith('.yaml'))

describe('test fixtures', () => {
  it('has at least one example', () => {
    expect(examples.length).toBeGreaterThan(0)
  })

  it.each(examples)('%s matches its copy in examples/', (file) => {
    const fixture = readFileSync(new URL(file, fixturesDir), 'utf8')
    const example = readFileSync(new URL(file, examplesDir), 'utf8')
    expect(fixture).toBe(example)
  })
})

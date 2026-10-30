/// <reference types="node" />
import { readFileSync } from 'node:fs'
import type { Topology } from '../src/engine/types'
import { parseTopology } from '../src/io/yaml'

/** Load a file from tests/fixtures, failing loudly if it doesn't validate. */
export function loadFixture(file: string): Topology {
  const result = parseTopology(readFileSync(new URL(`./fixtures/${file}`, import.meta.url), 'utf8'))
  if (!result.ok) throw new Error(`${file}: ${result.errors.join('; ')}`)
  return result.topology
}

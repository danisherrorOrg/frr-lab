/// <reference types="node" />
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { parseTopology, serializeTopology, type ParseResult } from '../../src/io/yaml'
import type { Topology } from '../../src/engine/types'

const fixture = (file: string) =>
  readFileSync(new URL(`../fixtures/${file}`, import.meta.url), 'utf8')

function expectOk(result: ParseResult): Topology {
  if (!result.ok) throw new Error(`expected ok, got errors: ${result.errors.join('; ')}`)
  return result.topology
}

function errorsOf(text: string): string[] {
  const result = parseTopology(text)
  if (result.ok) throw new Error('expected errors, got a valid topology')
  return result.errors
}

const twoNodes = (links: string) => `
name: t
nodes:
  - { id: S, sid: 1 }
  - { id: E, sid: 2 }
links:
${links}
`

describe('parseTopology: valid files', () => {
  it('loads Example 1 (square)', () => {
    const result = parseTopology(fixture('01-square.yaml'))
    const topo = expectOk(result)
    expect(result.ok && result.warnings).toEqual([])
    expect(topo.name).toBe('Square - LFA works')
    expect(topo.srgbBase).toBe(16000)
    expect(topo.nodes.map((n) => [n.id, n.sidIndex])).toEqual([
      ['S', 1],
      ['E', 2],
      ['N', 3],
      ['D', 4],
    ])
    expect(topo.links).toHaveLength(4)
    expect(topo.links[2]).toEqual({ id: 'S-N', a: 'S', b: 'N', metricAB: 15, metricBA: 15 })
  })

  it('reads Adj-SIDs per direction (Example 3)', () => {
    const topo = expectOk(parseTopology(fixture('03-ring5-highmetric.yaml')))
    const cb = topo.links.find((l) => l.a === 'C' && l.b === 'B')
    expect(cb).toMatchObject({ metricAB: 10, metricBA: 10, adjSidAB: 24006, adjSidBA: 24005 })
  })

  it.each(['01-square.yaml', '02-ring5.yaml', '03-ring5-highmetric.yaml'])(
    'loads %s without errors or warnings',
    (file) => {
      expect(parseTopology(fixture(file))).toMatchObject({ ok: true, warnings: [] })
    },
  )

  it('defaults metric_ba to metric and srgb_base to 16000', () => {
    const topo = expectOk(parseTopology(twoNodes('  - { a: S, b: E, metric: 7 }')))
    expect(topo.srgbBase).toBe(16000)
    expect(topo.links[0]).toMatchObject({ metricAB: 7, metricBA: 7 })
  })

  it('keeps a different reverse metric', () => {
    const topo = expectOk(parseTopology(twoNodes('  - { a: S, b: E, metric: 10, metric_ba: 20 }')))
    expect(topo.links[0]).toMatchObject({ metricAB: 10, metricBA: 20 })
  })

  it('accepts the metric bounds 1 and 16,777,215', () => {
    const topo = expectOk(
      parseTopology(twoNodes('  - { a: S, b: E, metric: 1, metric_ba: 16777215 }')),
    )
    expect(topo.links[0]).toMatchObject({ metricAB: 1, metricBA: 16777215 })
  })

  it('reads optional display names and positions', () => {
    const topo = expectOk(
      parseTopology(`
name: t
nodes:
  - { id: S, sid: 1, name: Core-1, pos: { x: 10, y: -20.5 } }
links: []
`),
    )
    expect(topo.nodes[0]).toEqual({
      id: 'S',
      sidIndex: 1,
      name: 'Core-1',
      pos: { x: 10, y: -20.5 },
    })
  })

  it('allows a file with no links key', () => {
    const topo = expectOk(parseTopology('name: t\nnodes:\n  - { id: S, sid: 1 }\n'))
    expect(topo.links).toEqual([])
  })
})

describe('parseTopology: errors', () => {
  it('rejects text that is not YAML', () => {
    expect(errorsOf('nodes: [ { id: S')[0]).toMatch(/not valid YAML/)
  })

  it('rejects custom YAML tags (safe schema only)', () => {
    expect(errorsOf('name: !!js/function "function () {}"\nnodes: []\n')[0]).toMatch(
      /not valid YAML/,
    )
  })

  it('rejects a file that is not a mapping', () => {
    expect(errorsOf('- a\n- b\n')[0]).toMatch(/mapping/)
  })

  it('requires a nodes list', () => {
    expect(errorsOf('name: t\n')).toContainEqual(expect.stringMatching(/"nodes" must be a list/))
  })

  it('rejects duplicate node ids', () => {
    const errors = errorsOf(`
name: t
nodes:
  - { id: S, sid: 1 }
  - { id: S, sid: 2 }
`)
    expect(errors).toContainEqual(expect.stringMatching(/Node #2: id "S" is already used/))
  })

  it('rejects duplicate SID indices', () => {
    const errors = errorsOf(`
name: t
nodes:
  - { id: S, sid: 1 }
  - { id: E, sid: 1 }
`)
    expect(errors).toContainEqual(
      expect.stringMatching(/Node #2 \(E\): SID index 1 is already used by S/),
    )
  })

  it('rejects a node without a valid SID index', () => {
    const errors = errorsOf('name: t\nnodes:\n  - { id: S, sid: -1 }\n  - { id: E }\n')
    expect(errors).toContainEqual(
      expect.stringMatching(/Node #1 \(S\): "sid" must be a whole number/),
    )
    expect(errors).toContainEqual(
      expect.stringMatching(/Node #2 \(E\): "sid" must be a whole number/),
    )
  })

  it('rejects a link to an unknown node', () => {
    const errors = errorsOf(twoNodes('  - { a: S, b: X, metric: 1 }'))
    expect(errors).toContainEqual(expect.stringMatching(/Link #1 \(S–X\): node "X" does not exist/))
  })

  it.each([
    ['0', 'metric: 0'],
    ['negative', 'metric: -5'],
    ['fractional', 'metric: 1.5'],
    ['too large', 'metric: 16777216'],
    ['text', 'metric: ten'],
    ['missing', ''],
  ])('rejects a %s metric', (_label, metric) => {
    const errors = errorsOf(twoNodes(`  - { a: S, b: E${metric ? `, ${metric}` : ''} }`))
    expect(errors).toContainEqual(
      expect.stringMatching(
        /Link #1 \(S–E\): "metric" must be a whole number from 1 to 16,777,215/,
      ),
    )
  })

  it('rejects a bad reverse metric', () => {
    const errors = errorsOf(twoNodes('  - { a: S, b: E, metric: 1, metric_ba: 0 }'))
    expect(errors).toContainEqual(expect.stringMatching(/"metric_ba" must be a whole number/))
  })

  it('rejects self-loops', () => {
    const errors = errorsOf(twoNodes('  - { a: S, b: S, metric: 1 }'))
    expect(errors).toContainEqual(
      expect.stringMatching(/Link #1 \(S–S\): a link can't connect a router to itself/),
    )
  })

  it('rejects parallel links, in either direction', () => {
    const errors = errorsOf(
      twoNodes('  - { a: S, b: E, metric: 1 }\n  - { a: E, b: S, metric: 2 }'),
    )
    expect(errors).toContainEqual(
      expect.stringMatching(/Link #2 \(E–S\): E and S are already linked by link #1/),
    )
  })

  it('rejects a bad Adj-SID label', () => {
    const errors = errorsOf(twoNodes('  - { a: S, b: E, metric: 1, adj_sid_ab: -3 }'))
    expect(errors).toContainEqual(expect.stringMatching(/"adj_sid_ab" must be a whole number/))
  })

  it('reports every problem at once, not just the first', () => {
    const errors = errorsOf(`
name: t
nodes:
  - { id: S, sid: 1 }
  - { id: S, sid: 1 }
links:
  - { a: S, b: X, metric: 0 }
`)
    expect(errors.length).toBeGreaterThanOrEqual(3)
  })
})

describe('parseTopology: warnings', () => {
  it('warns (but still loads) when the graph is disconnected', () => {
    const result = parseTopology(`
name: t
nodes:
  - { id: S, sid: 1 }
  - { id: E, sid: 2 }
  - { id: X, sid: 3 }
  - { id: Y, sid: 4 }
links:
  - { a: S, b: E, metric: 1 }
  - { a: X, b: Y, metric: 1 }
`)
    expect(result.ok).toBe(true)
    expect(result.ok && result.warnings).toEqual([
      "The network is not connected: S can't reach X, Y.",
    ])
  })
})

describe('serializeTopology', () => {
  it.each(['01-square.yaml', '02-ring5.yaml', '03-ring5-highmetric.yaml'])(
    'round-trips %s',
    (file) => {
      const topo = expectOk(parseTopology(fixture(file)))
      expect(expectOk(parseTopology(serializeTopology(topo)))).toEqual(topo)
    },
  )

  it('round-trips names, positions and asymmetric metrics', () => {
    const topo: Topology = {
      name: 'Round trip',
      srgbBase: 20000,
      nodes: [
        { id: 'S', sidIndex: 1, name: 'Core-1', pos: { x: 1, y: 2 } },
        { id: 'E', sidIndex: 2 },
      ],
      links: [{ id: 'S-E', a: 'S', b: 'E', metricAB: 10, metricBA: 20, adjSidBA: 24001 }],
    }
    expect(expectOk(parseTopology(serializeTopology(topo)))).toEqual(topo)
  })

  it('leaves out metric_ba when it equals metric', () => {
    const topo = expectOk(parseTopology(twoNodes('  - { a: S, b: E, metric: 7 }')))
    expect(serializeTopology(topo)).not.toContain('metric_ba')
  })
})

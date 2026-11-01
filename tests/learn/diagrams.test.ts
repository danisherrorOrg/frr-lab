/// <reference types="node" />
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { rowProtection } from '../../src/learn/diagram'
import { DIAGRAMS, diagramSvg } from '../../src/learn/diagrams'
import { EXAMPLES, exampleTopology } from '../../src/state/examples'

// The guide's SVG files are drawn by the engine. `npm run learn:diagrams` rewrites
// them; this test fails when a file no longer matches (D60).
const imgDir = new URL('../../docs/learn/img/', import.meta.url)
const update = process.env.UPDATE_LEARN_DIAGRAMS === '1'

describe('Learn guide diagrams', () => {
  it('have unique file names', () => {
    const files = DIAGRAMS.map((d) => d.file)
    expect(new Set(files).size).toBe(files.length)
  })

  it.each(DIAGRAMS.map((d) => d.file))('%s matches the engine', (file) => {
    const svg = diagramSvg(file)!
    expect(svg).toContain('<svg')
    const url = new URL(file, imgDir)
    if (update) {
      mkdirSync(imgDir, { recursive: true })
      writeFileSync(url, svg)
    }
    expect(existsSync(url), `${file} is missing: run npm run learn:diagrams`).toBe(true)
    expect(readFileSync(url, 'utf8'), `${file} is out of date: run npm run learn:diagrams`).toBe(
      svg,
    )
  })

  it('has no SVG file without a diagram', () => {
    const files = readdirSync(imgDir).filter((f) => f.endsWith('.svg'))
    expect(files.sort()).toEqual(DIAGRAMS.map((d) => d.file).sort())
  })

  // The numbers the chapters quote next to the pictures (docs/02-algorithms.md §6).
  it('draws the backups the chapters describe', () => {
    const t = (key: string) => exampleTopology(EXAMPLES.find((e) => e.key === key)!)
    const ring = rowProtection(t('ring5'), 'S', 'E', 'E')!
    expect(ring.rlfa.best).toBe('B')
    expect(ring.rlfa.pSpace).toEqual(['A', 'B'])
    expect(ring.rlfa.extPSpace).toEqual(['A', 'B', 'C'])
    expect(ring.rlfa.qSpace).toEqual(['B', 'C'])
    expect(ring.tilfa.labelStack).toEqual([16004, 16002])
    const high = rowProtection(t('ring5-high'), 'S', 'E', 'E')!
    expect(high.rlfa.pq).toEqual([])
    expect(high.tilfa.labelStack).toEqual([16004, 24005, 16002])
    const node = rowProtection(t('node-protection'), 'S', 'D', 'E')!
    expect(node.rlfa.best).toBe('C')
    expect(node.tilfa.labelStack).toEqual([16005, 16006])
    expect(rowProtection(t('srlg'), 'S', 'D', 'E')!.lfa.best).toBe('C')
    expect(rowProtection(t('parallel'), 'S', 'E', 'E')!.lfa.bestLink).toBe('S-E#2')
  })
})

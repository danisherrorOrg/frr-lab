// @vitest-environment jsdom
// D49: the diagram as an SVG file, written from Cytoscape's computed styles.
import cytoscape from 'cytoscape'
import { describe, expect, it } from 'vitest'
import { decorate, STYLE, sync } from '../../src/ui/canvas'
import { diagramSvg, EXPORT_BACKGROUND } from '../../src/ui/export-image'
import { EXAMPLES, exampleTopology } from '../../src/state/examples'

const none = { selection: null, linkStart: null, failed: [] }

// The built-in examples are the fixture files; jsdom can't read files by URL.
function draw(key: string) {
  const t = exampleTopology(EXAMPLES.find((e) => e.key === key)!)
  // styleEnabled: headless Cytoscape skips style maths unless asked.
  const cy = cytoscape({ headless: true, styleEnabled: true, style: STYLE })
  sync(cy, t)
  return { cy, t }
}

/** Parse as XML; a broken file has a <parsererror>. */
function parse(svg: string) {
  const doc = new DOMParser().parseFromString(svg, 'image/svg+xml')
  expect(doc.getElementsByTagName('parsererror')).toHaveLength(0)
  return doc
}

describe('diagramSvg', () => {
  it('draws every router and link with its label, on a white background', () => {
    const { cy, t } = draw('ring5')
    decorate(cy, t, { source: null }, none)
    const doc = parse(diagramSvg(cy, 'Ring <5>'))
    expect(doc.querySelector('title')!.textContent).toBe('Ring <5>')
    expect(doc.querySelectorAll('circle')).toHaveLength(5)
    expect(doc.querySelectorAll('path')).toHaveLength(5)
    expect(doc.querySelector('rect')!.getAttribute('fill')).toBe(EXPORT_BACKGROUND)
    const texts = [...doc.querySelectorAll('tspan')].map((x) => x.textContent)
    for (const id of ['S', 'E', 'A', 'B', 'C']) expect(texts).toContain(id)
    // S-E has metric 1 in the ring fixture, written in the middle of the link.
    expect(texts).toContain('1')
  })

  it('the box holds every router, whatever the zoom', () => {
    const { cy, t } = draw('ring5')
    decorate(cy, t, { source: null }, none)
    const doc = parse(diagramSvg(cy))
    const [x, y, w, h] = doc.documentElement.getAttribute('viewBox')!.split(' ').map(Number)
    cy.nodes().forEach((n) => {
      const p = n.position()
      expect(p.x).toBeGreaterThan(x!)
      expect(p.y).toBeGreaterThan(y!)
      expect(p.x).toBeLessThan(x! + w!)
      expect(p.y).toBeLessThan(y! + h!)
    })
  })

  it('shows what is on screen: paths, arrows, failed links, the P/Q gradient', () => {
    const { cy, t } = draw('ring5')
    decorate(
      cy,
      t,
      {
        source: 'S',
        dest: 'E',
        primary: ['S', 'E'],
        backup: ['S', 'A', 'B', 'C', 'E'],
        pSpace: ['A', 'B'],
        qSpace: ['B', 'C'],
      },
      { ...none, failed: ['S-E'] },
    )
    const svg = diagramSvg(cy)
    const doc = parse(svg)
    // Backup path: orange, dashed with the canvas pattern.
    const backup = [...doc.querySelectorAll('path')].filter((p) =>
      p.getAttribute('stroke')!.includes('234,88,12'),
    )
    expect(backup).toHaveLength(4)
    expect(backup[0]!.getAttribute('stroke-dasharray')).toBe('10 6')
    // Mid-line arrows on the primary and backup links.
    expect(doc.querySelectorAll('polygon').length).toBeGreaterThanOrEqual(5)
    // B is in P and Q: a left-to-right gradient fill.
    expect(doc.querySelectorAll('linearGradient')).toHaveLength(1)
    expect(svg).toContain('fill="url(#g0)"')
    // The destination's double border is two outlines.
    expect(doc.querySelectorAll('circle').length).toBe(6)
  })

  it('parallel links are curves on both sides, not drawn on top of each other', () => {
    const { cy, t } = draw('parallel')
    decorate(cy, t, { source: null }, none)
    const doc = parse(diagramSvg(cy))
    const ds = [...doc.querySelectorAll('path')].map((p) => p.getAttribute('d')!)
    expect(ds.filter((d) => d.includes('Q')).length).toBeGreaterThanOrEqual(2)
    expect(new Set(ds).size).toBe(ds.length)
  })

  it('overloaded routers are octagons', () => {
    const { cy, t } = draw('ring5')
    const ol = { ...t, nodes: t.nodes.map((n) => (n.id === 'A' ? { ...n, overload: true } : n)) }
    decorate(cy, ol, { source: null }, none)
    const doc = parse(diagramSvg(cy))
    expect(doc.querySelectorAll('circle')).toHaveLength(4)
    expect(doc.querySelectorAll('g > g > polygon')).toHaveLength(1)
  })

  it('an empty diagram is still a valid file', () => {
    const cy = cytoscape({ headless: true, styleEnabled: true, style: STYLE })
    parse(diagramSvg(cy))
  })
})

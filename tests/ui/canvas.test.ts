import cytoscape from 'cytoscape'
import { describe, expect, it } from 'vitest'
import { decorate, stepFlow, STYLE, sync } from '../../src/ui/canvas'
import { loadFixture } from '../helpers'

const none = { selection: null, linkStart: null, failed: [] }

function draw(file: string) {
  const t = loadFixture(file)
  const cy = cytoscape({ headless: true, style: STYLE })
  sync(cy, t)
  return { cy, t }
}

describe('canvas sync', () => {
  it('draws every router and link at its saved position', () => {
    const { cy } = draw('02-ring5.yaml')
    expect(cy.nodes().map((n) => n.id())).toEqual(['S', 'E', 'A', 'B', 'C'])
    expect(cy.edges()).toHaveLength(5)
    expect(cy.getElementById('E').position()).toEqual({ x: 200, y: 0 })
  })

  it('updates in place: removed routers go, their links with them', () => {
    const { cy, t } = draw('02-ring5.yaml')
    sync(cy, {
      ...t,
      nodes: t.nodes.filter((n) => n.id !== 'C'),
      links: t.links.filter((l) => l.a !== 'C' && l.b !== 'C'),
    })
    expect(cy.nodes()).toHaveLength(4)
    expect(
      cy
        .edges()
        .map((e) => e.id())
        .sort(),
    ).toEqual(['A-S', 'B-A', 'S-E'])
  })

  it('shows one metric when both directions match, one per end when they differ', () => {
    const { cy, t } = draw('04-isp-core.yaml')
    decorate(cy, t, { source: 'PE1' }, none)
    expect(cy.getElementById('PE1-P1').data()).toMatchObject({ label: '10', srcLabel: '' })
    expect(cy.getElementById('P1-P4').data()).toMatchObject({
      label: '',
      srcLabel: '20',
      tgtLabel: '40',
    })
  })
})

describe('canvas highlight', () => {
  it('Example 2: primary, dashed backup with direction, P/Q shading, ★ on the PQ node', () => {
    const { cy, t } = draw('02-ring5.yaml')
    decorate(
      cy,
      t,
      {
        source: 'S',
        dest: 'E',
        primary: ['S', 'E'],
        backup: ['S', 'A', 'B', 'C', 'E'],
        pSpace: ['A', 'B', 'C'],
        qSpace: ['B', 'C'],
        pq: 'B',
      },
      none,
    )
    expect(cy.getElementById('S-E').classes()).toEqual(['primary', 'primary-fwd'])
    // Link "A-S" is stored a=A, b=S, so S→A runs against it.
    expect(cy.getElementById('A-S').classes()).toEqual(['backup', 'backup-rev'])
    expect(cy.getElementById('C-B').classes()).toEqual(['backup', 'backup-rev'])
    expect(cy.getElementById('E-C').classes()).toEqual(['backup', 'backup-rev'])
    expect(cy.getElementById('B').hasClass('pq')).toBe(true)
    expect(cy.getElementById('B').data('display')).toBe('★ B')
    expect(cy.getElementById('A').classes()).toEqual(['p-space'])
    expect(cy.getElementById('C').classes()).toEqual(['p-space', 'q-space'])
    expect(cy.getElementById('S').hasClass('source')).toBe(true)
    expect(cy.getElementById('E').hasClass('dest')).toBe(true)
  })

  it('clears the old highlight, marks failed links with ✕ and the selection', () => {
    const { cy, t } = draw('02-ring5.yaml')
    decorate(cy, t, { source: 'S', primary: ['S', 'E'], pq: 'B' }, none)
    decorate(cy, t, { source: 'S' }, { selection: 'A', linkStart: null, failed: ['S-E'] })
    expect(cy.getElementById('S-E').classes()).toEqual(['failed'])
    expect(cy.getElementById('S-E').data('label')).toBe('✕ 1')
    expect(cy.getElementById('B').data('display')).toBe('B')
    expect(cy.getElementById('A').hasClass('sel')).toBe(true)
  })

  it('failure simulation: animated repair path, then the final path with a halo', () => {
    const t = loadFixture('02-ring5.yaml')
    // styleEnabled: headless Cytoscape skips style maths unless asked.
    const cy = cytoscape({ headless: true, styleEnabled: true, style: STYLE })
    sync(cy, t)
    // pstyle() (the computed style) isn't in Cytoscape's TypeScript types.
    type Parsed = { pfValue: number; strValue: string; value: unknown }
    const ps = (id: string, prop: string) =>
      (cy.getElementById(id) as unknown as { pstyle(p: string): Parsed }).pstyle(prop)
    const repair = ['S', 'A', 'B', 'C', 'E']
    decorate(
      cy,
      t,
      { source: 'S', dest: 'E', primary: ['S', 'E'], backup: repair, flowing: true },
      { selection: null, linkStart: null, failed: ['S-E'] },
    )
    expect(cy.getElementById('S-E').classes()).toEqual(['failed', 'primary', 'primary-fwd'])
    expect(cy.getElementById('A-S').classes()).toEqual(['backup', 'backup-rev', 'flowing'])
    stepFlow(cy, 8)
    // A-S runs against the travel direction (S→A), so its dashes move the other way.
    expect(ps('A-S', 'line-dash-offset').pfValue).toBe(8)
    expect(ps('E-C', 'line-dash-offset').pfValue).toBe(8)
    expect(cy.edges('.flowing')).toHaveLength(4)

    decorate(
      cy,
      t,
      { source: 'S', dest: 'E', final: repair },
      { selection: null, linkStart: null, failed: ['S-E'] },
    )
    expect(cy.edges('.flowing')).toHaveLength(0)
    expect(cy.getElementById('A-S').classes()).toEqual(['final', 'final-rev'])
    expect(ps('A-S', 'underlay-opacity').value).toBe(0.3)
    expect(ps('A-S', 'mid-source-arrow-shape').strValue).toBe('chevron')
  })
})

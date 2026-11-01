import cytoscape from 'cytoscape'
import { describe, expect, it } from 'vitest'
import { coverageMap } from '../../src/engine/heat-map'
import { decorate, stepFlow, STYLE, sync } from '../../src/ui/canvas'
import { heatMarks } from '../../src/ui/format'
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
  it('a picked set: its routers ringed, the rest faded, S and D left clear', () => {
    const { cy, t } = draw('02-ring5.yaml')
    decorate(cy, t, { source: 'S', dest: 'E', qSpace: ['B', 'C'], pq: 'B', spot: ['B', 'C'] }, none)
    expect(cy.getElementById('B').classes()).toEqual(['q-space', 'pq', 'spot'])
    expect(cy.getElementById('C').classes()).toEqual(['q-space', 'spot'])
    expect(cy.getElementById('A').classes()).toEqual(['faded'])
    expect(cy.getElementById('S').hasClass('faded')).toBe(false)
    expect(cy.getElementById('E').hasClass('faded')).toBe(false)

    // Unpicking clears both marks.
    decorate(cy, t, { source: 'S', dest: 'E' }, none)
    expect(cy.nodes('.spot, .faded')).toHaveLength(0)
  })

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

describe('canvas: failed router (Phase 9.3)', () => {
  it('greys out the router, marks it ✕ and draws every one of its links as down', () => {
    const { cy, t } = draw('02-ring5.yaml')
    decorate(cy, t, { source: 'S' }, { ...none, failedNodes: ['E'] })
    expect(cy.getElementById('E').hasClass('down')).toBe(true)
    expect(cy.getElementById('E').data('display')).toBe('✕ E')
    expect(cy.getElementById('S-E').hasClass('failed')).toBe(true)
    expect(cy.getElementById('E-C').hasClass('failed')).toBe(true)
    expect(cy.getElementById('E-C').data('label')).toBe('✕ 1')
    expect(cy.getElementById('C-B').hasClass('failed')).toBe(false)
    // Restored: back to normal.
    decorate(cy, t, { source: 'S' }, none)
    expect(cy.getElementById('E').hasClass('down')).toBe(false)
    expect(cy.getElementById('S-E').hasClass('failed')).toBe(false)
  })
})

describe('canvas: parallel links (D29)', () => {
  it('draws each link of a bundle as its own curved edge with its own metric', () => {
    const { cy, t } = draw('07-parallel.yaml')
    decorate(cy, t, { source: 'S' }, none)
    expect(cy.edges().map((e) => e.id())).toEqual(['S-E', 'S-E#2', 'E-D', 'E-D#2', 'S-A', 'A-D'])
    expect(cy.getElementById('S-E').data('label')).toBe('10')
    expect(cy.getElementById('S-E#2').data('label')).toBe('20')
  })

  it('highlights the named link of a bundle, not just any link between the routers', () => {
    const { cy, t } = draw('07-parallel.yaml')
    decorate(
      cy,
      t,
      {
        source: 'S',
        dest: 'E',
        primary: ['S', 'E'],
        primaryLinks: ['S-E'],
        backup: ['S', 'E'],
        backupLinks: ['S-E#2'],
      },
      { ...none, failed: ['S-E'] },
    )
    expect(cy.getElementById('S-E').classes()).toEqual(
      expect.arrayContaining(['primary', 'failed']),
    )
    expect(cy.getElementById('S-E').hasClass('backup')).toBe(false)
    expect(cy.getElementById('S-E#2').classes()).toEqual(
      expect.arrayContaining(['backup', 'backup-fwd']),
    )
    expect(cy.getElementById('S-E#2').hasClass('failed')).toBe(false)
  })

  it('packet walk: writes the label stack under each link’s metric, current hop in bold, and clears it', () => {
    const { cy, t } = draw('03-ring5-highmetric.yaml')
    decorate(
      cy,
      t,
      {
        source: 'S',
        packetAt: 'B',
        packetLink: 'C-B',
        packetStacks: [
          { link: 'A-S', lines: ['16004 B', '24005 B→C', '16002 E'], current: false },
          { link: 'C-B', lines: ['16002 E'], current: true },
          { link: 'E-C', lines: ['no labels'], current: false },
        ],
      },
      none,
    )
    expect(cy.getElementById('A-S').data('label')).toBe('1\n16004 B\n24005 B→C\n16002 E')
    expect(cy.getElementById('C-B').data('label')).toBe('10\n16002 E')
    expect(cy.getElementById('C-B').classes()).toEqual(
      expect.arrayContaining(['walk-stack', 'walk-current', 'packet-hop']),
    )
    expect(cy.getElementById('A-S').hasClass('walk-current')).toBe(false)
    expect(cy.getElementById('B').hasClass('packet-at')).toBe(true)

    decorate(cy, t, { source: 'S' }, none)
    expect(cy.getElementById('A-S').data('label')).toBe('1')
    expect(cy.getElementById('A-S').hasClass('walk-stack')).toBe(false)
  })
})

describe('canvas heat map', () => {
  it('colours routers and links by level and writes the share', () => {
    const { cy, t } = draw('03-ring5-highmetric.yaml')
    const heat = heatMarks(coverageMap(t), 'lfa')
    decorate(cy, t, { source: 'S' }, { ...none, heat })
    expect(cy.getElementById('S-E').classes()).toContain('heat-low')
    expect(cy.getElementById('S-E').data('label')).toBe('1 · 0%')
    expect(cy.getElementById('C-B').hasClass('heat-idle')).toBe(true)
    expect(cy.getElementById('C-B').data('label')).toBe('10 · –')
    expect(cy.getElementById('B').hasClass('heat-full')).toBe(true)
    expect(cy.getElementById('B').data('display')).toBe('B\n✓ 100%')
    expect(cy.getElementById('S').hasClass('heat-low')).toBe(true)
  })

  it('a failed link keeps its failed style on top; turning it off clears it', () => {
    const { cy, t } = draw('03-ring5-highmetric.yaml')
    const heat = heatMarks(coverageMap(t), 'tilfa')
    decorate(cy, t, { source: 'S' }, { ...none, failed: ['S-E'], heat })
    const se = cy.getElementById('S-E')
    expect(se.data('label')).toBe('✕ 1 · ✓ 100%')
    expect(se.classes()).toEqual(expect.arrayContaining(['heat-full', 'failed']))
    // Later rules win: failed links and the picked row's paths draw over the heat colours.
    const at = (sel: string) => STYLE.findIndex((r) => r.selector === sel)
    expect(at('edge.heat-full')).toBeLessThan(at('edge.failed'))
    expect(at('edge.heat-low')).toBeLessThan(at('edge.primary'))
    expect(at('node.heat-low')).toBeLessThan(at('node.p-space'))
    decorate(cy, t, { source: 'S' }, none)
    expect(cy.elements().filter((e) => /heat-/.test(e.classes().join(' ')))).toHaveLength(0)
    expect(cy.getElementById('B').data('display')).toBe('B')
  })
})

describe('canvas: LAN as a pseudonode (D55)', () => {
  it('draws the LAN as a square in the middle of its members, with a spoke each', () => {
    const { cy } = draw('10-lan-levels.yaml')
    const lan = cy.getElementById('lan:LAN1')
    expect(lan.hasClass('lan')).toBe(true)
    // Centre of R2 (200,-120), R3 (200,120), R4 (500,0).
    expect(lan.position()).toEqual({ x: 300, y: 0 })
    expect(
      cy
        .edges()
        .map((e) => e.id())
        .filter((id) => id.startsWith('lan:'))
        .sort(),
    ).toEqual(['lan:LAN1:R2', 'lan:LAN1:R3', 'lan:LAN1:R4'])
    // The LAN's member-to-member links are not drawn themselves.
    expect(cy.getElementById('LAN1:R2-R4').empty()).toBe(true)
    expect(cy.getElementById('lan:LAN1:R2').data()).toMatchObject({
      metricAB: 10,
      metricBA: 0,
      rep: 'LAN1:R2-R3',
    })
  })

  it('a path over the LAN lights both spokes; a failed interface marks the spoke', () => {
    const { cy, t } = draw('10-lan-levels.yaml')
    decorate(
      cy,
      t,
      { source: 'R3', dest: 'R2', primary: ['R3', 'R2'], primaryLinks: ['LAN1:R2-R3'] },
      { ...none, failed: ['LAN1:R2-R3', 'LAN1:R2-R4'] },
    )
    // R3 → LAN → R2: R3's spoke forwards, R2's spoke runs back to R2.
    expect(cy.getElementById('lan:LAN1:R3').hasClass('primary-fwd')).toBe(true)
    expect(cy.getElementById('lan:LAN1:R2').hasClass('primary-rev')).toBe(true)
    // All of R2's LAN links are down: its spoke is failed; R3's is not.
    expect(cy.getElementById('lan:LAN1:R2').hasClass('failed')).toBe(true)
    expect(cy.getElementById('lan:LAN1:R3').hasClass('failed')).toBe(false)
    expect(cy.getElementById('lan:LAN1').data('display')).toBe('LAN1')
  })
})

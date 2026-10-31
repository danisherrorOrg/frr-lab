// Cytoscape drawing for the canvas, kept out of the React component so tests can
// run it headless (jsdom has no <canvas>).
import type cytoscape from 'cytoscape'
import type { NodeId, Topology } from '../engine/types'

/** What to mark on the canvas for the selected results row (F4). */
export interface Highlight {
  source: NodeId | null
  dest?: NodeId
  primary?: NodeId[]
  backup?: NodeId[]
  pSpace?: NodeId[]
  qSpace?: NodeId[]
  /** The chosen PQ node, drawn with ★. */
  pq?: NodeId
  /** Path after the network reconverges (failure simulation, F5): green line with a halo. */
  final?: NodeId[]
  /** Animate traffic along the backup path (marching dashes). */
  flowing?: boolean
}

export const COLORS = { primary: '#2563eb', backup: '#ea580c', final: '#16a34a' }

// Colours are mid-tones so they read on light and dark backgrounds. Line style
// and arrows carry the meaning too, not only colour (docs/01-requirements.md §6).
export const STYLE: cytoscape.StylesheetJson = [
  {
    selector: 'node',
    style: {
      label: 'data(display)',
      'text-valign': 'center',
      'text-halign': 'center',
      'text-wrap': 'wrap',
      'font-size': 13,
      'font-weight': 'bold',
      color: '#0f172a',
      width: 48,
      height: 48,
      'background-color': '#e2e8f0',
      'border-width': 2,
      'border-color': '#475569',
    },
  },
  {
    selector: 'edge',
    style: {
      'curve-style': 'bezier',
      width: 2,
      'line-color': '#94a3b8',
      label: 'data(label)',
      'source-label': 'data(srcLabel)',
      'target-label': 'data(tgtLabel)',
      'source-text-offset': 34,
      'target-text-offset': 34,
      'font-size': 12,
      color: '#0f172a',
      'text-background-color': '#ffffff',
      'text-background-opacity': 0.85,
      'text-background-padding': '2px',
      'text-rotation': 'none',
    },
  },
  { selector: 'node.p-space', style: { 'background-color': '#bfdbfe' } },
  { selector: 'node.q-space', style: { 'background-color': '#bbf7d0' } },
  {
    selector: 'node.p-space.q-space',
    style: {
      'background-fill': 'linear-gradient',
      'background-gradient-stop-colors': ['#bfdbfe', '#bbf7d0'],
      'background-gradient-direction': 'to-right',
    },
  },
  { selector: 'node.pq', style: { 'border-color': '#a16207', 'border-width': 4 } },
  { selector: 'node.source', style: { 'border-color': '#1d4ed8', 'border-width': 5 } },
  {
    selector: 'node.dest',
    style: { 'border-color': '#c2410c', 'border-width': 6, 'border-style': 'double' },
  },
  {
    selector: '.sel',
    style: { 'overlay-color': '#6366f1', 'overlay-opacity': 0.25, 'overlay-padding': 6 },
  },
  {
    selector: 'node.link-start',
    style: { 'overlay-color': '#16a34a', 'overlay-opacity': 0.3, 'overlay-padding': 8 },
  },
  { selector: 'edge.primary', style: { 'line-color': '#2563eb', width: 5 } },
  {
    selector: 'edge.backup',
    style: {
      'line-color': '#ea580c',
      width: 5,
      'line-style': 'dashed',
      'line-dash-pattern': [10, 6],
    },
  },
  {
    // Edges can't be drawn double, so the final path gets a halo and chevrons instead.
    selector: 'edge.final',
    style: {
      'line-color': '#16a34a',
      width: 5,
      'underlay-color': '#16a34a',
      'underlay-opacity': 0.3,
      'underlay-padding': 6,
    },
  },
  {
    selector: 'edge.primary-fwd, edge.backup-fwd, edge.final-fwd',
    style: { 'mid-target-arrow-shape': 'triangle', 'mid-target-arrow-color': 'data(arrow)' },
  },
  {
    selector: 'edge.primary-rev, edge.backup-rev, edge.final-rev',
    style: { 'mid-source-arrow-shape': 'triangle', 'mid-source-arrow-color': 'data(arrow)' },
  },
  { selector: 'edge.final-fwd', style: { 'mid-target-arrow-shape': 'chevron' } },
  { selector: 'edge.final-rev', style: { 'mid-source-arrow-shape': 'chevron' } },
  {
    selector: 'edge.failed',
    style: { 'line-color': '#dc2626', 'line-style': 'dotted', width: 4 },
  },
]

function nodeLabel(id: NodeId, name: string | undefined, star: boolean) {
  const top = star ? `★ ${id}` : id
  return name ? `${top}\n${name}` : top
}

/** Metric labels: one in the middle, or one near each end when they differ (cost leaving that end). */
function edgeLabels(metricAB: number, metricBA: number, failed: boolean) {
  const mark = failed ? '✕ ' : ''
  return metricAB === metricBA
    ? { label: `${mark}${metricAB}`, srcLabel: '', tgtLabel: '' }
    : { label: mark, srcLabel: String(metricAB), tgtLabel: String(metricBA) }
}

/** Put the topology on the canvas, changing only what differs so zoom and drag aren't disturbed. */
export function sync(cy: cytoscape.Core, t: Topology) {
  cy.batch(() => {
    const nodeIds = new Set(t.nodes.map((n) => n.id))
    const linkIds = new Set(t.links.map((l) => l.id))
    cy.edges().forEach((e) => {
      if (!linkIds.has(e.id())) e.remove()
    })
    cy.nodes().forEach((n) => {
      if (!nodeIds.has(n.id())) n.remove()
    })
    for (const n of t.nodes) {
      const el = cy.getElementById(n.id)
      const pos = n.pos ?? { x: 0, y: 0 }
      if (el.empty()) {
        cy.add({ group: 'nodes', data: { id: n.id, name: n.name ?? '' }, position: { ...pos } })
      } else {
        el.data('name', n.name ?? '')
        if (!el.grabbed()) el.position({ ...pos })
      }
    }
    for (const l of t.links) {
      const el = cy.getElementById(l.id)
      const data = { metricAB: l.metricAB, metricBA: l.metricBA }
      if (el.empty())
        cy.add({ group: 'edges', data: { id: l.id, source: l.a, target: l.b, ...data } })
      else el.data(data)
    }
  })
}

const CLASSES =
  'p-space q-space pq source dest sel link-start primary backup final primary-fwd primary-rev backup-fwd backup-rev final-fwd final-rev flowing failed'

export function decorate(
  cy: cytoscape.Core,
  t: Topology,
  h: Highlight,
  extra: { selection: string | null; linkStart: NodeId | null; failed: string[] },
) {
  cy.batch(() => {
    cy.elements().removeClass(CLASSES)
    const failed = new Set(extra.failed)
    cy.nodes().forEach((n) => {
      n.data('display', nodeLabel(n.id(), n.data('name') || undefined, n.id() === h.pq))
    })
    cy.edges().forEach((e) => {
      const f = failed.has(e.id())
      e.data(edgeLabels(e.data('metricAB'), e.data('metricBA'), f))
      if (f) e.addClass('failed')
    })
    const add = (ids: NodeId[] | undefined, cls: string) => {
      for (const id of ids ?? []) cy.getElementById(id).addClass(cls)
    }
    add(h.pSpace, 'p-space')
    add(h.qSpace, 'q-space')
    add(h.pq === undefined ? [] : [h.pq], 'pq')
    add(h.source === null ? [] : [h.source], 'source')
    add(h.dest === undefined ? [] : [h.dest], 'dest')
    if (extra.linkStart) cy.getElementById(extra.linkStart).addClass('link-start')
    if (extra.selection) cy.getElementById(extra.selection).addClass('sel')

    const drawPath = (path: NodeId[] | undefined, kind: keyof typeof COLORS) => {
      const color = COLORS[kind]
      if (!path) return
      for (let i = 0; i + 1 < path.length; i++) {
        const [x, y] = [path[i]!, path[i + 1]!]
        const link = t.links.find((l) => (l.a === x && l.b === y) || (l.a === y && l.b === x))
        if (!link) continue
        const e = cy.getElementById(link.id)
        e.addClass(kind).addClass(link.a === x ? `${kind}-fwd` : `${kind}-rev`)
        e.data('arrow', color)
      }
    }
    drawPath(h.primary, 'primary')
    drawPath(h.backup, 'backup')
    drawPath(h.final, 'final')
    if (h.flowing) cy.edges('.backup').addClass('flowing')
  })
}

/**
 * One animation frame of traffic on the backup path: shift the dashes along the
 * direction of travel. Called on a timer by the canvas component.
 */
export function stepFlow(cy: cytoscape.Core, offset: number) {
  cy.batch(() => {
    cy.edges('.flowing').forEach((e) => {
      // Dashes move toward the target as the offset falls.
      e.style('line-dash-offset', e.hasClass('backup-fwd') ? -offset : offset)
    })
  })
}

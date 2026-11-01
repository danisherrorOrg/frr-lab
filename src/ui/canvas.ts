// Cytoscape drawing for the canvas, kept out of the React component so tests can
// run it headless (jsdom has no <canvas>).
import type cytoscape from 'cytoscape'
import type { NodeId, Topology } from '../engine/types'
import type { HeatLevel, HeatMarks } from './format'

/** What to mark on the canvas for the selected results row (F4). */
export interface Highlight {
  source: NodeId | null
  dest?: NodeId
  primary?: NodeId[]
  backup?: NodeId[]
  pSpace?: NodeId[]
  qSpace?: NodeId[]
  /**
   * One Remote LFA set picked in the detail panel: these routers are ringed and every
   * other router fades, so the set stands out. Undefined = nothing picked.
   */
  spot?: NodeId[]
  /** The chosen PQ node, drawn with ★. */
  pq?: NodeId
  /** Path after the network reconverges (failure simulation, F5): green line with a halo. */
  final?: NodeId[]
  /**
   * The link of each hop of `primary`, `backup` and `final`, from the engine
   * (hopLinks, Flow.repairLinks). With parallel links they say which link of a
   * bundle to draw (D29); without them the first link between the routers is used.
   */
  primaryLinks?: (string | undefined)[]
  backupLinks?: (string | undefined)[]
  finalLinks?: (string | undefined)[]
  /** Animate traffic along the backup path (marching dashes). */
  flowing?: boolean
  /** Packet walk: the router the packet is at, and the link it leaves on. */
  packetAt?: NodeId
  packetLink?: string
  /**
   * Packet walk on the diagram: the label stack each link of the repair carries,
   * top first, written under its metric. `current` is the hop being looked at.
   */
  packetStacks?: { link: string; lines: string[]; current: boolean }[]
}

export const COLORS = { primary: '#2563eb', backup: '#ea580c', final: '#16a34a' }

/**
 * Coverage heat map: a fixed good → critical status scale. Links use the full colour;
 * routers a light tint so their dark labels stay readable. The percentage is always
 * written too, so colour is never the only signal (docs/01-requirements.md §6).
 */
export const HEAT_COLORS: Record<HeatLevel, { line: string; fill: string }> = {
  full: { line: '#0ca30c', fill: '#92d692' },
  most: { line: '#fab219', fill: '#fddc98' },
  part: { line: '#ec835a', fill: '#f6c7b5' },
  low: { line: '#d03b3b', fill: '#eaa7a7' },
  idle: { line: '#94a3b8', fill: '#e2e8f0' },
}

// Before the path and P/Q styles, so the row picked in the results still shows on top.
const HEAT_STYLE: cytoscape.StylesheetJson = Object.entries(HEAT_COLORS).flatMap(([level, c]) => [
  { selector: `node.heat-${level}`, style: { 'background-color': c.fill } },
  { selector: `edge.heat-${level}`, style: { 'line-color': c.line, width: 4 } },
])

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
  ...HEAT_STYLE,
  // A link that carries nothing stays thin and dashed: it is only a backup.
  { selector: 'edge.heat-idle', style: { width: 2, 'line-style': 'dashed' } },
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
  {
    // A failed router: greyed out with a dashed border, so it reads without colour too.
    selector: 'node.down',
    style: {
      'background-color': '#cbd5e1',
      'background-opacity': 0.5,
      'border-style': 'dashed',
      'border-color': '#dc2626',
      color: '#64748b',
    },
  },
  {
    // Overload bit (D47): a stop-sign octagon with a thick amber border and "OL" in the
    // label, so it reads without colour too.
    selector: 'node.overload',
    style: { shape: 'octagon', 'border-color': '#b45309', 'border-width': 4 },
  },
  {
    // A picked P / Q / PQ set (detail panel): ring its routers, fade the others.
    selector: 'node.spot',
    style: {
      'underlay-color': '#4f46e5',
      'underlay-opacity': 0.35,
      'underlay-padding': 8,
      'underlay-shape': 'ellipse',
    },
  },
  { selector: 'node.faded', style: { opacity: 0.35 } },
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
    // Packet walk: a violet ring on the router, a violet glow on the link being sent over.
    selector: 'node.packet-at',
    style: {
      'overlay-color': '#7c3aed',
      'overlay-opacity': 0.35,
      'overlay-padding': 10,
      'overlay-shape': 'ellipse',
    },
  },
  {
    selector: 'edge.packet-hop',
    style: { 'underlay-color': '#7c3aed', 'underlay-opacity': 0.45, 'underlay-padding': 8 },
  },
  {
    // The label stack on a link of the packet walk: a stack of boxes read top-down.
    selector: 'edge.walk-stack',
    style: {
      'text-wrap': 'wrap',
      'font-family': 'ui-monospace, SFMono-Regular, Menlo, monospace',
      'font-size': 11,
      color: '#4c1d95',
      'text-background-color': '#ede9fe',
      'text-background-opacity': 0.95,
      'text-background-shape': 'roundrectangle',
      'text-border-width': 1,
      'text-border-color': '#a78bfa',
      'text-border-opacity': 1,
      'z-index': 5,
    },
  },
  {
    selector: 'edge.walk-current',
    style: {
      'font-weight': 'bold',
      'text-border-width': 2,
      'text-border-color': '#7c3aed',
      'text-background-color': '#ddd6fe',
      'z-index': 6,
    },
  },
  {
    selector: 'edge.failed',
    style: { 'line-color': '#dc2626', 'line-style': 'dotted', width: 4 },
  },
  // A LAN's pseudonode (D55): a small square, not a router.
  {
    selector: 'node.lan',
    style: {
      shape: 'round-rectangle',
      width: 22,
      height: 22,
      'background-color': '#64748b',
      'border-width': 0,
      'font-size': 11,
      'text-valign': 'bottom',
      'text-margin-y': 4,
    },
  },
]

function nodeLabel(
  id: NodeId,
  name: string | undefined,
  star: boolean,
  down: boolean,
  heat?: string,
  overload?: boolean,
) {
  const top = down ? `✕ ${id}` : star ? `★ ${id}` : id
  return [top, name, overload ? 'OL' : undefined, heat].filter((x) => x).join('\n')
}

/** Metric labels: one in the middle, or one near each end when they differ (cost leaving that end). */
function edgeLabels(metricAB: number, metricBA: number, failed: boolean) {
  const mark = failed ? '✕ ' : ''
  return metricAB === metricBA
    ? { label: `${mark}${metricAB}`, srcLabel: '', tgtLabel: '' }
    : { label: mark, srcLabel: String(metricAB), tgtLabel: String(metricBA) }
}

/** Canvas id of a LAN's pseudonode and of a member's spoke to it (D55). */
export const lanNodeId = (lan: string) => `lan:${lan}`
export const spokeId = (lan: string, node: NodeId) => `lan:${lan}:${node}`

/**
 * The canvas edges that draw link `id`: itself, or for a LAN link the two members'
 * spokes, the one of `from` first (D55).
 */
export function drawnEdges(t: Topology, id: string, from?: NodeId): string[] {
  const l = t.links.find((x) => x.id === id)
  if (l?.lan === undefined) return [id]
  const [first, second] = from === l.b ? [l.b, l.a] : [l.a, l.b]
  return [spokeId(l.lan, first), spokeId(l.lan, second)]
}

/** Put the topology on the canvas, changing only what differs so zoom and drag aren't disturbed. */
export function sync(cy: cytoscape.Core, t: Topology) {
  cy.batch(() => {
    const lans = t.lans ?? []
    const pos = new Map(t.nodes.map((n) => [n.id, n.pos ?? { x: 0, y: 0 }]))
    const nodeIds = new Set([...t.nodes.map((n) => n.id), ...lans.map((l) => lanNodeId(l.id))])
    const linkIds = new Set([
      ...t.links.filter((l) => l.lan === undefined).map((l) => l.id),
      ...lans.flatMap((l) => l.members.map((m) => spokeId(l.id, m.node))),
    ])
    cy.edges().forEach((e) => {
      if (!linkIds.has(e.id())) e.remove()
    })
    cy.nodes().forEach((n) => {
      if (!nodeIds.has(n.id())) n.remove()
    })
    for (const n of t.nodes) {
      const el = cy.getElementById(n.id)
      const p = pos.get(n.id)!
      if (el.empty()) {
        cy.add({ group: 'nodes', data: { id: n.id, name: n.name ?? '' }, position: { ...p } })
      } else {
        el.data('name', n.name ?? '')
        if (!el.grabbed()) el.position({ ...p })
      }
    }
    for (const l of t.links) {
      if (l.lan !== undefined) continue
      const el = cy.getElementById(l.id)
      const data = { metricAB: l.metricAB, metricBA: l.metricBA }
      if (el.empty())
        cy.add({ group: 'edges', data: { id: l.id, source: l.a, target: l.b, ...data } })
      else el.data(data)
    }
    // A LAN is drawn as its pseudonode, in the middle of its members, with a spoke to
    // each. A spoke costs the member's metric one way and 0 back (ISO 10589 §7.2.3).
    for (const lan of lans) {
      const at = lan.members.map((m) => pos.get(m.node)!)
      const centre = {
        x: at.reduce((a, p) => a + p.x, 0) / at.length,
        y: at.reduce((a, p) => a + p.y, 0) / at.length,
      }
      const id = lanNodeId(lan.id)
      const el = cy.getElementById(id)
      if (el.empty())
        cy.add({
          group: 'nodes',
          data: { id, name: '', lan: lan.id },
          position: centre,
          classes: 'lan',
          grabbable: false,
        })
      else el.position(centre)
      for (const m of lan.members) {
        const sid = spokeId(lan.id, m.node)
        // The member's first link on the LAN stands for the spoke when it is clicked.
        const rep = t.links.find((l) => l.lan === lan.id && (l.a === m.node || l.b === m.node))
        const data = { metricAB: m.metric, metricBA: 0, lan: lan.id, member: m.node, rep: rep?.id }
        const e = cy.getElementById(sid)
        if (e.empty())
          cy.add({ group: 'edges', data: { id: sid, source: m.node, target: id, ...data } })
        else e.data(data)
      }
    }
  })
}

const HEAT_CLASSES = 'heat-full heat-most heat-part heat-low heat-idle'

const CLASSES = `${HEAT_CLASSES} overload p-space q-space pq spot faded down source dest sel link-start primary backup final primary-fwd primary-rev backup-fwd backup-rev final-fwd final-rev flowing failed packet-at packet-hop walk-stack walk-current`

export function decorate(
  cy: cytoscape.Core,
  t: Topology,
  h: Highlight,
  extra: {
    selection: string | null
    linkStart: NodeId | null
    failed: string[]
    /** Failed routers: greyed out, and every link they have is drawn as down. */
    failedNodes?: NodeId[]
    /** Coverage heat map: colour and percentage per router and link. */
    heat?: HeatMarks
  },
) {
  cy.batch(() => {
    cy.elements().removeClass(CLASSES)
    const failed = new Set(extra.failed)
    const downNodes = new Set(extra.failedNodes ?? [])
    const overloaded = new Set(t.nodes.filter((n) => n.overload === true).map((n) => n.id))
    cy.nodes().forEach((n) => {
      if (n.data('lan') !== undefined) {
        n.data('display', n.data('lan'))
        n.addClass('lan')
        return
      }
      const down = downNodes.has(n.id())
      const heat = extra.heat?.nodes[n.id()]
      const ol = overloaded.has(n.id())
      n.data(
        'display',
        nodeLabel(n.id(), n.data('name') || undefined, n.id() === h.pq, down, heat?.text, ol),
      )
      if (down) n.addClass('down')
      if (ol) n.addClass('overload')
      if (heat) n.addClass(`heat-${heat.level}`)
    })
    cy.edges().forEach((e) => {
      // A spoke is down when its router is, or all its links on the LAN are (D55).
      const lan = e.data('lan') as string | undefined
      const member = e.data('member') as NodeId | undefined
      const spokeDown =
        lan !== undefined &&
        t.links
          .filter((l) => l.lan === lan && (l.a === member || l.b === member))
          .every((l) => failed.has(l.id))
      const f =
        spokeDown ||
        failed.has(e.id()) ||
        downNodes.has(e.data('source')) ||
        downNodes.has(e.data('target'))
      const labels = edgeLabels(e.data('metricAB'), e.data('metricBA'), f)
      const heat = extra.heat?.links[e.id()]
      if (heat) {
        labels.label = [labels.label.trim(), heat.text].filter((x) => x).join(' · ')
        e.addClass(`heat-${heat.level}`)
      }
      e.data(labels)
      if (f) e.addClass('failed')
    })
    const add = (ids: NodeId[] | undefined, cls: string) => {
      for (const id of ids ?? []) cy.getElementById(id).addClass(cls)
    }
    add(h.pSpace, 'p-space')
    add(h.qSpace, 'q-space')
    add(h.pq === undefined ? [] : [h.pq], 'pq')
    if (h.spot) {
      const spot = new Set(h.spot)
      // S and D stay clear: RFC 7490 never lists them in a set, but they give the context.
      const keep = new Set([h.source, h.dest])
      cy.nodes().forEach((n) => {
        if (spot.has(n.id())) n.addClass('spot')
        else if (!keep.has(n.id())) n.addClass('faded')
      })
    }
    add(h.source === null ? [] : [h.source], 'source')
    add(h.dest === undefined ? [] : [h.dest], 'dest')
    if (extra.linkStart) cy.getElementById(extra.linkStart).addClass('link-start')
    if (extra.selection)
      for (const id of drawnEdges(t, extra.selection)) cy.getElementById(id).addClass('sel')

    const drawPath = (
      path: NodeId[] | undefined,
      links: (string | undefined)[] | undefined,
      kind: keyof typeof COLORS,
    ) => {
      const color = COLORS[kind]
      if (!path) return
      for (let i = 0; i + 1 < path.length; i++) {
        const [x, y] = [path[i]!, path[i + 1]!]
        const joins = (l: Topology['links'][number]) =>
          (l.a === x && l.b === y) || (l.a === y && l.b === x)
        const named = links?.[i]
        const link =
          t.links.find((l) => l.id === named && joins(l)) ?? t.links.find((l) => joins(l))
        if (!link) continue
        if (link.lan !== undefined) {
          // x → LAN → y: x's spoke runs member → LAN, y's spoke LAN → member (D55).
          const [out, into] = drawnEdges(t, link.id, x)
          cy.getElementById(out!).addClass(kind).addClass(`${kind}-fwd`).data('arrow', color)
          cy.getElementById(into!).addClass(kind).addClass(`${kind}-rev`).data('arrow', color)
          continue
        }
        const e = cy.getElementById(link.id)
        e.addClass(kind).addClass(link.a === x ? `${kind}-fwd` : `${kind}-rev`)
        e.data('arrow', color)
      }
    }
    drawPath(h.primary, h.primaryLinks, 'primary')
    drawPath(h.backup, h.backupLinks, 'backup')
    drawPath(h.final, h.finalLinks, 'final')
    if (h.flowing) cy.edges('.backup').addClass('flowing')
    if (h.packetAt !== undefined) cy.getElementById(h.packetAt).addClass('packet-at')
    if (h.packetLink !== undefined)
      for (const id of drawnEdges(t, h.packetLink)) cy.getElementById(id).addClass('packet-hop')
    for (const { link, lines, current } of h.packetStacks ?? []) {
      const e = cy.getElementById(drawnEdges(t, link)[0]!)
      if (e.empty()) continue
      const metric = e.data('label') as string
      e.data('label', [metric, ...lines].filter((x) => x !== '').join('\n'))
      e.addClass('walk-stack')
      if (current) e.addClass('walk-current')
    }
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

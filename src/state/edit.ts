// Topology edits for the canvas and properties panel (F1). Every function returns
// a NEW topology and never changes its input: the engine caches by object (D15).
import type { Link, NodeId, RouterNode, Topology } from '../engine/types'
import { MAX_LABEL, MAX_METRIC } from '../io/yaml'

export type EditResult = { ok: true; topology: Topology } | { ok: false; error: string }

export type Pos = { x: number; y: number }

/** Ids typed in the UI: letters, digits, "_" and "." (no "-", which joins link ids). */
const ID_PATTERN = /^[A-Za-z0-9_.]+$/

const fmt = (n: number) => n.toLocaleString('en-US')

const isWhole = (n: number, min: number, max: number) => Number.isInteger(n) && n >= min && n <= max

/** Same id format as the YAML loader, so saved files keep their link ids. */
export const linkId = (a: NodeId, b: NodeId) => `${a}-${b}`

/** First free "R<n>" id. */
export function nextRouterId(t: Topology): NodeId {
  const used = new Set(t.nodes.map((n) => n.id))
  let i = 1
  while (used.has(`R${i}`)) i++
  return `R${i}`
}

/** Lowest free SID index from 1. */
export function nextSidIndex(t: Topology): number {
  const used = new Set(t.nodes.map((n) => n.sidIndex))
  let i = 1
  while (used.has(i)) i++
  return i
}

export function addRouter(t: Topology, pos: Pos): { topology: Topology; id: NodeId } {
  const id = nextRouterId(t)
  const node: RouterNode = { id, sidIndex: nextSidIndex(t), pos: roundPos(pos) }
  return { topology: { ...t, nodes: [...t.nodes, node] }, id }
}

export function moveRouter(t: Topology, id: NodeId, pos: Pos): Topology {
  return { ...t, nodes: t.nodes.map((n) => (n.id === id ? { ...n, pos: roundPos(pos) } : n)) }
}

/** Removes the router and every link that touches it. */
export function deleteRouter(t: Topology, id: NodeId): Topology {
  return {
    ...t,
    nodes: t.nodes.filter((n) => n.id !== id),
    links: t.links.filter((l) => l.a !== id && l.b !== id),
  }
}

export function deleteLink(t: Topology, id: string): Topology {
  return { ...t, links: t.links.filter((l) => l.id !== id) }
}

/** New link with the same metric both ways. MVP rules: no self-loops, no parallel links (D4). */
export function addLink(t: Topology, a: NodeId, b: NodeId, metric = 10): EditResult {
  if (a === b) return { ok: false, error: "A link can't connect a router to itself." }
  if (!t.nodes.some((n) => n.id === a) || !t.nodes.some((n) => n.id === b))
    return { ok: false, error: 'Both ends must be existing routers.' }
  if (findLink(t, a, b)) return { ok: false, error: `${a} and ${b} are already linked.` }
  const link: Link = { id: linkId(a, b), a, b, metricAB: metric, metricBA: metric }
  return { ok: true, topology: { ...t, links: [...t.links, link] } }
}

export const findLink = (t: Topology, x: NodeId, y: NodeId): Link | undefined =>
  t.links.find((l) => (l.a === x && l.b === y) || (l.a === y && l.b === x))

export interface RouterPatch {
  id?: string
  /** Empty text removes the name. */
  name?: string
  sidIndex?: number
}

/** Change a router. Renaming also updates its links (ends and ids). */
export function updateRouter(t: Topology, id: NodeId, patch: RouterPatch): EditResult {
  const node = t.nodes.find((n) => n.id === id)
  if (!node) return { ok: false, error: `Router "${id}" does not exist.` }
  const next: RouterNode = { ...node }

  if (patch.id !== undefined && patch.id !== id) {
    const newId = patch.id.trim()
    if (!ID_PATTERN.test(newId))
      return { ok: false, error: 'Use letters, digits, "_" or "." only, e.g. R1.' }
    if (t.nodes.some((n) => n.id === newId))
      return { ok: false, error: `Id "${newId}" is already used.` }
    next.id = newId
  }
  if (patch.name !== undefined) {
    const name = patch.name.trim()
    if (name === '') delete next.name
    else next.name = name
  }
  if (patch.sidIndex !== undefined) {
    if (!isWhole(patch.sidIndex, 0, MAX_LABEL))
      return { ok: false, error: `SID index must be a whole number from 0 to ${fmt(MAX_LABEL)}.` }
    const owner = t.nodes.find((n) => n.id !== id && n.sidIndex === patch.sidIndex)
    if (owner) return { ok: false, error: `SID index ${patch.sidIndex} is used by ${owner.id}.` }
    next.sidIndex = patch.sidIndex
  }

  const rename = (x: NodeId) => (x === id ? next.id : x)
  return {
    ok: true,
    topology: {
      ...t,
      nodes: t.nodes.map((n) => (n.id === id ? next : n)),
      links:
        next.id === id
          ? t.links
          : t.links.map((l) => {
              if (l.a !== id && l.b !== id) return l
              const a = rename(l.a)
              const b = rename(l.b)
              return { ...l, a, b, id: linkId(a, b) }
            }),
    },
  }
}

export interface LinkPatch {
  metricAB?: number
  metricBA?: number
  /** null removes the label (it is then auto-assigned, D18). */
  adjSidAB?: number | null
  adjSidBA?: number | null
}

export function updateLink(t: Topology, id: string, patch: LinkPatch): EditResult {
  const link = t.links.find((l) => l.id === id)
  if (!link) return { ok: false, error: `Link "${id}" does not exist.` }
  const next: Link = { ...link }

  for (const key of ['metricAB', 'metricBA'] as const) {
    const m = patch[key]
    if (m === undefined) continue
    // IS-IS wide metrics are 24 bits (RFC 5305 §3.7).
    if (!isWhole(m, 1, MAX_METRIC))
      return { ok: false, error: `Metric must be a whole number from 1 to ${fmt(MAX_METRIC)}.` }
    next[key] = m
  }
  for (const key of ['adjSidAB', 'adjSidBA'] as const) {
    const v = patch[key]
    if (v === undefined) continue
    if (v === null) {
      delete next[key]
      continue
    }
    // MPLS labels are 20 bits (RFC 3032 §2.1).
    if (!isWhole(v, 0, MAX_LABEL))
      return { ok: false, error: `Adj-SID must be a whole number from 0 to ${fmt(MAX_LABEL)}.` }
    next[key] = v
  }
  return { ok: true, topology: { ...t, links: t.links.map((l) => (l.id === id ? next : l)) } }
}

export interface TopologyPatch {
  name?: string
  srgbBase?: number
}

export function updateTopology(t: Topology, patch: TopologyPatch): EditResult {
  const next = { ...t }
  if (patch.name !== undefined) next.name = patch.name.trim() || 'Untitled'
  if (patch.srgbBase !== undefined) {
    if (!isWhole(patch.srgbBase, 0, MAX_LABEL))
      return { ok: false, error: `SRGB base must be a whole number from 0 to ${fmt(MAX_LABEL)}.` }
    next.srgbBase = patch.srgbBase
  }
  return { ok: true, topology: next }
}

/**
 * Give every router without a position a place on a circle, so files written
 * by hand still draw. Routers that have a position keep it.
 */
export function withPositions(t: Topology): Topology {
  const missing = t.nodes.filter((n) => n.pos === undefined)
  if (missing.length === 0) return t
  const r = Math.max(150, missing.length * 30)
  const place = new Map(
    missing.map((n, i) => {
      const angle = (2 * Math.PI * i) / missing.length - Math.PI / 2
      return [n.id, roundPos({ x: r + r * Math.cos(angle), y: r + r * Math.sin(angle) })]
    }),
  )
  return { ...t, nodes: t.nodes.map((n) => (n.pos ? n : { ...n, pos: place.get(n.id)! })) }
}

const roundPos = (p: Pos): Pos => ({ x: Math.round(p.x), y: Math.round(p.y) })

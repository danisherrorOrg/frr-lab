// Topology edits for the canvas and properties panel (F1). Every function returns
// a NEW topology and never changes its input: the engine caches by object (D15).
import type { LfaPolicy, Link, NodeId, RouterNode, Topology } from '../engine/types'
import { ID_PATTERN, MAX_LABEL, MAX_METRIC, MAX_MSD, MIN_MSD, uniqueLinkId } from '../io/yaml'
// BMI-MSD is one octet (RFC 8491 §2); below 2 not even a Remote LFA tunnel fits.
const msdError = `Max SID depth must be a whole number from ${MIN_MSD} to ${MAX_MSD}, or empty for no limit.`

export type EditResult = { ok: true; topology: Topology } | { ok: false; error: string }

export type Pos = { x: number; y: number }

const fmt = (n: number) => n.toLocaleString('en-US')

const isWhole = (n: number, min: number, max: number) => Number.isInteger(n) && n >= min && n <= max

/** Same id format as the YAML loader, so saved files keep their link ids. */
export const linkId = (a: NodeId, b: NodeId) => `${a}-${b}`

/** A free id for a new link a–b: "a-b", or "a-b#2"… for a parallel link (D29). */
export const newLinkId = (t: Topology, a: NodeId, b: NodeId) =>
  uniqueLinkId(linkId(a, b), new Set(t.links.map((l) => l.id)))

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

/** A free spot for a router added from the keyboard: right of the others, at their middle height. */
export function freePosition(t: Topology): Pos {
  const placed = t.nodes.flatMap((n) => (n.pos ? [n.pos] : []))
  if (placed.length === 0) return { x: 0, y: 0 }
  const maxX = Math.max(...placed.map((p) => p.x))
  const midY = placed.reduce((sum, p) => sum + p.y, 0) / placed.length
  return { x: maxX + 120, y: Math.round(midY) }
}

export function moveRouter(t: Topology, id: NodeId, pos: Pos): Topology {
  return { ...t, nodes: t.nodes.map((n) => (n.id === id ? { ...n, pos: roundPos(pos) } : n)) }
}

/** Removes the router and every link that touches it, and takes it off LFA exclude lists. */
export function deleteRouter(t: Topology, id: NodeId): Topology {
  return {
    ...t,
    nodes: t.nodes
      .filter((n) => n.id !== id)
      .map((n) =>
        withExclude(
          n,
          n.lfaExclude?.filter((x) => x !== id),
        ),
      ),
    links: t.links.filter((l) => l.a !== id && l.b !== id),
  }
}

/** The router with this exclude list; an empty list removes the field. */
function withExclude(n: RouterNode, list: NodeId[] | undefined): RouterNode {
  if (list === n.lfaExclude) return n
  const next = { ...n }
  if (list === undefined || list.length === 0) delete next.lfaExclude
  else next.lfaExclude = list
  return next
}

export function deleteLink(t: Topology, id: string): Topology {
  return { ...t, links: t.links.filter((l) => l.id !== id) }
}

/**
 * New link with the same metric both ways. No self-loops. A second link between
 * the same routers is a parallel link with its own id, e.g. "S-E#2" (D29).
 */
export function addLink(t: Topology, a: NodeId, b: NodeId, metric = 10): EditResult {
  if (a === b) return { ok: false, error: "A link can't connect a router to itself." }
  if (!t.nodes.some((n) => n.id === a) || !t.nodes.some((n) => n.id === b))
    return { ok: false, error: 'Both ends must be existing routers.' }
  const link: Link = { id: newLinkId(t, a, b), a, b, metricAB: metric, metricBA: metric }
  return { ok: true, topology: { ...t, links: [...t.links, link] } }
}

export interface RouterPatch {
  id?: string
  /** Empty text removes the name. */
  name?: string
  sidIndex?: number
  /** Max SID depth; null removes it (the router then uses the network's, D44). */
  msd?: number | null
  /** Neighbors never used as an LFA (RFC 7916 §6.2.4.4, D45); [] removes the list. */
  lfaExclude?: NodeId[]
}

/** Change a router. Renaming also updates its links (ends and ids) and other routers' exclude lists. */
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
  if (patch.msd === null) delete next.msd
  else if (patch.msd !== undefined) {
    if (!isWhole(patch.msd, MIN_MSD, MAX_MSD)) return { ok: false, error: msdError }
    next.msd = patch.msd
  }
  if (patch.lfaExclude !== undefined) {
    const list = [...new Set(patch.lfaExclude.map((x) => x.trim()).filter((x) => x !== ''))]
    const unknown = list.filter((x) => !t.nodes.some((n) => n.id === x))
    if (unknown.length > 0) return { ok: false, error: `No router called ${unknown.join(', ')}.` }
    if (list.includes(id)) return { ok: false, error: "A router can't exclude itself." }
    if (list.length === 0) delete next.lfaExclude
    else next.lfaExclude = list.sort()
  }

  const rename = (x: NodeId) => (x === id ? next.id : x)
  // Renamed links get new ids; parallel ones are numbered again in file order (D29).
  const taken = new Set(t.links.filter((l) => l.a !== id && l.b !== id).map((l) => l.id))
  const links =
    next.id === id
      ? t.links
      : t.links.map((l) => {
          if (l.a !== id && l.b !== id) return l
          const a = rename(l.a)
          const b = rename(l.b)
          const newId = uniqueLinkId(linkId(a, b), taken)
          taken.add(newId)
          return { ...l, a, b, id: newId }
        })
  const nodes = t.nodes.map((n) => {
    const me = n.id === id ? next : n
    if (next.id === id || me.lfaExclude === undefined) return me
    return withExclude(me, me.lfaExclude.map(rename).sort())
  })
  return { ok: true, topology: { ...t, nodes, links } }
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
  /** Max SID depth of every router; null = no limit (D44). */
  msd?: number | null
  /** Merged into the LFA policy; `prefer` is the default, so it is not stored (D45). */
  lfaPolicy?: LfaPolicy
}

export function updateTopology(t: Topology, patch: TopologyPatch): EditResult {
  const next = { ...t }
  if (patch.name !== undefined) next.name = patch.name.trim() || 'Untitled'
  if (patch.srgbBase !== undefined) {
    if (!isWhole(patch.srgbBase, 0, MAX_LABEL))
      return { ok: false, error: `SRGB base must be a whole number from 0 to ${fmt(MAX_LABEL)}.` }
    next.srgbBase = patch.srgbBase
  }
  if (patch.msd === null) delete next.msd
  else if (patch.msd !== undefined) {
    if (!isWhole(patch.msd, MIN_MSD, MAX_MSD)) return { ok: false, error: msdError }
    next.msd = patch.msd
  }
  if (patch.lfaPolicy !== undefined) {
    const merged: LfaPolicy = { ...t.lfaPolicy, ...patch.lfaPolicy }
    const policy: LfaPolicy = {}
    if (merged.nodeProtecting !== undefined && merged.nodeProtecting !== 'prefer')
      policy.nodeProtecting = merged.nodeProtecting
    if (merged.downstream !== undefined && merged.downstream !== 'prefer')
      policy.downstream = merged.downstream
    if (Object.keys(policy).length === 0) delete next.lfaPolicy
    else next.lfaPolicy = policy
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

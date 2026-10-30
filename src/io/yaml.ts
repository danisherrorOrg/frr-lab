import { CORE_SCHEMA, dump, load } from 'js-yaml'
import type { Link, NodeId, RouterNode, Topology } from '../engine/types'

// Topology YAML format and validation rules: docs/03-architecture.md §5.

export type ParseResult =
  { ok: true; topology: Topology; warnings: string[] } | { ok: false; errors: string[] }

export const DEFAULT_SRGB_BASE = 16000
// IS-IS wide metrics are 24 bits (RFC 5305 §3.7).
export const MAX_METRIC = 16_777_215
// MPLS labels are 20 bits (RFC 3032 §2.1).
export const MAX_LABEL = 1_048_575

type Raw = Record<string, unknown>

const isMap = (v: unknown): v is Raw => typeof v === 'object' && v !== null && !Array.isArray(v)

const isWhole = (v: unknown, min: number, max: number): v is number =>
  typeof v === 'number' && Number.isInteger(v) && v >= min && v <= max

const fmt = (n: number) => n.toLocaleString('en-US')

/** Parse and validate a topology file. Collects every problem instead of stopping at the first. */
export function parseTopology(text: string): ParseResult {
  let doc: unknown
  try {
    // CORE_SCHEMA = plain YAML types only; custom tags like !!js/function are rejected.
    doc = load(text, { schema: CORE_SCHEMA })
  } catch (e) {
    const reason = e instanceof Error ? e.message.split('\n')[0] : String(e)
    return { ok: false, errors: [`The file is not valid YAML: ${reason}`] }
  }
  if (!isMap(doc)) {
    return {
      ok: false,
      errors: ['The file must be a YAML mapping with "name", "nodes" and "links".'],
    }
  }

  const errors: string[] = []

  let name = 'Untitled'
  if (doc.name !== undefined) {
    if (typeof doc.name === 'string') name = doc.name
    else errors.push('"name" must be text.')
  }

  let srgbBase = DEFAULT_SRGB_BASE
  if (doc.srgb_base !== undefined) {
    if (isWhole(doc.srgb_base, 0, MAX_LABEL)) srgbBase = doc.srgb_base
    else errors.push(`"srgb_base" must be a whole number from 0 to ${fmt(MAX_LABEL)}.`)
  }

  const nodes = parseNodes(doc.nodes, errors)
  const links = parseLinks(doc.links, new Set(nodes.map((n) => n.id)), errors)

  if (errors.length > 0) return { ok: false, errors }
  return {
    ok: true,
    topology: { name, srgbBase, nodes, links },
    warnings: connectivityWarnings(nodes, links),
  }
}

function parseNodes(raw: unknown, errors: string[]): RouterNode[] {
  if (!Array.isArray(raw)) {
    errors.push('"nodes" must be a list of routers.')
    return []
  }
  const nodes: RouterNode[] = []
  const ids = new Set<NodeId>()
  const sidOwner = new Map<number, NodeId>()

  raw.forEach((item, i) => {
    const where = `Node #${i + 1}`
    if (!isMap(item)) {
      errors.push(`${where}: must be a mapping like { id: S, sid: 1 }.`)
      return
    }
    const { id, sid, name, pos } = item
    if (typeof id !== 'string' || id === '') {
      errors.push(`${where}: "id" must be text, e.g. R1 (put numbers in quotes).`)
      return
    }
    const label = `${where} (${id})`
    let valid = true

    if (ids.has(id)) {
      errors.push(`${where}: id "${id}" is already used.`)
      valid = false
    }
    ids.add(id)

    if (!isWhole(sid, 0, MAX_LABEL)) {
      errors.push(`${label}: "sid" must be a whole number from 0 to ${fmt(MAX_LABEL)}.`)
      valid = false
    } else {
      const owner = sidOwner.get(sid)
      if (owner !== undefined) {
        errors.push(`${label}: SID index ${sid} is already used by ${owner}.`)
        valid = false
      } else {
        sidOwner.set(sid, id)
      }
    }

    if (name !== undefined && typeof name !== 'string') {
      errors.push(`${label}: "name" must be text.`)
      valid = false
    }
    const isPos = isMap(pos) && Number.isFinite(pos.x) && Number.isFinite(pos.y)
    if (pos !== undefined && !isPos) {
      errors.push(`${label}: "pos" must look like { x: 10, y: 20 }.`)
      valid = false
    }

    if (!valid || !isWhole(sid, 0, MAX_LABEL)) return
    const node: RouterNode = { id, sidIndex: sid }
    if (typeof name === 'string') node.name = name
    if (isPos) node.pos = { x: pos.x as number, y: pos.y as number }
    nodes.push(node)
  })
  return nodes
}

function parseLinks(raw: unknown, nodeIds: Set<NodeId>, errors: string[]): Link[] {
  if (raw === undefined || raw === null) return []
  if (!Array.isArray(raw)) {
    errors.push('"links" must be a list.')
    return []
  }
  const links: Link[] = []
  // Unordered pair → link number, to catch parallel links in either direction (MVP: D4).
  const pairs = new Map<string, number>()

  raw.forEach((item, i) => {
    const where = `Link #${i + 1}`
    if (!isMap(item)) {
      errors.push(`${where}: must be a mapping like { a: S, b: E, metric: 10 }.`)
      return
    }
    const { a, b, metric, metric_ba, adj_sid_ab, adj_sid_ba } = item
    if (typeof a !== 'string' || typeof b !== 'string') {
      errors.push(`${where}: "a" and "b" must be router ids.`)
      return
    }
    const label = `${where} (${a}–${b})`
    let valid = true
    const fail = (msg: string) => {
      errors.push(`${label}: ${msg}`)
      valid = false
    }

    for (const end of a === b ? [a] : [a, b]) {
      if (!nodeIds.has(end)) fail(`node "${end}" does not exist.`)
    }
    if (a === b) fail("a link can't connect a router to itself.")

    const pair = [a, b].sort().join('\u0000')
    const earlier = pairs.get(pair)
    if (earlier !== undefined && a !== b)
      fail(`${a} and ${b} are already linked by link #${earlier}.`)
    else pairs.set(pair, i + 1)

    const metricRule = `must be a whole number from 1 to ${fmt(MAX_METRIC)}.`
    if (!isWhole(metric, 1, MAX_METRIC)) fail(`"metric" ${metricRule}`)
    if (metric_ba !== undefined && !isWhole(metric_ba, 1, MAX_METRIC))
      fail(`"metric_ba" ${metricRule}`)

    const labelRule = `must be a whole number from 0 to ${fmt(MAX_LABEL)}.`
    if (adj_sid_ab !== undefined && !isWhole(adj_sid_ab, 0, MAX_LABEL))
      fail(`"adj_sid_ab" ${labelRule}`)
    if (adj_sid_ba !== undefined && !isWhole(adj_sid_ba, 0, MAX_LABEL))
      fail(`"adj_sid_ba" ${labelRule}`)

    if (!valid) return
    const metricAB = metric as number
    const link: Link = {
      id: `${a}-${b}`,
      a,
      b,
      metricAB,
      metricBA: (metric_ba as number | undefined) ?? metricAB,
    }
    if (adj_sid_ab !== undefined) link.adjSidAB = adj_sid_ab as number
    if (adj_sid_ba !== undefined) link.adjSidBA = adj_sid_ba as number
    links.push(link)
  })
  return links
}

/** Warn, don't block: a disconnected network is still worth looking at (docs/03-architecture.md §5). */
function connectivityWarnings(nodes: RouterNode[], links: Link[]): string[] {
  const first = nodes[0]
  if (first === undefined) return []
  const neighbors = new Map<NodeId, NodeId[]>(nodes.map((n) => [n.id, []]))
  for (const { a, b } of links) {
    neighbors.get(a)?.push(b)
    neighbors.get(b)?.push(a)
  }
  const seen = new Set<NodeId>([first.id])
  const queue = [first.id]
  for (let next = queue.shift(); next !== undefined; next = queue.shift()) {
    for (const n of neighbors.get(next) ?? []) {
      if (!seen.has(n)) {
        seen.add(n)
        queue.push(n)
      }
    }
  }
  const unreachable = nodes.filter((n) => !seen.has(n.id)).map((n) => n.id)
  if (unreachable.length === 0) return []
  return [`The network is not connected: ${first.id} can't reach ${unreachable.join(', ')}.`]
}

/** Write a topology in the same format `parseTopology` reads. */
export function serializeTopology(topology: Topology): string {
  const doc = {
    name: topology.name,
    srgb_base: topology.srgbBase,
    nodes: topology.nodes.map((n) => ({
      id: n.id,
      sid: n.sidIndex,
      ...(n.name !== undefined && { name: n.name }),
      ...(n.pos !== undefined && { pos: { x: n.pos.x, y: n.pos.y } }),
    })),
    links: topology.links.map((l) => ({
      a: l.a,
      b: l.b,
      metric: l.metricAB,
      ...(l.metricBA !== l.metricAB && { metric_ba: l.metricBA }),
      ...(l.adjSidAB !== undefined && { adj_sid_ab: l.adjSidAB }),
      ...(l.adjSidBA !== undefined && { adj_sid_ba: l.adjSidBA }),
    })),
  }
  // flowLevel 2 writes one router or link per line, like the example files.
  return dump(doc, { schema: CORE_SCHEMA, flowLevel: 2, lineWidth: -1 })
}

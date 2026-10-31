import { CORE_SCHEMA, dump, load } from 'js-yaml'
import type { Link, NodeId, RouterNode, Topology } from '../engine/types'
import {
  DEFAULT_SRGB_BASE,
  ID_PATTERN,
  KEY_ALIASES,
  LINK_FIELDS,
  MAX_LABEL,
  MAX_METRIC,
  NODE_FIELDS,
  TOP_FIELDS,
} from './yaml-format'

// Topology YAML format and validation rules: docs/03-architecture.md §5.

export type ParseResult =
  { ok: true; topology: Topology; warnings: string[] } | { ok: false; errors: string[] }

export { DEFAULT_SRGB_BASE, ID_PATTERN, MAX_LABEL, MAX_METRIC } from './yaml-format'

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
    return { ok: false, errors: [syntaxError(e)] }
  }
  if (doc === undefined || doc === null) {
    return { ok: false, errors: ['The file is empty. See the YAML format guide for an example.'] }
  }
  if (!isMap(doc)) {
    return {
      ok: false,
      errors: ['The file must be a YAML mapping with "name", "nodes" and "links".'],
    }
  }

  const errors: string[] = []
  unknownKeys(doc, TOP_FIELDS, (key, hint) => errors.push(`Unknown key "${key}". ${hint}`))

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

  const { nodes, declared } = parseNodes(doc.nodes, errors)
  const links = parseLinks(doc.links, declared, errors)

  if (errors.length > 0) return { ok: false, errors }
  return {
    ok: true,
    topology: { name, srgbBase, nodes, links },
    warnings: connectivityWarnings(nodes, links),
  }
}

/** js-yaml's error as one line with its position (lines and columns counted from 1). */
function syntaxError(e: unknown): string {
  const err = e as { reason?: unknown; mark?: { line?: unknown; column?: unknown } }
  const reason =
    typeof err.reason === 'string'
      ? err.reason
      : (e instanceof Error ? e.message : String(e)).split('\n')[0]
  const { line, column } = err.mark ?? {}
  const where =
    typeof line === 'number' && typeof column === 'number'
      ? ` (line ${line + 1}, column ${column + 1})`
      : ''
  const hint = /\btab/.test(reason ?? '') ? '. Indent with spaces: use spaces, not tabs' : ''
  return `The file is not valid YAML${where}: ${reason}${hint}.`
}

/** Edit distance, to suggest "metric" for "metrc". Keys are short, so the simple table is fine. */
function distance(a: string, b: string): number {
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j)
  for (let i = 1; i <= a.length; i++) {
    const cur = [i]
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(
        prev[j]! + 1,
        cur[j - 1]! + 1,
        prev[j - 1]! + (a[i - 1] === b[j - 1] ? 0 : 1),
      )
    }
    prev = cur
  }
  return prev[b.length]!
}

/**
 * Report keys the format doesn't have. Without this a typo like "metrc" or "adj_sid"
 * is dropped without a word and the network silently differs from the file.
 */
function unknownKeys(
  map: Raw,
  fields: { key: string }[],
  report: (key: string, hint: string) => void,
) {
  const known = fields.map((f) => f.key)
  for (const key of Object.keys(map)) {
    if (known.includes(key)) continue
    const lower = key.toLowerCase()
    const alias = KEY_ALIASES[lower]
    const close = known
      .map((k) => ({ k, d: distance(lower, k) }))
      .filter(({ k, d }) => d <= (k.length <= 3 ? 1 : 2))
      .sort((x, y) => x.d - y.d)[0]?.k
    const guess = alias !== undefined && known.includes(alias) ? alias : close
    report(
      key,
      guess !== undefined ? `Did you mean "${guess}"?` : `Allowed keys: ${known.join(', ')}.`,
    )
  }
}

/** A short view of a bad list item for the error text. */
const shown = (v: unknown) => {
  const text = typeof v === 'string' ? v : (JSON.stringify(v) ?? String(v))
  return text.length > 30 ? `${text.slice(0, 30)}…` : text
}

/** The routers that load, plus every id the file declares (so links to a router with another error don't also say "does not exist"). */
function parseNodes(
  raw: unknown,
  errors: string[],
): { nodes: RouterNode[]; declared: Set<NodeId> } {
  const declared = new Set<NodeId>()
  if (!Array.isArray(raw)) {
    errors.push('"nodes" must be a list of routers.')
    return { nodes: [], declared }
  }
  const nodes: RouterNode[] = []
  const ids = new Map<NodeId, number>()
  const sidOwner = new Map<number, NodeId>()

  raw.forEach((item, i) => {
    const where = `Node #${i + 1}`
    if (!isMap(item)) {
      errors.push(`${where}: must be a mapping like { id: S, sid: 1 }, not "${shown(item)}".`)
      return
    }
    const { id, sid, name, pos } = item
    const named = typeof id === 'string' && id !== '' ? `${where} (${id})` : where
    unknownKeys(item, NODE_FIELDS, (key, hint) =>
      errors.push(`${named}: unknown field "${key}". ${hint}`),
    )
    if (typeof id !== 'string' || id === '') {
      errors.push(`${where}: "id" must be text, e.g. R1 (put numbers in quotes).`)
      return
    }
    declared.add(id)
    const label = named
    let valid = true

    if (!ID_PATTERN.test(id)) {
      errors.push(
        `${where}: id "${id}" can only use letters, digits, "_" and "." (no spaces or "-").`,
      )
      valid = false
    }
    const first = ids.get(id)
    if (first !== undefined) {
      errors.push(`${where}: id "${id}" is already used by Node #${first}.`)
      valid = false
    } else {
      ids.set(id, i + 1)
    }

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
  return { nodes, declared }
}

function parseLinks(raw: unknown, nodeIds: Set<NodeId>, errors: string[]): Link[] {
  if (raw === undefined || raw === null) return []
  if (!Array.isArray(raw)) {
    errors.push('"links" must be a list.')
    return []
  }
  const links: Link[] = []
  const ids = new Set<string>()

  raw.forEach((item, i) => {
    const where = `Link #${i + 1}`
    if (!isMap(item)) {
      errors.push(
        `${where}: must be a mapping like { a: S, b: E, metric: 10 }, not "${shown(item)}".`,
      )
      return
    }
    const { a, b, metric, metric_ba, adj_sid_ab, adj_sid_ba } = item
    const named = typeof a === 'string' && typeof b === 'string' ? `${where} (${a}–${b})` : where
    unknownKeys(item, LINK_FIELDS, (key, hint) =>
      errors.push(`${named}: unknown field "${key}". ${hint}`),
    )
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
    // Parallel links are allowed (D29): the second S–E link gets id "S-E#2", and so on.
    const id = uniqueLinkId(`${a}-${b}`, ids)
    ids.add(id)
    const link: Link = {
      id,
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

/**
 * `base`, or `base#2`, `base#3`… if taken. Link ids come from the ends (D14), so
 * parallel links need a number; "#" never appears in ids typed in the UI (D21).
 */
export function uniqueLinkId(base: string, taken: { has: (id: string) => boolean }): string {
  if (!taken.has(base)) return base
  let n = 2
  while (taken.has(`${base}#${n}`)) n++
  return `${base}#${n}`
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

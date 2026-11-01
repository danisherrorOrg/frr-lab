import { CORE_SCHEMA, dump, load } from 'js-yaml'
import { expandLans } from '../engine/lan'
import type {
  FlexAlgo,
  LfaPolicy,
  LfaPreference,
  Link,
  Lan,
  NodeId,
  ProtectionGoal,
  RouterNode,
  Topology,
} from '../engine/types'
import {
  DEFAULT_SRGB_BASE,
  FLEX_ALGO_FIELDS,
  FLEX_METRICS,
  ID_PATTERN,
  KEY_ALIASES,
  LOCATOR_PATTERN,
  LAN_FIELDS,
  LAN_MEMBER_FIELDS,
  LFA_POLICY_FIELDS,
  LFA_PREFERENCES,
  LINK_FIELDS,
  MAX_LABEL,
  MAX_METRIC,
  MAX_MSD,
  MIN_MSD,
  NODE_FIELDS,
  ROUTER_LEVELS,
  PROTECTION_GOALS,
  SRLG_PATTERN,
  TOP_FIELDS,
} from './yaml-format'

// Topology YAML format and validation rules: docs/03-architecture.md §5.

export type ParseResult =
  { ok: true; topology: Topology; warnings: string[] } | { ok: false; errors: string[] }

export {
  DEFAULT_SRGB_BASE,
  ID_PATTERN,
  MAX_LABEL,
  MAX_METRIC,
  MAX_MSD,
  MIN_MSD,
} from './yaml-format'

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

  let msd: number | undefined
  if (doc.msd !== undefined) {
    if (isWhole(doc.msd, MIN_MSD, MAX_MSD)) msd = doc.msd
    else errors.push(`"msd" ${msdRule}`)
  }

  const lfaPolicy = parseLfaPolicy(doc.lfa_policy, errors)
  let protection: ProtectionGoal | undefined
  if (doc.protection !== undefined) {
    if ((PROTECTION_GOALS as readonly unknown[]).includes(doc.protection))
      protection = doc.protection as ProtectionGoal
    else
      errors.push(
        `"protection" must be one of ${PROTECTION_GOALS.join(', ')}, not "${shown(doc.protection)}".`,
      )
  }
  const { nodes, declared } = parseNodes(doc.nodes, errors)
  const links = parseLinks(doc.links, declared, errors)
  const lans = parseLans(doc.lans, declared, errors)
  const flexAlgos = parseFlexAlgos(doc.flex_algo, errors)
  let dataplane: 'srv6' | undefined
  if (doc.dataplane !== undefined) {
    if (doc.dataplane === 'srv6') dataplane = 'srv6'
    else if (doc.dataplane !== 'mpls')
      errors.push(`"dataplane" must be mpls or srv6, not "${shown(doc.dataplane)}".`)
  }
  flexChecks(nodes, flexAlgos, errors)

  if (errors.length > 0) return { ok: false, errors }
  return {
    ok: true,
    // LAN member-to-member links come from `lans` (D55).
    topology: expandLans({
      name,
      srgbBase,
      ...(msd !== undefined && { msd }),
      ...(lfaPolicy !== undefined && { lfaPolicy }),
      // Only a non-default goal is stored (D51).
      ...(protection !== undefined && protection !== 'link' && { protection }),
      ...(flexAlgos.length > 0 && { flexAlgos }),
      ...(dataplane !== undefined && { dataplane }),
      nodes,
      links,
      ...(lans.length > 0 && { lans }),
    }),
    warnings: [
      ...connectivityWarnings(nodes, [...links, ...lans.flatMap(lanPairs)]),
      ...excludeWarnings(nodes, [...links, ...lans.flatMap(lanPairs)]),
    ],
  }
}

const isPreference = (v: unknown): v is LfaPreference =>
  (LFA_PREFERENCES as readonly unknown[]).includes(v)

/** `lfa_policy: { node_protecting: require, downstream: ignore }` (RFC 7916 §6.2, D45). */
function parseLfaPolicy(raw: unknown, errors: string[]): LfaPolicy | undefined {
  if (raw === undefined || raw === null) return undefined
  if (!isMap(raw)) {
    errors.push(
      '"lfa_policy" must be a mapping like { node_protecting: prefer, downstream: prefer }.',
    )
    return undefined
  }
  unknownKeys(raw, LFA_POLICY_FIELDS, (key, hint) =>
    errors.push(`lfa_policy: unknown field "${key}". ${hint}`),
  )
  const policy: LfaPolicy = {}
  for (const [key, field] of [
    ['node_protecting', 'nodeProtecting'],
    ['downstream', 'downstream'],
  ] as const) {
    const v = raw[key]
    if (v === undefined) continue
    if (isPreference(v)) policy[field] = v
    else
      errors.push(
        `lfa_policy: "${key}" must be one of ${LFA_PREFERENCES.join(', ')}, not "${shown(v)}".`,
      )
  }
  return policy
}

/** An excluded router that isn't a neighbor does nothing: say so, it is likely a mistake. */
function excludeWarnings(nodes: RouterNode[], links: Link[]): string[] {
  return nodes.flatMap((n) => {
    const neighbors = new Set(
      links.flatMap((l) => (l.a === n.id ? [l.b] : l.b === n.id ? [l.a] : [])),
    )
    const stray = (n.lfaExclude ?? []).filter((x) => !neighbors.has(x))
    return stray.length === 0
      ? []
      : [
          `${n.id}'s lfa_exclude lists ${stray.join(', ')}, not a neighbor of ${n.id}: it has no effect.`,
        ]
  })
}

/** A LAN's members as point-to-point pairs, for the connectivity and neighbor checks. */
const lanPairs = (lan: Lan): Link[] =>
  lan.members.slice(1).map((m) => ({
    id: '',
    a: lan.members[0]!.node,
    b: m.node,
    metricAB: 1,
    metricBA: 1,
  }))

/**
 * `lans: [{ id: LAN1, metric: 10, members: [A, B, { node: C, metric: 20 }] }]` (D55).
 * Ids share one namespace with routers: the canvas draws a LAN as its own shape.
 */
function parseLans(raw: unknown, routers: Set<NodeId>, errors: string[]): Lan[] {
  if (raw === undefined || raw === null) return []
  if (!Array.isArray(raw)) {
    errors.push('"lans" must be a list of LANs.')
    return []
  }
  const lans: Lan[] = []
  const ids = new Set<string>()
  raw.forEach((item, i) => {
    const where = `LAN #${i + 1}`
    if (!isMap(item)) {
      errors.push(`${where}: must be a mapping like { id: LAN1, metric: 10, members: [A, B] }.`)
      return
    }
    const { id, metric, members, level } = item
    const named = typeof id === 'string' ? `${where} (${id})` : where
    const lvl = level === undefined ? undefined : String(level)
    if (lvl !== undefined && lvl !== '1' && lvl !== '2') {
      errors.push(`${named}: "level" must be 1 or 2.`)
      return
    }
    unknownKeys(item, LAN_FIELDS, (key, hint) =>
      errors.push(`${named}: unknown field "${key}". ${hint}`),
    )
    if (typeof id !== 'string' || !ID_PATTERN.test(id)) {
      errors.push(`${where}: "id" must use letters, digits, "_" and "." only, e.g. LAN1.`)
      return
    }
    if (routers.has(id) || ids.has(id)) {
      errors.push(`${named}: id "${id}" is already used by a router or LAN.`)
      return
    }
    ids.add(id)
    const metricRule = `must be a whole number from 1 to ${fmt(MAX_METRIC)}.`
    if (metric !== undefined && !isWhole(metric, 1, MAX_METRIC)) {
      errors.push(`${named}: "metric" ${metricRule}`)
      return
    }
    if (!Array.isArray(members) || members.length < 2) {
      errors.push(`${named}: "members" must list at least two routers.`)
      return
    }
    const out: Lan['members'] = []
    let valid = true
    for (const m of members) {
      const node = typeof m === 'string' ? m : isMap(m) ? m.node : undefined
      const own = isMap(m) ? m.metric : undefined
      if (isMap(m))
        unknownKeys(m, LAN_MEMBER_FIELDS, (key, hint) =>
          errors.push(`${named}: member: unknown field "${key}". ${hint}`),
        )
      if (typeof node !== 'string' || !routers.has(node)) {
        errors.push(`${named}: member "${shown(node ?? m)}" is not a router in nodes.`)
        valid = false
        continue
      }
      if (out.some((x) => x.node === node)) {
        errors.push(`${named}: ${node} is listed twice.`)
        valid = false
        continue
      }
      const value = own ?? metric
      if (!isWhole(value, 1, MAX_METRIC)) {
        errors.push(
          own === undefined
            ? `${named}: ${node} has no metric: give the LAN a "metric" or the member its own.`
            : `${named}: ${node}'s metric ${metricRule}`,
        )
        valid = false
        continue
      }
      out.push({ node, metric: value })
    }
    if (valid)
      lans.push({
        id,
        members: out.sort((a, b) => (a.node < b.node ? -1 : 1)),
        ...((lvl === '1' || lvl === '2') && { level: lvl }),
      })
  })
  return lans
}

const isNames = (v: unknown): v is string[] =>
  Array.isArray(v) && v.every((x) => typeof x === 'string' && SRLG_PATTERN.test(x))

/** `flex_algo: [{ algo: 128, metric: delay, exclude_any: [red] }]` (RFC 9350, D58). */
function parseFlexAlgos(raw: unknown, errors: string[]): FlexAlgo[] {
  if (raw === undefined || raw === null) return []
  if (!Array.isArray(raw)) {
    errors.push('"flex_algo" must be a list like [{ algo: 128, metric: delay }].')
    return []
  }
  const out: FlexAlgo[] = []
  raw.forEach((item, i) => {
    const where = `Flex-Algo #${i + 1}`
    if (!isMap(item)) {
      errors.push(`${where}: must be a mapping like { algo: 128, metric: delay }.`)
      return
    }
    unknownKeys(item, FLEX_ALGO_FIELDS, (key, hint) =>
      errors.push(`${where}: unknown field "${key}". ${hint}`),
    )
    const { algo, metric, exclude_any, include_any, include_all } = item
    if (!isWhole(algo, 128, 255)) {
      errors.push(`${where}: "algo" must be a whole number from 128 to 255 (RFC 9350 §4).`)
      return
    }
    if (out.some((f) => f.algo === algo)) {
      errors.push(`${where}: algorithm ${algo} is defined twice.`)
      return
    }
    if (metric !== undefined && !(FLEX_METRICS as readonly unknown[]).includes(metric)) {
      errors.push(`${where}: "metric" must be igp, te or delay.`)
      return
    }
    const fa: FlexAlgo = { algo }
    if (metric !== undefined && metric !== 'igp') fa.metric = metric as 'te' | 'delay'
    for (const [key, field, v] of [
      ['exclude_any', 'excludeAny', exclude_any],
      ['include_any', 'includeAny', include_any],
      ['include_all', 'includeAll', include_all],
    ] as const) {
      if (v === undefined) continue
      if (!isNames(v)) {
        errors.push(`${where}: "${key}" must be a list of affinity names, like [red].`)
        return
      }
      if (v.length > 0) fa[field] = [...new Set(v)].sort()
    }
    out.push(fa)
  })
  return out.sort((a, b) => a.algo - b.algo)
}

/** Routers name only defined algorithms, and Prefix-SIDs stay unique per algorithm. */
function flexChecks(nodes: RouterNode[], algos: FlexAlgo[], errors: string[]) {
  const defined = new Set(algos.map((f) => f.algo))
  for (const n of nodes) {
    for (const a of n.algos ?? [])
      if (!defined.has(a))
        errors.push(`Node ${n.id}: "algos" lists ${a}, which flex_algo doesn't define.`)
    for (const a of Object.keys(n.algoSids ?? {}).map(Number))
      if (!defined.has(a))
        errors.push(`Node ${n.id}: "algo_sids" gives ${a}, which flex_algo doesn't define.`)
  }
  // One SRGB for every algorithm: an index can only mean one (router, algorithm) (RFC 8667 §2.1).
  const owner = new Map<number, string>(nodes.map((n) => [n.sidIndex, n.id]))
  for (const [k, fa] of algos.entries()) {
    for (const n of nodes) {
      if (n.algos !== undefined && !n.algos.includes(fa.algo)) continue
      const sid = n.algoSids?.[fa.algo] ?? n.sidIndex + 1000 * (k + 1)
      const other = owner.get(sid)
      const me = `${n.id} in Flex-Algo ${fa.algo}`
      if (other !== undefined)
        errors.push(`Prefix-SID index ${sid} is used by both ${other} and ${me}; set algo_sids.`)
      else owner.set(sid, me)
    }
  }
}

const msdRule = `(max SID depth) must be a whole number from ${MIN_MSD} to ${MAX_MSD}.`

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
    const {
      id,
      sid,
      name,
      pos,
      msd,
      overload,
      lfa_exclude: exclude,
      level,
      area,
      algos,
      algo_sids: algoSids,
      locator,
    } = item
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
    if (msd !== undefined && !isWhole(msd, MIN_MSD, MAX_MSD)) {
      errors.push(`${label}: "msd" ${msdRule}`)
      valid = false
    }
    if (overload !== undefined && typeof overload !== 'boolean') {
      errors.push(`${label}: "overload" must be true or false.`)
      valid = false
    }
    const isExclude =
      Array.isArray(exclude) && exclude.every((x) => typeof x === 'string' && x !== '')
    if (exclude !== undefined && !isExclude) {
      errors.push(`${label}: "lfa_exclude" must be a list of router ids, like [B, C].`)
      valid = false
    } else if (isExclude && exclude.includes(id)) {
      errors.push(`${label}: "lfa_exclude" can't list the router itself.`)
      valid = false
    }
    // YAML reads `level: 2` as a number and `level: 1-2` as text.
    const lvl = level === undefined ? undefined : String(level)
    if (lvl !== undefined && !(ROUTER_LEVELS as readonly string[]).includes(lvl)) {
      errors.push(`${label}: "level" must be 1, 2 or 1-2.`)
      valid = false
    }
    if (area !== undefined && (typeof area !== 'string' || area.trim() === '')) {
      errors.push(`${label}: "area" must be text in quotes, like "49.0001".`)
      valid = false
    }
    const isAlgos = Array.isArray(algos) && algos.every((a) => isWhole(a, 128, 255))
    if (algos !== undefined && !isAlgos) {
      errors.push(`${label}: "algos" must be a list of algorithm numbers 128 to 255.`)
      valid = false
    }
    const isAlgoSids =
      isMap(algoSids) &&
      Object.entries(algoSids).every(
        ([k, v]) => isWhole(Number(k), 128, 255) && isWhole(v, 0, MAX_LABEL),
      )
    if (algoSids !== undefined && !isAlgoSids) {
      errors.push(`${label}: "algo_sids" must look like { 128: 101 }.`)
      valid = false
    }
    if (locator !== undefined && (typeof locator !== 'string' || !LOCATOR_PATTERN.test(locator))) {
      errors.push(`${label}: "locator" must be an IPv6 prefix like "fc00:0:1::/48" (in quotes).`)
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
    if (msd !== undefined) node.msd = msd as number
    if (isExclude && exclude.length > 0) node.lfaExclude = [...new Set(exclude as string[])].sort()
    if (overload === true) node.overload = true
    if (lvl === '1' || lvl === '2') node.level = lvl
    if (typeof area === 'string' && area.trim() !== '') node.area = area.trim()
    if (isAlgos && algos.length > 0)
      node.algos = [...new Set(algos as number[])].sort((a, b) => a - b)
    if (isAlgoSids)
      node.algoSids = Object.fromEntries(
        Object.entries(algoSids).map(([k, v]) => [Number(k), v as number]),
      )
    if (typeof locator === 'string') node.locator = locator.toLowerCase()
    if (isPos) node.pos = { x: pos.x as number, y: pos.y as number }
    nodes.push(node)
  })
  for (const n of nodes) {
    const unknown = (n.lfaExclude ?? []).filter((x) => !declared.has(x))
    if (unknown.length > 0)
      errors.push(`Node ${n.id}: "lfa_exclude" names ${unknown.join(', ')}, not a router in nodes.`)
  }
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
    const {
      a,
      b,
      metric,
      metric_ba,
      adj_sid_ab,
      adj_sid_ba,
      srlg,
      level,
      affinity,
      te_metric,
      delay,
    } = item
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

    const isSrlg =
      Array.isArray(srlg) && srlg.every((x) => typeof x === 'string' && SRLG_PATTERN.test(x))
    if (srlg !== undefined && !isSrlg)
      fail('"srlg" must be a list of names (letters, digits, "_", "." and "-"), like [duct-7].')

    const lvl = level === undefined ? undefined : String(level)
    if (lvl !== undefined && lvl !== '1' && lvl !== '2') fail('"level" must be 1 or 2.')
    if (affinity !== undefined && !isNames(affinity))
      fail('"affinity" must be a list of names, like [red].')
    if (te_metric !== undefined && !isWhole(te_metric, 1, MAX_METRIC))
      fail(`"te_metric" ${metricRule}`)
    if (delay !== undefined && !isWhole(delay, 1, MAX_METRIC)) fail(`"delay" ${metricRule}`)

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
    if (isSrlg && srlg.length > 0) link.srlg = [...new Set(srlg as string[])].sort()
    if (lvl === '1' || lvl === '2') link.level = lvl
    if (isNames(affinity) && affinity.length > 0) link.affinity = [...new Set(affinity)].sort()
    if (te_metric !== undefined) link.teMetric = te_metric as number
    if (delay !== undefined) link.delay = delay as number
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

/** One LAN as written: a shared metric when every member has the same one. */
function lanDoc(lan: Lan) {
  const metrics = new Set(lan.members.map((m) => m.metric))
  const level = lan.level === undefined ? {} : { level: Number(lan.level) }
  return metrics.size === 1
    ? {
        id: lan.id,
        metric: lan.members[0]!.metric,
        members: lan.members.map((m) => m.node),
        ...level,
      }
    : {
        id: lan.id,
        members: lan.members.map((m) => ({ node: m.node, metric: m.metric })),
        ...level,
      }
}

/** Write a topology in the same format `parseTopology` reads. */
export function serializeTopology(topology: Topology): string {
  const doc = {
    name: topology.name,
    srgb_base: topology.srgbBase,
    ...(topology.msd !== undefined && { msd: topology.msd }),
    ...(topology.lfaPolicy !== undefined &&
      Object.keys(topology.lfaPolicy).length > 0 && {
        lfa_policy: {
          ...(topology.lfaPolicy.nodeProtecting !== undefined && {
            node_protecting: topology.lfaPolicy.nodeProtecting,
          }),
          ...(topology.lfaPolicy.downstream !== undefined && {
            downstream: topology.lfaPolicy.downstream,
          }),
        },
      }),
    ...(topology.protection !== undefined &&
      topology.protection !== 'link' && { protection: topology.protection }),
    ...(topology.dataplane !== undefined && { dataplane: topology.dataplane }),
    ...((topology.flexAlgos ?? []).length > 0 && {
      flex_algo: topology.flexAlgos!.map((f) => ({
        algo: f.algo,
        ...(f.metric !== undefined && { metric: f.metric }),
        ...(f.excludeAny !== undefined && { exclude_any: f.excludeAny }),
        ...(f.includeAny !== undefined && { include_any: f.includeAny }),
        ...(f.includeAll !== undefined && { include_all: f.includeAll }),
      })),
    }),
    nodes: topology.nodes.map((n) => ({
      id: n.id,
      sid: n.sidIndex,
      ...(n.name !== undefined && { name: n.name }),
      ...(n.msd !== undefined && { msd: n.msd }),
      ...(n.lfaExclude !== undefined && n.lfaExclude.length > 0 && { lfa_exclude: n.lfaExclude }),
      ...(n.overload === true && { overload: true }),
      ...(n.level !== undefined && { level: Number(n.level) }),
      ...(n.area !== undefined && { area: n.area }),
      ...(n.algos !== undefined && { algos: n.algos }),
      ...(n.algoSids !== undefined && { algo_sids: n.algoSids }),
      ...(n.locator !== undefined && { locator: n.locator }),
      ...(n.pos !== undefined && { pos: { x: n.pos.x, y: n.pos.y } }),
    })),
    // LAN links are written as the LAN (D55).
    links: topology.links
      .filter((l) => l.lan === undefined)
      .map((l) => ({
        a: l.a,
        b: l.b,
        metric: l.metricAB,
        ...(l.metricBA !== l.metricAB && { metric_ba: l.metricBA }),
        ...(l.adjSidAB !== undefined && { adj_sid_ab: l.adjSidAB }),
        ...(l.adjSidBA !== undefined && { adj_sid_ba: l.adjSidBA }),
        ...(l.srlg !== undefined && l.srlg.length > 0 && { srlg: l.srlg }),
        ...(l.level !== undefined && { level: Number(l.level) }),
        ...(l.affinity !== undefined && { affinity: l.affinity }),
        ...(l.teMetric !== undefined && { te_metric: l.teMetric }),
        ...(l.delay !== undefined && { delay: l.delay }),
      })),
    ...((topology.lans ?? []).length > 0 && { lans: topology.lans!.map(lanDoc) }),
  }
  // flowLevel 2 writes one router or link per line, like the example files.
  return dump(doc, { schema: CORE_SCHEMA, flowLevel: 2, lineWidth: -1 })
}

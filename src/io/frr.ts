// Import from FRR's `show isis database detail` (Later #2, D52). The output is text
// for people, not a stable format, so the parser looks for the few lines it needs and
// says what it skipped. It is pure: text in, topology (or errors) out.
//
// What it reads, per LSP (ISO 10589, RFC 5305, RFC 8667):
//   rt1.00-00   *   150  0x00000003  0x1234  1000  0/0/0      LSP ID … ATT/P/OL
//     Hostname: rt1                                           (RFC 5301)
//     Segment Routing: I:1 V:0, SRGB Base: 16000 Range: 8000  (RFC 8667 §3.1)
//     Node Maximum SID Depth: 16                              (RFC 8491)
//     Extended Reachability: rt2.00 (Metric: 10)              (TLV 22)
//       Adjacency-SID: 15001, Weight: 0, Flags: F:0 B:0, V:1, L:1, S:0, P:0
//     Extended IP Reachability: 10.0.0.1/32 (Metric: 0)       (TLV 135)
//       Prefix-SID Index: 1, Algorithm: 0, Flags:NO-PHP        (RFC 8667 §2.1)
import type { Lan, Link, NodeId, RouterNode, Topology } from '../engine/types'
import { DEFAULT_SRGB_BASE, ID_PATTERN, MAX_MSD, MAX_METRIC, MIN_MSD } from './yaml-format'
import { parseTopology, serializeTopology, uniqueLinkId } from './yaml'

/** One adjacency an LSP advertises: the neighbor (system id or hostname) and its pseudonode byte. */
export interface FrrNeighbor {
  name: string
  pseudonode: string
  metric: number
  /** The first IPv4, non-backup Adj-SID label (F:0, B:0), else the first one. */
  adjSid?: number
  /** `adjSid` came from an IPv4 primary line, so later backup or IPv6 lines don't replace it. */
  adjPrimary?: boolean
}

/** A prefix with a Prefix-SID (RFC 8667 §2.1). */
interface FrrPrefix {
  prefix: string
  index?: number
  label?: number
  algorithm: number
}

/** One router (or pseudonode) as its LSPs describe it; fragments are merged. */
export interface FrrLsp {
  /** The name part of the LSP ID: a hostname or a system id. */
  name: string
  /** "00" for a router, anything else for a LAN pseudonode. */
  pseudonode: string
  hostname?: string
  /** The first area address (ISO 10589), e.g. 49.0001. */
  area?: string
  overload: boolean
  srgbBase?: number
  msd?: number
  neighbors: FrrNeighbor[]
  prefixes: FrrPrefix[]
}

/** One level's link-state database. */
export interface FrrDatabase {
  level: number
  lsps: FrrLsp[]
}

export type FrrParse =
  { ok: true; databases: FrrDatabase[]; warnings: string[] } | { ok: false; errors: string[] }

const LEVEL = /IS-IS Level-(\d) link-state database/i
// "rt1.00-00   *  150  0x00000003  0x1234  1000  0/0/0". The name may hold dots (system ids).
const LSP_HEADER =
  /^\s*(\S+?)\.([0-9a-f]{2})-([0-9a-f]{2})\s+(?:\*\s+)?\d+\s+0x[0-9a-f]+\s+0x[0-9a-f]+\s+\S+\s+(\d)\/(\d)\/(\d)\s*$/i
const HOSTNAME = /^\s+Hostname:\s*(\S+)/i
const AREA = /^\s+Area Address(?:es)?:\s*(\S+)/i
// TLV 22 (wide) and TLV 2 (narrow): "Extended Reachability: rt2.00 (Metric: 10)".
const IS_REACH =
  /^\s+(?:Extended Reachability|IS Reachability):\s*(\S+?)\.([0-9a-f]{2})\s+\(Metric:\s*(\d+)\)/i
const MT_REACH = /^\s+MT Reachability:/i
const ADJ_SID = /^\s+(?:Adjacency-SID|Adj-SID|Adj SID)\s*:?\s*(\d+)(.*)$/i
const LAN_ADJ_SID = /^\s+LAN-(?:Adjacency|Adj)-SID\s*:?\s*(\d+)(.*)$/i
const SRGB = /SRGB Base:\s*(\d+)/i
const MSD = /(?:Node Maximum SID Depth|BMI-MSD|Node MSD)\s*:?\s*(\d+)/i
const IP_REACH =
  /^\s+(?:Extended IP Reachability|IPv6 Reachability|IP Reachability|MT IPv6 Reachability):\s*(\S+)/i
const PREFIX_SID = /Prefix-SID\s+(Index|Label)\s*:?\s*(\d+)(?:.*?Algorithm\s*:?\s*(\d+))?/i
const SYSTEM_ID = /^[0-9a-f]{4}\.[0-9a-f]{4}\.[0-9a-f]{4}$/i

/** Read every level's database from the command's output. */
export function parseFrrDatabase(text: string): FrrParse {
  const databases: FrrDatabase[] = []
  let db: FrrDatabase | undefined
  let lsp: FrrLsp | undefined
  let lastNeighbor: FrrNeighbor | undefined
  let lastPrefix: FrrPrefix | undefined
  let mt = 0

  const lspFor = (name: string, pseudonode: string): FrrLsp => {
    if (db === undefined) {
      // Some outputs have no level line; treat them as one database.
      db = { level: 0, lsps: [] }
      databases.push(db)
    }
    const found = db.lsps.find((x) => x.name === name && x.pseudonode === pseudonode)
    if (found) return found
    const fresh: FrrLsp = { name, pseudonode, overload: false, neighbors: [], prefixes: [] }
    db.lsps.push(fresh)
    return fresh
  }

  for (const line of text.split(/\r?\n/)) {
    const level = LEVEL.exec(line)
    if (level) {
      const n = Number(level[1])
      db = databases.find((x) => x.level === n)
      if (db === undefined) {
        db = { level: n, lsps: [] }
        databases.push(db)
      }
      lsp = undefined
      continue
    }
    const header = LSP_HEADER.exec(line)
    if (header) {
      const [, name, pn, fragment, , , ol] = header
      lsp = lspFor(name!, pn!.toLowerCase())
      // The OL bit is meaningful in fragment 0 (ISO 10589 §7.3.4.1).
      if (fragment === '00' && ol === '1') lsp.overload = true
      lastNeighbor = undefined
      lastPrefix = undefined
      continue
    }
    if (lsp === undefined) continue

    const host = HOSTNAME.exec(line)
    if (host) {
      lsp.hostname = host[1]!
      continue
    }
    const area = AREA.exec(line)
    if (area) {
      lsp.area ??= area[1]!
      continue
    }
    if (MT_REACH.test(line)) {
      mt += 1
      lastNeighbor = undefined
      continue
    }
    const reach = IS_REACH.exec(line)
    if (reach) {
      lastNeighbor = {
        name: reach[1]!,
        pseudonode: reach[2]!.toLowerCase(),
        metric: Number(reach[3]),
      }
      lsp.neighbors.push(lastNeighbor)
      lastPrefix = undefined
      continue
    }
    const adj = ADJ_SID.exec(line) ?? LAN_ADJ_SID.exec(line)
    if (adj && lastNeighbor) {
      const flags = adj[2] ?? ''
      const backup = /\bB:\s*1/.test(flags)
      const ipv6 = /\bF:\s*1/.test(flags)
      // Keep the IPv4 primary Adj-SID (RFC 8667 §2.2.1: B = backup, F = IPv6).
      const primary = !backup && !ipv6
      if (lastNeighbor.adjSid === undefined || (primary && !lastNeighbor.adjPrimary)) {
        lastNeighbor.adjSid = Number(adj[1])
        if (primary) lastNeighbor.adjPrimary = true
      }
      continue
    }
    const ip = IP_REACH.exec(line)
    if (ip) {
      lastPrefix = { prefix: ip[1]!, algorithm: 0 }
      lsp.prefixes.push(lastPrefix)
      lastNeighbor = undefined
      continue
    }
    const sid = PREFIX_SID.exec(line)
    if (sid && lastPrefix) {
      if (sid[1]!.toLowerCase() === 'index') lastPrefix.index = Number(sid[2])
      else lastPrefix.label = Number(sid[2])
      lastPrefix.algorithm = sid[3] === undefined ? 0 : Number(sid[3])
      continue
    }
    const srgb = SRGB.exec(line)
    if (srgb) lsp.srgbBase = Number(srgb[1])
    const msd = MSD.exec(line)
    if (msd) lsp.msd = Number(msd[1])
  }

  const routers = databases.flatMap((d) => d.lsps)
  if (routers.length === 0) {
    return {
      ok: false,
      errors: [
        'No IS-IS LSPs found. Paste the output of "show isis database detail" from FRR (vtysh), including the LSP ID lines.',
      ],
    }
  }
  const warnings =
    mt > 0
      ? [
          `Skipped ${mt} multi-topology (MT) reachability entr${mt === 1 ? 'y' : 'ies'}: only the default topology is imported.`,
        ]
      : []
  return { ok: true, databases: databases.filter((d) => d.lsps.length > 0), warnings }
}

export interface FrrImportOptions {
  /**
   * Which level to import: 1, 2, or `all` for both as one multi-level network (D56).
   * Default: the Level-2 database if there is one, else the first.
   */
  level?: number | 'all'
  /** The topology's name. */
  name?: string
}

export type FrrImport =
  | { ok: true; topology: Topology; level: number | 'all'; levels: number[]; warnings: string[] }
  | { ok: false; errors: string[] }

/** One adjacency both ends list, between LSP names a < b by LFA Lab id. */
interface Adjacency {
  a: NodeId
  b: NodeId
  fwd: FrrNeighbor
  rev: FrrNeighbor
}

/**
 * `show isis database detail` → a topology. Router ids come from the hostname TLV
 * (else the system id), made safe for LFA Lab ids. A link needs both ends to list
 * each other (the IS-IS two-way check, ISO 10589 §7.2.8.2): one-way entries are
 * skipped with a warning. Parallel adjacencies become parallel links (D29). A LAN
 * pseudonode LSP becomes a LAN of the routers it and they both list (D55). With
 * `level: 'all'` both levels make one network with router levels and areas (D56).
 */
export function importFrr(text: string, options: FrrImportOptions = {}): FrrImport {
  const parsed = parseFrrDatabase(text)
  if (!parsed.ok) return parsed
  const levels = parsed.databases.map((d) => d.level)
  const want = options.level ?? (levels.includes(2) ? 2 : levels.includes(1) ? 1 : levels[0]!)
  const dbs =
    want === 'all'
      ? [...parsed.databases].sort((x, y) => y.level - x.level) // Level-2 first
      : parsed.databases.filter((d) => d.level === want)
  if (dbs.length === 0) {
    return {
      ok: false,
      errors: [`There is no Level-${want} database in the text (found: ${levels.join(', ')}).`],
    }
  }
  const multi = want === 'all' && dbs.length > 1
  const warnings = [...parsed.warnings]
  const levelName =
    want === 'all' ? (multi ? ' (Level-1 and Level-2)' : '') : want === 0 ? '' : ` (Level-${want})`
  if (levels.length > 1 && want !== 'all')
    warnings.push(
      `The text has ${levels.length} databases (Level-${levels.join(', Level-')}); imported Level-${want}.`,
    )

  // Routers, merged by LSP name over the levels (Level-2's LSP first).
  const byName = new Map<string, { lsp: FrrLsp; levels: Set<number> }>()
  for (const db of dbs)
    for (const l of db.lsps.filter((x) => x.pseudonode === '00')) {
      const had = byName.get(l.name)
      if (had === undefined) byName.set(l.name, { lsp: l, levels: new Set([db.level]) })
      else {
        had.levels.add(db.level)
        if (had.lsp.area === undefined && l.area !== undefined)
          had.lsp = { ...had.lsp, area: l.area }
      }
    }
  const routers = [...byName.values()].map((x) => x.lsp)
  const canonical = new Map<string, string>() // any name of a router → its LSP name
  for (const r of routers) {
    canonical.set(r.name.toLowerCase(), r.name)
    if (r.hostname !== undefined) canonical.set(r.hostname.toLowerCase(), r.name)
  }
  const ids = new Map<string, NodeId>() // LSP name → LFA Lab id
  const taken = new Set<NodeId>()
  for (const r of [...routers].sort((a, b) => cmp(a.name, b.name))) {
    let id = safeId(r.hostname ?? r.name)
    if (taken.has(id)) {
      let k = 2
      while (taken.has(`${id}_${k}`)) k++
      warnings.push(`Two routers are both named "${id}"; the second is "${id}_${k}".`)
      id = `${id}_${k}`
    }
    taken.add(id)
    ids.set(r.name, id)
  }

  // SRGB: LFA Lab uses one SRGB for every router (D9).
  const srgbs = routers.flatMap((r) => (r.srgbBase === undefined ? [] : [r.srgbBase]))
  const srgbBase = mostCommon(srgbs) ?? DEFAULT_SRGB_BASE
  if (srgbs.length === 0)
    warnings.push(`No SRGB found; using ${DEFAULT_SRGB_BASE}. Is segment routing on?`)
  else if (new Set(srgbs).size > 1)
    warnings.push(
      `Routers use different SRGBs (${[...new Set(srgbs)].join(', ')}); LFA Lab assumes one, so it uses ${srgbBase}. Labels may differ from the real ones.`,
    )

  const nodes: RouterNode[] = []
  const usedSids = new Set<number>()
  const needSid: RouterNode[] = []
  for (const r of [...routers].sort((a, b) => cmp(ids.get(a.name)!, ids.get(b.name)!))) {
    const id = ids.get(r.name)!
    const node: RouterNode = { id, sidIndex: -1 }
    if (r.hostname !== undefined && r.hostname !== id) node.name = r.hostname
    if (r.overload) node.overload = true
    if (r.msd !== undefined) {
      if (r.msd >= MIN_MSD) node.msd = Math.min(r.msd, MAX_MSD)
      else warnings.push(`${id}: max SID depth ${r.msd} is below ${MIN_MSD}; ignored.`)
    }
    if (multi) {
      // In one level's database only: an L1-only or L2-only router (ISO 10589 §7.2.1).
      const in1 = byName.get(r.name)!.levels
      if (in1.size === 1) node.level = in1.has(1) ? '1' : '2'
      if (r.area !== undefined) node.area = r.area
    }
    const sid = nodeSid(r, srgbBase)
    if (sid !== undefined && !usedSids.has(sid)) {
      node.sidIndex = sid
      usedSids.add(sid)
    } else {
      if (sid !== undefined)
        warnings.push(`${id}: Prefix-SID index ${sid} is already used by another router.`)
      needSid.push(node)
    }
    nodes.push(node)
  }
  let next = 1
  for (const node of needSid) {
    while (usedSids.has(next)) next++
    node.sidIndex = next
    usedSids.add(next)
    warnings.push(`${node.id}: no Prefix-SID found; gave it index ${next}.`)
  }

  // Each level's adjacencies and LANs.
  const unknown = new Set<string>()
  const oneWay = new Set<string>()
  const perLevel = dbs.map((db) => {
    const adj = adjacencies(db, canonical, ids, unknown, oneWay)
    const lans = pseudonodeLans(db, canonical, ids, warnings)
    return { level: db.level, adj, lans }
  })
  if (unknown.size > 0)
    warnings.push(
      `Skipped links to ${[...unknown].join(', ')}: no LSP for ${unknown.size === 1 ? 'that router' : 'those routers'} in this level.`,
    )
  if (oneWay.size > 0)
    warnings.push(
      `Skipped adjacencies only one end lists (the IS-IS two-way check fails): ${[...oneWay].join('; ')}.`,
    )

  // Links: the same adjacency in both levels (same metrics) is one link for both;
  // otherwise each is its own link, marked with its level (circuit type, D56).
  const links: Link[] = []
  const linkIds = new Set<string>()
  const addLink = (x: Adjacency, level: '1' | '2' | undefined) => {
    const id = uniqueLinkId(`${x.a}-${x.b}`, linkIds)
    linkIds.add(id)
    const link: Link = {
      id,
      a: x.a,
      b: x.b,
      metricAB: clampMetric(x.fwd.metric),
      metricBA: clampMetric(x.rev.metric),
    }
    if (x.fwd.adjSid !== undefined) link.adjSidAB = x.fwd.adjSid
    if (x.rev.adjSid !== undefined) link.adjSidBA = x.rev.adjSid
    if (level !== undefined) link.level = level
    links.push(link)
  }
  const [first, ...rest] = perLevel
  const lvl = (n: number) => (n === 1 ? '1' : '2') as '1' | '2'
  if (!multi) for (const x of first!.adj) addLink(x, undefined)
  else {
    const other = rest[0]!.adj
    const used = new Set<number>()
    for (const x of first!.adj) {
      const j = other.findIndex(
        (y, k) =>
          !used.has(k) &&
          y.a === x.a &&
          y.b === x.b &&
          y.fwd.metric === x.fwd.metric &&
          y.rev.metric === x.rev.metric,
      )
      if (j >= 0) used.add(j)
      addLink(x, j >= 0 ? undefined : lvl(first!.level))
    }
    other.forEach((y, k) => {
      if (!used.has(k)) addLink(y, lvl(rest[0]!.level))
    })
  }
  if (links.some((l) => l.metricAB === 0 || l.metricBA === 0))
    warnings.push('Some metrics were 0; LFA Lab needs at least 1, so they are 1.')

  // LANs: one for both levels when they match, else one per level (D55, D56).
  const lans: Lan[] = []
  const lanIds = new Set<string>(nodes.map((n) => n.id))
  const addLan = (lan: Lan, level: '1' | '2' | undefined) => {
    let id = lan.id
    for (let k = 2; lanIds.has(id); k++) id = `${lan.id}_${k}`
    lanIds.add(id)
    lans.push({ ...lan, id, ...(level !== undefined && { level }) })
  }
  const sameLan = (x: Lan, y: Lan) => JSON.stringify(x.members) === JSON.stringify(y.members)
  if (!multi) for (const l of first!.lans) addLan(l, undefined)
  else {
    const other = rest[0]!.lans
    const used = new Set<number>()
    for (const l of first!.lans) {
      const j = other.findIndex((y, k) => !used.has(k) && sameLan(l, y))
      if (j >= 0) used.add(j)
      addLan(l, j >= 0 ? undefined : lvl(first!.level))
    }
    other.forEach((y, k) => {
      if (!used.has(k)) addLan(y, lvl(rest[0]!.level))
    })
  }

  const topology: Topology = {
    name: options.name ?? `FRR import${levelName}`,
    srgbBase,
    nodes,
    links,
    ...(lans.length > 0 && { lans }),
  }
  // Same rules as a YAML file (labels, ids, metrics), so a bad value can't slip in.
  const check = parseTopology(serializeTopology(topology))
  if (!check.ok) return { ok: false, errors: check.errors }
  return {
    ok: true,
    topology: check.topology,
    level: want === 'all' && !multi ? dbs[0]!.level : want,
    levels,
    warnings: [...warnings, ...check.warnings],
  }
}

/** One level's two-way point-to-point adjacencies, paired in the order the LSPs list them. */
function adjacencies(
  db: FrrDatabase,
  canonical: Map<string, string>,
  ids: Map<string, NodeId>,
  unknown: Set<string>,
  oneWay: Set<string>,
): Adjacency[] {
  const directed = new Map<string, FrrNeighbor[]>()
  for (const r of db.lsps.filter((x) => x.pseudonode === '00')) {
    for (const n of r.neighbors) {
      if (n.pseudonode !== '00') continue // a LAN: see pseudonodeLans()
      const to = canonical.get(n.name.toLowerCase())
      if (to === undefined || !ids.has(to)) {
        unknown.add(n.name)
        continue
      }
      if (to === r.name) continue
      const key = `${r.name}\n${to}`
      directed.set(key, [...(directed.get(key) ?? []), n])
    }
  }
  // Sorted by the LFA Lab ids of the two ends, so link ids follow the file's order rules.
  const pairs = [...new Set([...directed.keys()].map((k) => k.split('\n').sort().join('\n')))]
    .map((k) => {
      const [x, y] = k.split('\n') as [string, string]
      return ids.get(x)! < ids.get(y)! ? ([x, y] as const) : ([y, x] as const)
    })
    .sort(
      ([x1, y1], [x2, y2]) => cmp(ids.get(x1)!, ids.get(x2)!) || cmp(ids.get(y1)!, ids.get(y2)!),
    )
  const out: Adjacency[] = []
  for (const [la, lb] of pairs) {
    const [a, b] = [ids.get(la)!, ids.get(lb)!]
    const ab = directed.get(`${la}\n${lb}`) ?? []
    const ba = directed.get(`${lb}\n${la}`) ?? []
    if (ab.length !== ba.length)
      oneWay.add(`${a}–${b} (${a} lists ${ab.length}, ${b} lists ${ba.length})`)
    for (let i = 0; i < Math.min(ab.length, ba.length); i++)
      out.push({ a, b, fwd: ab[i]!, rev: ba[i]! })
  }
  return out
}

/**
 * One level's LANs: a pseudonode LSP (ISO 10589 §7.2.3) lists the routers on the LAN,
 * and each router lists the pseudonode with its metric to it. A member needs both
 * (the two-way check); a LAN needs two members. Its id is the DIS's id and the
 * pseudonode number, e.g. `p_2.01`.
 */
function pseudonodeLans(
  db: FrrDatabase,
  canonical: Map<string, string>,
  ids: Map<string, NodeId>,
  warnings: string[],
): Lan[] {
  const routers = db.lsps.filter((x) => x.pseudonode === '00')
  const lans: Lan[] = []
  for (const pn of db.lsps.filter((x) => x.pseudonode !== '00')) {
    const owner = canonical.get(pn.name.toLowerCase())
    const listed = new Set(
      pn.neighbors.flatMap((n) => {
        const c = canonical.get(n.name.toLowerCase())
        return c === undefined ? [] : [c]
      }),
    )
    const members = routers.flatMap((r) => {
      const n = r.neighbors.find(
        (x) =>
          x.pseudonode === pn.pseudonode &&
          canonical.get(x.name.toLowerCase()) === (owner ?? pn.name) &&
          listed.has(r.name),
      )
      return n === undefined ? [] : [{ node: ids.get(r.name)!, metric: clampMetric(n.metric) }]
    })
    const name = `${owner === undefined ? safeId(pn.name) : ids.get(owner)}.${pn.pseudonode}`
    if (members.length < 2) {
      warnings.push(`LAN ${name}: fewer than two routers list it both ways; skipped.`)
      continue
    }
    lans.push({ id: name, members: members.sort((x, y) => cmp(x.node, y.node)) })
  }
  return lans.sort((x, y) => cmp(x.id, y.id))
}

/** The router's own Prefix-SID: algorithm 0, a host route (/32, /128) first (RFC 8667 §2.1). */
function nodeSid(r: FrrLsp, srgbBase: number): number | undefined {
  const sids = r.prefixes.filter((p) => p.algorithm === 0 && (p.index ?? p.label) !== undefined)
  const host = sids.find((p) => /\/(32|128)$/.test(p.prefix)) ?? sids[0]
  if (host === undefined) return undefined
  if (host.index !== undefined) return host.index
  const index = host.label! - (r.srgbBase ?? srgbBase)
  return index >= 0 ? index : undefined
}

/** LFA Lab ids are letters, digits, "_" and "." (D40); FRR hostnames may hold "-". */
function safeId(name: string): NodeId {
  const id = name.replace(/[^A-Za-z0-9_.]/g, '_')
  if (SYSTEM_ID.test(id) || ID_PATTERN.test(id)) return id
  return id || 'R'
}

const clampMetric = (m: number) => Math.min(MAX_METRIC, Math.max(1, m))

function mostCommon(xs: number[]): number | undefined {
  const counts = new Map<number, number>()
  for (const x of xs) counts.set(x, (counts.get(x) ?? 0) + 1)
  let best: number | undefined
  for (const [x, c] of counts)
    if (best === undefined || c > counts.get(best)! || (c === counts.get(best)! && x < best))
      best = x
  return best
}

const cmp = (x: string, y: string) => (x < y ? -1 : x > y ? 1 : 0)

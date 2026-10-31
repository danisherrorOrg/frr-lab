// Failure simulation (F5, docs/02-algorithms.md §8): fail links and routers and
// follow the traffic from S to every destination, first on the FRR repair path,
// then on the path the network uses once it has reconverged.
import { cheapestEdge, type Edge } from './graph'
import { computeForSource } from './index'
import { prefixLabel } from './labels'
import { shortestPath } from './paths'
import { allPairs, type AllPairs } from './spf'
import type { DestinationResult, NodeId, Segment, Topology } from './types'

/**
 * Which FRR methods the routers run, as on a real router:
 * - `lfa`: LFA only (ECMP counts, RFC 5286 §3.4)
 * - `rlfa`: LFA, else Remote LFA (RFC 7490)
 * - `tilfa`: TI-LFA for everything (RFC 9855)
 */
export type RepairMode = 'lfa' | 'rlfa' | 'tilfa'

/** The method that actually carried the traffic. */
export type RepairMethod = 'ecmp' | 'lfa' | 'rlfa' | 'tilfa'

/**
 * How the PLR's repair path compares with the PLR's own post-convergence path:
 * the same routers, a different path of the same cost, or a more costly path.
 */
export type RepairMatch = 'same' | 'same-cost' | 'longer'

/**
 * What happens to an affected flow while FRR is in charge (D24):
 * - `repaired`: traffic reaches D, on one backup or on several routers' backups in turn
 * - `dropped`: a router on the way has no usable backup for its failed link
 * - `looped`: the backups send traffic round in a circle until the network reconverges
 * - `unreachable`: the failed links cut D off from S; nothing could reach it
 */
export type FlowStatus = 'repaired' | 'dropped' | 'looped' | 'unreachable'

/** One router switching to its backup because its own link is down. */
export interface RepairStep {
  /** The router that repairs (a point of local repair). */
  at: NodeId
  /** The failed link it found, and the router on the far side. */
  link: string
  next: NodeId
  /** Where traffic was heading at that router: D, or a tunnel end / segment on the way. */
  target: NodeId
  method: RepairMethod
  /** Where `at` is in the flow's `repair` path (a router can be visited twice). */
  atIndex: number
}

/** Where traffic was dropped, and why. */
export interface Drop {
  at: NodeId
  /** The failed link, and the router on its far side. */
  link: string
  next: NodeId
  /** `no-backup`: no backup for that link. `backup-down`: the backup's own first link is down too. */
  reason: 'no-backup' | 'backup-down'
}

/**
 * Why the PLR's backup, as planned for its one failed link, runs through a failed
 * router (D27). Link-protecting backups only avoid the link, not the router:
 * - `ecmp` / `lfa`: neighbor `via`'s path to D passes the router. `check` holds the
 *   node-protecting inequality (RFC 5286 §3.2) when that router is the PLR's own
 *   next hop E: `dist(N,D) < dist(N,E) + dist(E,D)` failed.
 * - `rlfa`: the tunnel to the PQ node, or the PQ node's path to D, passes it (RFC 8102 §2.1).
 * - `tilfa`: this segment's path passes it (or is its Prefix-SID / an Adj-SID on one of
 *   its links); `null` = the backup's first hop goes there.
 */
export type BackupBreak =
  | {
      method: 'ecmp' | 'lfa'
      via: NodeId
      check?: { distND: number; distNE: number; distED: number }
    }
  | { method: 'rlfa'; pq: NodeId; leg: 'to-pq' | 'from-pq' }
  | { method: 'tilfa'; segment: Segment | null }

/** Where a planned backup meets a failed router. */
export interface Through {
  /** The failed router. */
  node: NodeId
  /** The router on the backup path just before it. */
  at: NodeId
  why: BackupBreak
}

/** What failed: link ids and router ids. */
export interface Failures {
  links?: readonly string[]
  nodes?: readonly NodeId[]
}

export interface FailedLink {
  id: string
  a: NodeId
  b: NodeId
}

/** Traffic from S to one destination. */
export interface Flow {
  dest: NodeId
  /** S's normal path (lowest-id ECMP tie-break, like the drawings). */
  before: NodeId[]
  beforeCost: number
  /** True when `before` crosses a failed link (in either direction) or a failed router. */
  affected: boolean
  /** D itself is a failed router: unreachable, as expected; no repair is followed. */
  destDown?: true
  /** The first failed link on `before`: the one the PLR repairs. */
  hitLink?: string
  /** Point of local repair: the router on `before` just before `hitLink`. */
  plr?: NodeId
  /** The router on the far side of `hitLink`. */
  next?: NodeId
  /** Set for affected flows; see FlowStatus. */
  status?: FlowStatus
  /** The first PLR's method. Undefined when it has no backup: traffic is dropped there. */
  method?: RepairMethod
  /**
   * Where traffic really goes: S → … → PLR on the normal path, then hop by hop on
   * backups and normal tables. Ends at D, at the router that drops it, or where a
   * loop closes (that router is then listed twice). Undefined when the PLR has no backup.
   */
  repair?: NodeId[]
  /** The link of each hop of `repair`: with parallel links, which one carried it (D29). */
  repairLinks?: string[]
  /**
   * The MPLS label stack on each hop of `repair`, top first, as the sending router
   * builds it, before penultimate-hop popping. For the packet walk (§4.5, §8.3).
   */
  repairLabels?: Segment[][]
  repairCost?: number
  /** Every router that switched to a backup, in order. The first one is the PLR. */
  repairs?: RepairStep[]
  /** Set when traffic is dropped. */
  drop?: Drop
  /** Set when traffic loops: the router where the loop closes. */
  loopAt?: NodeId
  /** S's path after convergence. Undefined when D can't be reached any more. */
  after?: NodeId[]
  afterCost?: number
  /** Cost of the repair from the PLR on (the part after the normal path). */
  plrRepairCost?: number
  /** The PLR's own path to D once the network has reconverged, and its cost. */
  plrAfter?: NodeId[]
  plrAfterCost?: number
  /** Repair vs the PLR's final path. Only for traffic that reaches D. */
  match?: RepairMatch
  /**
   * Set when the PLR's backup, planned for its one failed link, passes a failed
   * router: the repair is broken by the router failure (D27). What really happens
   * next (another router repairs, a drop, a loop) is in `repairs` and `status`.
   */
  through?: Through
}

export interface FailureSimulation {
  /** The failed links, in the order given, without repeats (not the links of failed routers). */
  links: FailedLink[]
  /** The failed routers, in the order given, without repeats. */
  nodes: NodeId[]
  mode: RepairMode
  /** One per destination S can reach before the failure, sorted by router id. */
  flows: Flow[]
}

export interface SimulateOptions {
  /** Use extended P-space for RLFA (default true, D5). */
  extended?: boolean
}

/**
 * What a packet carries, top first: `hop` = send straight to this neighbor (an LFA
 * next hop, an Adj-SID, a tunnel's exit neighbor), over `link` when the backup
 * names one (D29), else the cheapest link; `to` = forward on normal tables until
 * this router (D, a PQ node, a Prefix-SID). `seg` is the MPLS label it is on the
 * wire, if any: a Prefix-SID for every `to`, an Adj-SID for a TI-LFA `hop`. A
 * backup's own first hop is just the interface the PLR sends on, with no label.
 */
type Instr = { hop: NodeId; link?: string; seg?: Segment } | { to: NodeId; seg: Segment }

/** Makes the Prefix-SID segment of a router. */
type PrefixOf = (node: NodeId) => Segment

/** IP TTL limit: a packet that keeps going this long is looping. */
const MAX_HOPS = 255

// Keyed by topology object (D15), so allPairs() of the reduced topology stays cached too.
const reducedCache = new WeakMap<Topology, Map<string, Topology>>()

/** The topology with these links removed (both directions). */
function withoutLinks(topology: Topology, ids: Set<string>): Topology {
  const byLinks = reducedCache.get(topology) ?? new Map<string, Topology>()
  reducedCache.set(topology, byLinks)
  const key = [...ids].sort().join('\n')
  let t = byLinks.get(key)
  if (t === undefined) {
    t = { ...topology, links: topology.links.filter((l) => !ids.has(l.id)) }
    byLinks.set(key, t)
  }
  return t
}

const samePath = (x: NodeId[], y: NodeId[]) =>
  x.length === y.length && x.every((n, i) => n === y[i])

/** What a backup puts on the packet; TI-LFA keeps its segment list for explain text. */
interface Backup {
  method: RepairMethod
  instrs: Instr[]
  segments?: Segment[]
}

const isLinkList = (f: readonly string[] | Failures): f is readonly string[] => Array.isArray(f)

const instrKey = (k: Instr) => ('hop' in k ? `>${k.hop}@${k.link ?? ''}` : k.to)

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0)

/**
 * Fail links and routers and follow traffic from `source` to every destination.
 * A failed router takes all its links down at once; its neighbors only see "my
 * link failed" and use their link-protecting backups (D27). Traffic is forwarded
 * hop by hop. Every router uses its normal (pre-failure) table; a router whose own
 * outgoing link is down switches to the backup it pre-computed for that one link,
 * as in FRR. That holds for traffic already on someone else's backup too, so with
 * several failures one repair can lead into another, into a drop, or into a loop (D24).
 * `failed` may be a plain list of link ids.
 */
export function simulateFailure(
  topology: Topology,
  source: NodeId,
  failed: readonly string[] | Failures,
  mode: RepairMode,
  options: SimulateOptions = {},
): FailureSimulation {
  const given: Failures = isLinkList(failed) ? { links: failed } : failed
  const ids = [...new Set(given.links ?? [])]
  const nodes = [...new Set(given.nodes ?? [])]
  if (ids.length === 0 && nodes.length === 0)
    throw new Error(isLinkList(failed) ? 'No failed link given.' : 'Nothing failed.')
  const links: FailedLink[] = ids.map((id) => {
    const l = topology.links.find((k) => k.id === id)
    if (l === undefined) throw new Error(`Unknown link "${id}".`)
    return { id: l.id, a: l.a, b: l.b }
  })
  for (const n of nodes) {
    if (!topology.nodes.some((x) => x.id === n)) throw new Error(`Unknown router "${n}".`)
  }
  if (nodes.includes(source))
    throw new Error(`The source router ${source} is down: it sends no traffic.`)
  const table = allPairs(topology)
  const fromS = table.from.get(source)
  if (fromS === undefined) throw new Error(`Unknown source router "${source}".`)
  const prefixOf: PrefixOf = (node) => ({
    kind: 'prefix',
    node,
    label: prefixLabel(topology, node),
  })

  // Every link that is down: the failed links plus every link of a failed router.
  const downNodes = new Set(nodes)
  const down: FailedLink[] = [...links]
  for (const l of topology.links) {
    if ((downNodes.has(l.a) || downNodes.has(l.b)) && !ids.includes(l.id))
      down.push({ id: l.id, a: l.a, b: l.b })
  }
  const downIds = new Set(down.map((l) => l.id))

  // A failed router with no links left is unreachable in the reduced SPF.
  const after = allPairs(withoutLinks(topology, downIds))
  const isUp = (linkId: string) => !downIds.has(linkId)
  /** The link normal forwarding uses from x to neighbor y: the cheapest, lowest id (D29). */
  const normalLink = (x: NodeId, y: NodeId) => cheapestEdge(table.graph, x, y)!

  // Each router's results, computed once: every flow repaired there shares them.
  const atRouter = new Map<NodeId, DestinationResult[]>()
  const resultsAt = (x: NodeId) => {
    let r = atRouter.get(x)
    if (r === undefined) {
      r = computeForSource(topology, x, {
        explain: false,
        ...(options.extended !== undefined && { extended: options.extended }),
      })
      atRouter.set(x, r)
    }
    return r
  }

  const flows: Flow[] = []
  for (const d of table.graph.nodes) {
    if (d === source || !fromS.dist.has(d)) continue
    const before = shortestPath(table, source, d)!
    const flow: Flow = { dest: d, before, beforeCost: fromS.dist.get(d)!, affected: false }
    // Only the link the flow really takes counts: one link of a bundle may be down
    // while the flow uses another (D29).
    const i = before.findIndex(
      (x, k) => k + 1 < before.length && !isUp(normalLink(x, before[k + 1]!).linkId),
    )

    if (i >= 0) {
      const plr = before[i]!
      flow.affected = true
      flow.plr = plr
      flow.next = before[i + 1]!
      flow.hitLink = normalLink(plr, flow.next).linkId

      if (downNodes.has(d)) {
        // D itself is down: nothing can reach it, and that is expected, not a
        // protection failure (D27). No repair is followed.
        flow.destDown = true
        flow.status = 'unreachable'
        flows.push(flow)
        continue
      }

      const walk = forward(table, source, d, mode, isUp, normalLink, resultsAt, prefixOf)
      flow.repairs = walk.repairs
      if (walk.repairs.length > 0) {
        flow.method = walk.repairs[0]!.method
        flow.repair = walk.path
        flow.repairLinks = walk.links
        flow.repairLabels = walk.labels
        flow.repairCost = sum(walk.costs)
        // Up to the PLR the walk is the normal path, so the PLR sits at index i.
        flow.plrRepairCost = sum(walk.costs.slice(i))
      }
      if (walk.drop) flow.drop = walk.drop
      if (walk.loopAt !== undefined) flow.loopAt = walk.loopAt
      if (downNodes.size > 0 && walk.repairs.length > 0) {
        const through = backupThrough(
          table,
          resultsAt(plr),
          plr,
          flow.hitLink,
          flow.next,
          d,
          mode,
          downNodes,
          isUp,
          prefixOf,
        )
        if (through) flow.through = through
      }

      // Costs after convergence come from the reduced SPF: with a bundle, the
      // cheapest link left may cost more than the one that failed (D29).
      const plrAfter = shortestPath(after, plr, d)
      if (plrAfter) {
        flow.plrAfter = plrAfter
        flow.plrAfterCost = after.from.get(plr)!.dist.get(d)!
        if (walk.delivered) {
          flow.match =
            samePath(walk.path.slice(i), plrAfter) && flow.plrRepairCost === flow.plrAfterCost
              ? 'same'
              : flow.plrRepairCost === flow.plrAfterCost
                ? 'same-cost'
                : 'longer'
        }
      }

      const sAfter = shortestPath(after, source, d)
      if (sAfter) {
        flow.after = sAfter
        flow.afterCost = after.from.get(source)!.dist.get(d)!
      }
      flow.status = !flow.after
        ? 'unreachable'
        : walk.delivered
          ? 'repaired'
          : walk.drop
            ? 'dropped'
            : 'looped'
    } else {
      flow.after = before
      flow.afterCost = flow.beforeCost
    }
    flows.push(flow)
  }

  return { links, nodes, mode, flows }
}

/** One source's failure result in numbers, for the per-DUT view (Phase 9.6). */
export interface FailureSummary {
  /** Destinations whose path crosses something down; a failed router as destination is left out. */
  affected: number
  repaired: number
  /** Repaired, but by more than one router (D24). */
  relayed: number
  dropped: number
  looped: number
  unreachable: number
  /** Destinations that are failed routers themselves: unreachable, as expected (D27). */
  destDown: number
  /** Affected destinations that meet a failed router (meetsDownRouter). */
  viaRouter: number
  /** Of those: the PLR's backup avoids every failed router, passes one (D27), or doesn't exist. */
  survive: number
  breaks: number
  noBackup: number
}

/**
 * Does this affected flow meet a failed router: its normal path passes one, or
 * the PLR's planned backup does (`through`)? A flow that only crosses a failed
 * link can still have a backup through a failed router, and that backup breaks
 * (D27, D32). The router check (survive / breaks / no backup) is about these flows.
 */
export function meetsDownRouter(f: Flow, nodes: readonly NodeId[]): boolean {
  return (
    f.affected &&
    !f.destDown &&
    (f.through !== undefined || f.before.some((x) => nodes.includes(x)))
  )
}

/** Count one source's flows. `nodes` are the failed routers. */
export function summarizeFlows(flows: readonly Flow[], nodes: readonly NodeId[]): FailureSummary {
  const hit = flows.filter((f) => f.affected && !f.destDown)
  const n = (st: FlowStatus) => hit.filter((f) => f.status === st).length
  const viaRouter = hit.filter((f) => meetsDownRouter(f, nodes))
  return {
    affected: hit.length,
    repaired: n('repaired'),
    relayed: hit.filter((f) => f.status === 'repaired' && (f.repairs?.length ?? 0) > 1).length,
    dropped: n('dropped'),
    looped: n('looped'),
    unreachable: n('unreachable'),
    destDown: flows.filter((f) => f.destDown).length,
    viaRouter: viaRouter.length,
    survive: viaRouter.filter((f) => f.method && !f.through).length,
    breaks: viaRouter.filter((f) => f.through).length,
    noBackup: viaRouter.filter((f) => !f.method).length,
  }
}

/** One router as the DUT: down (it sends nothing), or its summary. */
export type SourceFailure =
  { source: NodeId; down: true } | { source: NodeId; summary: FailureSummary }

/**
 * The same failure from every router in turn (Phase 9.6), sorted by router id.
 * Each one is exactly simulateFailure from that source.
 */
export function simulateAllSources(
  topology: Topology,
  failed: Failures,
  mode: RepairMode,
  options: SimulateOptions & {
    onProgress?: (done: number, total: number, source: NodeId) => void
  } = {},
): SourceFailure[] {
  const { onProgress, ...simOptions } = options
  const sources = allPairs(topology).graph.nodes
  const down = new Set(failed.nodes ?? [])
  return sources.map((source, i): SourceFailure => {
    const r: SourceFailure = down.has(source)
      ? { source, down: true }
      : {
          source,
          summary: summarizeFlows(
            simulateFailure(topology, source, failed, mode, simOptions).flows,
            [...down],
          ),
        }
    onProgress?.(i + 1, sources.length, source)
    return r
  })
}

interface Walk {
  path: NodeId[]
  /** The link and its metric for each hop of `path`. */
  links: string[]
  costs: number[]
  /** The label stack sent on each hop of `path`, top first, before PHP. */
  labels: Segment[][]
  repairs: RepairStep[]
  delivered: boolean
  drop?: Drop
  loopAt?: NodeId
}

/**
 * Follow one packet from `source` to `d`. A router repairs at most once per visit:
 * its forwarding entry holds one primary and one backup, so if the backup's first
 * link is down too the packet is dropped there. Forwarding depends only on the
 * router and what the packet carries, so meeting the same pair twice is a loop.
 */
function forward(
  table: AllPairs,
  source: NodeId,
  d: NodeId,
  mode: RepairMode,
  isUp: (linkId: string) => boolean,
  normalLink: (x: NodeId, y: NodeId) => Edge,
  resultsAt: (x: NodeId) => DestinationResult[],
  prefixOf: PrefixOf,
): Walk {
  const path = [source]
  const links: string[] = []
  const costs: number[] = []
  const labels: Segment[][] = []
  const repairs: RepairStep[] = []
  const seen = new Set<string>()
  let at = source
  // The packet reaches S already carrying D's label (as in the packet walk, §4.5).
  let stack: Instr[] = [{ to: d, seg: prefixOf(d) }]
  let repairedHere = false
  const sofar = () => ({ path, links, costs, labels, repairs })

  for (;;) {
    while (stack[0] !== undefined && 'to' in stack[0] && stack[0].to === at) stack.shift()
    const top = stack[0]
    if (top === undefined) return { ...sofar(), delivered: true }

    if (!repairedHere) {
      const key = `${at}|${stack.map(instrKey).join(',')}`
      // Back at a router with the same labels: the exact loop, shown up to here.
      if (seen.has(key)) return { ...sofar(), delivered: false, loopAt: at }
      if (path.length > MAX_HOPS) return ttlLoop(sofar())
      seen.add(key)
    }

    // firstHops are sorted: [0] is the lowest-id hop, the tie-break of the drawings.
    const next = 'hop' in top ? top.hop : table.from.get(at)!.firstHops.get(top.to)![0]!
    // A backup may name the link (an LFA over one link of a bundle, an Adj-SID: D29).
    const edge =
      'hop' in top && top.link !== undefined
        ? table.graph.out.get(at)!.find((x) => x.linkId === top.link)!
        : normalLink(at, next)
    if (isUp(edge.linkId)) {
      if ('hop' in top) stack.shift()
      at = next
      path.push(at)
      links.push(edge.linkId)
      costs.push(edge.metric)
      labels.push(stack.flatMap((k) => (k.seg ? [k.seg] : [])))
      repairedHere = false
      continue
    }
    const down = edge.linkId
    if (repairedHere) {
      return { ...sofar(), delivered: false, drop: { at, link: down, next, reason: 'backup-down' } }
    }
    // A failed Adj-SID hop is repaired towards its far end (RFC 9855 §6.2, §9; Adj-SID
    // B-flag, RFC 8667 §2.2.1).
    // Only TI-LFA stacks carry Adj-SIDs mid-path, and a fresh backup's own first hop
    // was handled above. When the router's normal path to that neighbor doesn't use
    // the link (the Adj-SID forced a costlier link, or another link of a bundle:
    // D29), that normal path is the backup.
    const target = 'hop' in top ? top.hop : top.to
    const normalHop = table.from.get(at)!.firstHops.get(target)![0]!
    const viaNormal =
      'hop' in top && (normalHop !== target || normalLink(at, target).linkId !== down)
        ? { method: 'tilfa' as const, instrs: [{ to: target, seg: prefixOf(target) }] }
        : undefined
    const r = viaNormal ?? repairAt(table, resultsAt(at), down, target, mode, isUp, prefixOf)
    if (r === undefined) {
      return { ...sofar(), delivered: false, drop: { at, link: down, next, reason: 'no-backup' } }
    }
    repairs.push({ at, link: down, next, target, method: r.method, atIndex: path.length - 1 })
    stack = [...r.instrs, ...stack.slice(1)]
    repairedHere = true
  }
}

/**
 * Out of hops (labels keep piling up, so no state repeats exactly): cut the path
 * where traffic first comes back to a router, so the drawing stays readable.
 */
function ttlLoop(w: Omit<Walk, 'delivered'>): Walk {
  const { path } = w
  const k = path.findIndex((x, j) => path.indexOf(x) < j)
  if (k < 0) return { ...w, delivered: false, loopAt: path.at(-1)! }
  return {
    path: path.slice(0, k + 1),
    links: w.links.slice(0, k),
    costs: w.costs.slice(0, k),
    labels: w.labels.slice(0, k),
    repairs: w.repairs.filter((r) => r.atIndex < k),
    delivered: false,
    loopAt: path[k]!,
  }
}

/**
 * The PLR's backup for target `t` when its link `failed` is down, by the routers'
 * FRR mode, as what it puts on the packet. Built on the full topology: a backup
 * protects one link (RFC 5286 §1, RFC 9855 §3), so a bundle has one backup per
 * link (D29). `isUp` says which of the PLR's links still work; only the ECMP choice
 * uses it, since a forwarding entry holds one backup and the other methods have no
 * second one to try.
 */
function repairAt(
  table: AllPairs,
  results: DestinationResult[],
  failed: string,
  t: NodeId,
  mode: RepairMode,
  isUp: (linkId: string) => boolean,
  prefixOf: PrefixOf,
): Backup | undefined {
  const r = results.find((x) => x.dest === t)
  const p = r?.protections.find((x) => x.protectedLink.id === failed)
  if (r === undefined || p === undefined) return undefined

  // Another primary next-hop link is always loop-free and avoids the link (D16). It
  // comes first in every mode: the router just stops using the failed member (D22),
  // and every other failed member too, so it picks one that is still up (D25). If
  // none is, it keeps the lowest-id one and the packet is dropped there: the members
  // are each other's backups, so the entry has nothing left. Members are links, so
  // another link of a bundle is one too (D29).
  const others = r.protections.map((x) => x.protectedLink).filter((x) => x.id !== failed)
  const other = others.find((x) => isUp(x.id)) ?? others[0]
  if (p.ecmpProtected && other !== undefined) {
    return {
      method: 'ecmp',
      instrs: [
        { hop: other.to, link: other.id },
        { to: t, seg: prefixOf(t) },
      ],
    }
  }

  if (mode === 'tilfa') {
    const { path, outLink, segments } = p.tilfa
    if (!path || !outLink || !segments) return undefined
    // Out of the post-convergence first-hop interface, then the segment list (RFC 9855 §5.1).
    const segs = segments.map((s): Instr =>
      s.kind === 'prefix' ? { to: s.node, seg: s } : { hop: s.to, link: s.link, seg: s },
    )
    return { method: 'tilfa', instrs: [{ hop: path[1]!, link: outLink }, ...segs], segments }
  }

  if (p.lfa.best !== undefined) {
    const hop: Instr =
      p.lfa.bestLink === undefined ? { hop: p.lfa.best } : { hop: p.lfa.best, link: p.lfa.bestLink }
    return { method: 'lfa', instrs: [hop, { to: t, seg: prefixOf(t) }] }
  }
  const pq = p.rlfa.needed ? p.rlfa.best : undefined
  if (mode === 'rlfa' && pq !== undefined && shortestPath(table, pq, t)) {
    // Tunnel to the PQ node, through the exit neighbor for extended P-space (D11).
    const exit = p.rlfa.exitVia[pq]
    // The tunnel label is the PQ node's Prefix-SID (SR-MPLS, not targeted LDP).
    const toPq: Instr = { to: pq, seg: prefixOf(pq) }
    const tunnel: Instr[] = exit === undefined ? [toPq] : [{ hop: exit }, toPq]
    return { method: 'rlfa', instrs: [...tunnel, { to: t, seg: prefixOf(t) }] }
  }
  return undefined
}

/**
 * Does the PLR's backup for (D, link PLR–E), as planned for that one failure, pass
 * a failed router? Followed leg by leg on normal tables, the same way `forward`
 * would with only that link down (D27). Returns the first failed router met, the
 * router just before it, and which part of the backup leads there. `isUp` is the
 * PLR's real link state: an ECMP router drops every failed member, not only E (D25),
 * so the member checked must be the one `forward` sends the traffic to (D28).
 */
function backupThrough(
  table: AllPairs,
  results: DestinationResult[],
  plr: NodeId,
  failed: string,
  next: NodeId,
  d: NodeId,
  mode: RepairMode,
  downNodes: Set<NodeId>,
  isUp: (linkId: string) => boolean,
  prefixOf: PrefixOf,
): Through | undefined {
  const plan = repairAt(table, results, failed, d, mode, isUp, prefixOf)
  if (plan === undefined) return undefined
  let at = plr
  for (const [k, ins] of plan.instrs.entries()) {
    const leg = 'hop' in ins ? [at, ins.hop] : shortestPath(table, at, ins.to)
    if (leg === undefined) return undefined
    const j = leg.findIndex((x, i) => i > 0 && downNodes.has(x))
    if (j > 0) {
      const node = leg[j]!
      return { node, at: leg[j - 1]!, why: breakReason(table, plan, k, next, d, node) }
    }
    at = leg.at(-1)!
  }
  return undefined
}

/** Which part of the backup (instruction `k`) leads into failed router `node`. */
function breakReason(
  table: AllPairs,
  plan: Backup,
  k: number,
  e: NodeId,
  d: NodeId,
  node: NodeId,
): BackupBreak {
  const first = plan.instrs[0]!
  if (plan.method === 'ecmp' || plan.method === 'lfa') {
    const via = 'hop' in first ? first.hop : first.to
    const dist = (x: NodeId, y: NodeId) => table.from.get(x)!.dist.get(y)!
    // RFC 5286 §3.2 Inequality 3, only meaningful for the protected neighbor E itself.
    return node === e && via !== e
      ? {
          method: plan.method,
          via,
          check: { distND: dist(via, d), distNE: dist(via, e), distED: dist(e, d) },
        }
      : { method: plan.method, via }
  }
  if (plan.method === 'rlfa') {
    // [exit hop?, to PQ, to D]: everything before the last instruction is the tunnel.
    const tunnelEnd = plan.instrs.at(-2)!
    const pq = 'to' in tunnelEnd ? tunnelEnd.to : tunnelEnd.hop
    return { method: 'rlfa', pq, leg: k < plan.instrs.length - 1 ? 'to-pq' : 'from-pq' }
  }
  // [first hop, ...one instruction per segment] (RFC 9855 §5.1).
  return { method: 'tilfa', segment: k === 0 ? null : (plan.segments?.[k - 1] ?? null) }
}

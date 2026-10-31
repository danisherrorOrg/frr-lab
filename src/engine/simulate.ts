// Failure simulation (F5, docs/02-algorithms.md §8): fail one or more links and
// follow the traffic from S to every destination, first on the FRR repair path,
// then on the path the network uses once it has reconverged.
import { computeForSource } from './index'
import { shortestPath } from './paths'
import { allPairs, type AllPairs } from './spf'
import type { DestinationResult, NodeId, Topology } from './types'

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
  /** True when `before` crosses a failed link (in either direction). */
  affected: boolean
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
}

export interface FailureSimulation {
  /** The failed links, in the order given, without repeats. */
  links: FailedLink[]
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
 * next hop, an Adj-SID, a tunnel's exit neighbor); `to` = forward on normal
 * tables until this router (D, a PQ node, a Prefix-SID).
 */
type Instr = { hop: NodeId } | { to: NodeId }

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

/** Sum of directed metrics along a path. */
function pathCost(topology: Topology, path: NodeId[]): number {
  let cost = 0
  for (let i = 0; i + 1 < path.length; i++) {
    const [x, y] = [path[i]!, path[i + 1]!]
    const l = topology.links.find((k) => (k.a === x && k.b === y) || (k.a === y && k.b === x))
    if (l === undefined) throw new Error(`No link ${x}–${y} on the path.`)
    cost += l.a === x ? l.metricAB : l.metricBA
  }
  return cost
}

const samePath = (x: NodeId[], y: NodeId[]) =>
  x.length === y.length && x.every((n, i) => n === y[i])

const instrKey = (k: Instr) => ('hop' in k ? `>${k.hop}` : k.to)

/**
 * Fail links `linkIds` and follow traffic from `source` to every destination.
 * Traffic is forwarded hop by hop. Every router uses its normal (pre-failure)
 * table; a router whose own outgoing link is down switches to the backup it
 * pre-computed for that one link, as in FRR. That holds for traffic already on
 * someone else's backup too, so with several links down one repair can lead into
 * another, into a drop, or into a loop (D24).
 */
export function simulateFailure(
  topology: Topology,
  source: NodeId,
  linkIds: readonly string[],
  mode: RepairMode,
  options: SimulateOptions = {},
): FailureSimulation {
  const ids = [...new Set(linkIds)]
  if (ids.length === 0) throw new Error('No failed link given.')
  const links: FailedLink[] = ids.map((id) => {
    const l = topology.links.find((k) => k.id === id)
    if (l === undefined) throw new Error(`Unknown link "${id}".`)
    return { id: l.id, a: l.a, b: l.b }
  })
  const table = allPairs(topology)
  const fromS = table.from.get(source)
  if (fromS === undefined) throw new Error(`Unknown source router "${source}".`)

  const after = allPairs(withoutLinks(topology, new Set(ids)))
  /** The failed link between x and y, if any. */
  const downBetween = (x: NodeId, y: NodeId) =>
    links.find((l) => (x === l.a && y === l.b) || (x === l.b && y === l.a))

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
    const i = before.findIndex((x, k) => k + 1 < before.length && downBetween(x, before[k + 1]!))

    if (i >= 0) {
      const plr = before[i]!
      flow.affected = true
      flow.plr = plr
      flow.next = before[i + 1]!
      flow.hitLink = downBetween(plr, flow.next)!.id

      const walk = forward(table, source, d, mode, downBetween, resultsAt)
      flow.repairs = walk.repairs
      if (walk.repairs.length > 0) {
        flow.method = walk.repairs[0]!.method
        flow.repair = walk.path
        flow.repairCost = pathCost(topology, walk.path)
        // Up to the PLR the walk is the normal path, so the PLR sits at index i.
        flow.plrRepairCost = pathCost(topology, walk.path.slice(i))
      }
      if (walk.drop) flow.drop = walk.drop
      if (walk.loopAt !== undefined) flow.loopAt = walk.loopAt

      const plrAfter = shortestPath(after, plr, d)
      if (plrAfter) {
        flow.plrAfter = plrAfter
        flow.plrAfterCost = pathCost(topology, plrAfter)
        if (walk.delivered) {
          flow.match = samePath(walk.path.slice(i), plrAfter)
            ? 'same'
            : flow.plrRepairCost === flow.plrAfterCost
              ? 'same-cost'
              : 'longer'
        }
      }

      const sAfter = shortestPath(after, source, d)
      if (sAfter) {
        flow.after = sAfter
        flow.afterCost = pathCost(topology, sAfter)
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

  return { links, mode, flows }
}

interface Walk {
  path: NodeId[]
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
  downBetween: (x: NodeId, y: NodeId) => FailedLink | undefined,
  resultsAt: (x: NodeId) => DestinationResult[],
): Walk {
  const path = [source]
  const repairs: RepairStep[] = []
  /** Index in `path` of each repair's router. */
  const repairIdx: number[] = []
  const seen = new Set<string>()
  let at = source
  let stack: Instr[] = [{ to: d }]
  let repairedHere = false

  for (;;) {
    while (stack[0] !== undefined && 'to' in stack[0] && stack[0].to === at) stack.shift()
    const top = stack[0]
    if (top === undefined) return { path, repairs, delivered: true }

    if (!repairedHere) {
      const key = `${at}|${stack.map(instrKey).join(',')}`
      // Back at a router with the same labels: the exact loop, shown up to here.
      if (seen.has(key)) return { path, repairs, delivered: false, loopAt: at }
      if (path.length > MAX_HOPS) return ttlLoop(path, repairs, repairIdx)
      seen.add(key)
    }

    // firstHops are sorted: [0] is the lowest-id hop, the tie-break of the drawings.
    const next = 'hop' in top ? top.hop : table.from.get(at)!.firstHops.get(top.to)![0]!
    const down = downBetween(at, next)
    if (down === undefined) {
      if ('hop' in top) stack.shift()
      at = next
      path.push(at)
      repairedHere = false
      continue
    }
    if (repairedHere) {
      return {
        path,
        repairs,
        delivered: false,
        drop: { at, link: down.id, next, reason: 'backup-down' },
      }
    }
    // A failed Adj-SID hop is repaired towards its far end (RFC 9855 §6.2, §9; Adj-SID
    // B-flag, RFC 8667 §2.2.1).
    // Only TI-LFA stacks carry Adj-SIDs mid-path, and a fresh backup's own first hop
    // was handled above. When the router's normal path to that neighbor doesn't use
    // the link (the Adj-SID forced a costlier link), that normal path is the backup.
    const target = 'hop' in top ? top.hop : top.to
    const viaNormal =
      'hop' in top && table.from.get(at)!.firstHops.get(target)![0] !== target
        ? { method: 'tilfa' as const, instrs: [{ to: target }] }
        : undefined
    const isUp = (n: NodeId) => downBetween(at, n) === undefined
    const r = viaNormal ?? repairAt(table, resultsAt(at), next, target, mode, isUp)
    if (r === undefined) {
      return {
        path,
        repairs,
        delivered: false,
        drop: { at, link: down.id, next, reason: 'no-backup' },
      }
    }
    repairs.push({ at, link: down.id, next, target, method: r.method })
    repairIdx.push(path.length - 1)
    stack = [...r.instrs, ...stack.slice(1)]
    repairedHere = true
  }
}

/**
 * Out of hops (labels keep piling up, so no state repeats exactly): cut the path
 * where traffic first comes back to a router, so the drawing stays readable.
 */
function ttlLoop(path: NodeId[], repairs: RepairStep[], repairIdx: number[]): Walk {
  const k = path.findIndex((x, j) => path.indexOf(x) < j)
  if (k < 0) return { path, repairs, delivered: false, loopAt: path.at(-1)! }
  return {
    path: path.slice(0, k + 1),
    repairs: repairs.filter((_, j) => repairIdx[j]! < k),
    delivered: false,
    loopAt: path[k]!,
  }
}

/**
 * The PLR's backup for target `t` when its next hop `next` is unreachable, by the
 * routers' FRR mode, as what it puts on the packet. Built on the full topology:
 * a backup protects one link (RFC 5286 §1, RFC 9855 §3). `isUp` says which of the
 * PLR's links still work; only the ECMP choice uses it, since a forwarding entry
 * holds one backup and the other methods have no second one to try.
 */
function repairAt(
  table: AllPairs,
  results: DestinationResult[],
  next: NodeId,
  t: NodeId,
  mode: RepairMode,
  isUp: (neighbor: NodeId) => boolean,
): { method: RepairMethod; instrs: Instr[] } | undefined {
  const r = results.find((x) => x.dest === t)
  const p = r?.protections.find((x) => x.protectedLink.to === next)
  if (r === undefined || p === undefined) return undefined

  // Another primary next hop is always loop-free and avoids the link (D16). It comes
  // first in every mode: the router just stops using the failed member (D22), and
  // every other failed member too, so it picks one that is still up (D25). If none
  // is, it keeps the lowest-id one and the packet is dropped there: the members are
  // each other's backups, so the entry has nothing left.
  const others = r.nextHops.filter((n) => n !== next)
  const other = others.find(isUp) ?? others[0]
  if (p.ecmpProtected && other !== undefined) {
    return { method: 'ecmp', instrs: [{ hop: other }, { to: t }] }
  }

  if (mode === 'tilfa') {
    const { path, segments } = p.tilfa
    if (!path || !segments) return undefined
    // Out of the post-convergence first-hop interface, then the segment list (RFC 9855 §5.1).
    const segs = segments.map((s): Instr => (s.kind === 'prefix' ? { to: s.node } : { hop: s.to }))
    return { method: 'tilfa', instrs: [{ hop: path[1]! }, ...segs] }
  }

  if (p.lfa.best !== undefined) {
    return { method: 'lfa', instrs: [{ hop: p.lfa.best }, { to: t }] }
  }
  const pq = p.rlfa.needed ? p.rlfa.best : undefined
  if (mode === 'rlfa' && pq !== undefined && shortestPath(table, pq, t)) {
    // Tunnel to the PQ node, through the exit neighbor for extended P-space (D11).
    const exit = p.rlfa.exitVia[pq]
    const tunnel: Instr[] = exit === undefined ? [{ to: pq }] : [{ hop: exit }, { to: pq }]
    return { method: 'rlfa', instrs: [...tunnel, { to: t }] }
  }
  return undefined
}

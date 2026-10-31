// Failure simulation (F5, docs/02-algorithms.md §8): fail one or more links and
// follow the traffic from S to every destination, first on the FRR repair path,
// then on the path the network uses once it has reconverged.
import { computeForSource } from './index'
import { protectionPaths, shortestPath } from './paths'
import { allPairs } from './spf'
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
 * What happens to an affected flow while FRR is in charge:
 * - `repaired`: the backup avoids every failed link
 * - `broken`: the backup was built for one failure and runs into another failed link
 * - `dropped`: the PLR has no backup at all
 * - `unreachable`: the failed links cut D off from S; nothing could reach it
 */
export type FlowStatus = 'repaired' | 'broken' | 'dropped' | 'unreachable'

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
  /** Undefined when affected but nothing repairs it: traffic is dropped until convergence. */
  method?: RepairMethod
  /** S → … → PLR on the normal path, then the PLR's repair path to D. */
  repair?: NodeId[]
  repairCost?: number
  /** The first other failed link on the PLR's repair path, in the direction traffic goes. */
  brokenAt?: { link: string; from: NodeId; to: NodeId }
  /** S's path after convergence. Undefined when D can't be reached any more. */
  after?: NodeId[]
  afterCost?: number
  /** Cost of the repair from the PLR to D (the part after the normal path). */
  plrRepairCost?: number
  /** The PLR's own path to D once the network has reconverged, and its cost. */
  plrAfter?: NodeId[]
  plrAfterCost?: number
  /** Repair vs the PLR's final path. Only for repairs that survive. */
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

/**
 * Fail links `linkIds` and follow traffic from `source` to every destination.
 * Each router forwards on its normal (pre-failure) table; the PLR (the router
 * before the first failed link on the path) switches to its pre-computed repair,
 * as in FRR. Repairs are built for one failure, so with several links down a
 * repair can run into another failed link: it is then `broken` (D23).
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
  /** Index of the first hop of `path` on a failed link, or -1. */
  const firstDown = (path: NodeId[]) =>
    path.findIndex((x, k) => k + 1 < path.length && downBetween(x, path[k + 1]!) !== undefined)

  // Each PLR's results, computed once: every affected flow at that PLR shares them.
  const atPlr = new Map<NodeId, DestinationResult[]>()
  const resultsAt = (plr: NodeId) => {
    let r = atPlr.get(plr)
    if (r === undefined) {
      r = computeForSource(topology, plr, {
        explain: false,
        ...(options.extended !== undefined && { extended: options.extended }),
      })
      atPlr.set(plr, r)
    }
    return r
  }

  const flows: Flow[] = []
  for (const d of table.graph.nodes) {
    if (d === source || !fromS.dist.has(d)) continue
    const before = shortestPath(table, source, d)!
    const flow: Flow = { dest: d, before, beforeCost: fromS.dist.get(d)!, affected: false }

    const i = firstDown(before)
    if (i >= 0) {
      const plr = before[i]!
      const next = before[i + 1]!
      flow.affected = true
      flow.hitLink = downBetween(plr, next)!.id
      flow.plr = plr
      flow.next = next

      const repair = repairAt(topology, resultsAt(plr), plr, next, d, mode)
      if (repair) {
        flow.method = repair.method
        flow.repair = [...before.slice(0, i), ...repair.path]
        flow.repairCost = pathCost(topology, flow.repair)
        flow.plrRepairCost = pathCost(topology, repair.path)
        const j = firstDown(repair.path)
        if (j >= 0) {
          const [from, to] = [repair.path[j]!, repair.path[j + 1]!]
          flow.brokenAt = { link: downBetween(from, to)!.id, from, to }
        }
      }
      const plrAfter = shortestPath(after, plr, d)
      if (plrAfter) {
        flow.plrAfter = plrAfter
        flow.plrAfterCost = pathCost(topology, plrAfter)
        if (repair && !flow.brokenAt) {
          flow.match = samePath(repair.path, plrAfter)
            ? 'same'
            : flow.plrRepairCost === flow.plrAfterCost
              ? 'same-cost'
              : 'longer'
        }
      }
    }

    const sAfter = flow.affected ? shortestPath(after, source, d) : before
    if (sAfter) {
      flow.after = sAfter
      flow.afterCost = pathCost(topology, sAfter)
    }
    if (flow.affected) {
      flow.status = !flow.after
        ? 'unreachable'
        : !flow.repair
          ? 'dropped'
          : flow.brokenAt
            ? 'broken'
            : 'repaired'
    }
    flows.push(flow)
  }

  return { links, mode, flows }
}

/** The PLR's repair path to D for its next hop `next`, by the routers' FRR mode. */
function repairAt(
  topology: Topology,
  results: DestinationResult[],
  plr: NodeId,
  next: NodeId,
  d: NodeId,
  mode: RepairMode,
): { method: RepairMethod; path: NodeId[] } | undefined {
  const r = results.find((x) => x.dest === d)
  const p = r?.protections.find((x) => x.protectedLink.to === next)
  if (r === undefined || p === undefined) return undefined
  const paths = protectionPaths(topology, plr, d, p)

  if (mode === 'tilfa') return paths.tilfa && { method: 'tilfa', path: paths.tilfa }

  // Another primary next hop is always loop-free and avoids the link (D16).
  const other = r.nextHops.find((n) => n !== next)
  if (p.ecmpProtected && other !== undefined) {
    const rest = shortestPath(allPairs(topology), other, d)
    if (rest) return { method: 'ecmp', path: [plr, ...rest] }
  }
  if (paths.lfa) return { method: 'lfa', path: paths.lfa }
  if (mode === 'rlfa' && paths.rlfa) return { method: 'rlfa', path: paths.rlfa }
  return undefined
}

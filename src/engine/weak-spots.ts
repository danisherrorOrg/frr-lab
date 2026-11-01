// Weakest spots (TODO backlog, docs/02-algorithms.md §17): fail each link and each
// router on its own and count the traffic, from every router to every destination,
// that the routers' backups don't get through. Nothing new is decided: the counts
// are the failure simulation's (§8), every router as the source (§8.2).
import { cheapestEdge, withoutLink } from './graph'
import { shortestPath } from './paths'
import {
  backupsAt,
  hasBackup,
  routerFailureCounts,
  type NormalFlow,
  type RepairMode,
} from './simulate'
import { allPairs, spf } from './spf'
import type { NodeId, Topology } from './types'

/** What happens to the flows (source, destination) that cross one failed link or router. */
export interface SpotCounts {
  /** Flows whose normal path crosses it; flows to a failed router itself are left out. */
  affected: number
  /** A backup gets the traffic through. */
  repaired: number
  /** A router on the way has no backup it can use. */
  dropped: number
  /** The backups send the traffic round in a circle (only when a router fails). */
  looped: number
  /** The failure cuts the destination off: no backup could help. */
  unreachable: number
}

export interface WeakSpot {
  kind: 'link' | 'node'
  /** Link id or router id. */
  id: string
  /** A link's ends. */
  a?: NodeId
  b?: NodeId
  counts: SpotCounts
  /** dropped + looped + unreachable: flows that don't get through until reconvergence, or ever. */
  unprotected: number
  /** Router only: flows to that router itself, unreachable as expected (D27). */
  destDown?: number
}

export interface WeakSpots {
  mode: RepairMode
  /** Every (source, destination) flow in the network: routers each source reaches. */
  flows: number
  /** Most unprotected flows first; ties: more affected, links before routers, then id. */
  spots: WeakSpot[]
}

export interface WeakSpotOptions {
  /** Use extended P-space for RLFA (default true, D5). */
  extended?: boolean
  /** Called after each link and router: `done` of `total` finished, `id` the one just done. */
  onProgress?: (done: number, total: number, id: string) => void
}

const empty = (): SpotCounts => ({
  affected: 0,
  repaired: 0,
  dropped: 0,
  looped: 0,
  unreachable: 0,
})

const unprotected = (c: SpotCounts) => c.dropped + c.looped + c.unreachable

/**
 * Fail every link and every router, one at a time, and count the flows each
 * failure leaves unprotected when the routers run `mode`.
 */
export function weakSpots(
  topology: Topology,
  mode: RepairMode,
  options: WeakSpotOptions = {},
): WeakSpots {
  const table = allPairs(topology)
  const nodes = table.graph.nodes
  const total = topology.links.length + nodes.length
  let done = 0
  const tick = (id: string) => options.onProgress?.(++done, total, id)

  // Links: a single failed link is repaired by one router at most, and the traffic
  // never loops (§8, property-tested), so each flow's fate is the backup of the
  // router just before the link: the same answer as simulateFailure, without
  // following every packet. `links` is in file order; sorted below.
  const cutOff = (w: NodeId, x: NodeId, d: NodeId, link: string) =>
    w === x || !table.graph.overloaded.has(w) || !spf(withoutLink(table.graph, link), w).dist.has(d)
  const byLink = new Map<string, SpotCounts>(topology.links.map((l) => [l.id, empty()]))
  const normal: NormalFlow[] = []
  for (const w of nodes) {
    for (const d of nodes) {
      if (d === w || !table.from.get(w)!.dist.has(d)) continue
      // The one path the simulation follows: lowest-id ties, cheapest link (D29).
      const path = shortestPath(table, w, d)!
      normal.push({ source: w, dest: d, path })
      for (let k = 0; k + 1 < path.length; k++) {
        const x = path[k]!
        const link = cheapestEdge(table.graph, x, path[k + 1]!)!.linkId
        const c = byLink.get(link)!
        c.affected += 1
        const p = backupsAt(topology, x, options.extended)
          .find((r) => r.dest === d)
          ?.protections.find((q) => q.protectedLink.id === link)
        // TI-LFA finds no path without the link: the link cut D off from x. Then w is
        // cut off too (links work both ways, and w reached x without it), unless w has
        // the overload bit: w may still reach D itself on a path x can't use.
        if (p !== undefined && p.tilfa.path === undefined) {
          if (cutOff(w, x, d, link)) c.unreachable += 1
          else c.dropped += 1
        } else if (p !== undefined && hasBackup(p, mode)) c.repaired += 1
        else c.dropped += 1
      }
    }
  }
  const spots: WeakSpot[] = []
  for (const l of topology.links) {
    const counts = byLink.get(l.id)!
    spots.push({ kind: 'link', id: l.id, a: l.a, b: l.b, counts, unprotected: unprotected(counts) })
    tick(l.id)
  }

  // Routers: backups through the failed router break, and a neighbor may repair
  // again, drop or loop (§8.1), so the flows that meet it are followed hop by hop,
  // exactly as the failure simulation does.
  for (const n of nodes) {
    const { destDown, ...counts } = routerFailureCounts(topology, n, mode, normal, {
      ...(options.extended !== undefined && { extended: options.extended }),
    })
    spots.push({ kind: 'node', id: n, counts, unprotected: unprotected(counts), destDown })
    tick(n)
  }

  spots.sort(
    (x, y) =>
      y.unprotected - x.unprotected ||
      y.counts.affected - x.counts.affected ||
      (x.kind === y.kind ? 0 : x.kind === 'link' ? -1 : 1) ||
      (x.id < y.id ? -1 : x.id > y.id ? 1 : 0),
  )
  return { mode, flows: normal.length, spots }
}

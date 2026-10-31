// Node-by-node paths for drawing a result on the canvas (F4). The UI does no
// routing maths itself (docs/03-architecture.md §1), so it asks for these here.
import { cheapestEdge } from './graph'
import { allPairs, type AllPairs } from './spf'
import type { NodeId, Protection, Topology } from './types'

/**
 * One shortest path X → Y in the normal network, or undefined if Y can't be reached.
 * Ties are broken by the lowest router id at the first difference, the same rule
 * as the post-convergence path (docs/02-algorithms.md §4.1), so drawings are stable.
 */
export function shortestPath(table: AllPairs, x: NodeId, y: NodeId): NodeId[] | undefined {
  const path = [x]
  let at = x
  while (at !== y) {
    // firstHops are sorted, so [0] is the lowest-id hop that starts a shortest path.
    const hop = table.from.get(at)?.firstHops.get(y)?.[0]
    if (hop === undefined) return undefined
    path.push(hop)
    at = hop
  }
  return path
}

export interface ProtectionPaths {
  /** S → E, then E's shortest path to D. */
  primary: NodeId[]
  /** S → best LFA N, then N's normal path to D (RFC 5286 §4). */
  lfa?: NodeId[]
  /** S → PQ node (through the exit neighbor for extended P, D11), then PQ's path to D. */
  rlfa?: NodeId[]
  /** The post-convergence path (RFC 9855 §3). */
  tilfa?: NodeId[]
}

/** S → `first`'s last router, then its normal shortest path to D. */
function via(table: AllPairs, first: NodeId[], d: NodeId): NodeId[] | undefined {
  const rest = shortestPath(table, first[first.length - 1]!, d)
  return rest && [...first, ...rest.slice(1)]
}

/** The LFA's path: S → N, then N's normal path to D (RFC 5286 §4). */
export const lfaPath = (table: AllPairs, s: NodeId, n: NodeId, d: NodeId) => via(table, [s, n], d)

/**
 * The Remote LFA path: S's tunnel to the PQ node (through the exit neighbor for
 * extended P-space, D11), then the PQ node's normal path to D (RFC 7490 §5.2).
 */
export function rlfaPath(
  table: AllPairs,
  s: NodeId,
  pq: NodeId,
  exit: NodeId | undefined,
  d: NodeId,
): NodeId[] | undefined {
  const toPq = exit === undefined ? shortestPath(table, s, pq) : via(table, [s, exit], pq)
  return toPq && via(table, toPq, d)
}

/** Paths for one (S, D, protected link S–E) result. */
export function protectionPaths(
  topology: Topology,
  s: NodeId,
  d: NodeId,
  p: Protection,
): ProtectionPaths {
  const table = allPairs(topology)
  const e = p.protectedLink.to
  const out: ProtectionPaths = { primary: via(table, [s, e], d) ?? [s, e] }

  const n = p.lfa.best
  const lfa = n === undefined ? undefined : lfaPath(table, s, n, d)
  if (lfa) out.lfa = lfa

  const pq = p.rlfa.needed ? p.rlfa.best : undefined
  if (pq !== undefined) {
    const rlfa = rlfaPath(table, s, pq, p.rlfa.exitVia[pq], d)
    if (rlfa) out.rlfa = rlfa
  }

  if (p.tilfa.path) out.tilfa = p.tilfa.path
  return out
}

export interface HopLinkOptions {
  /** The link of the first hop, when it is known (the protected link, an LFA's link, D29). */
  first?: string
  /** Links not to use (failed ones), unless a hop has no other link. */
  avoid?: Iterable<string>
}

/**
 * The link each hop of a node path takes, for drawing: `first` for the first hop
 * if given, else the cheapest link in that direction that isn't avoided, lowest id
 * on ties. That is the link normal forwarding and repairs use (D29), so a bundle
 * shows which of its links carries the traffic. `undefined` = no link there.
 */
export function hopLinks(
  topology: Topology,
  path: NodeId[],
  options: HopLinkOptions = {},
): (string | undefined)[] {
  const graph = allPairs(topology).graph
  const avoid = new Set(options.avoid ?? [])
  const out: (string | undefined)[] = []
  for (let i = 0; i + 1 < path.length; i++) {
    const [x, y] = [path[i]!, path[i + 1]!]
    const given = i === 0 ? options.first : undefined
    const fits =
      given !== undefined && graph.out.get(x)?.some((e) => e.to === y && e.linkId === given)
    const edge = fits
      ? given
      : (cheapestEdge(graph, x, y, (id) => avoid.has(id)) ?? cheapestEdge(graph, x, y))?.linkId
    out.push(edge)
  }
  return out
}

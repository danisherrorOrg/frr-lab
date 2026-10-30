// Node-by-node paths for drawing a result on the canvas (F4). The UI does no
// routing maths itself (docs/03-architecture.md §1), so it asks for these here.
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

/** Paths for one (S, D, protected link S–E) result. */
export function protectionPaths(
  topology: Topology,
  s: NodeId,
  d: NodeId,
  p: Protection,
): ProtectionPaths {
  const table = allPairs(topology)
  const via = (first: NodeId[], to: NodeId): NodeId[] | undefined => {
    const rest = shortestPath(table, first[first.length - 1]!, to)
    return rest && [...first, ...rest.slice(1)]
  }

  const e = p.protectedLink.to
  const out: ProtectionPaths = { primary: via([s, e], d) ?? [s, e] }

  const n = p.lfa.best
  const lfa = n === undefined ? undefined : via([s, n], d)
  if (lfa) out.lfa = lfa

  const pq = p.rlfa.needed ? p.rlfa.best : undefined
  if (pq !== undefined) {
    const exit = p.rlfa.exitVia[pq]
    const toPq = exit === undefined ? shortestPath(table, s, pq) : via([s, exit], pq)
    const rlfa = toPq && via(toPq, d)
    if (rlfa) out.rlfa = rlfa
  }

  if (p.tilfa.path) out.tilfa = p.tilfa.path
  return out
}

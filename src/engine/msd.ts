// Max SID depth (MSD): docs/02-algorithms.md §14, D44.
import type { NodeId, Topology } from './types'

/**
 * Router `node`'s Base MPLS Imposition MSD (RFC 8491 §5): its own value, else the
 * network's. Undefined = no limit.
 */
export function msdOf(topology: Topology, node: NodeId): number | undefined {
  return topology.nodes.find((n) => n.id === node)?.msd ?? topology.msd
}

/**
 * Labels imposed = labels swapped + labels pushed (RFC 8491 §1.1). S swaps D's own
 * label and pushes the repair list, so the whole stack counts (for IP traffic S
 * pushes all of it, the same number).
 */
export function isTooDeep(labelStack: readonly number[], msd: number | undefined): boolean {
  return msd !== undefined && labelStack.length > msd
}

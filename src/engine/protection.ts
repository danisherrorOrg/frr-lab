// What the backups protect against: the link, or the next-hop router (D51,
// docs/02-algorithms.md §4.4 and §3.1).
import type { ProtectionGoal, Topology } from './types'

/** The network's protection goal; left out = link protection. */
export function protectionOf(topology: Topology): ProtectionGoal {
  return topology.protection ?? 'link'
}

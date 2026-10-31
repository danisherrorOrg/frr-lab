// Coverage heat map (TODO backlog, docs/02-algorithms.md §12): the §5 coverage numbers
// grouped by router and by link, so the canvas can colour each by how well it is protected.
import { countPair, emptyCounts, type CoverageCounts } from './coverage'
import { computeForSource } from './index'
import { allPairs } from './spf'
import type { RepairMode } from './simulate'
import type { NodeId, Topology } from './types'

export interface HeatMap {
  /**
   * Per router R: the pairs R repairs as the PLR, i.e. R's own coverage row (§5).
   * A router that reaches nothing has 0 pairs.
   */
  routers: Record<NodeId, CoverageCounts>
  /**
   * Per link: the pairs repaired when it fails, both directions added up. Each is
   * a row of the router before the link (FRR is local repair, §11). A link on no
   * shortest path has 0 pairs: it can only be a backup.
   */
  links: Record<string, CoverageCounts>
}

/**
 * Every router's results once (as in "all sources" coverage), counted per router
 * and per protected link. Nothing new is decided: the counts are §5's.
 */
export function coverageMap(
  topology: Topology,
  options: {
    extended?: boolean
    onProgress?: (done: number, total: number, source: NodeId) => void
  } = {},
): HeatMap {
  const nodes = allPairs(topology).graph.nodes
  const routers: HeatMap['routers'] = {}
  const links: HeatMap['links'] = {}
  for (const l of [...topology.links].sort((x, y) => (x.id < y.id ? -1 : x.id > y.id ? 1 : 0)))
    links[l.id] = emptyCounts()

  nodes.forEach((source, i) => {
    const counts = emptyCounts()
    const results = computeForSource(topology, source, {
      explain: false,
      ...(options.extended !== undefined && { extended: options.extended }),
    })
    for (const r of results)
      for (const p of r.protections) {
        countPair(counts, p)
        countPair(links[p.protectedLink.id]!, p)
      }
    routers[source] = counts
    options.onProgress?.(i + 1, nodes.length, source)
  })
  return { routers, links }
}

/**
 * Pairs protected when routers run `mode` (the simulation's repair modes): LFA
 * (ECMP counts as LFA, §5), LFA or Remote LFA, or TI-LFA.
 */
export function protectedIn(counts: CoverageCounts, mode: RepairMode): number {
  return counts[mode]
}

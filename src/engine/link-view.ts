// Per-link view (TODO backlog, docs/02-algorithms.md §11): pick a link, see every
// (source, destination) whose traffic crosses it and how that traffic is protected.
import { edgeOf } from './graph'
import { computeForSource } from './index'
import { toRows, type Method, type ResultRow } from './rows'
import { allPairs, dist, linkPathCost } from './spf'
import type { NodeId, Topology } from './types'

/** One destination the router before the link protects over it. */
export interface LinkPair {
  /** The repairing router's results row: `row.source` is the PLR (§8 step 2). */
  row: ResultRow
  /**
   * Every router whose traffic to `row.dest` crosses the link this way on some
   * shortest path, sorted. Always holds `row.source`. A tie counts as crossing (§1.5).
   */
  sources: NodeId[]
}

export interface LinkDirection {
  from: NodeId
  to: NodeId
  /** Sorted by destination, as in the results table. */
  pairs: LinkPair[]
  /** (source, destination) flows over this direction: the sum of `sources` lengths. */
  flows: number
  /** Pairs by the simplest method that protects them (§5 order); `none` = unprotected. */
  counts: Record<Method | 'none', number>
}

export interface LinkView {
  link: string
  a: NodeId
  b: NodeId
  /** a→b, then b→a. */
  directions: [LinkDirection, LinkDirection]
}

/**
 * What one link carries and how each flow is protected if it fails. FRR is local
 * repair: whoever sends the traffic, the router before the link repairs it with
 * its own backup for (D, that link) (RFC 5286 §1, RFC 9855 §2). So each pair is
 * that router's results row, and `sources` lists the traffic that row protects.
 */
export function linkView(
  topology: Topology,
  linkId: string,
  options: { extended?: boolean } = {},
): LinkView {
  const link = topology.links.find((l) => l.id === linkId)
  if (link === undefined) throw new Error(`Unknown link "${linkId}".`)
  const table = allPairs(topology)
  const nodes = table.graph.nodes

  const direction = (from: NodeId, to: NodeId): LinkDirection => {
    const metric = edgeOf(table.graph, from, linkId)!.metric
    const rows = toRows(
      from,
      computeForSource(topology, from, {
        explain: false,
        ...(options.extended !== undefined && { extended: options.extended }),
      }),
    ).filter((r) => r.link === linkId)

    // X's traffic to D crosses from→to on some shortest path when
    // dist(X,from) + c + dist(to,D) = dist(X,D) (§1.5 with "=" as "uses it").
    const pairs = rows.map((row): LinkPair => {
      const sources = nodes.filter((x) => {
        if (x === row.dest) return false
        // Infinity when `from` or `to` has the overload bit and would be transit.
        const via = linkPathCost(table, x, from, to, metric, row.dest)
        return Number.isFinite(via) && via === dist(table, x, row.dest)
      })
      return { row, sources }
    })

    const counts: LinkDirection['counts'] = { ecmp: 0, lfa: 0, rlfa: 0, tilfa: 0, none: 0 }
    for (const p of pairs) counts[p.row.protectedBy ?? 'none'] += 1
    return { from, to, pairs, flows: pairs.reduce((n, p) => n + p.sources.length, 0), counts }
  }

  return {
    link: linkId,
    a: link.a,
    b: link.b,
    directions: [direction(link.a, link.b), direction(link.b, link.a)],
  }
}

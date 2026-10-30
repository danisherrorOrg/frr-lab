import type { NodeId, Topology } from './types'

/** One direction of a link. Metrics can differ per direction (docs/02-algorithms.md intro). */
export interface Edge {
  from: NodeId
  to: NodeId
  metric: number
  linkId: string
}

export interface Graph {
  /** All router ids, sorted. */
  nodes: NodeId[]
  /** Edges leaving each router, sorted by `to`. Used by forward SPF (§1.1). */
  out: Map<NodeId, Edge[]>
  /** Edges arriving at each router, sorted by `from`. Used by reverse SPF (§1.2). */
  in: Map<NodeId, Edge[]>
}

const byId = (x: NodeId, y: NodeId) => (x < y ? -1 : x > y ? 1 : 0)

/**
 * Build a directed adjacency list from a validated topology.
 * Everything is sorted so results never depend on the order of the file
 * (CLAUDE.md rule 1: same input → same output).
 */
export function buildGraph(topology: Topology): Graph {
  const nodes = topology.nodes.map((n) => n.id).sort(byId)
  const out = new Map<NodeId, Edge[]>(nodes.map((id) => [id, []]))
  const inc = new Map<NodeId, Edge[]>(nodes.map((id) => [id, []]))

  const add = (edge: Edge) => {
    const from = out.get(edge.from)
    const to = inc.get(edge.to)
    if (from === undefined || to === undefined) {
      const missing = from === undefined ? edge.from : edge.to
      throw new Error(`Link ${edge.linkId} points to unknown router "${missing}".`)
    }
    from.push(edge)
    to.push(edge)
  }

  for (const link of topology.links) {
    add({ from: link.a, to: link.b, metric: link.metricAB, linkId: link.id })
    add({ from: link.b, to: link.a, metric: link.metricBA, linkId: link.id })
  }
  for (const edges of out.values()) edges.sort((x, y) => byId(x.to, y.to))
  for (const edges of inc.values()) edges.sort((x, y) => byId(x.from, y.from))

  return { nodes, out, in: inc }
}

/** c(X,Y): metric of the direct link X→Y, or undefined if X and Y aren't neighbors. */
export function linkMetric(graph: Graph, x: NodeId, y: NodeId): number | undefined {
  return graph.out.get(x)?.find((e) => e.to === y)?.metric
}

import type { NodeId, Topology } from './types'

/** One direction of a link. Metrics can differ per direction (docs/02-algorithms.md intro). */
export interface Edge {
  from: NodeId
  to: NodeId
  metric: number
  /** Metric of the same link the other way (to→from). RFC 5286 §3.5 checks both. */
  back: number
  linkId: string
}

export interface Graph {
  /** All router ids, sorted. */
  nodes: NodeId[]
  /** Edges leaving each router, sorted by `to`, then link id. Used by forward SPF (§1.1). */
  out: Map<NodeId, Edge[]>
  /** Edges arriving at each router, sorted by `from`, then link id. Used by reverse SPF (§1.2). */
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
    const { a, b, metricAB: ab, metricBA: ba, id } = link
    add({ from: a, to: b, metric: ab, back: ba, linkId: id })
    add({ from: b, to: a, metric: ba, back: ab, linkId: id })
  }
  // Parallel links (D29) share `to`, so the link id breaks the tie.
  for (const edges of out.values())
    edges.sort((x, y) => byId(x.to, y.to) || byId(x.linkId, y.linkId))
  for (const edges of inc.values())
    edges.sort((x, y) => byId(x.from, y.from) || byId(x.linkId, y.linkId))

  return { nodes, out, in: inc }
}

/**
 * c(X,Y): metric of the cheapest direct link X→Y, or undefined if X and Y aren't
 * neighbors. With parallel links (D29) that is the one shortest paths use.
 */
export function linkMetric(graph: Graph, x: NodeId, y: NodeId): number | undefined {
  return cheapestEdge(graph, x, y)?.metric
}

/** Every link direction X→Y, sorted by link id. More than one = parallel links (D29). */
export function edgesBetween(graph: Graph, x: NodeId, y: NodeId): Edge[] {
  return (graph.out.get(x) ?? []).filter((e) => e.to === y)
}

/**
 * The link X→Y normal forwarding uses: the cheapest, then the lowest link id
 * (same tie-break idea as §4.1, so one flow and one drawing per destination: D29).
 * `skip` leaves links out (failed ones).
 */
export function cheapestEdge(
  graph: Graph,
  x: NodeId,
  y: NodeId,
  skip?: (linkId: string) => boolean,
): Edge | undefined {
  let best: Edge | undefined
  for (const e of graph.out.get(x) ?? []) {
    if (e.to !== y || skip?.(e.linkId)) continue
    if (best === undefined || e.metric < best.metric) best = e
  }
  return best
}

/** The direction from→… of link `linkId`, or undefined if `from` isn't one of its ends. */
export function edgeOf(graph: Graph, from: NodeId, linkId: string): Edge | undefined {
  return graph.out.get(from)?.find((e) => e.linkId === linkId)
}

/** True when X and Y are joined by more than one link (a bundle, D29). */
export function isBundle(graph: Graph | undefined, x: NodeId, y: NodeId): boolean {
  return graph !== undefined && edgesBetween(graph, x, y).length > 1
}

/** "S–E", or "S–E (S-E#2)" when S and E have parallel links, so text names the one meant (D29). */
export function linkText(
  graph: Graph | undefined,
  x: NodeId,
  y: NodeId,
  linkId: string | undefined,
): string {
  return linkId !== undefined && isBundle(graph, x, y) ? `${x}–${y} (${linkId})` : `${x}–${y}`
}

/** "N", or "N over S-N#2" when S and N have parallel links (D29). */
export function hopText(
  graph: Graph | undefined,
  s: NodeId,
  n: NodeId,
  linkId: string | undefined,
): string {
  return linkId !== undefined && isBundle(graph, s, n) ? `${n} over ${linkId}` : n
}

/**
 * The same graph without one link (both directions). Filtering keeps the sort
 * order, so it is much cheaper than buildGraph(); TI-LFA needs one per protected link.
 */
export function withoutLink(graph: Graph, linkId: string): Graph {
  const drop = (m: Map<NodeId, Edge[]>) =>
    new Map([...m].map(([k, edges]) => [k, edges.filter((e) => e.linkId !== linkId)]))
  return { nodes: graph.nodes, out: drop(graph.out), in: drop(graph.in) }
}

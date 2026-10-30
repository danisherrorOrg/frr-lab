import { buildGraph, type Graph } from './graph'
import type { NodeId, Topology } from './types'

/** Shortest paths from one root. Routers that can't be reached have no entries. */
export interface SpfResult {
  root: NodeId
  /** dist(root, Y). */
  dist: Map<NodeId, number>
  /** Every predecessor of Y on some shortest path, sorted (needed for ECMP: §1.1). */
  preds: Map<NodeId, NodeId[]>
  /** Neighbors of the root that start some shortest path to Y, sorted. Empty for the root. */
  firstHops: Map<NodeId, NodeId[]>
}

const byId = (x: NodeId, y: NodeId) => (x < y ? -1 : x > y ? 1 : 0)

/** Forward SPF (Dijkstra) from `root`: docs/02-algorithms.md §1.1. */
export function spf(graph: Graph, root: NodeId): SpfResult {
  const { dist, preds, settled } = dijkstra(graph, root, 'forward')
  for (const list of preds.values()) list.sort(byId)

  // Metrics are positive, so every predecessor is settled before the node itself:
  // walking in settle order lets each node inherit its predecessors' first hops.
  const firstHops = new Map<NodeId, NodeId[]>([[root, []]])
  for (const y of settled) {
    if (y === root) continue
    const hops = new Set<NodeId>()
    for (const p of preds.get(y) ?? []) {
      if (p === root) hops.add(y)
      else for (const h of firstHops.get(p) ?? []) hops.add(h)
    }
    firstHops.set(y, [...hops].sort(byId))
  }

  return { root, dist, preds, firstHops }
}

/** Distances to one root. Routers that can't reach it have no entry. */
export interface ReverseSpfResult {
  root: NodeId
  /** dist(Y, root). */
  dist: Map<NodeId, number>
}

/**
 * Reverse SPF: Dijkstra over incoming edges, giving dist(Y, root) for every Y
 * in one run. Q-space needs this when metrics differ per direction (§1.2, RFC 7490 §5.3).
 */
export function reverseSpf(graph: Graph, root: NodeId): ReverseSpfResult {
  return { root, dist: dijkstra(graph, root, 'reverse').dist }
}

/** dist(X,Y) for every pair, from one forward SPF per router (§1.3). */
export interface AllPairs {
  graph: Graph
  /** Forward SPF from each router, in sorted router order. */
  from: Map<NodeId, SpfResult>
}

// Cache keyed by the topology object itself. The store replaces the topology on
// every edit instead of changing it, so a new object is the "new version" (§1.3).
// This doesn't break purity: the same input still gives the same output.
const cache = new WeakMap<Topology, AllPairs>()

/** All-pairs shortest paths, cached per topology object. Treat topologies as immutable. */
export function allPairs(topology: Topology): AllPairs {
  const cached = cache.get(topology)
  if (cached !== undefined) return cached
  const graph = buildGraph(topology)
  const table: AllPairs = { graph, from: new Map(graph.nodes.map((x) => [x, spf(graph, x)])) }
  cache.set(topology, table)
  return table
}

/** dist(X,Y), or Infinity if Y can't be reached, so strict "<" checks stay false. */
export function dist(table: AllPairs, x: NodeId, y: NodeId): number {
  const fromX = table.from.get(x)
  if (fromX === undefined) throw new Error(`Distance from unknown router "${x}".`)
  if (!table.from.has(y)) throw new Error(`Distance to unknown router "${y}".`)
  return fromX.dist.get(y) ?? Infinity
}

/**
 * Shared Dijkstra. Forward follows edges leaving each router; reverse follows
 * edges arriving, so "predecessors" in reverse are next hops towards the root.
 */
function dijkstra(graph: Graph, root: NodeId, direction: 'forward' | 'reverse') {
  const edges = direction === 'forward' ? graph.out : graph.in
  if (!edges.has(root)) throw new Error(`SPF from unknown router "${root}".`)

  const dist = new Map<NodeId, number>([[root, 0]])
  const preds = new Map<NodeId, NodeId[]>([[root, []]])
  const settled: NodeId[] = []
  const done = new Set<NodeId>()
  const heap = new MinHeap()
  heap.push(0, root)

  for (let item = heap.pop(); item !== undefined; item = heap.pop()) {
    const [d, u] = item
    // Lazy deletion: skip stale heap entries.
    if (done.has(u) || d !== dist.get(u)) continue
    done.add(u)
    settled.push(u)

    for (const edge of edges.get(u) ?? []) {
      const v = direction === 'forward' ? edge.to : edge.from
      const candidate = d + edge.metric
      const current = dist.get(v)
      if (current === undefined || candidate < current) {
        dist.set(v, candidate)
        preds.set(v, [u])
        heap.push(candidate, v)
      } else if (candidate === current) {
        // Equal cost: keep every predecessor so ECMP is visible.
        preds.get(v)?.push(u)
      }
    }
  }
  return { dist, preds, settled }
}

/** Binary min-heap of [distance, node], ties broken by node id so the settle order is fixed. */
class MinHeap {
  private items: [number, NodeId][] = []

  push(d: number, id: NodeId): void {
    const items = this.items
    items.push([d, id])
    let i = items.length - 1
    while (i > 0) {
      const parent = (i - 1) >> 1
      if (!less(items[i]!, items[parent]!)) break
      swap(items, i, parent)
      i = parent
    }
  }

  pop(): [number, NodeId] | undefined {
    const items = this.items
    const top = items[0]
    const last = items.pop()
    if (top === undefined || last === undefined || items.length === 0) return top
    items[0] = last
    let i = 0
    for (;;) {
      const l = 2 * i + 1
      const r = l + 1
      let min = i
      if (l < items.length && less(items[l]!, items[min]!)) min = l
      if (r < items.length && less(items[r]!, items[min]!)) min = r
      if (min === i) return top
      swap(items, i, min)
      i = min
    }
  }
}

const less = (a: [number, NodeId], b: [number, NodeId]) =>
  a[0] < b[0] || (a[0] === b[0] && a[1] < b[1])

function swap<T>(arr: T[], i: number, j: number): void {
  const t = arr[i]!
  arr[i] = arr[j]!
  arr[j] = t
}

// Shared risk link groups (Later #3, D53, docs/02-algorithms.md §18): links that fail
// together. A pure lookup over Link.srlg.
import { cheapestEdge, type Edge, type Graph } from './graph'
import { dist, linkPathCost, type AllPairs } from './spf'
import type { NodeId, Protection, ProtectionGoal, Protects, Topology } from './types'

/** Does this goal plan around router E? */
export const hasNode = (g: ProtectionGoal): boolean => g === 'node' || g === 'node-srlg'
/** Does this goal plan around the protected link's SRLGs? */
export const hasSrlg = (g: ProtectionGoal): boolean => g === 'srlg' || g === 'node-srlg'

/** Every SRLG and its links, sorted by group name, then link id. */
export function srlgGroups(topology: Topology): { group: string; links: string[] }[] {
  const by = new Map<string, string[]>()
  for (const l of topology.links)
    for (const g of l.srlg ?? []) by.set(g, [...(by.get(g) ?? []), l.id])
  return [...by]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([group, links]) => ({ group, links: [...links].sort() }))
}

// Keyed by topology object (D15).
const cache = new WeakMap<Topology, Map<string, string[]>>()

/**
 * The links that share at least one SRLG with `linkId`, not counting the link itself,
 * sorted. Empty when the link has no SRLG.
 */
export function srlgShared(topology: Topology, linkId: string): string[] {
  let byLink = cache.get(topology)
  if (byLink === undefined) {
    byLink = new Map()
    cache.set(topology, byLink)
  }
  const hit = byLink.get(linkId)
  if (hit !== undefined) return hit
  const groups = new Set(topology.links.find((l) => l.id === linkId)?.srlg ?? [])
  const shared =
    groups.size === 0
      ? []
      : topology.links
          .filter((l) => l.id !== linkId && (l.srlg ?? []).some((g) => groups.has(g)))
          .map((l) => l.id)
          .sort()
  byLink.set(linkId, shared)
  return shared
}

/** Both directions of these links, from the graph. */
export function sharedEdges(graph: Graph, links: readonly string[]): Edge[] {
  if (links.length === 0) return []
  const set = new Set(links)
  return graph.nodes.flatMap((n) => (graph.out.get(n) ?? []).filter((e) => set.has(e.linkId)))
}

/** Every normal shortest path x→y avoids all of these link directions (§1.5, ties count as "uses"). */
export function pathAvoids(
  table: AllPairs,
  x: NodeId,
  y: NodeId,
  shared: readonly Edge[],
): boolean {
  if (x === y) return true
  const d = dist(table, x, y)
  return shared.every((e) => d < linkPathCost(table, x, e.from, e.to, e.metric, y))
}

/**
 * Does the Remote LFA tunnel S → (exit N) → PQ, then PQ's path to D, avoid every
 * link of the SRLG (D53)? The exit leaves on S's cheapest link to N (D29).
 */
export function rlfaAvoidsSrlg(
  table: AllPairs,
  s: NodeId,
  pq: NodeId,
  exit: NodeId | undefined,
  d: NodeId,
  shared: readonly Edge[],
): boolean {
  if (shared.length === 0) return true
  const ids = new Set(shared.map((e) => e.linkId))
  const toPq =
    exit === undefined
      ? pathAvoids(table, s, pq, shared)
      : !ids.has(cheapestEdge(table.graph, s, exit)!.linkId) && pathAvoids(table, exit, pq, shared)
  return toPq && pathAvoids(table, pq, d, shared)
}

/**
 * Adds the SRLG part to a Remote LFA's `protects` (D53): `link` → `srlg`, `node` →
 * `node-srlg` when the tunnel avoids the SRLG; else it stays and gets a fallback.
 */
export function withSrlgProtects(rlfa: Protection['rlfa'], avoids: boolean): Protection['rlfa'] {
  if (!rlfa.needed || rlfa.best === undefined) return rlfa
  const base: Protects = rlfa.protects === 'node' ? 'node' : 'link'
  if (avoids) return { ...rlfa, protects: base === 'node' ? 'node-srlg' : 'srlg' }
  return { ...rlfa, protects: base, fallback: rlfa.fallback ?? 'none' }
}

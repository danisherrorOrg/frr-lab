import type { NodeId, Topology } from './types'

/** First auto-assigned Adj-SID label (docs/02-algorithms.md §4.3). */
export const ADJ_SID_START = 24000

export interface LabelTable {
  /** Router → prefix-SID label. */
  prefix: Map<NodeId, number>
  /** "X>Y" → Adj-SID label of the link direction X→Y. */
  adj: Map<string, number>
}

const adjKey = (from: NodeId, to: NodeId) => `${from}>${to}`

// Keyed by the topology object, like allPairs (D15).
const cache = new WeakMap<Topology, LabelTable>()

/**
 * Every label in the topology. Prefix label = SRGB base + SID index, same SRGB
 * everywhere (RFC 8402 §3.2, D9). Missing Adj-SIDs are numbered per router,
 * since Adj-SIDs are local (RFC 8402 §3.4): from 24000 in neighbor-ID order,
 * skipping labels the router already uses (D18).
 */
export function labelTable(topology: Topology): LabelTable {
  const cached = cache.get(topology)
  if (cached !== undefined) return cached

  const prefix = new Map(topology.nodes.map((n) => [n.id, topology.srgbBase + n.sidIndex]))
  const prefixLabels = new Set(prefix.values())

  // Each router's outgoing link directions, with the label from the file if any.
  const outgoing = new Map<NodeId, { to: NodeId; label?: number }[]>()
  const add = (from: NodeId, to: NodeId, label: number | undefined) => {
    const list = outgoing.get(from) ?? []
    list.push(label === undefined ? { to } : { to, label })
    outgoing.set(from, list)
  }
  for (const l of topology.links) {
    add(l.a, l.b, l.adjSidAB)
    add(l.b, l.a, l.adjSidBA)
  }

  const adj = new Map<string, number>()
  for (const [from, list] of outgoing) {
    list.sort((x, y) => (x.to < y.to ? -1 : x.to > y.to ? 1 : 0))
    const used = new Set(prefixLabels)
    for (const { label } of list) if (label !== undefined) used.add(label)
    let next = ADJ_SID_START
    for (const { to, label } of list) {
      if (label !== undefined) {
        adj.set(adjKey(from, to), label)
        continue
      }
      while (used.has(next)) next++
      used.add(next)
      adj.set(adjKey(from, to), next)
    }
  }

  const table = { prefix, adj }
  cache.set(topology, table)
  return table
}

/** Prefix-SID label of router `node`. */
export function prefixLabel(topology: Topology, node: NodeId): number {
  const label = labelTable(topology).prefix.get(node)
  if (label === undefined) throw new Error(`Prefix-SID of unknown router "${node}".`)
  return label
}

/** Adj-SID label of the link direction from→to. */
export function adjLabel(topology: Topology, from: NodeId, to: NodeId): number {
  const label = labelTable(topology).adj.get(adjKey(from, to))
  if (label === undefined) throw new Error(`There is no link ${from}→${to}.`)
  return label
}

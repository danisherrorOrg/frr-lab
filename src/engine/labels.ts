import type { NodeId, Topology } from './types'

/** First auto-assigned Adj-SID label (docs/02-algorithms.md §4.3). */
export const ADJ_SID_START = 24000

export interface LabelTable {
  /** Router → prefix-SID label. */
  prefix: Map<NodeId, number>
  /** "X>link id" → Adj-SID label of that link, leaving X. One per link, so bundles get one each (D29). */
  adj: Map<string, number>
  /** "X>Y" → the ids of every link X→Y, sorted. */
  links: Map<string, string[]>
}

const adjKey = (from: NodeId, link: string) => `${from}>${link}`
const pairKey = (from: NodeId, to: NodeId) => `${from}>${to}`
const byId = (x: string, y: string) => (x < y ? -1 : x > y ? 1 : 0)

// Keyed by the topology object, like allPairs (D15).
const cache = new WeakMap<Topology, LabelTable>()

/**
 * Every label in the topology. Prefix label = SRGB base + SID index, same SRGB
 * everywhere (RFC 8402 §3.2, D9). Missing Adj-SIDs are numbered per router,
 * since Adj-SIDs are local (RFC 8402 §3.4): from 24000 in neighbor-ID order,
 * then link-id order for parallel links, skipping labels the router already uses
 * (D18). Each link of a bundle is its own adjacency with its own Adj-SID
 * (RFC 8402 §3.4, RFC 8667 §2.2.1; D29).
 */
export function labelTable(topology: Topology): LabelTable {
  const cached = cache.get(topology)
  if (cached !== undefined) return cached

  const prefix = new Map(topology.nodes.map((n) => [n.id, topology.srgbBase + n.sidIndex]))
  const prefixLabels = new Set(prefix.values())

  // Each router's outgoing link directions, with the label from the file if any.
  const outgoing = new Map<NodeId, { to: NodeId; link: string; label?: number }[]>()
  const links = new Map<string, string[]>()
  const add = (from: NodeId, to: NodeId, link: string, label: number | undefined) => {
    const list = outgoing.get(from) ?? []
    list.push(label === undefined ? { to, link } : { to, link, label })
    outgoing.set(from, list)
    const ids = links.get(pairKey(from, to)) ?? []
    ids.push(link)
    links.set(pairKey(from, to), ids)
  }
  for (const l of topology.links) {
    add(l.a, l.b, l.id, l.adjSidAB)
    add(l.b, l.a, l.id, l.adjSidBA)
  }
  for (const ids of links.values()) ids.sort(byId)

  const adj = new Map<string, number>()
  for (const [from, list] of outgoing) {
    list.sort((x, y) => byId(x.to, y.to) || byId(x.link, y.link))
    const used = new Set(prefixLabels)
    for (const { label } of list) if (label !== undefined) used.add(label)
    let next = ADJ_SID_START
    for (const { link, label } of list) {
      if (label !== undefined) {
        adj.set(adjKey(from, link), label)
        continue
      }
      while (used.has(next)) next++
      used.add(next)
      adj.set(adjKey(from, link), next)
    }
  }

  const table = { prefix, adj, links }
  cache.set(topology, table)
  return table
}

/** Prefix-SID label of router `node`. */
export function prefixLabel(topology: Topology, node: NodeId): number {
  const label = labelTable(topology).prefix.get(node)
  if (label === undefined) throw new Error(`Prefix-SID of unknown router "${node}".`)
  return label
}

/**
 * Adj-SID label of the link direction from→to. With parallel links `link` must
 * name which one: "the Adj-SID to E" is not one label any more (D29).
 */
export function adjLabel(topology: Topology, from: NodeId, to: NodeId, link?: string): number {
  const table = labelTable(topology)
  const ids = table.links.get(pairKey(from, to)) ?? []
  if (ids.length === 0) throw new Error(`There is no link ${from}→${to}.`)
  if (link === undefined && ids.length > 1)
    throw new Error(
      `There are ${ids.length} links ${from}–${to}: say which one (${ids.join(', ')}).`,
    )
  const id = link ?? ids[0]!
  if (!ids.includes(id)) throw new Error(`Link ${id} doesn't join ${from} and ${to}.`)
  return table.adj.get(adjKey(from, id))!
}

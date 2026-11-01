// Broadcast LANs (Later #5, D55, docs/02-algorithms.md §20). IS-IS draws a LAN as a
// pseudonode: each member reaches it at its own metric, and it reaches every member at
// 0 (ISO 10589 §7.2.3). The engine keeps point-to-point maths by giving each pair of
// members a link A→B costing A's metric (A→LAN + LAN→B = m_A + 0): the same distances
// and next hops as the pseudonode, without a router that isn't one.
import { sharedEdges } from './srlg'
import type { Graph } from './graph'
import type { Lan, Link, NodeId, Topology } from './types'

/** The link id of members a and b (a < b) on a LAN. */
export const lanLinkId = (lan: string, a: NodeId, b: NodeId) => `${lan}:${a}-${b}`

/**
 * The LAN of a link id made by lanLinkId(), else undefined. Router ids can't hold ":"
 * (ID_PATTERN), so only LAN links have one.
 */
export const lanOfLinkId = (id: string): string | undefined =>
  id.includes(':') ? id.slice(0, id.indexOf(':')) : undefined

/** The member-to-member links of one LAN, sorted by the pair. */
export function lanLinks(lan: Lan): Link[] {
  const m = [...lan.members].sort((x, y) => (x.node < y.node ? -1 : 1))
  const out: Link[] = []
  for (let i = 0; i < m.length; i++)
    for (let j = i + 1; j < m.length; j++) {
      const [a, b] = [m[i]!, m[j]!]
      out.push({
        id: lanLinkId(lan.id, a.node, b.node),
        a: a.node,
        b: b.node,
        metricAB: a.metric,
        metricBA: b.metric,
        lan: lan.id,
      })
    }
  return out
}

/**
 * The topology with its LAN links made again from `lans` (after an edit to a LAN or
 * its routers). Adj-SIDs and SRLGs set on a LAN link are kept when the pair still is.
 */
export function expandLans(t: Topology): Topology {
  const old = new Map(t.links.filter((l) => l.lan !== undefined).map((l) => [l.id, l]))
  const fresh = (t.lans ?? []).flatMap(lanLinks).map((l) => {
    const prev = old.get(l.id)
    if (prev === undefined) return l
    const keep: Link = { ...l }
    if (prev.adjSidAB !== undefined) keep.adjSidAB = prev.adjSidAB
    if (prev.adjSidBA !== undefined) keep.adjSidBA = prev.adjSidBA
    if (prev.srlg !== undefined) keep.srlg = prev.srlg
    return keep
  })
  const next: Topology = { ...t, links: [...t.links.filter((l) => l.lan === undefined), ...fresh] }
  if ((t.lans ?? []).length === 0) delete next.lans
  return next
}

// Keyed by topology object (D15).
const cache = new WeakMap<Topology, Map<string, string[]>>()

/**
 * The other links router `s` has on the same LAN as `linkId`: they all go down when
 * s's interface to the LAN fails (RFC 5286 §3.6), so link protection must avoid them
 * too. Empty for a point-to-point link.
 */
export function lanShared(t: Topology, linkId: string, s: NodeId): string[] {
  if ((t.lans?.length ?? 0) === 0) return []
  let by = cache.get(t)
  if (by === undefined) cache.set(t, (by = new Map()))
  const key = `${s}>${linkId}`
  const hit = by.get(key)
  if (hit !== undefined) return hit
  const lan = t.links.find((l) => l.id === linkId)?.lan
  const out =
    lan === undefined
      ? []
      : t.links
          .filter((l) => l.lan === lan && l.id !== linkId && (l.a === s || l.b === s))
          .map((l) => l.id)
          .sort()
  by.set(key, out)
  return out
}

const NO_FATE = { ids: new Set<string>(), edges: [] }

/** lanShared as a set, and both directions of those links, for the checks. */
export function lanFate(t: Topology, graph: Graph, linkId: string, s: NodeId) {
  // Most networks have no LAN: skip the lookups (coverage asks for every pair).
  if ((t.lans?.length ?? 0) === 0) return NO_FATE
  const ids = lanShared(t, linkId, s)
  return { ids: new Set(ids), edges: sharedEdges(graph, ids) }
}

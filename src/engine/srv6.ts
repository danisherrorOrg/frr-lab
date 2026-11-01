// SRv6 (Later #6, D59, docs/02-algorithms.md §24). TI-LFA computes the same repair on
// SRv6 as on SR-MPLS (RFC 9855 §7.2); only the encoding differs: each segment is an
// IPv6 address (a SID) from a router's locator (RFC 8986 §3.1).
import { allPairs } from './spf'
import type { NodeId, Segment, Topology } from './types'

/** Router `node`'s locator: its own, else fc00:0:<SID index in hex>::/48. */
export function locatorOf(t: Topology, node: NodeId): string {
  const n = t.nodes.find((x) => x.id === node)
  if (n === undefined) throw new Error(`Locator of unknown router "${node}".`)
  return n.locator ?? `fc00:0:${n.sidIndex.toString(16)}::/48`
}

/** "fc00:0:1::/48" → "fc00:0:1::": where the SIDs' function part goes. */
const base = (locator: string) => locator.slice(0, locator.indexOf('::') + 2)

/** The router's End SID (RFC 8986 §4.1, the SRv6 node segment): locator + function 1. */
export const endSid = (t: Topology, node: NodeId) => `${base(locatorOf(t, node))}1`

/**
 * The End.X SID (RFC 8986 §4.2, an adjacency segment) of one link direction: function
 * 0x40 + the link's place among the router's links, in the order Adj-SIDs are numbered
 * (by neighbor, then link id: D18), so each link of a bundle has its own (D29).
 */
export function endXSid(t: Topology, from: NodeId, link: string): string {
  const out = allPairs(t).graph.out.get(from) ?? []
  const i = out.findIndex((e) => e.linkId === link)
  if (i < 0) throw new Error(`Link ${link} doesn't leave ${from}.`)
  return `${base(locatorOf(t, from))}${(0x40 + i).toString(16)}`
}

/** One segment as an SRv6 SID. */
export const srv6Sid = (t: Topology, s: Segment): string =>
  s.kind === 'prefix' ? endSid(t, s.node) : endXSid(t, s.from, s.link)

/**
 * The SRv6 repair list for TI-LFA segments (RFC 9855 §7.2): every segment but the
 * destination's own, which stays as the inner packet's address. Empty = the repair is
 * just the outgoing interface (the LFA case), no SRH needed.
 */
export function srv6RepairList(t: Topology, segments: readonly Segment[]): string[] {
  const last = segments.at(-1)
  const list = last?.kind === 'prefix' ? segments.slice(0, -1) : segments
  return list.map((s) => srv6Sid(t, s))
}

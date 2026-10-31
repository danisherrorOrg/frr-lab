// Packet walk: follow one packet along a TI-LFA repair, router by router, and show
// the label stack at each one (docs/02-algorithms.md §4.5).
import { cheapestEdge } from './graph'
import { allPairs, dist } from './spf'
import { computeTilfa, postConvergence } from './tilfa'
import type { NodeId, Segment, Topology } from './types'

type PrefixSegment = Extract<Segment, { kind: 'prefix' }>
type AdjSegment = Extract<Segment, { kind: 'adj' }>

/** What one router does to the packet, in order. */
export type PacketAction =
  /** S (the PLR) puts the repair list on top of the packet's own label (RFC 9855 §5). */
  | { kind: 'push'; segments: Segment[] }
  /** S sends out of the repair interface, whatever its normal table says (RFC 9855 §5). */
  | { kind: 'repair-out'; to: NodeId; link: string }
  /**
   * Top label is someone else's Prefix-SID: forward on the normal shortest path to it.
   * `metric + distNextY === distRY` is why `to` is a valid next hop (RFC 8402 §3.2).
   */
  | {
      kind: 'forward'
      segment: PrefixSegment
      to: NodeId
      link: string
      metric: number
      distRY: number
      distNextY: number
    }
  /** Penultimate-hop pop: the next router is the end of this segment (RFC 8660 §2). */
  | { kind: 'php'; segment: PrefixSegment }
  /** Top label is this router's own Prefix-SID: the segment ends here, pop it. */
  | { kind: 'pop-end'; segment: PrefixSegment }
  /** Top label is one of this router's Adj-SIDs: pop it and send out that link (RFC 8402 §3.4). */
  | { kind: 'pop-adj'; segment: AdjSegment }
  /** No labels left at D: deliver the packet. */
  | { kind: 'deliver' }

export interface PacketHop {
  router: NodeId
  /** Labels as the packet arrives, top first. At S: just the packet's own label. */
  received: Segment[]
  actions: PacketAction[]
  /** Labels as the packet leaves, top first. Absent at D. */
  sent?: Segment[]
  /** Next router, link and that link's metric. Absent at D. */
  to?: NodeId
  link?: string
  metric?: number
}

export interface PacketWalk {
  s: NodeId
  d: NodeId
  /** Penultimate-hop popping on (the SR-MPLS default) or off. */
  php: boolean
  /** One per router on the post-convergence path, S first, D last. */
  hops: PacketHop[]
  /** Sum of the link metrics walked: equals the post-convergence cost. */
  cost: number
}

export interface PacketWalkOptions {
  /** Which link of a bundle is protected (D29). Default: the cheapest. */
  link?: string
  /** Default true. */
  php?: boolean
}

/**
 * Walk a packet from S to D along the TI-LFA repair for link S–E. Only S uses the
 * repair; every other router reads the top label and uses its normal table, so this
 * also checks that the segment list does what §4.2 promises. Undefined when D is
 * cut off by the failure (nothing to walk).
 */
export function packetWalk(
  topology: Topology,
  s: NodeId,
  d: NodeId,
  e: NodeId,
  options: PacketWalkOptions = {},
): PacketWalk | undefined {
  const php = options.php ?? true
  const r = computeTilfa(topology, s, d, e, options.link)
  if (r.partitioned || !r.path || !r.segments || !r.outLink) return undefined
  const { path, segments } = r
  const table = allPairs(topology)
  // Links still up after S–E fails: the repair never uses the failed one (D29).
  const graph = postConvergence(topology, s, e, r.link).graph

  // The packet arrives at S with D's label on top; S pushes the rest (RFC 9855 §7.1).
  let stack: Segment[] = [segments.at(-1)!]
  const hops: PacketHop[] = []
  let cost = 0

  for (let i = 0; i < path.length; i++) {
    const router = path[i]!
    const hop: PacketHop = { router, received: stack, actions: [] }
    hops.push(hop)
    if (i === 0) {
      hop.actions.push({ kind: 'push', segments: segments.slice(0, -1) })
      stack = segments
    }

    // A router may pop its own labels first, then it sends (or delivers).
    for (;;) {
      const top = stack[0]
      if (top === undefined) {
        if (router !== d) throw new Error(`The packet has no labels left at ${router}, not ${d}.`)
        hop.actions.push({ kind: 'deliver' })
        break
      }
      if (top.kind === 'prefix' && top.node === router) {
        hop.actions.push({ kind: 'pop-end', segment: top })
        stack = stack.slice(1)
        continue
      }
      const next = path[i + 1]
      if (next === undefined) throw new Error(`The packet reached ${d} with labels left.`)

      let link: string
      if (i === 0) {
        // S doesn't read the top label: it may even be the first hop's Adj-SID, once
        // clean-up dropped the segment that only reached N (RFC 9855 §5.1).
        link = r.outLink
        hop.actions.push({ kind: 'repair-out', to: next, link })
      } else if (top.kind === 'adj') {
        if (top.from !== router || top.to !== next) {
          throw new Error(`${router} can't use Adj-SID ${top.from}→${top.to}.`)
        }
        hop.actions.push({ kind: 'pop-adj', segment: top })
        stack = stack.slice(1)
        link = top.link
      } else {
        const edge = cheapestEdge(graph, router, next)!
        link = edge.linkId
        const distRY = dist(table, router, top.node)
        const distNextY = dist(table, next, top.node)
        if (edge.metric + distNextY !== distRY) {
          throw new Error(`${next} is not on ${router}'s shortest path to ${top.node}.`)
        }
        hop.actions.push({
          kind: 'forward',
          segment: top,
          to: next,
          link,
          metric: edge.metric,
          distRY,
          distNextY,
        })
      }

      // PHP: the router before the segment's end pops its label (only for a Prefix-SID).
      const now = stack[0]
      if (php && now?.kind === 'prefix' && now.node === next) {
        hop.actions.push({ kind: 'php', segment: now })
        stack = stack.slice(1)
      }

      const metric = graph.out.get(router)!.find((x) => x.linkId === link)!.metric
      Object.assign(hop, { sent: stack, to: next, link, metric })
      cost += metric
      break
    }
  }

  return { s, d, php, hops, cost }
}

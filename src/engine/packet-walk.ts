// Packet walk: follow one packet router by router, and show the label stack at
// each one (docs/02-algorithms.md §4.5): along a TI-LFA repair, along the normal
// path, or along the simulated traffic when links or routers are down (§8.3).
import { cheapestEdge } from './graph'
import { prefixLabel } from './labels'
import { shortestPath } from './paths'
import type { Drop, Flow, FlowStatus, RepairStep } from './simulate'
import { allPairs, dist, type AllPairs } from './spf'
import { protectionOf } from './protection'
import { postConvergence, tilfaFor } from './tilfa'
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
  /**
   * Simulated traffic (§8.3): this router's own link is down, so it switches to its
   * backup. `before` is the stack it was about to send, `after` what it sends instead
   * (absent when the backup's own first link is down too and the packet is dropped).
   */
  | { kind: 'repair'; step: RepairStep; before: Segment[]; after?: Segment[] }
  /** Simulated traffic: no usable backup, so the packet is dropped here. */
  | { kind: 'drop'; drop: Drop }
  /**
   * Simulated traffic: the packet is back at a router it already passed. `exact`:
   * with the same labels, so it will go round the same way again.
   */
  | { kind: 'loop'; exact: boolean }

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
  /** The TI-LFA repair, the normal (primary) path, simulated traffic, or the path after convergence. */
  kind: 'tilfa' | 'primary' | 'flow' | 'converged'
  s: NodeId
  d: NodeId
  /** Penultimate-hop popping on (the SR-MPLS default) or off. */
  php: boolean
  /**
   * One per router walked, S first. TI-LFA: the post-convergence path. Primary: the
   * normal path. Flow: the simulated traffic, ending at D, where it is dropped, or
   * where a loop closes (that router is then listed twice).
   */
  hops: PacketHop[]
  /** Sum of the link metrics walked. TI-LFA: the post-convergence cost. */
  cost: number
  /** Flow walks: how the traffic ends (FlowStatus of the simulation). */
  status?: FlowStatus
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
  // The repair the network installs: link- or node-protecting (D51).
  const r = tilfaFor(topology, s, d, e, options.link, protectionOf(topology))
  if (r.partitioned || !r.path || !r.segments || !r.outLink) return undefined
  const { path, segments } = r
  const table = allPairs(topology)
  // Links still up after S–E (or router E) fails: the repair never uses them (D29).
  const graph = postConvergence(topology, s, e, r.link, r.scope).graph

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

  return { kind: 'tilfa', s, d, php, hops, cost }
}

/** A router's Prefix-SID as a segment. */
const prefixSeg = (topology: Topology, node: NodeId): Segment => ({
  kind: 'prefix',
  node,
  label: prefixLabel(topology, node),
})

/**
 * Walk a packet from S to D on the normal path through E, the primary next hop of
 * the row (over `link` for a bundle). Every router, S too, forwards on D's
 * Prefix-SID; with PHP the router before D pops it (RFC 8660 §2). Undefined when
 * E can't reach D.
 */
export function primaryWalk(
  topology: Topology,
  s: NodeId,
  d: NodeId,
  e: NodeId,
  options: PacketWalkOptions = {},
): PacketWalk | undefined {
  const php = options.php ?? true
  const table = allPairs(topology)
  const rest = shortestPath(table, e, d)
  const first = cheapestEdge(table.graph, s, e)
  if (!rest || !first) return undefined
  const path = [s, ...rest]
  const links = path
    .slice(0, -1)
    .map((x, i) =>
      i === 0 ? (options.link ?? first.linkId) : cheapestEdge(table.graph, x, path[i + 1]!)!.linkId,
    )
  const own = prefixSeg(topology, d)
  const { hops, cost } = labelHops(table, {
    path,
    links,
    sent: links.map(() => [own]),
    start: [own],
    repairs: [],
    php,
  })
  return { kind: 'primary', s, d, php, hops, cost }
}

/**
 * Walk the packet of one simulated flow (`simulateFailure`, §8.3): the normal path
 * up to the first router whose own link is down, its backup, maybe a second
 * router's backup, then D, a drop, or a loop. Labels come from the simulation;
 * this adds PHP and says what each router does. Unaffected flows walk their
 * normal path. Undefined when D is a failed router (nothing is followed).
 */
export function flowWalk(
  topology: Topology,
  flow: Flow,
  options: { php?: boolean } = {},
): PacketWalk | undefined {
  if (flow.destDown) return undefined
  const php = options.php ?? true
  const table = allPairs(topology)
  const s = flow.before[0]!
  const d = flow.dest
  const own = prefixSeg(topology, d)
  const normal = (path: NodeId[]) => ({
    path,
    links: path.slice(0, -1).map((x, i) => cheapestEdge(table.graph, x, path[i + 1]!)!.linkId),
    sent: path.slice(1).map(() => [own]),
  })
  const walked =
    flow.repair && flow.repairLinks && flow.repairLabels
      ? { path: flow.repair, links: flow.repairLinks, sent: flow.repairLabels }
      : flow.affected && flow.plr !== undefined
        ? // The PLR has no backup: the packet gets as far as the PLR and is dropped.
          normal(flow.before.slice(0, flow.before.indexOf(flow.plr) + 1))
        : normal(flow.before)
  const { hops, cost } = labelHops(table, {
    ...walked,
    start: [own],
    repairs: flow.repairs ?? [],
    php,
    ...(flow.drop && { drop: flow.drop }),
    ...(flow.loopAt !== undefined && { loopAt: flow.loopAt }),
  })
  return {
    kind: 'flow',
    s,
    d,
    php,
    hops,
    cost,
    ...(flow.status !== undefined && { status: flow.status }),
  }
}

/**
 * Walk a simulated flow once the network has reconverged (§8 step 4, §8.3): S's
 * new path to D, with every router's table rebuilt without the links that are down
 * (`down`: failed links and the links of failed routers). No backup is used, so every
 * router just forwards on D's Prefix-SID, with PHP before D. Undefined when D can't
 * be reached any more.
 */
export function convergedWalk(
  topology: Topology,
  flow: Flow,
  down: Iterable<string>,
  options: { php?: boolean } = {},
): PacketWalk | undefined {
  const path = flow.after
  if (!path) return undefined
  const php = options.php ?? true
  const gone = new Set(down)
  const table = allPairs({ ...topology, links: topology.links.filter((l) => !gone.has(l.id)) })
  const links = path.slice(0, -1).map((x, i) => cheapestEdge(table.graph, x, path[i + 1]!)!.linkId)
  const own = prefixSeg(topology, flow.dest)
  const { hops, cost } = labelHops(table, {
    path,
    links,
    sent: links.map(() => [own]),
    start: [own],
    repairs: [],
    php,
  })
  return { kind: 'converged', s: path[0]!, d: flow.dest, php, hops, cost }
}

interface LabelPath {
  path: NodeId[]
  /** The link of each hop of `path`. */
  links: string[]
  /** The stack each router sends on its hop, top first, before PHP. */
  sent: Segment[][]
  /** What the packet carries when it reaches S. */
  start: Segment[]
  /** Routers that switch to a backup, by their index in `path`. */
  repairs: RepairStep[]
  php: boolean
  /** How the walk ends when not at D. */
  drop?: Drop
  loopAt?: NodeId
}

/**
 * Say what each router of a known path does with its labels. Every router uses its
 * normal table unless it repairs; throws if a router couldn't send what `sent`
 * says, so tests check the simulation's labels too.
 */
function labelHops(table: AllPairs, w: LabelPath): { hops: PacketHop[]; cost: number } {
  const { path, links, sent, php } = w
  const hops: PacketHop[] = []
  /** The stack after each router popped its own labels, to spot an exact loop. */
  const kept: Segment[][] = []
  let cost = 0
  // PHP: the router before a segment's end pops its label (only a Prefix-SID).
  const onWire = (k: number) => {
    const out = sent[k]!
    const top = out[0]
    return php && top?.kind === 'prefix' && top.node === path[k + 1] ? out.slice(1) : out
  }
  const same = (x: Segment[], y: Segment[]) =>
    x.length === y.length && x.every((a, i) => a.label === y[i]!.label)

  for (let k = 0; k < path.length; k++) {
    const router = path[k]!
    const received = k === 0 ? w.start : onWire(k - 1)
    const hop: PacketHop = { router, received, actions: [] }
    hops.push(hop)
    let stack = received
    while (stack[0]?.kind === 'prefix' && stack[0].node === router) {
      hop.actions.push({ kind: 'pop-end', segment: stack[0] })
      stack = stack.slice(1)
    }
    kept.push(stack)
    const repair = w.repairs.find((r) => r.atIndex === k)
    const last = k === path.length - 1

    if (last) {
      if (repair) hop.actions.push({ kind: 'repair', step: repair, before: stack })
      if (w.drop) hop.actions.push({ kind: 'drop', drop: w.drop })
      else if (w.loopAt !== undefined) {
        const j = path.indexOf(router)
        hop.actions.push({ kind: 'loop', exact: j < k && same(kept[j]!, stack) })
      } else if (stack.length > 0) {
        throw new Error(`The packet reached ${router} with labels left.`)
      } else hop.actions.push({ kind: 'deliver' })
      break
    }

    const next = path[k + 1]!
    const link = links[k]!
    const out = sent[k]!
    const edge = table.graph.out.get(router)!.find((x) => x.linkId === link)!
    const top = stack[0]
    if (repair) {
      hop.actions.push({ kind: 'repair', step: repair, before: stack, after: out })
    } else if (top === undefined) {
      throw new Error(`The packet has no labels left at ${router}.`)
    } else if (top.kind === 'adj') {
      if (top.from !== router || top.link !== link || !same(out, stack.slice(1))) {
        throw new Error(`${router} can't use Adj-SID ${top.from}→${top.to}.`)
      }
      hop.actions.push({ kind: 'pop-adj', segment: top })
    } else {
      const distRY = dist(table, router, top.node)
      const distNextY = dist(table, next, top.node)
      if (edge.metric + distNextY !== distRY || !same(out, stack)) {
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
    const wire = onWire(k)
    if (wire !== out) hop.actions.push({ kind: 'php', segment: out[0] as PrefixSegment })
    Object.assign(hop, { sent: wire, to: next, link, metric: edge.metric })
    cost += edge.metric
  }
  return { hops, cost }
}

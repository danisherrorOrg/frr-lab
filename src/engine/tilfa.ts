import {
  cheapestEdge,
  edgeOf,
  linkMetric,
  withoutLink,
  withoutLinks,
  withoutNode,
  type Edge,
  type Graph,
} from './graph'
import { adjLabel, prefixLabel } from './labels'
import { isTooDeep } from './msd'
import { allPairs, avoidsLink, dist, linkPathCost, spf, viaCost } from './spf'
import { lanShared } from './lan'
import { hasNode, hasSrlg, sharedEdges, srlgShared } from './srlg'
import type { NodeFallback, NodeId, Protection, ProtectionGoal, Segment, Topology } from './types'

/**
 * What the post-convergence SPF removes (RFC 9855 §2.1, SPT_new(S, X)): the link
 * S–E, router E with all its links (node protection, 02-algorithms.md §4.4, D51),
 * and with `srlg` every link sharing an SRLG with S–E (§18, D53).
 */
export type TilfaScope = ProtectionGoal

/** SPF from S with link S–E removed (both directions): docs/02-algorithms.md §4.1. */
export interface PostConvergence {
  /** The graph without the failed link. Its cheapest links are the ones the repair uses. */
  graph: Graph
  /** dist_new(S, Y). Routers cut off by the failure have no entry. */
  dist: Map<NodeId, number>
  /** One shortest path S → Y per reachable Y, ties broken by lowest router IDs (§4.1). */
  path: Map<NodeId, NodeId[]>
}

// Keyed by topology object (D15), then by "S>link". Coverage asks for the same link many times.
const cache = new WeakMap<Topology, Map<string, PostConvergence>>()

/** The link S→E named `linkId`, or the cheapest link S→E when it is left out (D29). */
function protectedEdge(graph: Graph, s: NodeId, e: NodeId, linkId?: string): Edge {
  const edge = linkId === undefined ? cheapestEdge(graph, s, e) : edgeOf(graph, s, linkId)
  if (edge === undefined || edge.to !== e) {
    const which = linkId === undefined ? '' : ` (${linkId})`
    throw new Error(`There is no link ${s}→${e}${which} to protect.`)
  }
  return edge
}

/**
 * Post-convergence SPF from S after link S–E fails (RFC 9855 §3: SPT_new(S, X)).
 * Only that one link is removed: another link of a bundle stays up (D29). With
 * `scope` = `node`, router E and every link of it are removed instead (D51).
 * Equal-cost paths are compared router by router from S; the lowest ID at the
 * first difference wins. Built in settle order, since every predecessor of Y
 * is settled before Y.
 */
export function postConvergence(
  topology: Topology,
  s: NodeId,
  e: NodeId,
  linkId?: string,
  scope: TilfaScope = 'link',
): PostConvergence {
  const full = allPairs(topology).graph
  const link = protectedEdge(full, s, e, linkId).linkId
  const key = `${s}>${link}>${scope}`
  const forTopo = cache.get(topology) ?? new Map<string, PostConvergence>()
  cache.set(topology, forTopo)
  const cached = forTopo.get(key)
  if (cached !== undefined) return cached

  const base = hasNode(scope) ? withoutNode(full, e) : withoutLink(full, link)
  // S's interface to a LAN fails as a whole (RFC 5286 §3.6, D55); an SRLG fails together
  // (D53). Node protection plans for E failing instead, so S's interface stays up.
  const fate = new Set([
    ...(hasNode(scope) ? [] : lanShared(topology, link, s)),
    ...(hasSrlg(scope) ? srlgShared(topology, link) : []),
  ])
  const graph = withoutLinks(base, fate)
  const tree = spf(graph, s)

  const settleOrder = [...tree.dist.keys()].sort((x, y) => {
    const dx = tree.dist.get(x)!
    const dy = tree.dist.get(y)!
    return dx - dy || (x < y ? -1 : x > y ? 1 : 0)
  })
  const path = new Map<NodeId, NodeId[]>([[s, [s]]])
  for (const y of settleOrder) {
    if (y === s) continue
    let best: NodeId[] | undefined
    for (const p of tree.preds.get(y) ?? []) {
      const candidate = [...path.get(p)!, y]
      if (best === undefined || lexLess(candidate, best)) best = candidate
    }
    path.set(y, best!)
  }

  const result = { graph, dist: tree.dist, path }
  forTopo.set(key, result)
  return result
}

function lexLess(a: NodeId[], b: NodeId[]): boolean {
  for (let i = 0; i < Math.min(a.length, b.length); i++) {
    if (a[i] !== b[i]) return a[i]! < b[i]!
  }
  return a.length < b.length
}

/** The numbers behind one "can a prefix-SID reach Y from X?" check (§4.2). */
export interface SegmentCheck {
  from: NodeId
  node: NodeId
  /** Cost of the post-convergence path from `from` to `node`. */
  pathCost: number
  /** dist(from, node) with normal (pre-failure) routing. */
  distXY: number
  /** (a) the normal shortest path costs the same as the repair path. */
  onPath: boolean
  /** For (b): dist(from,S) and dist(E,node). */
  distXS: number
  distEY: number
  /**
   * dist(from,S) + c(S,E) + dist(E,node); Infinity when S or E has the overload bit
   * and would be transit, so no normal path uses the link (RFC 7490 §5.4).
   */
  viaLink: number
  /**
   * Node scope only: dist(from,E) and dist(from,E) + dist(E,node), Infinity when E
   * has the overload bit (no transit). (b) then reads "avoid router E" (§4.4).
   */
  distXE?: number
  viaNode?: number
  /** SRLG scope: a link of S–E's SRLGs that some normal path from→node may use (§18). */
  srlgHit?: string
  /** A LAN link: another of S's links on S–E's LAN that some normal path may use (§20). */
  lanHit?: string
  /** (b) all normal shortest paths from→node avoid S–E (§1.5), or router E in node scope. */
  avoids: boolean
}

/** One step of the greedy walk. */
export interface WalkStep {
  from: NodeId
  segment: Segment
  /** The check that let a prefix-SID through. Absent for an Adj-SID. */
  accepted?: SegmentCheck
  /** The next router along the path, which failed the check (why the walk stopped here). */
  rejected?: SegmentCheck
}

export interface TilfaResult {
  s: NodeId
  d: NodeId
  e: NodeId
  /** What the post-convergence SPF removed: the link, or router E (D51), plus the SRLG (D53). */
  scope: TilfaScope
  /** What the network asked for, when it is more than this repair has (set with `fallback`). */
  goal?: ProtectionGoal
  /** SRLG scope: the other links of S–E's SRLGs, also removed (D53). */
  srlgLinks?: string[]
  /** On a LAN: S's other links on that LAN, also removed (D55). */
  lanLinks?: string[]
  /** Node protection was asked for but this is the link-protecting repair: why (D51). */
  fallback?: NodeFallback
  /** The protected link's id. */
  link: string
  cSE: number
  /** D can't be reached once S–E is removed: unprotected. */
  partitioned: boolean
  path?: NodeId[]
  /** The outgoing interface: S's cheapest remaining link to path[1] (RFC 9855 §5). */
  outLink?: string
  /** Post-convergence cost of `path`. */
  cost?: number
  walk: WalkStep[]
  /** Segments straight from the walk, before clean-up. */
  rawSegments?: Segment[]
  /** First segment removed because it only reaches the first-hop neighbor (RFC 9855 §5.1). */
  dropped?: Segment
  /** Repair list + the destination's own Prefix-SID (RFC 9855 §7.1). */
  segments?: Segment[]
  /** Top first, before penultimate-hop popping (§4.3). */
  labelStack?: number[]
  /** Labels pushed on top of the destination's own label. */
  extraLabels?: number
}

/**
 * TI-LFA link protection for source S, destination D and link S–E
 * (docs/02-algorithms.md §4, RFC 9855 §5, D8). Only S has switched to the repair;
 * every other router forwards with its normal table, so each prefix-SID must
 * follow normal shortest paths that avoid S–E. `linkId` picks one link of a
 * bundle (default: the cheapest, D29).
 */
export function computeTilfa(
  topology: Topology,
  s: NodeId,
  d: NodeId,
  e: NodeId,
  linkId?: string,
  scope: TilfaScope = 'link',
): TilfaResult {
  if (s === d) throw new Error(`Source ${s} can't be its own destination.`)
  // RFC 9855 §1 node protection assumes E has failed; E can't then be the destination.
  if (hasNode(scope) && d === e)
    throw new Error(`Node protection doesn't apply when the destination ${d} is the next hop.`)
  const table = allPairs(topology)
  const failed = protectedEdge(table.graph, s, e, linkId)
  const link = failed.linkId
  const cSE = failed.metric

  const pc = postConvergence(topology, s, e, link, scope)
  const shared = hasSrlg(scope) ? sharedEdges(table.graph, srlgShared(topology, link)) : []
  const lanLinks = hasNode(scope) ? [] : lanShared(topology, link, s)
  const lanE = sharedEdges(table.graph, lanLinks)
  const path = pc.path.get(d)
  const srlgLinks = hasSrlg(scope) ? srlgShared(topology, link) : []
  const extra = {
    ...(srlgLinks.length > 0 && { srlgLinks }),
    ...(lanLinks.length > 0 && { lanLinks }),
  }
  if (path === undefined)
    return { s, d, e, scope, ...extra, link, cSE, partitioned: true, walk: [] }

  // Cost along the path from S to each position, over the cheapest links still up.
  const at = [0]
  for (let i = 1; i < path.length; i++) {
    at.push(at[i - 1]! + linkMetric(pc.graph, path[i - 1]!, path[i]!)!)
  }

  const check = (i: number, j: number): SegmentCheck => {
    const from = path[i]!
    const node = path[j]!
    const distXY = dist(table, from, node)
    const pathCost = at[j]! - at[i]!
    const base = {
      from,
      node,
      pathCost,
      distXY,
      onPath: distXY === pathCost,
      distXS: dist(table, from, s),
      distEY: dist(table, e, node),
      viaLink: linkPathCost(table, from, s, e, cSE, node),
    }
    // SRLG scope: every normal path also avoids each link of S–E's SRLGs, both ways (§18);
    // on a LAN, S's other links on it, which fail with its interface (§20).
    const bad = (x: Edge) => !(distXY < linkPathCost(table, from, x.from, x.to, x.metric, node))
    const lanBad = lanE.find(bad)
    const srlgBad = shared.find(bad)
    const hit = lanBad ?? srlgBad
    const srlg = {
      ...(srlgBad !== undefined && { srlgHit: srlgBad.linkId }),
      ...(lanBad !== undefined && { lanHit: lanBad.linkId }),
    }
    if (!hasNode(scope))
      return {
        ...base,
        ...srlg,
        avoids: avoidsLink(table, from, node, s, e, cSE) && hit === undefined,
      }
    // Node protection: every normal path from→node avoids router E (§4.4). E is not on
    // the post-convergence path, so it is never an end of the segment.
    const viaNode = viaCost(table, from, e, node)
    return {
      ...base,
      ...srlg,
      distXE: dist(table, from, e),
      viaNode,
      avoids: distXY < viaNode && hit === undefined,
    }
  }

  const prefix = (node: NodeId): Segment => ({
    kind: 'prefix',
    node,
    label: prefixLabel(topology, node),
  })

  // Greedy walk (§4.2): from each position, the furthest router a prefix-SID can reach.
  const walk: WalkStep[] = []
  for (let i = 0; i < path.length - 1;) {
    let j = path.length - 1
    let accepted: SegmentCheck | undefined
    for (; j > i; j--) {
      const c = check(i, j)
      if (c.onPath && c.avoids) {
        accepted = c
        break
      }
    }
    if (accepted !== undefined) {
      const rejected = j + 1 < path.length ? check(i, j + 1) : undefined
      walk.push({
        from: path[i]!,
        segment: prefix(path[j]!),
        accepted,
        ...(rejected && { rejected }),
      })
      i = j
    } else {
      const from = path[i]!
      const to = path[i + 1]!
      // The Adj-SID of the exact link the path takes (D29): a bundle has one per link.
      const hop = cheapestEdge(pc.graph, from, to)!.linkId
      walk.push({
        from,
        segment: { kind: 'adj', from, to, link: hop, label: adjLabel(topology, from, to, hop) },
        rejected: check(i, i + 1),
      })
      i += 1
    }
  }

  const rawSegments = walk.map((w) => w.segment)
  const segments = [...rawSegments]

  // Clean-up (RFC 9855 §5.1): S sends out of the first-hop interface anyway, so a first
  // segment that only reaches that neighbor is dropped. Prefix-SID(D) stays: it's D's own label.
  const n1 = path[1]!
  const first = segments[0]
  let dropped: Segment | undefined
  if (
    first !== undefined &&
    ((first.kind === 'adj' && first.from === s && first.to === n1) ||
      (first.kind === 'prefix' && first.node === n1 && n1 !== d))
  ) {
    dropped = segments.shift()
  }

  // RFC 9855 §7.1: the destination's own label sits under the repair list.
  const last = segments.at(-1)
  if (last === undefined || last.kind !== 'prefix' || last.node !== d) segments.push(prefix(d))

  const labelStack = segments.map((x) => x.label)
  return {
    s,
    d,
    e,
    scope,
    ...extra,
    link,
    cSE,
    partitioned: false,
    path,
    outLink: cheapestEdge(pc.graph, s, n1)!.linkId,
    cost: pc.dist.get(d)!,
    walk,
    rawSegments,
    ...(dropped && { dropped }),
    segments,
    labelStack,
    extraLabels: labelStack.length - 1,
  }
}

/**
 * The TI-LFA repair the network's protection goal asks for (D51). Link protection is
 * computeTilfa as before. Node protection removes router E; when D is E, or nothing
 * avoids E, the repair falls back to link protection and says why (`fallback`).
 */
export function tilfaFor(
  topology: Topology,
  s: NodeId,
  d: NodeId,
  e: NodeId,
  linkId: string | undefined,
  goal: ProtectionGoal,
): TilfaResult {
  if (goal === 'link') return computeTilfa(topology, s, d, e, linkId)
  // Try the whole goal, then without the SRLG, then without the node (D53, D51).
  const tries: TilfaScope[] =
    goal === 'node-srlg' ? ['node-srlg', 'node', 'srlg', 'link'] : [goal, 'link']
  const destIsE = d === e
  let last: TilfaResult | undefined
  for (const scope of tries) {
    // Node protection can't apply when D is E itself (§4.4).
    if (destIsE && hasNode(scope)) continue
    const r = computeTilfa(topology, s, d, e, linkId, scope)
    last = r
    if (r.partitioned) continue
    if (scope === goal) return r
    const fallback: NodeFallback =
      destIsE && hasNode(goal) && hasSrlg(scope) === hasSrlg(goal) ? 'dest-is-next-hop' : 'none'
    return { ...r, fallback, goal }
  }
  return last ?? computeTilfa(topology, s, d, e, linkId)
}

/**
 * The TI-LFA part of a Protection. Empty when the network is partitioned. `msd` is
 * S's max SID depth: a longer stack is kept but marked `tooDeep` (§14, D44).
 */
export function tilfaForProtection(
  result: TilfaResult,
  msd?: number,
  goal: ProtectionGoal = 'link',
  srv6?: string[],
): Protection['tilfa'] {
  const { path, outLink, segments, labelStack, extraLabels } = result
  // In node mode, say what the repair protects (D51); link mode stays as it was.
  const protects: Partial<Protection['tilfa']> =
    goal !== 'link' && path !== undefined
      ? {
          protects: result.scope,
          ...(result.fallback !== undefined && { fallback: result.fallback }),
        }
      : {}
  if (
    result.partitioned ||
    !path ||
    !outLink ||
    !segments ||
    !labelStack ||
    extraLabels === undefined
  ) {
    return msd === undefined ? {} : { msd }
  }
  return {
    path,
    outLink,
    segments,
    labelStack,
    extraLabels,
    ...(msd !== undefined && { msd }),
    // SRv6 counts the SIDs S pushes; SR-MPLS the whole stack (RFC 8491 §1.1, D44, D59).
    ...(isTooDeep(srv6 ?? labelStack, msd) && { tooDeep: true }),
    ...(srv6 !== undefined && { srv6 }),
    ...protects,
  }
}

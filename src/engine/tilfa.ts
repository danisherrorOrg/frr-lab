import { buildGraph, linkMetric } from './graph'
import { adjLabel, prefixLabel } from './labels'
import { allPairs, avoidsLink, dist, spf } from './spf'
import type { NodeId, Protection, Segment, Topology } from './types'

/** SPF from S with link S–E removed (both directions): docs/02-algorithms.md §4.1. */
export interface PostConvergence {
  /** dist_new(S, Y). Routers cut off by the failure have no entry. */
  dist: Map<NodeId, number>
  /** One shortest path S → Y per reachable Y, ties broken by lowest router IDs (§4.1). */
  path: Map<NodeId, NodeId[]>
}

// Keyed by topology object (D15), then by "S>E". Coverage asks for the same link many times.
const cache = new WeakMap<Topology, Map<string, PostConvergence>>()

/**
 * Post-convergence SPF from S after link S–E fails (RFC 9855 §3: SPT_new(S, X)).
 * Equal-cost paths are compared router by router from S; the lowest ID at the
 * first difference wins. Built in settle order, since every predecessor of Y
 * is settled before Y.
 */
export function postConvergence(topology: Topology, s: NodeId, e: NodeId): PostConvergence {
  const key = `${s}>${e}`
  const forTopo = cache.get(topology) ?? new Map<string, PostConvergence>()
  cache.set(topology, forTopo)
  const cached = forTopo.get(key)
  if (cached !== undefined) return cached

  const failed = (a: NodeId, b: NodeId) => (a === s && b === e) || (a === e && b === s)
  const graph = buildGraph({ ...topology, links: topology.links.filter((l) => !failed(l.a, l.b)) })
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

  const result = { dist: tree.dist, path }
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
  /** (b) all normal shortest paths from→node avoid S–E (§1.5). */
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
  cSE: number
  /** D can't be reached once S–E is removed: unprotected. */
  partitioned: boolean
  path?: NodeId[]
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
 * follow normal shortest paths that avoid S–E.
 */
export function computeTilfa(topology: Topology, s: NodeId, d: NodeId, e: NodeId): TilfaResult {
  if (s === d) throw new Error(`Source ${s} can't be its own destination.`)
  const table = allPairs(topology)
  const cSE = linkMetric(table.graph, s, e)
  if (cSE === undefined) throw new Error(`There is no link ${s}→${e} to protect.`)

  const pc = postConvergence(topology, s, e)
  const path = pc.path.get(d)
  if (path === undefined) return { s, d, e, cSE, partitioned: true, walk: [] }

  // Cost along the path from S to each position.
  const at = [0]
  for (let i = 1; i < path.length; i++) {
    at.push(at[i - 1]! + linkMetric(table.graph, path[i - 1]!, path[i]!)!)
  }

  const check = (i: number, j: number): SegmentCheck => {
    const from = path[i]!
    const node = path[j]!
    const distXY = dist(table, from, node)
    const pathCost = at[j]! - at[i]!
    return {
      from,
      node,
      pathCost,
      distXY,
      onPath: distXY === pathCost,
      distXS: dist(table, from, s),
      distEY: dist(table, e, node),
      avoids: avoidsLink(table, from, node, s, e),
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
      walk.push({
        from,
        segment: { kind: 'adj', from, to, label: adjLabel(topology, from, to) },
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
    cSE,
    partitioned: false,
    path,
    cost: pc.dist.get(d)!,
    walk,
    rawSegments,
    ...(dropped && { dropped }),
    segments,
    labelStack,
    extraLabels: labelStack.length - 1,
  }
}

/** The TI-LFA part of a Protection. Empty when the network is partitioned. */
export function tilfaForProtection(result: TilfaResult): Protection['tilfa'] {
  const { path, segments, labelStack, extraLabels } = result
  if (result.partitioned || !path || !segments || !labelStack || extraLabels === undefined) {
    return {}
  }
  return { path, segments, labelStack, extraLabels }
}

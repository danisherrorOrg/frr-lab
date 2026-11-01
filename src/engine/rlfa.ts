import { cheapestEdge, edgeOf } from './graph'
import { MAX_METRIC } from './lfa'
import { dist, linkPathCost, reverseSpf, viaCost, type AllPairs } from './spf'
import type { NodeId, Protection } from './types'

/** Y ∈ P(S) ⇔ dist(S,Y) < c(S,E) + dist(E,Y). RFC 7490 §5.2.1.1. */
export const inPSpace = (distSY: number, cSE: number, distEY: number): boolean =>
  distSY < cSE + distEY

/**
 * Y ∈ P(N) ⇔ dist(N,Y) < dist(N,S) + dist(S,Y): RFC 5286 Inequality 1, as in the
 * RFC 7490 §5.3 pseudocode. Unioned with P(S) it gives the same set as the §5.2.1.2
 * prose test, and the tunnel from N never comes back through S (D17).
 */
export const inExtPSpace = (distNY: number, distNS: number, distSY: number): boolean =>
  distNY < distNS + distSY

/**
 * Y ∈ Q(E) ⇔ dist(Y,E) < dist(Y,S) + c(S,E). RFC 7490 §5.2.1.3 and §5.3 write
 * dist(S,E), which equals c(S,E) whenever S–E is a primary link (D17).
 */
export const inQSpace = (distYE: number, distYS: number, cSE: number): boolean =>
  distYE < distYS + cSE

/** The numbers behind each check, kept so explain steps can show them. */
export interface PCheck {
  node: NodeId
  distSY: number
  distEY: number
  /** c(S,E) + dist(E,Y); Infinity when E has the overload bit (never transit, RFC 7490 §5.4). */
  viaLink: number
  inP: boolean
}

export interface ExtPCheck {
  neighbor: NodeId
  node: NodeId
  cSN: number
  distNY: number
  distNS: number
  distSY: number
  /** dist(N,S) + dist(S,Y); Infinity when S has the overload bit (RFC 7490 §5.4). */
  viaS: number
  inP: boolean
}

export interface QCheck {
  node: NodeId
  distYE: number
  distYS: number
  /** dist(Y,S) + c(S,E); Infinity when S has the overload bit (RFC 7490 §5.4). */
  viaLink: number
  inQ: boolean
}

/** Cost from S to one PQ node (RFC 7490 §5.2.2). `exitVia` set = reached through neighbor N. */
export interface PqCost {
  node: NodeId
  cost: number
  exitVia?: NodeId
  cSN?: number
  distNY?: number
}

export interface RlfaOptions {
  /** Use extended P-space for PQ (default true, D5). False = plain P(S) only. */
  extended?: boolean
  /** The protected link S→E, by id. Default: the cheapest link S→E (D29). */
  link?: string
}

export interface RlfaResult {
  s: NodeId
  e: NodeId
  /** The protected link's id. */
  link: string
  cSE: number
  extended: boolean
  /** All spaces sorted by router id; S and E are never listed (D17). */
  pSpace: NodeId[]
  extPSpace: NodeId[]
  qSpace: NodeId[]
  pq: NodeId[]
  /** For PQ nodes outside P(S): the neighbor the tunnel must leave through (D11). */
  exitVia: Record<NodeId, NodeId>
  /** One per PQ node, same order as `pq`. */
  costs: PqCost[]
  best?: NodeId
  /** One per router other than S and E. */
  pChecks: PCheck[]
  /** Neighbor N ≠ E × router outside P(S). Routers in P(S) are always in some P(N). */
  extChecks: ExtPCheck[]
  qChecks: QCheck[]
  /** Links never used as an exit, and why (RFC 7490 §5.4). */
  skipped: { neighbor: NodeId; link: string; reason: 'max-metric' | 'overload' }[]
  /**
   * Routers in both spaces left out of `pq` because they have the overload bit:
   * "the PLR MUST NOT use a repair tunnel endpoint with the IS-IS overload bit set"
   * (RFC 7490 §5.4). Left out when none.
   */
  overloadedPq?: NodeId[]
}

/**
 * Remote LFA for source S protecting link S→E (docs/02-algorithms.md §3, RFC 7490 §5.2).
 * The result doesn't depend on the destination: E's Q-space stands in for every
 * destination behind E (RFC 7490 §5.2.1.3).
 */
export function computeRlfa(
  table: AllPairs,
  s: NodeId,
  e: NodeId,
  options: RlfaOptions = {},
): RlfaResult {
  const extended = options.extended ?? true
  const protectedEdge =
    options.link === undefined
      ? cheapestEdge(table.graph, s, e)
      : edgeOf(table.graph, s, options.link)
  if (protectedEdge === undefined || protectedEdge.to !== e) {
    const which = options.link === undefined ? '' : ` (${options.link})`
    throw new Error(`There is no link ${s}→${e}${which} to protect.`)
  }
  const cSE = protectedEdge.metric

  const others = table.graph.nodes.filter((y) => y !== s && y !== e)

  const pChecks = others.map((node): PCheck => {
    const distSY = dist(table, s, node)
    const distEY = dist(table, e, node)
    const viaLink = linkPathCost(table, s, s, e, cSE, node)
    // inPSpace() with an overloaded E never transit.
    return { node, distSY, distEY, viaLink, inP: distSY < viaLink }
  })
  const pSet = new Set(pChecks.filter((c) => c.inP).map((c) => c.node))

  const skipped: RlfaResult['skipped'] = []
  const extChecks: ExtPCheck[] = []
  // One exit per neighbor: its cheapest usable link. Another link to E is never an
  // exit: E would be an LFA (D17), so Remote LFA isn't used (D29).
  const exitLinks = new Map<NodeId, { metric: number }>()
  for (const edge of table.graph.out.get(s) ?? []) {
    const n = edge.to
    if (n === e) continue
    // RFC 7490 §5.4 (and RFC 5286 §3.5): never repair over a max-metric first hop.
    if (edge.metric === MAX_METRIC || edge.back === MAX_METRIC) {
      skipped.push({ neighbor: n, link: edge.linkId, reason: 'max-metric' })
      continue
    }
    // RFC 7490 §5.4: nor one "whose first hop has the overload bit set".
    if (table.graph.overloaded.has(n)) {
      skipped.push({ neighbor: n, link: edge.linkId, reason: 'overload' })
      continue
    }
    const cur = exitLinks.get(n)
    if (cur === undefined || edge.metric < cur.metric) exitLinks.set(n, edge)
  }
  for (const [n, edge] of exitLinks) {
    const distNS = dist(table, n, s)
    for (const node of others) {
      if (pSet.has(node)) continue
      const distNY = dist(table, n, node)
      const distSY = dist(table, s, node)
      const viaS = viaCost(table, n, s, node)
      extChecks.push({
        neighbor: n,
        node,
        cSN: edge.metric,
        distNY,
        distNS,
        distSY,
        viaS,
        // inExtPSpace() with an overloaded S never transit.
        inP: distNY < viaS,
      })
    }
  }

  // RFC 7490 §5.3 Compute_Q_Space: reverse SPFs rooted at E and S give dist(Y,E), dist(Y,S).
  const toE = reverseSpf(table.graph, e).dist
  const toS = reverseSpf(table.graph, s).dist
  const qChecks = others.map((node): QCheck => {
    const distYE = toE.get(node) ?? Infinity
    const distYS = toS.get(node) ?? Infinity
    // inQSpace() with an overloaded S never transit: Y→…→S→E would pass through S.
    const viaLink = table.graph.overloaded.has(s) ? Infinity : distYS + cSE
    return { node, distYE, distYS, viaLink, inQ: distYE < viaLink }
  })
  const qSet = new Set(qChecks.filter((c) => c.inQ).map((c) => c.node))

  // Cheapest exit for each router outside P(S): lowest c(S,N)+dist(N,Y), then lowest id.
  // extChecks are in neighbor-id order, so a strict "<" keeps the lowest id on ties.
  const exits = new Map<NodeId, ExtPCheck>()
  for (const c of extChecks) {
    if (!c.inP) continue
    const cur = exits.get(c.node)
    if (cur === undefined || c.cSN + c.distNY < cur.cSN + cur.distNY) exits.set(c.node, c)
  }

  const pSpace = others.filter((y) => pSet.has(y))
  const extPSpace = others.filter((y) => pSet.has(y) || exits.has(y))
  const inBoth = (extended ? extPSpace : pSpace).filter((y) => qSet.has(y))
  const pq = inBoth.filter((y) => !table.graph.overloaded.has(y))
  const overloadedPq = inBoth.filter((y) => table.graph.overloaded.has(y))

  const exitVia: Record<NodeId, NodeId> = {}
  const costs = pq.map((node): PqCost => {
    if (pSet.has(node)) return { node, cost: dist(table, s, node) }
    const x = exits.get(node)!
    exitVia[node] = x.neighbor
    return { node, cost: x.cSN + x.distNY, exitVia: x.neighbor, cSN: x.cSN, distNY: x.distNY }
  })

  const best = chooseBestPq(costs)
  const result: RlfaResult = {
    s,
    e,
    link: protectedEdge.linkId,
    cSE,
    extended,
    pSpace,
    extPSpace,
    qSpace: others.filter((y) => qSet.has(y)),
    pq,
    exitVia,
    costs,
    pChecks,
    extChecks,
    qChecks,
    skipped,
    ...(overloadedPq.length > 0 && { overloadedPq }),
  }
  return best === undefined ? result : { ...result, best }
}

/** RFC 7490 §5.2.2: lowest cost S->PQ (RECOMMENDED), then lowest node id (SHOULD). */
export function chooseBestPq(costs: PqCost[]): NodeId | undefined {
  let best: PqCost | undefined
  for (const c of costs) {
    if (best === undefined || c.cost < best.cost || (c.cost === best.cost && c.node < best.node))
      best = c
  }
  return best?.node
}

/**
 * The RLFA part of a Protection. RLFA is only used when there's no LFA
 * (docs/02-algorithms.md §3), but the spaces are kept for teaching.
 */
export function rlfaForProtection(
  result: RlfaResult,
  lfaBest: NodeId | undefined,
): Protection['rlfa'] {
  const needed = lfaBest === undefined
  const out: Protection['rlfa'] = {
    pSpace: result.pSpace,
    extPSpace: result.extPSpace,
    qSpace: result.qSpace,
    pq: result.pq,
    exitVia: result.exitVia,
    extended: result.extended,
    needed,
  }
  return needed && result.best !== undefined ? { ...out, best: result.best } : out
}

import { linkMetric } from './graph'
import { MAX_METRIC } from './lfa'
import { dist, reverseSpf, type AllPairs } from './spf'
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
  inP: boolean
}

export interface ExtPCheck {
  neighbor: NodeId
  node: NodeId
  cSN: number
  distNY: number
  distNS: number
  distSY: number
  inP: boolean
}

export interface QCheck {
  node: NodeId
  distYE: number
  distYS: number
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
}

export interface RlfaResult {
  s: NodeId
  e: NodeId
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
  /** Neighbors never used as an exit, and why (RFC 7490 §5.4). */
  skipped: { neighbor: NodeId; reason: 'max-metric' }[]
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
  const cSE = linkMetric(table.graph, s, e)
  if (cSE === undefined) throw new Error(`There is no link ${s}→${e} to protect.`)

  const others = table.graph.nodes.filter((y) => y !== s && y !== e)

  const pChecks = others.map((node): PCheck => {
    const distSY = dist(table, s, node)
    const distEY = dist(table, e, node)
    return { node, distSY, distEY, inP: inPSpace(distSY, cSE, distEY) }
  })
  const pSet = new Set(pChecks.filter((c) => c.inP).map((c) => c.node))

  const skipped: RlfaResult['skipped'] = []
  const extChecks: ExtPCheck[] = []
  for (const edge of table.graph.out.get(s) ?? []) {
    const n = edge.to
    if (n === e) continue
    // RFC 7490 §5.4 (and RFC 5286 §3.5): never repair over a max-metric first hop.
    if (edge.metric === MAX_METRIC || linkMetric(table.graph, n, s) === MAX_METRIC) {
      skipped.push({ neighbor: n, reason: 'max-metric' })
      continue
    }
    const distNS = dist(table, n, s)
    for (const node of others) {
      if (pSet.has(node)) continue
      const distNY = dist(table, n, node)
      const distSY = dist(table, s, node)
      extChecks.push({
        neighbor: n,
        node,
        cSN: edge.metric,
        distNY,
        distNS,
        distSY,
        inP: inExtPSpace(distNY, distNS, distSY),
      })
    }
  }

  // RFC 7490 §5.3 Compute_Q_Space: reverse SPFs rooted at E and S give dist(Y,E), dist(Y,S).
  const toE = reverseSpf(table.graph, e).dist
  const toS = reverseSpf(table.graph, s).dist
  const qChecks = others.map((node): QCheck => {
    const distYE = toE.get(node) ?? Infinity
    const distYS = toS.get(node) ?? Infinity
    return { node, distYE, distYS, inQ: inQSpace(distYE, distYS, cSE) }
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
  const pq = (extended ? extPSpace : pSpace).filter((y) => qSet.has(y))

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

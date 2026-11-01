import { cheapestEdge, edgeOf, type Edge } from './graph'
import { MAX_METRIC } from './lfa'
import { dist, linkPathCost, reverseSpf, viaCost, type AllPairs } from './spf'
import type { NodeFallback, NodeId, Protection } from './types'

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
  /** On a LAN: another of S's links on it that S's path to Y may use (D55). */
  lanBlocked?: string
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
  /**
   * S's other links on the protected link's LAN, both directions (D55): they fail with
   * S's interface, so P(S) avoids them and they are never a tunnel exit (RFC 5286 §3.6).
   */
  lanEdges?: readonly Edge[]
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
  /** The neighbors a tunnel may leave through and the cost of their cheapest link, by id. */
  exits: { n: NodeId; cSN: number }[]
  /** Links never used as an exit, and why (RFC 7490 §5.4). */
  skipped: { neighbor: NodeId; link: string; reason: 'max-metric' | 'overload' | 'same-lan' }[]
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
  const lanEdges = options.lanEdges ?? []
  const lanIds = new Set(lanEdges.map((x) => x.linkId))

  const others = table.graph.nodes.filter((y) => y !== s && y !== e)

  const pChecks = others.map((node): PCheck => {
    const distSY = dist(table, s, node)
    const distEY = dist(table, e, node)
    const viaLink = linkPathCost(table, s, s, e, cSE, node)
    // inPSpace() with an overloaded E never transit; on a LAN, S's other links on it too.
    const blocked = lanEdges.find(
      (x) => !(distSY < linkPathCost(table, s, x.from, x.to, x.metric, node)),
    )
    return {
      node,
      distSY,
      distEY,
      viaLink,
      ...(blocked !== undefined && { lanBlocked: blocked.linkId }),
      inP: distSY < viaLink && blocked === undefined,
    }
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
    if (lanIds.has(edge.linkId)) {
      skipped.push({ neighbor: n, link: edge.linkId, reason: 'same-lan' })
      continue
    }
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
    exits: [...exitLinks].map(([n, x]) => ({ n, cSN: x.metric })),
    skipped,
    ...(overloadedPq.length > 0 && { overloadedPq }),
  }
  return best === undefined ? result : { ...result, best }
}

/** How router Y gets into the node-protecting P-space (RFC 8102 §2.2.2). */
export interface NodePCheck {
  node: NodeId
  /** Through S's own normal path (null) or neighbor N, and the numbers. */
  via: NodeId | null
  /** dist(S,Y) or dist(N,Y). */
  distXY: number
  distXE: number
  distEY: number
  /** dist(X,E) + dist(E,Y): Infinity when E has the overload bit (no transit). */
  viaE: number
  /** Cost from S: dist(S,Y), or c(S,N) + dist(N,Y). */
  cost: number
  inP: boolean
}

/** RFC 8102 §2.3.2: the PQ node's own path to D must avoid E. */
export interface NodeDestCheck {
  node: NodeId
  distYD: number
  distYE: number
  distED: number
  /** dist(Y,E) + dist(E,D); Infinity when E has the overload bit. */
  viaE: number
  ok: boolean
}

export interface NodeRlfaResult {
  s: NodeId
  e: NodeId
  d: NodeId
  /** Node-protecting P-space: S's own and its neighbors' (RFC 8102 §2.2.2), sorted. */
  pSpace: NodeId[]
  /** One per Q-space router (the candidates), with the cheapest way in. */
  pChecks: NodePCheck[]
  /** One per router in both spaces that isn't overloaded. */
  destChecks: NodeDestCheck[]
  /** Node-protecting PQ nodes for D, sorted. */
  pq: NodeId[]
  /** PQ node → the neighbor the tunnel leaves through; left out = S's own path. */
  exitVia: Record<NodeId, NodeId>
  costs: PqCost[]
  best?: NodeId
}

/**
 * Remote LFA node protection for (S, D, link S–E) (RFC 8102, docs/02-algorithms.md §3.1,
 * D51). Unlike link protection it depends on D. A PQ node Y needs:
 * 1. a tunnel that avoids E (node-protecting extended P-space, §2.2.2): S's own normal
 *    path, `dist(S,Y) < dist(S,E) + dist(E,Y)`, or through a neighbor N ≠ E with
 *    `dist(N,Y) < dist(N,E) + dist(E,Y)` (and, as for link protection, the tunnel
 *    never comes back through S: `dist(N,Y) < dist(N,S) + dist(S,Y)`, D17);
 * 2. Y in E's Q-space for the link (§2.2.3, the same set as link protection);
 * 3. Y's own path to D avoids E: `dist(Y,D) < dist(Y,E) + dist(E,D)` (§2.3.2).
 * The best is the closest by metric, then the lowest id (§2.3.4).
 */
export function nodeRlfa(table: AllPairs, link: RlfaResult, d: NodeId): NodeRlfaResult {
  const { s, e } = link
  if (d === e) throw new Error(`Node protection doesn't apply when ${d} is the next hop.`)
  const exits = link.exits
  const pChecks: NodePCheck[] = []
  for (const y of link.qSpace) {
    const own: NodePCheck = {
      node: y,
      via: null,
      distXY: dist(table, s, y),
      distXE: dist(table, s, e),
      distEY: dist(table, e, y),
      viaE: viaCost(table, s, e, y),
      cost: dist(table, s, y),
      inP: false,
    }
    own.inP = own.distXY < own.viaE
    let best: NodePCheck | undefined = own.inP ? own : undefined
    // RFC 8102 §2.3.1 SHOULD try every neighbor; plain P-space only (no `extended`) skips them.
    if (link.extended) {
      for (const { n, cSN } of exits) {
        const distNY = dist(table, n, y)
        const viaE = viaCost(table, n, e, y)
        const c: NodePCheck = {
          node: y,
          via: n,
          distXY: distNY,
          distXE: dist(table, n, e),
          distEY: dist(table, e, y),
          viaE,
          cost: cSN + distNY,
          inP: distNY < viaE && distNY < viaCost(table, n, s, y),
        }
        if (c.inP && (best === undefined || c.cost < best.cost)) best = c
      }
    }
    pChecks.push(best ?? own)
  }
  const pSpace = pChecks.filter((c) => c.inP).map((c) => c.node)
  const destChecks = pSpace
    .filter((y) => !table.graph.overloaded.has(y)) // RFC 7490 §5.4, as for link protection
    .map((y): NodeDestCheck => {
      const distYD = dist(table, y, d)
      const viaE = viaCost(table, y, e, d)
      return {
        node: y,
        distYD,
        distYE: dist(table, y, e),
        distED: dist(table, e, d),
        viaE,
        ok: distYD < viaE,
      }
    })
  const pq = destChecks.filter((c) => c.ok).map((c) => c.node)
  const exitVia: Record<NodeId, NodeId> = {}
  const costs = pq.map((node): PqCost => {
    const c = pChecks.find((x) => x.node === node)!
    if (c.via === null) return { node, cost: c.cost }
    exitVia[node] = c.via
    return { node, cost: c.cost, exitVia: c.via, cSN: c.cost - c.distXY, distNY: c.distXY }
  })
  const best = chooseBestPq(costs)
  const out: NodeRlfaResult = { s, e, d, pSpace, pChecks, destChecks, pq, exitVia, costs }
  return best === undefined ? out : { ...out, best }
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

/**
 * The RLFA part of a Protection in node mode (D51): a node-protecting PQ node when
 * there is one, else the link-protecting one, marked with why. `node` is undefined
 * when D is E (node protection can't apply).
 */
export function rlfaForNodeProtection(
  result: RlfaResult,
  node: NodeRlfaResult | undefined,
  lfaBest: NodeId | undefined,
): Protection['rlfa'] {
  const out = rlfaForProtection(result, lfaBest)
  const spaces =
    node === undefined
      ? {}
      : {
          node: {
            pSpace: node.pSpace,
            pq: node.pq,
            ...(node.best !== undefined && { best: node.best }),
          },
        }
  if (!out.needed) return { ...out, ...spaces }
  if (node?.best !== undefined) {
    const exitVia = { ...out.exitVia }
    const exit = node.exitVia[node.best]
    if (exit === undefined) delete exitVia[node.best]
    else exitVia[node.best] = exit
    return { ...out, ...spaces, exitVia, best: node.best, protects: 'node' }
  }
  if (out.best === undefined) return { ...out, ...spaces }
  const fallback: NodeFallback = node === undefined ? 'dest-is-next-hop' : 'none'
  return { ...out, ...spaces, protects: 'link', fallback }
}

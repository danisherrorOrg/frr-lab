import type { Edge } from './graph'
import { avoidsLink, dist, firstLinks, type AllPairs } from './spf'
import type { LfaCandidate, NodeId } from './types'

/** Highest IS-IS wide metric. RFC 5286 §3.5: never use an alternate over such a link. */
export const MAX_METRIC = 16_777_215

/** Inequality 1 (RFC 5286 §1, required by §3.1): N won't send the traffic back to S. */
export const loopFree = (distND: number, distNS: number, distSD: number): boolean =>
  distND < distNS + distSD

/** Inequality 2 (RFC 5286 §1): N is closer to D than S is. */
export const downstream = (distND: number, distSD: number): boolean => distND < distSD

/** Inequality 3 (RFC 5286 §3.2): N's path to D avoids router E. A tie counts as "may use E". */
export const nodeProtecting = (distND: number, distNE: number, distED: number): boolean =>
  distND < distNE + distED

/** The distances behind one candidate's checks, kept so explain steps can show real numbers. */
export interface LfaCheck {
  neighbor: NodeId
  /** The link S→N this candidate uses (D29). */
  link: string
  cSN: number
  distND: number
  distNS: number
  distSD: number
  distNE: number
  distED: number
}

export interface LfaResult {
  /** One per link out of S other than the protected one, sorted by neighbor, then link id. */
  candidates: LfaCandidate[]
  /** Same order as `candidates`. */
  checks: LfaCheck[]
  /** Links left out before any check, and why. */
  skipped: { neighbor: NodeId; link: string; reason: 'max-metric' }[]
  best?: NodeId
  /** The link S uses to reach `best`. */
  bestLink?: string
}

/**
 * The primary next-hop link S→E for D named by `linkId`, or the first one when it
 * is left out (the only one unless S–E is a bundle of equal links, D29).
 */
export function primaryLink(
  table: AllPairs,
  s: NodeId,
  d: NodeId,
  e: NodeId,
  linkId?: string,
): Edge {
  const link = firstLinks(table, s, d).find(
    (x) => x.to === e && (linkId === undefined || x.linkId === linkId),
  )
  if (link === undefined) {
    const which = linkId === undefined ? e : `${e} over link ${linkId}`
    throw new Error(`${which} is not a primary next hop from ${s} to ${d}.`)
  }
  return link
}

/**
 * LFA for source S, destination D and primary next-hop link S→E (docs/02-algorithms.md §2).
 * A candidate is an (outgoing link, neighbor) pair (RFC 5286 §3.6): every other link
 * out of S, other ECMP next hops included (§3.4). Another link to E itself passes
 * Inequality 1 and protects the link but never the node (§3.6 steps 7–8, D29).
 */
export function computeLfa(
  table: AllPairs,
  s: NodeId,
  d: NodeId,
  e: NodeId,
  linkId?: string,
): LfaResult {
  if (s === d) throw new Error(`Source ${s} can't be its own destination.`)
  if (!table.from.has(s)) throw new Error(`Unknown source router "${s}".`)
  const primary = primaryLink(table, s, d, e, linkId)

  const distSD = dist(table, s, d)
  const distED = dist(table, e, d)
  const result: LfaResult = { candidates: [], checks: [], skipped: [] }

  for (const edge of table.graph.out.get(s) ?? []) {
    const n = edge.to
    if (edge.linkId === primary.linkId) continue
    // RFC 5286 §3.5: MUST NOT use a link whose cost or reverse cost is the maximum.
    if (edge.metric === MAX_METRIC || edge.back === MAX_METRIC) {
      result.skipped.push({ neighbor: n, link: edge.linkId, reason: 'max-metric' })
      continue
    }
    const check: LfaCheck = {
      neighbor: n,
      link: edge.linkId,
      cSN: edge.metric,
      distND: dist(table, n, d),
      distNS: dist(table, n, s),
      distSD,
      distNE: dist(table, n, e),
      distED,
    }
    result.checks.push(check)
    result.candidates.push({
      neighbor: n,
      link: edge.linkId,
      loopFree: loopFree(check.distND, check.distNS, distSD),
      downstream: downstream(check.distND, distSD),
      nodeProtecting: nodeProtecting(check.distND, check.distNE, distED),
      cost: check.cSN + check.distND,
    })
  }

  const best = bestLfaCandidate(result.candidates)
  return best === undefined ? result : { ...result, best: best.neighbor, bestLink: best.link }
}

/**
 * Best LFA among the loop-free candidates (D7, RFC 5286 §1 and §3.6):
 * node-protecting → downstream → lowest c(S,N) + dist(N,D) → lowest router ID
 * → lowest link id (D29).
 */
export function chooseBestLfa(candidates: LfaCandidate[]): NodeId | undefined {
  return bestLfaCandidate(candidates)?.neighbor
}

function bestLfaCandidate(candidates: LfaCandidate[]): LfaCandidate | undefined {
  let best: LfaCandidate | undefined
  for (const c of candidates) {
    if (c.loopFree && (best === undefined || betterLfa(c, best))) best = c
  }
  return best
}

function betterLfa(a: LfaCandidate, b: LfaCandidate): boolean {
  if (a.nodeProtecting !== b.nodeProtecting) return a.nodeProtecting
  if (a.downstream !== b.downstream) return a.downstream
  if (a.cost !== b.cost) return a.cost < b.cost
  if (a.neighbor !== b.neighbor) return a.neighbor < b.neighbor
  return a.link < b.link
}

/**
 * Other primary next-hop links for D whose shortest paths all avoid link S→E
 * (docs/02-algorithms.md §1.4, RFC 5286 §3.4). Non-empty means "ECMP-protected":
 * S keeps forwarding over them when S–E fails. Another equal link to E itself
 * counts (D29). Sorted by neighbor, then link id.
 */
export function ecmpProtectorLinks(
  table: AllPairs,
  s: NodeId,
  d: NodeId,
  e: NodeId,
  linkId?: string,
): Edge[] {
  const primary = primaryLink(table, s, d, e, linkId)
  return firstLinks(table, s, d).filter(
    (x) => x.linkId !== primary.linkId && avoidsLink(table, x.to, d, s, e, primary.metric),
  )
}

/** The routers of ecmpProtectorLinks(), each once, sorted by router id. */
export function ecmpProtectors(
  table: AllPairs,
  s: NodeId,
  d: NodeId,
  e: NodeId,
  linkId?: string,
): NodeId[] {
  return [...new Set(ecmpProtectorLinks(table, s, d, e, linkId).map((x) => x.to))]
}

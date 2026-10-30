import { linkMetric } from './graph'
import { avoidsLink, dist, type AllPairs } from './spf'
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
  cSN: number
  distND: number
  distNS: number
  distSD: number
  distNE: number
  distED: number
}

export interface LfaResult {
  /** One per neighbor N ≠ E, sorted by router id. */
  candidates: LfaCandidate[]
  /** Same order as `candidates`. */
  checks: LfaCheck[]
  /** Neighbors left out before any check, and why. */
  skipped: { neighbor: NodeId; reason: 'max-metric' }[]
  best?: NodeId
}

/**
 * LFA for source S, destination D and primary next hop E (docs/02-algorithms.md §2).
 * Every other neighbor of S is a candidate, other ECMP next hops included (RFC 5286 §3.4).
 */
export function computeLfa(table: AllPairs, s: NodeId, d: NodeId, e: NodeId): LfaResult {
  if (s === d) throw new Error(`Source ${s} can't be its own destination.`)
  const fromS = table.from.get(s)
  if (fromS === undefined) throw new Error(`Unknown source router "${s}".`)
  if (!(fromS.firstHops.get(d) ?? []).includes(e)) {
    throw new Error(`${e} is not a primary next hop from ${s} to ${d}.`)
  }

  const distSD = dist(table, s, d)
  const distED = dist(table, e, d)
  const result: LfaResult = { candidates: [], checks: [], skipped: [] }

  for (const edge of table.graph.out.get(s) ?? []) {
    const n = edge.to
    if (n === e) continue
    // RFC 5286 §3.5: MUST NOT use a link whose cost or reverse cost is the maximum.
    if (edge.metric === MAX_METRIC || linkMetric(table.graph, n, s) === MAX_METRIC) {
      result.skipped.push({ neighbor: n, reason: 'max-metric' })
      continue
    }
    const check: LfaCheck = {
      neighbor: n,
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
      loopFree: loopFree(check.distND, check.distNS, distSD),
      downstream: downstream(check.distND, distSD),
      nodeProtecting: nodeProtecting(check.distND, check.distNE, distED),
      cost: check.cSN + check.distND,
    })
  }

  const best = chooseBestLfa(result.candidates)
  return best === undefined ? result : { ...result, best }
}

/**
 * Best LFA among the loop-free candidates (D7, RFC 5286 §1 and §3.6):
 * node-protecting → downstream → lowest c(S,N) + dist(N,D) → lowest router ID.
 */
export function chooseBestLfa(candidates: LfaCandidate[]): NodeId | undefined {
  let best: LfaCandidate | undefined
  for (const c of candidates) {
    if (c.loopFree && (best === undefined || betterLfa(c, best))) best = c
  }
  return best?.neighbor
}

function betterLfa(a: LfaCandidate, b: LfaCandidate): boolean {
  if (a.nodeProtecting !== b.nodeProtecting) return a.nodeProtecting
  if (a.downstream !== b.downstream) return a.downstream
  if (a.cost !== b.cost) return a.cost < b.cost
  return a.neighbor < b.neighbor
}

/**
 * Other primary next hops for D whose shortest paths all avoid link S→E
 * (docs/02-algorithms.md §1.4, RFC 5286 §3.4). Non-empty means "ECMP-protected":
 * S keeps forwarding over them when S–E fails. Sorted by router id.
 */
export function ecmpProtectors(table: AllPairs, s: NodeId, d: NodeId, e: NodeId): NodeId[] {
  const hops = table.from.get(s)?.firstHops.get(d) ?? []
  return hops.filter((n) => n !== e && avoidsLink(table, n, d, s, e))
}

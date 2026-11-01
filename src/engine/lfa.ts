import type { Edge } from './graph'
import { DEFAULT_LFA_POLICY, type ResolvedLfaPolicy } from './lfa-policy'
import { avoidsLink, dist, firstLinks, linkPathCost, viaCost, type AllPairs } from './spf'
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
  /**
   * dist(N,S) + dist(S,D) and dist(N,E) + dist(E,D): the right-hand sides of
   * Inequalities 1 and 3. Infinity when S or E has the overload bit, so N can't pass
   * through it (RFC 7490 §5.4).
   */
  viaS: number
  viaE: number
}

export interface LfaResult {
  /** One per link out of S other than the protected one, sorted by neighbor, then link id. */
  candidates: LfaCandidate[]
  /** Same order as `candidates`. */
  checks: LfaCheck[]
  /**
   * Links left out before any check, and why: a maximum metric or a neighbor with
   * the overload bit (RFC 5286 §3.5), or a neighbor S's policy never uses (RFC 7916 §6.2.4.4).
   */
  skipped: {
    neighbor: NodeId
    link: string
    reason: 'max-metric' | 'overload' | 'excluded' | 'same-lan'
  }[]
  /** The policy the choice used (docs/02-algorithms.md §15). */
  policy: ResolvedLfaPolicy
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
 * `policy` is S's LFA policy (RFC 7916 §6.2, §15 of 02); left out = the D7 order.
 * `shared` holds both directions of the links that share an SRLG with S–E, in the
 * SRLG modes (D53): then each candidate gets `srlgDisjoint`, and those rank first.
 */
export function computeLfa(
  table: AllPairs,
  s: NodeId,
  d: NodeId,
  e: NodeId,
  linkId?: string,
  policy: ResolvedLfaPolicy = DEFAULT_LFA_POLICY,
  shared: readonly Edge[] = [],
  sameLan: ReadonlySet<string> = new Set(),
): LfaResult {
  const sharedIds = new Set(shared.map((x) => x.linkId))
  if (s === d) throw new Error(`Source ${s} can't be its own destination.`)
  if (!table.from.has(s)) throw new Error(`Unknown source router "${s}".`)
  const primary = primaryLink(table, s, d, e, linkId)

  const distSD = dist(table, s, d)
  const distED = dist(table, e, d)
  const result: LfaResult = { candidates: [], checks: [], skipped: [], policy }

  for (const edge of table.graph.out.get(s) ?? []) {
    const n = edge.to
    if (edge.linkId === primary.linkId) continue
    // RFC 5286 §3.6: an alternate across the same LAN fails with S's interface to it (D55).
    if (sameLan.has(edge.linkId)) {
      result.skipped.push({ neighbor: n, link: edge.linkId, reason: 'same-lan' })
      continue
    }
    // RFC 5286 §3.5: MUST NOT use a link whose cost or reverse cost is the maximum.
    if (edge.metric === MAX_METRIC || edge.back === MAX_METRIC) {
      result.skipped.push({ neighbor: n, link: edge.linkId, reason: 'max-metric' })
      continue
    }
    // RFC 5286 §3.5: "if N_i has the overload bit set, then S MUST NOT consider using
    // N_i as an alternate", even for N_i's own address.
    if (table.graph.overloaded.has(n)) {
      result.skipped.push({ neighbor: n, link: edge.linkId, reason: 'overload' })
      continue
    }
    // RFC 7916 §6.2.4.4: the operator can exclude a specific alternate.
    if (policy.exclude.includes(n)) {
      result.skipped.push({ neighbor: n, link: edge.linkId, reason: 'excluded' })
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
      viaS: viaCost(table, n, s, d),
      viaE: viaCost(table, n, e, d),
    }
    result.checks.push(check)
    const cand: LfaCandidate = {
      neighbor: n,
      link: edge.linkId,
      // Same as loopFree() and nodeProtecting(), with an overloaded S or E never transit.
      loopFree: check.distND < check.viaS,
      downstream: downstream(check.distND, distSD),
      nodeProtecting: check.distND < check.viaE,
      cost: check.cSN + check.distND,
    }
    // RFC 7916 §6.2.4.1: an alternate whose link or path shares an SRLG with S–E may
    // fail with it. A tie counts as "may use it", as in §1.5.
    if (shared.length > 0)
      cand.srlgDisjoint =
        !sharedIds.has(edge.linkId) &&
        shared.every((x) => check.distND < linkPathCost(table, n, x.from, x.to, x.metric, d))
    const rejected = cand.loopFree ? policyRejection(cand, policy, d === e) : undefined
    result.candidates.push(rejected === undefined ? cand : { ...cand, policyRejected: rejected })
  }

  const best = bestLfaCandidate(result.candidates, policy)
  return best === undefined ? result : { ...result, best: best.neighbor, bestLink: best.link }
}

/**
 * Why a `require` in the policy rules out a loop-free candidate, if it does.
 * Node protection can't apply when D is E itself (§4.4 of 02), so then it is not
 * required: RFC 7916 §6.2.2 falls back to link protection.
 */
function policyRejection(
  c: LfaCandidate,
  policy: ResolvedLfaPolicy,
  destIsE: boolean,
): LfaCandidate['policyRejected'] {
  if (policy.nodeProtecting === 'require' && !destIsE && !c.nodeProtecting)
    return 'not-node-protecting'
  if (policy.downstream === 'require' && !c.downstream) return 'not-downstream'
  return undefined
}

/**
 * Best LFA among the loop-free candidates no policy rule rules out (D7, RFC 5286 §1
 * and §3.6): node-protecting → downstream → lowest c(S,N) + dist(N,D) → lowest
 * router ID → lowest link id (D29). An `ignore` in the policy skips that step.
 */
export function chooseBestLfa(
  candidates: LfaCandidate[],
  policy: ResolvedLfaPolicy = DEFAULT_LFA_POLICY,
): NodeId | undefined {
  return bestLfaCandidate(candidates, policy)?.neighbor
}

function bestLfaCandidate(
  candidates: LfaCandidate[],
  policy: ResolvedLfaPolicy,
): LfaCandidate | undefined {
  let best: LfaCandidate | undefined
  for (const c of candidates) {
    if (!c.loopFree || c.policyRejected !== undefined) continue
    if (best === undefined || betterLfa(c, best, policy)) best = c
  }
  return best
}

function betterLfa(a: LfaCandidate, b: LfaCandidate, policy: ResolvedLfaPolicy): boolean {
  // SRLG modes (D53): SRLG-disjoint first (RFC 7916 §6.2.4.1), then the D7 order.
  if (a.srlgDisjoint !== undefined && a.srlgDisjoint !== b.srlgDisjoint) return a.srlgDisjoint
  if (policy.nodeProtecting !== 'ignore' && a.nodeProtecting !== b.nodeProtecting)
    return a.nodeProtecting
  if (policy.downstream !== 'ignore' && a.downstream !== b.downstream) return a.downstream
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
  sameLan: ReadonlySet<string> = new Set(),
): Edge[] {
  const primary = primaryLink(table, s, d, e, linkId)
  // Another next hop on the same LAN goes down with S's interface (RFC 5286 §3.6, D55).
  return firstLinks(table, s, d).filter(
    (x) =>
      x.linkId !== primary.linkId &&
      !sameLan.has(x.linkId) &&
      avoidsLink(table, x.to, d, s, e, primary.metric),
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

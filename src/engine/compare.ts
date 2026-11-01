// Compare view (TODO backlog, docs/02-algorithms.md §10): LFA, Remote LFA and TI-LFA
// for one (S, D, protected link S–E), side by side. Nothing new is decided here: each
// method's own rules pick the backup; this only lines up path, cost and labels.
import { edgeOf } from './graph'
import { prefixLabel } from './labels'
import { computeLfa, ecmpProtectorLinks, primaryLink } from './lfa'
import { hopLinks, lfaPath, rlfaPath } from './paths'
import { lfaPolicyOf } from './lfa-policy'
import { isTooDeep, msdOf } from './msd'
import { lanFate } from './lan'
import { protectionOf } from './protection'
import { hasNode, hasSrlg, rlfaAvoidsSrlg, sharedEdges, srlgShared } from './srlg'
import { computeRlfa, nodeRlfa } from './rlfa'
import type { Method } from './rows'
import { allPairs, dist } from './spf'
import { computeTilfa, tilfaFor } from './tilfa'
import type { NodeId, Protects, Segment, Topology } from './types'

export type CompareMethod = Exclude<Method, 'ecmp'>

/** A backup path against S's path after reconvergence (as "Repair = final?", §8 step 6). */
export type VsFinal = 'same' | 'same-cost' | 'longer'

export interface RoutePath {
  path: NodeId[]
  /** The link of each hop (D29: names the link of a bundle). */
  links: string[]
  cost: number
}

export interface BackupOption {
  method: CompareMethod
  /** The method has a backup for this (S, D, S–E). */
  found: boolean
  /**
   * The method the results table names: the simplest that protects, in the
   * coverage order ECMP → LFA → Remote LFA → TI-LFA (§5).
   */
  used: boolean
  path?: NodeId[]
  links?: string[]
  /** Sum of the link metrics along `path`. */
  cost?: number
  /** What S puts on the packet, top first; the last is D's own Prefix-SID (RFC 9855 §7.1). */
  segments?: Segment[]
  /** Labels on top of D's own one. */
  extraLabels?: number
  /** TI-LFA: S's max SID depth, when one is set (RFC 8491 §5). */
  msd?: number
  /** TI-LFA: the stack is deeper than `msd`, so S can't install it and it isn't `used` (D44). */
  tooDeep?: boolean
  vsFinal?: VsFinal
  /** LFA: the neighbor N. Remote LFA: the PQ node. */
  via?: NodeId
  /** LFA: the link S uses to reach N. */
  viaLink?: string
  /** Remote LFA: the neighbor the tunnel leaves through (extended P-space, D11). */
  exitVia?: NodeId
  /** LFA: N's path to D also avoids E (RFC 5286 Inequality 3). */
  nodeProtecting?: boolean
  /** Node mode (D51), Remote LFA and TI-LFA: does this backup avoid router E? */
  protects?: Protects
}

export interface BackupComparison {
  s: NodeId
  d: NodeId
  e: NodeId
  link: string
  primary: RoutePath
  /** S's path once the network has reconverged without S–E (RFC 9855 §3). Absent: D is cut off. */
  final?: RoutePath
  /** Another primary next hop already protects D (RFC 5286 §3.4). */
  ecmp: boolean
  protectedBy: Method | null
  /** Always LFA, Remote LFA, TI-LFA, in that order. */
  options: [BackupOption, BackupOption, BackupOption]
}

export interface CompareOptions {
  /** Use extended P-space for Remote LFA (default true, D5). */
  extended?: boolean
}

/**
 * LFA, Remote LFA and TI-LFA for source S, destination D and the primary link `link`
 * out of S. Remote LFA's tunnel is worked out even when an LFA exists: a router only
 * uses it when there is no LFA (RFC 7490 §1), but seeing both is the point here.
 */
export function compareBackups(
  topology: Topology,
  s: NodeId,
  d: NodeId,
  link: string,
  options: CompareOptions = {},
): BackupComparison {
  const table = allPairs(topology)
  const out = edgeOf(table.graph, s, link)
  if (out === undefined) throw new Error(`Link ${link} doesn't leave ${s}.`)
  const e = out.to
  primaryLink(table, s, d, e, link) // throws when S–E isn't a primary next hop to D

  const route = (path: NodeId[], first?: string): RoutePath => {
    const links = hopLinks(topology, path, {
      ...(first !== undefined && { first }),
      avoid: [link],
    }).map((l) => l!)
    let cost = 0
    links.forEach((l, i) => (cost += edgeOf(table.graph, path[i]!, l)!.metric))
    return { path, links, cost }
  }
  const prefix = (node: NodeId): Segment => ({
    kind: 'prefix',
    node,
    label: prefixLabel(topology, node),
  })

  const primaryPath = lfaPath(table, s, e, d) ?? [s, e]
  const primaryLinks = hopLinks(topology, primaryPath, { first: link }).map((l) => l!)
  const primary = { path: primaryPath, links: primaryLinks, cost: dist(table, s, d) }

  // S's final path is the link post-convergence path; in node mode TI-LFA may take
  // another one that also avoids router E (D51), so it can be longer than final.
  const goal = protectionOf(topology)
  const linkTilfa = computeTilfa(topology, s, d, e, link)
  const final = linkTilfa.path && route(linkTilfa.path, linkTilfa.outLink)
  const tilfa = goal !== 'link' ? tilfaFor(topology, s, d, e, link, goal) : linkTilfa
  const tilfaRoute = tilfa === linkTilfa ? final : tilfa.path && route(tilfa.path, tilfa.outLink)

  const vsFinal = (r: RoutePath): VsFinal | undefined => {
    if (!final) return undefined
    if (r.cost > final.cost) return 'longer'
    const samePath =
      r.path.length === final.path.length && r.path.every((x, i) => x === final.path[i])
    return samePath ? 'same' : 'same-cost'
  }
  const option = (
    method: CompareMethod,
    r: RoutePath | undefined,
    segments: Segment[],
    extra: Partial<BackupOption>,
  ): BackupOption =>
    r === undefined
      ? { method, found: false, used: false }
      : {
          method,
          found: true,
          used: false,
          ...r,
          segments,
          extraLabels: segments.length - 1,
          ...(vsFinal(r) !== undefined && { vsFinal: vsFinal(r)! }),
          ...extra,
        }

  // LFA (RFC 5286): S just sends to N, so the packet keeps D's own label.
  const lan = lanFate(topology, table.graph, link, s)
  const lfa = computeLfa(
    table,
    s,
    d,
    e,
    link,
    lfaPolicyOf(topology, s),
    hasSrlg(goal) ? sharedEdges(table.graph, srlgShared(topology, link)) : [],
    lan.ids,
  )
  const lfaCand = lfa.candidates.find((c) => c.link === lfa.bestLink)
  const lfaRoute =
    lfa.best === undefined ? undefined : route(lfaPath(table, s, lfa.best, d)!, lfa.bestLink)
  const lfaOpt = option('lfa', lfaRoute, [prefix(d)], {
    ...(lfa.best !== undefined && { via: lfa.best, viaLink: lfa.bestLink! }),
    ...(lfaCand && { nodeProtecting: lfaCand.nodeProtecting }),
  })

  // Remote LFA (RFC 7490): the tunnel label is the PQ node's Prefix-SID (SR-MPLS, D35).
  const rlfa = computeRlfa(table, s, e, {
    extended: options.extended ?? true,
    link,
    lanEdges: lan.edges,
  })
  // What the tunnel protects in the goal: node (D51), and the SRLG (D53).
  const sharedE = hasSrlg(goal) ? sharedEdges(table.graph, srlgShared(topology, link)) : []
  const rlfaProtects = (pq: NodeId, exit: NodeId | undefined): Protects => {
    const node = nodePq?.best !== undefined
    const srlg = hasSrlg(goal) && rlfaAvoidsSrlg(table, s, pq, exit, d, sharedE)
    return node ? (srlg ? 'node-srlg' : 'node') : srlg ? 'srlg' : 'link'
  }
  // Node mode: a node-protecting PQ node first (RFC 8102), else the link one (D51).
  const nodePq = hasNode(goal) && d !== e ? nodeRlfa(table, rlfa, d) : undefined
  const pq = nodePq?.best ?? rlfa.best
  const exit =
    pq === undefined
      ? undefined
      : nodePq?.best !== undefined
        ? nodePq.exitVia[pq]
        : rlfa.exitVia[pq]
  const rlfaNodes = pq === undefined ? undefined : rlfaPath(table, s, pq, exit, d)
  const rlfaRoute = rlfaNodes && route(rlfaNodes)
  const tunnel = pq === undefined || pq === d ? [prefix(d)] : [prefix(pq), prefix(d)]
  const rlfaOpt = option('rlfa', rlfaRoute, tunnel, {
    ...(pq !== undefined && { via: pq }),
    ...(exit !== undefined && { exitVia: exit }),
    ...(goal !== 'link' && pq !== undefined && { protects: rlfaProtects(pq, exit) }),
  })

  // TI-LFA (RFC 9855): the post-convergence path, with its segment list.
  const msd = msdOf(topology, s)
  const tiOpt = option('tilfa', tilfaRoute, tilfa.segments ?? [], {
    ...(msd !== undefined && { msd }),
    ...(isTooDeep(tilfa.labelStack ?? [], msd) && { tooDeep: true }),
    ...(goal !== 'link' && tilfa.path !== undefined && { protects: tilfa.scope }),
  })

  const ecmp = ecmpProtectorLinks(table, s, d, e, link, lan.ids).length > 0
  const protectedBy: Method | null = ecmp
    ? 'ecmp'
    : lfaOpt.found
      ? 'lfa'
      : rlfaOpt.found
        ? 'rlfa'
        : tiOpt.found && tiOpt.tooDeep !== true
          ? 'tilfa'
          : null
  const opts: BackupComparison['options'] = [lfaOpt, rlfaOpt, tiOpt]
  for (const o of opts) o.used = o.method === protectedBy

  return { s, d, e, link, primary, ...(final && { final }), ecmp, protectedBy, options: opts }
}

// Engine entry points (docs/03-architecture.md §3): what the worker and the UI call.
import {
  addCounts,
  emptyCounts,
  summarizeSource,
  type CoverageReport,
  type UnprotectedPair,
} from './coverage'
import { explainLfa, explainNodeRlfa, explainRlfa, explainSrv6, explainTilfa } from './explain'
import { computeLfa, ecmpProtectorLinks } from './lfa'
import { lfaPolicyOf } from './lfa-policy'
import { msdOf } from './msd'
import { lanFate } from './lan'
import { protectionOf } from './protection'
import { srv6RepairList } from './srv6'
import { hasNode, hasSrlg, rlfaAvoidsSrlg, sharedEdges, srlgShared, withSrlgProtects } from './srlg'
import {
  computeRlfa,
  nodeRlfa,
  rlfaForNodeProtection,
  rlfaForProtection,
  type RlfaResult,
} from './rlfa'
import { toRows, type SourceRows } from './rows'
import { allPairs, firstLinks } from './spf'
import { tilfaFor, tilfaForProtection } from './tilfa'
import type { DestinationResult, NodeId, Protection, Topology } from './types'

export interface ComputeOptions {
  /** Use extended P-space for RLFA (default true, D5). */
  extended?: boolean
  /** Build explain steps (default true). Coverage runs turn them off: they are large. */
  explain?: boolean
}

/**
 * Every destination's primary path and backups from one source
 * (docs/02-algorithms.md §2–§4): one Protection per primary next-hop link.
 * Destinations are sorted by router id; routers S can't reach are left out.
 */
export function computeForSource(
  topology: Topology,
  source: NodeId,
  options: ComputeOptions = {},
): DestinationResult[] {
  const table = allPairs(topology)
  const fromS = table.from.get(source)
  if (fromS === undefined) throw new Error(`Unknown source router "${source}".`)
  const withExplain = options.explain ?? true
  // The PLR's own limit: S is the router that imposes the repair (RFC 8491 §5, D44).
  const msd = msdOf(topology, source)
  // S's own LFA policy (RFC 7916 §6.2, D45).
  const policy = lfaPolicyOf(topology, source)
  // Link or node protection for Remote LFA and TI-LFA (D51).
  const goal = protectionOf(topology)

  // RLFA depends only on the protected link, not on D (RFC 7490 §5.2.1.3): once per link.
  const rlfaByLink = new Map<string, RlfaResult>()
  const rlfaFor = (e: NodeId, link: string) => {
    let r = rlfaByLink.get(link)
    if (r === undefined) {
      r = computeRlfa(table, source, e, {
        extended: options.extended ?? true,
        link,
        lanEdges: lanFate(topology, table.graph, link, source).edges,
      })
      rlfaByLink.set(link, r)
    }
    return r
  }

  // The Remote LFA part for the goal: node protection (RFC 8102, D51), then whether
  // the chosen tunnel also avoids S–E's SRLG (D53).
  const rlfaForGoal = (
    rlfa: RlfaResult,
    node: ReturnType<typeof nodeRlfa> | undefined,
    lfaBest: NodeId | undefined,
    d: NodeId,
    sharedE: ReturnType<typeof sharedEdges>,
  ): Protection['rlfa'] => {
    const base = hasNode(goal)
      ? rlfaForNodeProtection(rlfa, node, lfaBest)
      : rlfaForProtection(rlfa, lfaBest)
    if (!hasSrlg(goal)) return base
    const pq = base.needed ? base.best : undefined
    const avoids =
      pq !== undefined && rlfaAvoidsSrlg(table, source, pq, base.exitVia[pq], d, sharedE)
    return withSrlgProtects(base, avoids)
  }

  const results: DestinationResult[] = []
  for (const d of table.graph.nodes) {
    const cost = fromS.dist.get(d)
    if (d === source || cost === undefined) continue
    const nextHops = fromS.firstHops.get(d) ?? []

    // One protection per primary next-hop link: a bundle of equal links gives several (D29).
    const protections = firstLinks(table, source, d).map((edge): Protection => {
      const e = edge.to
      const link = edge.linkId
      // SRLG modes: the links that fail with S–E (D53).
      const shared = hasSrlg(goal) ? srlgShared(topology, link) : []
      const sharedE = sharedEdges(table.graph, shared)
      // On a LAN, S's other links on it fail with its interface (RFC 5286 §3.6, D55).
      const lan = lanFate(topology, table.graph, link, source)
      const lfa = computeLfa(table, source, d, e, link, policy, sharedE, lan.ids)
      const excluded = [
        ...new Set(lfa.skipped.filter((x) => x.reason === 'excluded').map((x) => x.neighbor)),
      ]
      const ecmp = ecmpProtectorLinks(table, source, d, e, link, lan.ids)
      const rlfa = rlfaFor(e, link)
      // RFC 8102 node protection depends on D; it can't apply when D is E.
      const node = hasNode(goal) && d !== e ? nodeRlfa(table, rlfa, d) : undefined
      const tilfa = tilfaFor(topology, source, d, e, link, goal)
      const graph = table.graph
      const explain = withExplain
        ? [
            ...explainLfa(lfa, {
              s: source,
              d,
              e,
              ecmpProtectors: [...new Set(ecmp.map((x) => x.to))],
              link,
              ecmpLinks: ecmp.map((x) => x.linkId),
              graph,
            }),
            ...explainRlfa(rlfa, { d, lfaBest: lfa.best, graph }),
            ...(node
              ? explainNodeRlfa(node, { lfaBest: lfa.best, linkBest: rlfa.best, graph })
              : []),
            ...explainTilfa(tilfa, graph, topology.dataplane === 'srv6' ? undefined : msd),
            ...(topology.dataplane === 'srv6' && tilfa.segments
              ? explainSrv6(srv6RepairList(topology, tilfa.segments), d, msd, source)
              : []),
          ]
        : []
      return {
        protectedLink: { from: source, to: e, id: link },
        ecmpProtected: ecmp.length > 0,
        ...(shared.length > 0 && { srlg: shared }),
        lfa: {
          candidates: lfa.candidates,
          ...(lfa.best !== undefined && { best: lfa.best, bestLink: lfa.bestLink! }),
          ...(excluded.length > 0 && { excluded }),
        },
        rlfa: rlfaForGoal(rlfa, node, lfa.best, d, sharedE),
        tilfa: tilfaForProtection(
          tilfa,
          msd,
          goal,
          topology.dataplane === 'srv6' && tilfa.segments
            ? srv6RepairList(topology, tilfa.segments)
            : undefined,
        ),
        explain,
      }
    })
    results.push({ dest: d, cost, nextHops, protections })
  }
  return results
}

export interface CoverageOptions {
  /** Use extended P-space for RLFA (default true, D5). */
  extended?: boolean
  /** Sources to include (default: every router, the "all sources" mode of §5). */
  sources?: NodeId[]
  /** Called after each source: `done` of `total` sources finished. */
  onProgress?: (done: number, total: number, source: NodeId) => void
}

/** Coverage report for one or more sources (docs/02-algorithms.md §5). */
export function computeCoverage(topology: Topology, options: CoverageOptions = {}): CoverageReport {
  const all = allPairs(topology).graph.nodes
  const sources = options.sources ? [...new Set(options.sources)].sort() : all

  const report: CoverageReport = { sources: [], total: emptyCounts(), unprotected: [] }
  const unprotected: UnprotectedPair[][] = []
  sources.forEach((source, i) => {
    const results = computeForSource(topology, source, {
      explain: false,
      ...(options.extended !== undefined && { extended: options.extended }),
    })
    const { counts, unprotected: gaps } = summarizeSource(source, results)
    report.sources.push({ source, counts })
    report.total = addCounts(report.total, counts)
    unprotected.push(gaps)
    options.onProgress?.(i + 1, sources.length, source)
  })
  report.unprotected = unprotected.flat()
  return report
}

/**
 * Every router's results-table rows, each router in turn as the source (the DUT,
 * Phase 9.6). The same computeForSource as one source, without explain steps.
 */
export function computeAllSources(
  topology: Topology,
  options: Omit<CoverageOptions, 'sources'> = {},
): SourceRows[] {
  const sources = allPairs(topology).graph.nodes
  return sources.map((source, i) => {
    const results = computeForSource(topology, source, {
      explain: false,
      ...(options.extended !== undefined && { extended: options.extended }),
    })
    options.onProgress?.(i + 1, sources.length, source)
    return { source, rows: toRows(source, results) }
  })
}

export type {
  CoverageCounts,
  CoverageReport,
  SourceCoverage,
  UnprotectedPair,
  UnprotectedReason,
} from './coverage'
export { percent } from './coverage'
export { isTooDeep, msdOf } from './msd'
export { protectionOf } from './protection'
export { endSid, endXSid, locatorOf, srv6RepairList, srv6Sid } from './srv6'
export {
  DEFAULT_LFA_POLICY,
  hasLfaPolicy,
  isDefaultLfaPolicy,
  lfaPolicyEffect,
  lfaPolicyOf,
  withoutLfaPolicy,
  type LfaPolicyChange,
  type LfaPolicyEffect,
  type ResolvedLfaPolicy,
} from './lfa-policy'
export { protectedBy, toRows, type Method, type ResultRow, type SourceRows } from './rows'
export {
  hopLinks,
  protectionPaths,
  shortestPath,
  type HopLinkOptions,
  type ProtectionPaths,
} from './paths'
export {
  compareBackups,
  type BackupComparison,
  type BackupOption,
  type CompareMethod,
  type CompareOptions,
  type RoutePath,
  type VsFinal,
} from './compare'

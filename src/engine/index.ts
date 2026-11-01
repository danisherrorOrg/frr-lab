// Engine entry points (docs/03-architecture.md §3): what the worker and the UI call.
import {
  addCounts,
  emptyCounts,
  summarizeSource,
  type CoverageReport,
  type UnprotectedPair,
} from './coverage'
import { explainLfa, explainRlfa, explainTilfa } from './explain'
import { computeLfa, ecmpProtectorLinks } from './lfa'
import { msdOf } from './msd'
import { computeRlfa, rlfaForProtection, type RlfaResult } from './rlfa'
import { toRows, type SourceRows } from './rows'
import { allPairs, firstLinks } from './spf'
import { computeTilfa, tilfaForProtection } from './tilfa'
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

  // RLFA depends only on the protected link, not on D (RFC 7490 §5.2.1.3): once per link.
  const rlfaByLink = new Map<string, RlfaResult>()
  const rlfaFor = (e: NodeId, link: string) => {
    let r = rlfaByLink.get(link)
    if (r === undefined) {
      r = computeRlfa(table, source, e, { extended: options.extended ?? true, link })
      rlfaByLink.set(link, r)
    }
    return r
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
      const lfa = computeLfa(table, source, d, e, link)
      const ecmp = ecmpProtectorLinks(table, source, d, e, link)
      const rlfa = rlfaFor(e, link)
      const tilfa = computeTilfa(topology, source, d, e, link)
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
            ...explainTilfa(tilfa, graph, msd),
          ]
        : []
      return {
        protectedLink: { from: source, to: e, id: link },
        ecmpProtected: ecmp.length > 0,
        lfa:
          lfa.best === undefined
            ? { candidates: lfa.candidates }
            : { candidates: lfa.candidates, best: lfa.best, bestLink: lfa.bestLink! },
        rlfa: rlfaForProtection(rlfa, lfa.best),
        tilfa: tilfaForProtection(tilfa, msd),
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

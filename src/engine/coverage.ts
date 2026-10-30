import type { DestinationResult, NodeId } from './types'

/**
 * Counts of (D, primary link S–E) pairs for one source or many (docs/02-algorithms.md §5).
 * Each method's count includes the weaker ones: `rlfa` is "LFA or RLFA".
 */
export interface CoverageCounts {
  /** Every (D, primary next-hop link) pair. Routers S can't reach have no pairs. */
  pairs: number
  /** Another primary next hop avoids the link (RFC 5286 §3.4). These also count as LFA. */
  ecmp: number
  lfa: number
  /** Protected by LFA or RLFA. */
  rlfa: number
  tilfa: number
}

export interface SourceCoverage {
  source: NodeId
  counts: CoverageCounts
}

/**
 * Why a pair is in the unprotected list, from the strongest method that fails:
 * - `no-lfa`: Remote LFA or TI-LFA still protects it
 * - `no-rlfa`: no LFA and no PQ node; only TI-LFA protects it
 * - `partitioned`: D can't be reached once the link fails; nothing protects it
 */
export type UnprotectedReason = 'no-lfa' | 'no-rlfa' | 'partitioned'

/** One (source, destination, link) pair that LFA alone doesn't protect. */
export interface UnprotectedPair {
  source: NodeId
  dest: NodeId
  link: { from: NodeId; to: NodeId }
  lfa: boolean
  rlfa: boolean
  tilfa: boolean
  reason: UnprotectedReason
  text: string
}

export interface CoverageReport {
  /** One row per source, sorted by router id. */
  sources: SourceCoverage[]
  /** Sum over all rows ("all sources" mode when every router is a source). */
  total: CoverageCounts
  /** Sorted by source, then destination, then link. */
  unprotected: UnprotectedPair[]
}

export const emptyCounts = (): CoverageCounts => ({ pairs: 0, ecmp: 0, lfa: 0, rlfa: 0, tilfa: 0 })

export function addCounts(a: CoverageCounts, b: CoverageCounts): CoverageCounts {
  return {
    pairs: a.pairs + b.pairs,
    ecmp: a.ecmp + b.ecmp,
    lfa: a.lfa + b.lfa,
    rlfa: a.rlfa + b.rlfa,
    tilfa: a.tilfa + b.tilfa,
  }
}

/** Coverage numbers and the unprotected list for one source's results (§5). */
export function summarizeSource(
  source: NodeId,
  results: DestinationResult[],
): { counts: CoverageCounts; unprotected: UnprotectedPair[] } {
  const counts = emptyCounts()
  const unprotected: UnprotectedPair[] = []

  for (const r of results) {
    for (const p of r.protections) {
      const lfa = p.lfa.best !== undefined
      // RLFA only runs when there's no LFA (§3), so "LFA or RLFA".
      const rlfa = lfa || p.rlfa.best !== undefined
      const tilfa = p.tilfa.path !== undefined
      counts.pairs += 1
      if (p.ecmpProtected) counts.ecmp += 1
      if (lfa) counts.lfa += 1
      if (rlfa) counts.rlfa += 1
      if (tilfa) counts.tilfa += 1
      if (lfa) continue

      const { from, to } = p.protectedLink
      const over = `${r.dest} over ${from}–${to}`
      let reason: UnprotectedReason
      let text: string
      if (!tilfa) {
        reason = 'partitioned'
        text = `${r.dest} can’t be reached once ${from}–${to} fails: the link is a bridge`
      } else if (!rlfa) {
        const extra = p.tilfa.extraLabels ?? 0
        reason = 'no-rlfa'
        text = `No LFA and no PQ node for ${over}; only TI-LFA protects (${extra} extra label${extra === 1 ? '' : 's'})`
      } else {
        reason = 'no-lfa'
        text = `No LFA for ${over}; Remote LFA tunnels to PQ node ${p.rlfa.best}`
      }
      unprotected.push({ source, dest: r.dest, link: { from, to }, lfa, rlfa, tilfa, reason, text })
    }
  }
  return { counts, unprotected }
}

/** part / total as a percentage with one decimal; undefined when there's nothing to protect. */
export function percent(part: number, total: number): number | undefined {
  if (total === 0) return undefined
  return Math.round((part / total) * 1000) / 10
}

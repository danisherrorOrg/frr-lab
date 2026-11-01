import { hasNode, hasSrlg } from './srlg'
import type { DestinationResult, NodeId, Protection } from './types'

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
  /** TI-LFA repairs S can install: within its max SID depth (D44). */
  tilfa: number
  /** TI-LFA repairs whose label stack is deeper than S's MSD: not counted in `tilfa` (D44). */
  tooDeep: number
  /**
   * Node mode only (D51): pairs where node protection applies (D ≠ E), and of those,
   * the ones whose LFA-or-Remote-LFA backup and whose TI-LFA backup avoid router E.
   */
  node?: { pairs: number; rlfa: number; tilfa: number }
  /**
   * SRLG modes only (D53): pairs whose protected link shares an SRLG with other links,
   * and of those, the ones whose LFA-or-Remote-LFA and TI-LFA backups avoid them all.
   */
  srlg?: { pairs: number; rlfa: number; tilfa: number }
}

export interface SourceCoverage {
  source: NodeId
  counts: CoverageCounts
}

/**
 * Why a pair is in the unprotected list, from the strongest method that fails:
 * - `no-lfa`: Remote LFA or TI-LFA still protects it
 * - `no-rlfa`: no LFA and no PQ node; only TI-LFA protects it
 * - `too-deep`: no LFA, no PQ node, and the TI-LFA stack is deeper than S's MSD (D44)
 * - `partitioned`: D can't be reached once the link fails; nothing protects it
 */
export type UnprotectedReason = 'no-lfa' | 'no-rlfa' | 'too-deep' | 'partitioned'

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

export const emptyCounts = (): CoverageCounts => ({
  pairs: 0,
  ecmp: 0,
  lfa: 0,
  rlfa: 0,
  tilfa: 0,
  tooDeep: 0,
})

export function addCounts(a: CoverageCounts, b: CoverageCounts): CoverageCounts {
  return {
    pairs: a.pairs + b.pairs,
    ecmp: a.ecmp + b.ecmp,
    lfa: a.lfa + b.lfa,
    rlfa: a.rlfa + b.rlfa,
    tilfa: a.tilfa + b.tilfa,
    tooDeep: a.tooDeep + b.tooDeep,
    ...((a.node !== undefined || b.node !== undefined) && {
      node: {
        pairs: (a.node?.pairs ?? 0) + (b.node?.pairs ?? 0),
        rlfa: (a.node?.rlfa ?? 0) + (b.node?.rlfa ?? 0),
        tilfa: (a.node?.tilfa ?? 0) + (b.node?.tilfa ?? 0),
      },
    }),
    ...((a.srlg !== undefined || b.srlg !== undefined) && {
      srlg: {
        pairs: (a.srlg?.pairs ?? 0) + (b.srlg?.pairs ?? 0),
        rlfa: (a.srlg?.rlfa ?? 0) + (b.srlg?.rlfa ?? 0),
        tilfa: (a.srlg?.tilfa ?? 0) + (b.srlg?.tilfa ?? 0),
      },
    }),
  }
}

/**
 * Add one (D, link) pair to `counts` (§5) and say which methods protect it.
 * RLFA only runs when there's no LFA (§3), so `rlfa` is "LFA or RLFA". A TI-LFA
 * repair deeper than S's MSD can't be installed, so it doesn't protect (D44).
 */
export function countPair(counts: CoverageCounts, p: Protection) {
  const lfa = p.lfa.best !== undefined
  const rlfa = lfa || p.rlfa.best !== undefined
  const tooDeep = p.tilfa.tooDeep === true
  const tilfa = p.tilfa.path !== undefined && !tooDeep
  counts.pairs += 1
  if (p.ecmpProtected) counts.ecmp += 1
  if (lfa) counts.lfa += 1
  if (rlfa) counts.rlfa += 1
  if (tilfa) counts.tilfa += 1
  if (tooDeep) counts.tooDeep += 1
  // Node mode with D ≠ E: rlfa.node is set (D51).
  if (p.rlfa.node !== undefined) {
    const node = (counts.node ??= { pairs: 0, rlfa: 0, tilfa: 0 })
    const lfaNode = lfa && p.lfa.candidates.find((c) => c.link === p.lfa.bestLink)?.nodeProtecting
    node.pairs += 1
    const rp = p.rlfa.protects
    if (lfaNode || (!lfa && rp !== undefined && hasNode(rp))) node.rlfa += 1
    if (tilfa && p.tilfa.protects !== undefined && hasNode(p.tilfa.protects)) node.tilfa += 1
  }
  // SRLG modes with an SRLG on this link: p.srlg is set (D53).
  if (p.srlg !== undefined) {
    const srlg = (counts.srlg ??= { pairs: 0, rlfa: 0, tilfa: 0 })
    const lfaOk = lfa && p.lfa.candidates.find((c) => c.link === p.lfa.bestLink)?.srlgDisjoint
    const rp = p.rlfa.protects
    srlg.pairs += 1
    if (lfaOk || (!lfa && rp !== undefined && hasSrlg(rp))) srlg.rlfa += 1
    if (tilfa && p.tilfa.protects !== undefined && hasSrlg(p.tilfa.protects)) srlg.tilfa += 1
  }
  return { lfa, rlfa, tilfa, tooDeep }
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
      const { lfa, rlfa, tilfa, tooDeep } = countPair(counts, p)
      if (lfa) continue

      const { from, to } = p.protectedLink
      const over = `${r.dest} over ${from}–${to}`
      let reason: UnprotectedReason
      let text: string
      if (rlfa) {
        reason = 'no-lfa'
        text = `No LFA for ${over}; Remote LFA tunnels to PQ node ${p.rlfa.best}`
      } else if (tilfa) {
        const extra = p.tilfa.extraLabels ?? 0
        reason = 'no-rlfa'
        text = `No LFA and no PQ node for ${over}; only TI-LFA protects (${extra} extra label${extra === 1 ? '' : 's'})`
      } else if (tooDeep) {
        const depth = p.tilfa.labelStack?.length ?? 0
        reason = 'too-deep'
        text = `No LFA and no PQ node for ${over}; the TI-LFA stack needs ${depth} labels, more than ${source}’s MSD of ${p.tilfa.msd}`
      } else {
        reason = 'partitioned'
        text = `${r.dest} can’t be reached once ${from}–${to} fails: the link is a bridge`
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

// Compact results-table rows (Phase 9.6). The "All routers" view holds every router's
// rows at once, so a row keeps only what the table shows: no LFA candidates, P/Q
// spaces or explain steps. The detail panel still asks for one source's full results.
import type { DestinationResult, NodeId, Protection, Segment } from './types'

export type Method = 'ecmp' | 'lfa' | 'rlfa' | 'tilfa'

/**
 * The simplest method that protects this pair, in the order coverage counts
 * them (docs/02-algorithms.md §5): ECMP, LFA, Remote LFA, TI-LFA.
 */
export function protectedBy(p: Protection): Method | null {
  if (p.ecmpProtected) return 'ecmp'
  if (p.lfa.best !== undefined) return 'lfa'
  if (p.rlfa.needed && p.rlfa.best !== undefined) return 'rlfa'
  // Too deep for S's hardware: not installed, so it protects nothing (D44).
  if (p.tilfa.path !== undefined && p.tilfa.tooDeep !== true) return 'tilfa'
  return null
}

/** One results-table row: source S, destination D, protected primary link S–`via`. */
export interface ResultRow {
  source: NodeId
  dest: NodeId
  cost: number
  /** The primary next hop E. */
  via: NodeId
  /** The protected link's id: a bundle gives one row per link (D29). */
  link: string
  ecmp: boolean
  /** The chosen LFA and the link S uses to reach it. */
  lfa?: { neighbor: NodeId; link: string; nodeProtecting: boolean }
  /** `needed` = false when an LFA already protects D (the spaces are only shown). */
  rlfa: { needed: boolean; pq?: NodeId; via?: NodeId }
  /**
   * `out` is the first router after S, `outLink` the link to it (RFC 9855 §5).
   * `tooDeep`: the stack is longer than S's `msd`, so it is not installed (D44).
   */
  tilfa?: {
    segments: Segment[]
    labelStack: number[]
    out: NodeId
    outLink: string
    msd?: number
    tooDeep?: boolean
  }
  protectedBy: Method | null
}

/** One row per (destination, primary next-hop link), in the engine's order. */
export function toRows(source: NodeId, results: DestinationResult[]): ResultRow[] {
  return results.flatMap((r) =>
    r.protections.map((p): ResultRow => {
      const { lfa, rlfa, tilfa } = p
      const best = lfa.candidates.find((c) => c.link === lfa.bestLink)
      const pq = rlfa.best
      const via = pq === undefined ? undefined : rlfa.exitVia[pq]
      const out = tilfa.path?.[1]
      return {
        source,
        dest: r.dest,
        cost: r.cost,
        via: p.protectedLink.to,
        link: p.protectedLink.id,
        ecmp: p.ecmpProtected,
        ...(lfa.best !== undefined &&
          best && {
            lfa: { neighbor: lfa.best, link: best.link, nodeProtecting: best.nodeProtecting },
          }),
        rlfa: {
          needed: rlfa.needed,
          ...(pq !== undefined && { pq }),
          ...(via !== undefined && { via }),
        },
        ...(tilfa.segments &&
          out !== undefined &&
          tilfa.outLink !== undefined && {
            tilfa: {
              segments: tilfa.segments,
              labelStack: tilfa.labelStack ?? [],
              out,
              outLink: tilfa.outLink,
              ...(tilfa.msd !== undefined && { msd: tilfa.msd }),
              ...(tilfa.tooDeep === true && { tooDeep: true }),
            },
          }),
        protectedBy: protectedBy(p),
      }
    }),
  )
}

/** One router's rows, for the "All routers" view. */
export interface SourceRows {
  source: NodeId
  rows: ResultRow[]
}

// What-if diff (TODO backlog, docs/02-algorithms.md §13): coverage of the network as it
// is and with one change (a new metric), side by side. Nothing new is decided: both
// sides are the §5 counts, and each pair's method is the results table's `protectedBy`.
import { addCounts, countPair, emptyCounts, type CoverageCounts } from './coverage'
import { computeForSource } from './index'
import { protectedBy, type Method } from './rows'
import { allPairs } from './spf'
import type { NodeId, Topology } from './types'

/** One (D, primary link S–E) pair of a destination and the simplest method protecting it. */
export interface PairMethod {
  link: string
  /** The primary next hop E. */
  via: NodeId
  by: Method | null
}

/**
 * - `better` / `worse`: the destination's weakest pair is protected by a stronger /
 *   weaker method
 * - `rerouted`: the primary links changed but the weakest protection did not
 */
export type WhatIfEffect = 'better' | 'worse' | 'rerouted'

/** A (source, destination) whose primary links or protection differ. */
export interface WhatIfChange {
  source: NodeId
  dest: NodeId
  /** Sorted by link id; empty when D can't be reached on that side. */
  before: PairMethod[]
  after: PairMethod[]
  effect: WhatIfEffect
}

export interface WhatIfSource {
  source: NodeId
  before: CoverageCounts
  after: CoverageCounts
}

export interface WhatIf {
  before: CoverageCounts
  after: CoverageCounts
  /** Every router of either side, sorted by id. */
  sources: WhatIfSource[]
  /** Sorted by source, then destination. */
  changes: WhatIfChange[]
}

/**
 * How strong a method is, in the repair modes' order (§5): LFA (ECMP counts as
 * LFA) is protected in every mode, Remote LFA from "LFA + Remote LFA" up, TI-LFA
 * only in TI-LFA mode, none never.
 */
export function strength(by: Method | null): number {
  return by === 'ecmp' || by === 'lfa' ? 3 : by === 'rlfa' ? 2 : by === 'tilfa' ? 1 : 0
}

/** The weakest pair's strength; a destination with no pairs has nothing to compare. */
const weakest = (pairs: PairMethod[]) =>
  pairs.length === 0 ? undefined : Math.min(...pairs.map((p) => strength(p.by)))

const byKey = <T>(xs: T[], key: (x: T) => string) =>
  [...xs].sort((x, y) => (key(x) < key(y) ? -1 : key(x) > key(y) ? 1 : 0))

/** One side for one source: counts and each destination's pairs. */
function side(topology: Topology, source: NodeId, known: boolean, extended?: boolean) {
  const counts = emptyCounts()
  const dests = new Map<NodeId, PairMethod[]>()
  if (!known) return { counts, dests }
  const results = computeForSource(topology, source, {
    explain: false,
    ...(extended !== undefined && { extended }),
  })
  for (const r of results) {
    const pairs: PairMethod[] = []
    for (const p of r.protections) {
      countPair(counts, p)
      pairs.push({ link: p.protectedLink.id, via: p.protectedLink.to, by: protectedBy(p) })
    }
    dests.set(
      r.dest,
      byKey(pairs, (p) => p.link),
    )
  }
  return { counts, dests }
}

/** Pairs are equal when they use the same links with equally strong methods. */
const sameStrength = (a: PairMethod[], b: PairMethod[]) =>
  a.length === b.length &&
  a.every((p, i) => p.link === b[i]!.link && strength(p.by) === strength(b[i]!.by))

/**
 * Coverage of `before` and `after` (the same network with one change), per source
 * and in total, and every (source, destination) whose pairs changed. ECMP ↔ LFA
 * is not a change: both are protected in every mode.
 */
export function whatIf(
  before: Topology,
  after: Topology,
  options: {
    extended?: boolean
    onProgress?: (done: number, total: number, source: NodeId) => void
  } = {},
): WhatIf {
  const was = new Set(allPairs(before).graph.nodes)
  const now = new Set(allPairs(after).graph.nodes)
  const ids = [...new Set([...was, ...now])].sort()
  const out: WhatIf = { before: emptyCounts(), after: emptyCounts(), sources: [], changes: [] }

  ids.forEach((source, i) => {
    const b = side(before, source, was.has(source), options.extended)
    const a = side(after, source, now.has(source), options.extended)
    out.sources.push({ source, before: b.counts, after: a.counts })
    out.before = addCounts(out.before, b.counts)
    out.after = addCounts(out.after, a.counts)

    for (const dest of [...new Set([...b.dests.keys(), ...a.dests.keys()])].sort()) {
      const pb = b.dests.get(dest) ?? []
      const pa = a.dests.get(dest) ?? []
      if (sameStrength(pb, pa)) continue
      const wb = weakest(pb)
      const wa = weakest(pa)
      const effect: WhatIfEffect =
        wb === undefined || wa === undefined || wb === wa
          ? 'rerouted'
          : wa > wb
            ? 'better'
            : 'worse'
      out.changes.push({ source, dest, before: pb, after: pa, effect })
    }
    options.onProgress?.(i + 1, ids.length, source)
  })
  return out
}

// LFA selection policy: docs/02-algorithms.md §15, D45.
import type { DestinationResult, LfaPreference, NodeId, Protection, Topology } from './types'

/** One router's LFA policy with every field filled in. */
export interface ResolvedLfaPolicy {
  nodeProtecting: LfaPreference
  downstream: LfaPreference
  /** Neighbors never used as an LFA, sorted. */
  exclude: NodeId[]
}

/** D7: node-protecting before link-only, then downstream, nothing excluded. */
export const DEFAULT_LFA_POLICY: ResolvedLfaPolicy = {
  nodeProtecting: 'prefer',
  downstream: 'prefer',
  exclude: [],
}

/** Router `node`'s LFA policy: the network's preferences plus its own exclude list. */
export function lfaPolicyOf(topology: Topology, node: NodeId): ResolvedLfaPolicy {
  const exclude = topology.nodes.find((n) => n.id === node)?.lfaExclude ?? []
  return {
    nodeProtecting: topology.lfaPolicy?.nodeProtecting ?? 'prefer',
    downstream: topology.lfaPolicy?.downstream ?? 'prefer',
    exclude: [...new Set(exclude)].sort(),
  }
}

export const isDefaultLfaPolicy = (p: ResolvedLfaPolicy): boolean =>
  p.nodeProtecting === 'prefer' && p.downstream === 'prefer' && p.exclude.length === 0

/** The same network with no LFA policy: D7 order, no exclude lists. */
export function withoutLfaPolicy(topology: Topology): Topology {
  const next: Topology = {
    ...topology,
    nodes: topology.nodes.map((n) => {
      if (n.lfaExclude === undefined) return n
      const plain = { ...n }
      delete plain.lfaExclude
      return plain
    }),
  }
  delete next.lfaPolicy
  return next
}

/** Any policy in the network: non-default preferences, or an exclude list on some router. */
export const hasLfaPolicy = (topology: Topology): boolean =>
  topology.lfaPolicy?.nodeProtecting !== undefined ||
  topology.lfaPolicy?.downstream !== undefined ||
  topology.nodes.some((n) => (n.lfaExclude?.length ?? 0) > 0)

/** One (D, protected link) whose chosen LFA the policy changes. Undefined = no LFA. */
export interface LfaPolicyChange {
  dest: NodeId
  link: string
  before?: NodeId
  after?: NodeId
}

export interface LfaPolicyEffect {
  /** (D, protected link) pairs looked at. */
  pairs: number
  changes: LfaPolicyChange[]
}

/**
 * What the policy changes for one source (docs/02-algorithms.md §15): the chosen
 * LFA with no policy (`before`) against with it (`after`), per protected link.
 */
export function lfaPolicyEffect(
  before: DestinationResult[],
  after: DestinationResult[],
): LfaPolicyEffect {
  const was = new Map<string, Protection['lfa']>()
  for (const r of before)
    for (const p of r.protections) was.set(`${r.dest} ${p.protectedLink.id}`, p.lfa)
  const effect: LfaPolicyEffect = { pairs: 0, changes: [] }
  for (const r of after) {
    for (const p of r.protections) {
      effect.pairs++
      const old = was.get(`${r.dest} ${p.protectedLink.id}`)
      if (old?.bestLink === p.lfa.bestLink) continue
      effect.changes.push({
        dest: r.dest,
        link: p.protectedLink.id,
        ...(old?.best !== undefined && { before: old.best }),
        ...(p.lfa.best !== undefined && { after: p.lfa.best }),
      })
    }
  }
  return effect
}

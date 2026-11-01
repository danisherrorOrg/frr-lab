// Flexible Algorithm (Later #6, D58, docs/02-algorithms.md §23). A Flex-Algo is its
// own topology: the routers that take part, the links that meet its constraints, with
// the metric it asks for (RFC 9350 §5–§6). Its backups are computed in that topology
// too (RFC 9350 §6.1: "the repair path … MUST be computed using the same Flex-Algo").
import { expandLans } from './lan'
import type { FlexAlgo, Link, NodeId, RouterNode, Topology } from './types'

/**
 * Router `node`'s Prefix-SID index in Flex-Algo `algo`: its own, else its algorithm-0
 * index + 1000 × the algorithm's place in the list (1st = +1000), so SIDs differ per
 * algorithm (RFC 8667 §2.1: one Prefix-SID per algorithm).
 */
export function flexSidIndex(t: Topology, node: RouterNode, algo: number): number {
  const own = node.algoSids?.[algo]
  if (own !== undefined) return own
  const k = [...(t.flexAlgos ?? [])]
    .sort((a, b) => a.algo - b.algo)
    .findIndex((f) => f.algo === algo)
  return node.sidIndex + 1000 * (k + 1)
}

/** Does the link meet the algorithm's colour rules (RFC 9350 §6.2–6.5)? */
export function meetsConstraints(fa: FlexAlgo, link: Link): boolean {
  const colours = new Set(link.affinity ?? [])
  if ((fa.excludeAny ?? []).some((c) => colours.has(c))) return false
  if ((fa.includeAny ?? []).length > 0 && !(fa.includeAny ?? []).some((c) => colours.has(c)))
    return false
  return (fa.includeAll ?? []).every((c) => colours.has(c))
}

/** A link's cost in the algorithm, or undefined when it doesn't have that metric (§5.1). */
function costs(fa: FlexAlgo, l: Link): [number, number] | undefined {
  const m = fa.metric ?? 'igp'
  if (m === 'igp') return [l.metricAB, l.metricBA]
  const v = m === 'te' ? l.teMetric : l.delay
  return v === undefined ? undefined : [v, v]
}

/** "Flex-Algo 128: delay, exclude red". */
export function flexAlgoText(fa: FlexAlgo): string {
  const parts = [
    fa.metric === 'te' ? 'TE metric' : fa.metric === 'delay' ? 'min delay' : 'IGP metric',
    ...(fa.excludeAny?.length ? [`exclude ${fa.excludeAny.join(', ')}`] : []),
    ...(fa.includeAny?.length ? [`include any of ${fa.includeAny.join(', ')}`] : []),
    ...(fa.includeAll?.length ? [`include all of ${fa.includeAll.join(', ')}`] : []),
  ]
  return `Flex-Algo ${fa.algo}: ${parts.join(', ')}`
}

/**
 * The topology Flex-Algo `algo` computes on: routers that take part (with their
 * algorithm's SID index), links between them that meet the constraints and carry the
 * metric, costed with it. LANs stay only for the IGP metric (they carry no TE metric
 * or delay here). Everything else (SRGB, MSD, policy, protection) is unchanged.
 */
export function flexTopology(t: Topology, algo: number): Topology {
  const fa = t.flexAlgos?.find((f) => f.algo === algo)
  if (fa === undefined) throw new Error(`Flex-Algo ${algo} is not defined.`)
  const nodes = t.nodes
    .filter((n) => n.algos === undefined || n.algos.includes(algo))
    .map((n) => {
      // SRv6: each algorithm has its own locator (RFC 9350 §14); the one set on the router
      // is algorithm 0's, so the view derives one from the algorithm's SID index (D59).
      const m: RouterNode = { ...n, sidIndex: flexSidIndex(t, n, algo) }
      delete m.locator
      return m
    })
  const ids = new Set<NodeId>(nodes.map((n) => n.id))
  const links = t.links.flatMap((l): Link[] => {
    if (l.lan !== undefined || !ids.has(l.a) || !ids.has(l.b) || !meetsConstraints(fa, l)) return []
    const c = costs(fa, l)
    return c === undefined ? [] : [{ ...l, metricAB: c[0], metricBA: c[1] }]
  })
  const igp = (fa.metric ?? 'igp') === 'igp'
  const lans = igp
    ? (t.lans ?? [])
        .map((lan) => ({ ...lan, members: lan.members.filter((m) => ids.has(m.node)) }))
        .filter((lan) => lan.members.length >= 2)
    : []
  return expandLans({
    ...t,
    name: `${t.name} (Flex-Algo ${algo})`,
    nodes,
    links: [...links, ...t.links.filter((l) => l.lan !== undefined)],
    lans,
  })
}

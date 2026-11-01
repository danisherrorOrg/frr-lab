// Microloops (Later #6, D57, docs/02-algorithms.md §22). After a failure the routers
// update their forwarding tables one by one (RFC 5715 §1). While some have the new
// table and others the old one, traffic can go round between them for a moment: a
// microloop. This finds, per destination, the loops some update order can make.
import type { Failures } from './simulate'
import { allPairs, type AllPairs } from './spf'
import type { NodeId, Topology } from './types'

/** One loop some update order can make, for traffic to `dest`. */
export interface Microloop {
  dest: NodeId
  /** Routers round the loop, the first again at the end: A → B → A. */
  cycle: NodeId[]
  /** Routers in the loop that must already use their new next hop. */
  updated: NodeId[]
  /** Routers in the loop still on their old next hop. */
  waiting: NodeId[]
  /**
   * A router next to the failure (a PLR) is among `updated`: it left its FRR repair
   * early. Local convergence delay (RFC 8333) keeps it on the repair until the others
   * have updated, so this loop doesn't form (for one link going down).
   */
  plrEarly: boolean
}

export interface MicroloopReport {
  /** Routers whose next hop to some destination changes, counted per destination. */
  changes: number
  /** Sorted by destination, then by the loop. */
  loops: Microloop[]
}

/** The topology without these links (both directions). */
function without(t: Topology, ids: Set<string>): Topology {
  return { ...t, links: t.links.filter((l) => !ids.has(l.id)) }
}

/** The lowest-id first hop from x to d, the tie-break of the drawings (§4.1). */
const hop = (table: AllPairs, x: NodeId, d: NodeId) => table.from.get(x)?.firstHops.get(d)?.[0]

/**
 * Microloops a failure can make while the network converges (RFC 5715). Each router
 * forwards to D on its old next hop or its new one, the lowest-id one as in the
 * simulation. A router whose old next hop is over a failed link is a PLR: until it
 * updates, its FRR repair carries the traffic past the others' tables (TI-LFA's
 * segments, RFC 9855), so traffic leaves the loop search there; once updated it
 * forwards on its new next hop. Any cycle mixing old and new next hops is a loop
 * some update order makes.
 */
export function microloops(topology: Topology, failed: Failures): MicroloopReport {
  const down = new Set(failed.nodes ?? [])
  const downIds = new Set([
    ...(failed.links ?? []),
    ...topology.links.filter((l) => down.has(l.a) || down.has(l.b)).map((l) => l.id),
  ])
  const before = allPairs(topology)
  const after = allPairs(without(topology, downIds))
  const edgeUp = (x: NodeId, y: NodeId) =>
    before.graph.out.get(x)!.some((e) => e.to === y && !downIds.has(e.linkId))

  let changes = 0
  const loops: Microloop[] = []
  for (const d of before.graph.nodes) {
    if (down.has(d)) continue
    const old = new Map<NodeId, NodeId>()
    const fresh = new Map<NodeId, NodeId>()
    const plr = new Set<NodeId>()
    for (const r of before.graph.nodes) {
      if (r === d || down.has(r)) continue
      const o = hop(before, r, d)
      const n = hop(after, r, d)
      if (n !== undefined) fresh.set(r, n)
      // An old next hop over a failed link (or a failed router): r is a PLR.
      if (o !== undefined && !down.has(o) && edgeUp(r, o)) old.set(r, o)
      else if (o !== undefined) plr.add(r)
      if (o !== n) changes += 1
    }
    // Out-edges: old and new next hop; a PLR only its new one (its repair leaves the search).
    const next = (r: NodeId): { to: NodeId; isNew: boolean }[] => {
      const out: { to: NodeId; isNew: boolean }[] = []
      const o = old.get(r)
      const n = fresh.get(r)
      if (o !== undefined && !plr.has(r)) out.push({ to: o, isNew: false })
      if (n !== undefined && n !== o) out.push({ to: n, isNew: true })
      return out
    }
    const seen = new Set<string>()
    for (const r of before.graph.nodes) {
      const n = fresh.get(r)
      if (n === undefined || n === old.get(r)) continue
      // The shortest way back to r once r has updated (breadth-first, so the loop is short).
      const prev = new Map<NodeId, { from: NodeId; isNew: boolean }>()
      const queue: NodeId[] = [n]
      prev.set(n, { from: r, isNew: true })
      let found = false
      for (let i = 0; i < queue.length && !found; i++) {
        const x = queue[i]!
        if (x === d) continue
        for (const e of next(x)) {
          if (e.to === r) {
            prev.set(r, { from: x, isNew: e.isNew })
            found = true
            break
          }
          if (prev.has(e.to) || e.to === d) continue
          prev.set(e.to, { from: x, isNew: e.isNew })
          queue.push(e.to)
        }
      }
      if (!found) continue
      // Walk back from r to r.
      const cycle: NodeId[] = [r]
      const states = new Map<NodeId, boolean>()
      let at = r
      do {
        const p = prev.get(at)!
        states.set(p.from, p.isNew)
        cycle.unshift(p.from)
        at = p.from
      } while (at !== r)
      // Same loop from another start: keep one, starting at its lowest id.
      const ring = cycle.slice(0, -1)
      const k = ring.indexOf([...ring].sort()[0]!)
      const canon = [...ring.slice(k), ...ring.slice(0, k)]
      const key = `${d}|${canon.join('>')}`
      if (seen.has(key)) continue
      seen.add(key)
      const isNew = (x: NodeId) => states.get(x) === true
      const updated = canon.filter((x) => isNew(x) && old.get(x) !== fresh.get(x))
      loops.push({
        dest: d,
        cycle: [...canon, canon[0]!],
        updated,
        waiting: canon.filter((x) => !isNew(x) && old.get(x) !== fresh.get(x)),
        plrEarly: updated.some((x) => plr.has(x)),
      })
    }
  }
  loops.sort((a, b) =>
    a.dest !== b.dest ? (a.dest < b.dest ? -1 : 1) : a.cycle.join() < b.cycle.join() ? -1 : 1,
  )
  return { changes, loops }
}

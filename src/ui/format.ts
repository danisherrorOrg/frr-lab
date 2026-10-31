// Small text helpers for the results table and detail panel. No routing maths:
// they only read what the engine returned.
import type { ProtectionPaths } from '../engine/paths'
import type { FailureSimulation, Flow, Through } from '../engine/simulate'
import type { NodeId, Protection, Segment, Topology } from '../engine/types'
import type { BackupKind } from '../state/store'

export type Method = 'ecmp' | 'lfa' | 'rlfa' | 'tilfa'

export const METHOD_NAME: Record<Method, string> = {
  ecmp: 'ECMP',
  lfa: 'LFA',
  rlfa: 'Remote LFA',
  tilfa: 'TI-LFA',
}

/**
 * The simplest method that protects this pair, in the order coverage counts
 * them (docs/02-algorithms.md §5): ECMP, LFA, Remote LFA, TI-LFA.
 */
export function protectedBy(p: Protection): Method | null {
  if (p.ecmpProtected) return 'ecmp'
  if (p.lfa.best !== undefined) return 'lfa'
  if (p.rlfa.needed && p.rlfa.best !== undefined) return 'rlfa'
  if (p.tilfa.path !== undefined) return 'tilfa'
  return null
}

/** Router pairs joined by more than one link (parallel links, D29), as "a|b" with a < b. */
export type Bundles = ReadonlySet<string>

const pairKey = (a: NodeId, b: NodeId) => (a < b ? `${a}|${b}` : `${b}|${a}`)

/** Every router pair with parallel links: only then does text need to name the link. */
export function bundles(t: Topology): Bundles {
  const seen = new Set<string>()
  const many = new Set<string>()
  for (const l of t.links) {
    const k = pairKey(l.a, l.b)
    if (seen.has(k)) many.add(k)
    seen.add(k)
  }
  return many
}

export const isBundled = (b: Bundles | undefined, x: NodeId, y: NodeId) =>
  b !== undefined && b.has(pairKey(x, y))

/** "E", or "E (S-E#2)" when S and E have parallel links, so the link is clear (D29). */
export const hopName = (b: Bundles | undefined, s: NodeId, n: NodeId, link: string | undefined) =>
  link !== undefined && isBundled(b, s, n) ? `${n} (${link})` : n

/** "S–E", or "S–E (S-E#2)" for one link of a bundle. */
export const linkName = (b: Bundles | undefined, x: NodeId, y: NodeId, link: string | undefined) =>
  link !== undefined && isBundled(b, x, y) ? `${x}–${y} (${link})` : `${x}–${y}`

export const segmentText = (s: Segment, b?: Bundles): string =>
  s.kind === 'prefix' ? `Prefix ${s.node}` : `Adj ${s.from}→${hopName(b, s.from, s.to, s.link)}`

/** "B · B→C · E": short form for the table. */
export const segmentsShort = (segs: Segment[], b?: Bundles): string =>
  segs
    .map((s) => (s.kind === 'prefix' ? s.node : `${s.from}→${hopName(b, s.from, s.to, s.link)}`))
    .join(' · ')

/** Tags for one LFA candidate, e.g. "node-protecting, downstream". */
export function lfaTags(c: {
  loopFree: boolean
  downstream: boolean
  nodeProtecting: boolean
}): string {
  if (!c.loopFree) return 'not loop-free'
  const tags = [c.nodeProtecting ? 'node-protecting' : 'link-protecting']
  if (c.downstream) tags.push('downstream')
  return tags.join(', ')
}

/** The backup path to draw: the chosen kind, or for 'auto' the first that exists. */
export function pickBackup(
  paths: ProtectionPaths,
  kind: BackupKind,
): { kind: Exclude<BackupKind, 'auto'>; path: NodeId[] } | null {
  const order = kind === 'auto' ? (['lfa', 'rlfa', 'tilfa'] as const) : [kind]
  for (const k of order) {
    const path = paths[k]
    if (path) return { kind: k, path }
  }
  return null
}

/** Parse a number typed in a field; '' and non-numbers give NaN so range checks fail. */
export const toNumber = (text: string) => (text.trim() === '' ? NaN : Number(text.trim()))

/** File name from the topology name: "Small ISP core" → "small-isp-core.yaml". */
export const fileName = (name: string) =>
  `${
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '') || 'topology'
  }.yaml`

/**
 * The flow drawn on the canvas: the chosen one, else the first affected one. A failed
 * router as destination has nothing to draw (it is simply unreachable).
 */
export function drawnFlow(sim: FailureSimulation, dest: NodeId | null): Flow | undefined {
  const drawable = (f: Flow) => f.affected && !f.destDown
  return sim.flows.find((f) => f.dest === dest && drawable(f)) ?? sim.flows.find(drawable)
}

/**
 * Why a backup is broken by a router failure, with real numbers (D27):
 * "N's path to D goes through E: dist(N,D) = 2 is not < dist(N,E) + dist(E,D) = 1+1 = 2 …"
 * `next` is the neighbor the PLR protects against. Only when that neighbor is the
 * failed router is it a node-protection story; any other failed router is a second
 * failure the backup was never planned for (D28).
 */
export function throughText(t: Through, plr: NodeId, next: NodeId, dest: NodeId): string {
  const { node, at, why } = t
  const hop = `${at}→${node}`
  const second =
    `${node} is a second failure: ${plr}'s backup was planned for the link ${plr}–${next} ` +
    `alone, and FRR plans for one failure at a time.`
  if (why.method === 'ecmp' || why.method === 'lfa') {
    const who = why.method === 'ecmp' ? `the other ECMP next hop ${why.via}` : `LFA ${why.via}`
    if (why.check) {
      const { distND, distNE, distED } = why.check
      return (
        `${who} reaches ${dest} through ${node}: dist(${why.via},${dest}) = ${distND} is not < ` +
        `dist(${why.via},${node}) + dist(${node},${dest}) = ${distNE}+${distED} = ${distNE + distED}, ` +
        `so ${why.via} only protects the link ${plr}–${node}, not the router (RFC 5286 §3.2).`
      )
    }
    const part =
      why.via === node
        ? `${who} is itself down.`
        : `${who} reaches ${dest} through ${node} (${hop}).`
    return node === next ? part : `${part} ${second}`
  }
  if (why.method === 'rlfa') {
    const leg =
      why.leg === 'to-pq'
        ? why.pq === node
          ? `PQ node ${why.pq} is itself down`
          : `the tunnel to PQ node ${why.pq} goes through ${node} (${hop})`
        : `PQ node ${why.pq} reaches ${dest} through ${node} (${hop})`
    return node === next
      ? `${leg}. Remote LFA (RFC 7490) only protects the link ${plr}–${node}, not the router (RFC 8102 §2.1).`
      : `${leg}. ${second}`
  }
  // TypeScript can't narrow the 'ecmp' | 'lfa' member away by the checks above.
  if (why.method !== 'tilfa') return ''
  const seg = why.segment
  const part =
    seg === null
      ? `its first hop is ${node}`
      : seg.kind === 'prefix' && seg.node === node
        ? `the segment list holds Prefix-SID(${node}) (label ${seg.label}), the label of the router that is down`
        : seg.kind === 'adj'
          ? `the segment list holds Adj-SID(${seg.from}→${seg.to}) (label ${seg.label}), a link of ${node}`
          : `segment Prefix-SID(${seg.node}) follows normal paths through ${node} (${hop})`
  return node === next
    ? `${part}. TI-LFA link protection only avoids the link ${plr}–${node}; node protection would plan around the router (RFC 9855 §1).`
    : `${part}. ${second}`
}

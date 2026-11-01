// Small text helpers for the results table and detail panel. No routing maths:
// they only read what the engine returned.
import { percent, type CoverageCounts } from '../engine/coverage'
import { protectedIn, type HeatMap } from '../engine/heat-map'
import { adjLabel } from '../engine/labels'
import type { PacketWalk } from '../engine/packet-walk'
import type { ProtectionPaths } from '../engine/paths'
import type { Method, ResultRow } from '../engine/rows'
import type {
  FailureSimulation,
  FailureSummary,
  Flow,
  RepairMode,
  SourceFailure,
  Through,
} from '../engine/simulate'
import type { NodeId, Protection, Segment, Topology } from '../engine/types'
import type { PairMethod } from '../engine/what-if'
import type { BackupKind, Selection } from '../state/store'
import type { Highlight } from './canvas'

export type { Method } from '../engine/rows'
export { protectedBy } from '../engine/rows'

export const METHOD_NAME: Record<Method, string> = {
  ecmp: 'ECMP',
  lfa: 'LFA',
  rlfa: 'Remote LFA',
  tilfa: 'TI-LFA',
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

/** A label stack as diagram lines, top first: ["16004 B", "24005 B→C"], or ["no labels"]. */
export const stackLines = (segs: Segment[], b?: Bundles): string[] =>
  segs.length === 0
    ? ['no labels']
    : segs.map(
        (s) =>
          `${s.label} ${s.kind === 'prefix' ? s.node : `${s.from}→${hopName(b, s.from, s.to, s.link)}`}`,
      )

/**
 * What a packet walk marks on the diagram at `step`: the router, the link it leaves
 * on, and (with `stacks`) the label stack on every link walked. A link used twice
 * (a loop) shows the stack of the latest visit up to `step`, else the first.
 */
export function walkMarks(
  walk: PacketWalk | undefined,
  step: number | null,
  stacks: boolean,
  b?: Bundles,
): Pick<Highlight, 'packetAt' | 'packetLink' | 'packetStacks'> {
  const at = step === null ? undefined : walk?.hops[step]
  if (!walk || !at) return {}
  const byLink = new Map<string, number>()
  walk.hops.forEach((h, i) => {
    if (h.link === undefined) return
    const had = byLink.get(h.link)
    if (had === undefined || i <= step!) byLink.set(h.link, i)
  })
  return {
    packetAt: at.router,
    ...(at.link !== undefined && { packetLink: at.link }),
    ...(stacks && {
      packetStacks: [...byLink].map(([link, i]) => ({
        link,
        lines: stackLines(walk.hops[i]!.sent ?? [], b),
        current: i === step,
      })),
    }),
  }
}

/** A Remote LFA set picked in the detail panel, to show on its own on the diagram. */
export type SpaceKind = 'p' | 'extP' | 'q' | 'pq'

/** The routers in one Remote LFA set (RFC 7490 §5.2–5.3). */
export function spaceSet(rlfa: Protection['rlfa'], kind: SpaceKind): NodeId[] {
  return { p: rlfa.pSpace, extP: rlfa.extPSpace, q: rlfa.qSpace, pq: rlfa.pq }[kind]
}

/**
 * The P/Q shading for one row. With no set picked: the P-space in use (extended or
 * plain) and the Q-space. With one picked: only that set, its routers ringed
 * (`spot`) and the rest faded. PQ nodes are in both spaces, so they get both shades.
 * The ★ on the chosen PQ node stays either way.
 */
export function spaceMarks(
  rlfa: Protection['rlfa'],
  focus: SpaceKind | null,
): Pick<Highlight, 'pSpace' | 'qSpace' | 'pq' | 'spot'> {
  const pq = rlfa.needed && rlfa.best !== undefined ? { pq: rlfa.best } : {}
  // An edit can empty the picked set; then fall back to the normal shading.
  const ids = focus === null ? [] : spaceSet(rlfa, focus)
  if (focus === null || ids.length === 0)
    return { pSpace: rlfa.extended ? rlfa.extPSpace : rlfa.pSpace, qSpace: rlfa.qSpace, ...pq }
  return {
    ...(focus !== 'q' && { pSpace: ids }),
    ...((focus === 'q' || focus === 'pq') && { qSpace: ids }),
    ...pq,
    spot: ids,
  }
}

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
 * failure the backup was never planned for (D28). `link` is the PLR's failed link:
 * with parallel links the text names it, since each link has its own backup (D29).
 */
export function throughText(
  t: Through,
  plr: NodeId,
  next: NodeId,
  dest: NodeId,
  link?: string,
  b?: Bundles,
): string {
  const { node, at, why } = t
  const hop = `${at}→${node}`
  const protectedLink = linkName(b, plr, next, link)
  const second =
    `${node} is a second failure: ${plr}'s backup was planned for the link ${protectedLink} ` +
    `alone, and FRR plans for one failure at a time.`
  if (why.method === 'ecmp' || why.method === 'lfa') {
    const who = why.method === 'ecmp' ? `the other ECMP next hop ${why.via}` : `LFA ${why.via}`
    if (why.check) {
      const { distND, distNE, distED } = why.check
      return (
        `${who} reaches ${dest} through ${node}: dist(${why.via},${dest}) = ${distND} is not < ` +
        `dist(${why.via},${node}) + dist(${node},${dest}) = ${distNE}+${distED} = ${distNE + distED}, ` +
        `so ${why.via} only protects the link ${protectedLink}, not the router (RFC 5286 §3.2).`
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
      ? `${leg}. Remote LFA (RFC 7490) only protects the link ${protectedLink}, not the router (RFC 8102 §2.1).`
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
          ? `the segment list holds Adj-SID(${seg.from}→${seg.to})${isBundled(b, seg.from, seg.to) ? ` of link ${seg.link}` : ''} (label ${seg.label}), a link of ${node}`
          : `segment Prefix-SID(${seg.node}) follows normal paths through ${node} (${hop})`
  return node === next
    ? `${part}. TI-LFA link protection only avoids the link ${protectedLink}; node protection would plan around the router (RFC 9855 §1).`
    : `${part}. ${second}`
}

/** "1 router" / "2 routers". */
export const plural = (k: number, word: string) => `${k} ${word}${k === 1 ? '' : 's'}`

/**
 * Hover text for a router or link on the canvas (Phase 9.5): what the properties
 * panel would show, without having to select it.
 */
export function tooltipLines(
  t: Topology,
  target: Exclude<Selection, null>,
  down: { links: readonly string[]; nodes: readonly NodeId[] },
): string[] {
  if (target.kind === 'node') {
    const n = t.nodes.find((x) => x.id === target.id)
    if (!n) return []
    return [
      `Router ${n.id}${n.name ? ` · ${n.name}` : ''}`,
      `Prefix-SID index ${n.sidIndex} · label ${t.srgbBase + n.sidIndex}`,
      ...(down.nodes.includes(n.id) ? ['✕ down: all its links are down'] : []),
    ]
  }
  const l = t.links.find((x) => x.id === target.id)
  if (!l) return []
  const { a, b } = l
  // Labels set in the file are shown as they are; the others are auto-assigned (D18).
  const adj = (from: NodeId, to: NodeId, set: number | undefined) =>
    `${from}→${to} ${set ?? `${adjLabel(t, from, to, l.id)} (auto)`}`
  const deadEnd = [a, b].find((x) => down.nodes.includes(x))
  return [
    `Link ${linkName(bundles(t), a, b, l.id)}`,
    l.metricAB === l.metricBA
      ? `Metric ${l.metricAB} both ways`
      : `Metric ${a}→${b} ${l.metricAB} · ${b}→${a} ${l.metricBA}`,
    `Adj-SID ${adj(a, b, l.adjSidAB)} · ${adj(b, a, l.adjSidBA)}`,
    ...(deadEnd !== undefined
      ? [`✕ down (router ${deadEnd} is down)`]
      : down.links.includes(l.id)
        ? ['✕ down']
        : []),
  ]
}

/** "3 repaired, 1 dropped until convergence": the non-zero outcomes, in a fixed order. */
export function outcomeText(s: FailureSummary): string {
  const parts: [number, string][] = [
    [s.repaired, `repaired${s.relayed > 0 ? ` (${s.relayed} by more than one router)` : ''}`],
    [s.dropped, 'dropped until convergence'],
    [s.looped, 'looping until convergence'],
    [s.unreachable, 'unreachable'],
  ]
  return parts
    .filter(([k], i) => k > 0 || i === 0)
    .map(([k, text]) => `${k} ${text}`)
    .join(', ')
}

/** "2 survive, 1 breaks" ("2 repairs survive" with a noun), "no backup" only when there are some (D27). */
export function surviveText(s: FailureSummary, noun?: string): string {
  return (
    `${noun ? plural(s.survive, noun) : s.survive} survive${s.survive === 1 ? 's' : ''}, ${s.breaks} break${s.breaks === 1 ? 's' : ''}` +
    `${s.noBackup > 0 ? `, ${s.noBackup} with no backup` : ''}`
  )
}

/**
 * One line for one DUT in the per-router failure view (Phase 9.6), e.g.
 * "3 affected, 3 repaired; 2 survive, 1 breaks". `routersDown`: add the survive /
 * break part, which only means something when a router has failed. It counts the
 * flows that meet a down router; when that isn't every affected one, say how many (D32).
 */
export function dutSummary(x: SourceFailure, routersDown: boolean): string {
  if ('down' in x) return 'down: sends no traffic'
  const s = x.summary
  if (s.affected === 0) return 'nothing affected'
  const which =
    s.viaRouter === s.affected
      ? ''
      : `${s.viaRouter} meet${s.viaRouter === 1 ? 's' : ''} a down router: `
  return `${s.affected} affected, ${outcomeText(s)}${routersDown ? `; ${which}${surviveText(s)}` : ''}`
}

/**
 * How one results row is protected, in a line (per-link view, docs/02-algorithms.md §11):
 * "LFA A (node-protecting)", "Remote LFA: tunnel to PQ node B", "TI-LFA: B · E (16004 16002)".
 */
/** Why a TI-LFA repair isn't installed: "3 labels > MSD 2 of S" (RFC 8491 §5, D44). */
export function tooDeepText(router: NodeId, labels: number, msd: number): string {
  return `${labels} label${labels === 1 ? '' : 's'} > MSD ${msd} of ${router}`
}

export function howText(r: ResultRow, b?: Bundles): string {
  switch (r.protectedBy) {
    case 'ecmp':
      return r.lfa
        ? `ECMP: the other next hop ${hopName(b, r.source, r.lfa.neighbor, r.lfa.link)} takes it`
        : 'ECMP: another equal-cost next hop takes it'
    case 'lfa':
      return r.lfa
        ? `LFA ${hopName(b, r.source, r.lfa.neighbor, r.lfa.link)} (${r.lfa.nodeProtecting ? 'node' : 'link'}-protecting)`
        : 'LFA'
    case 'rlfa':
      return `Remote LFA: tunnel to PQ node ${r.rlfa.pq ?? '?'}${r.rlfa.via ? ` via ${r.rlfa.via}` : ''}`
    case 'tilfa':
      return r.tilfa
        ? `TI-LFA: ${segmentsShort(r.tilfa.segments, b)} (${r.tilfa.labelStack.join(' ')})`
        : 'TI-LFA'
    default:
      return r.tilfa?.tooDeep && r.tilfa.msd !== undefined
        ? `Nothing: TI-LFA ${segmentsShort(r.tilfa.segments, b)} is too deep (${tooDeepText(r.source, r.tilfa.labelStack.length, r.tilfa.msd)})`
        : `Nothing: ${r.dest} is cut off from ${r.source} when the link fails`
  }
}

// Coverage heat map (TODO backlog, docs/02-algorithms.md §12).

/**
 * How well a router or link is protected: every repair (`full`), 75% or more
 * (`most`), 50% or more (`part`), less (`low`), or nothing to repair (`idle`).
 */
export type HeatLevel = 'full' | 'most' | 'part' | 'low' | 'idle'

export const HEAT_LEVELS: { level: HeatLevel; text: string }[] = [
  { level: 'full', text: '✓ 100%: every repair has a backup' },
  { level: 'most', text: '75–99%' },
  { level: 'part', text: '50–74%' },
  { level: 'low', text: 'under 50%' },
  { level: 'idle', text: '–: nothing to repair (only a backup link)' },
]

/** What the heat map protects with: the simulation's repair modes. */
export const HEAT_MODE_NAME: Record<RepairMode, string> = {
  lfa: 'LFA',
  rlfa: 'LFA + Remote LFA',
  tilfa: 'TI-LFA',
}

export interface HeatMark {
  level: HeatLevel
  /** Written on the diagram: "✓ 100%", "50%", or "–". */
  text: string
}

/** Level and label for one router's or link's counts in `mode`. */
export function heatMark(counts: CoverageCounts, mode: RepairMode): HeatMark {
  const part = protectedIn(counts, mode)
  const pct = percent(part, counts.pairs)
  if (pct === undefined) return { level: 'idle', text: '–' }
  // Exact counts decide the level, so 99.96% never rounds up to a ✓.
  if (part === counts.pairs) return { level: 'full', text: '✓ 100%' }
  const f = part / counts.pairs
  const level: HeatLevel = f >= 0.75 ? 'most' : f >= 0.5 ? 'part' : 'low'
  return { level, text: `${Math.min(pct, 99.9)}%` }
}

export interface HeatMarks {
  nodes: Record<NodeId, HeatMark>
  links: Record<string, HeatMark>
}

export function heatMarks(map: HeatMap, mode: RepairMode): HeatMarks {
  const each = (r: Record<string, CoverageCounts>) =>
    Object.fromEntries(Object.entries(r).map(([id, c]) => [id, heatMark(c, mode)]))
  return { nodes: each(map.routers), links: each(map.links) }
}

/** Tooltip lines: every mode's numbers, so the colour can be checked. */
export function heatLines(counts: CoverageCounts, kind: 'node' | 'link'): string[] {
  if (counts.pairs === 0)
    return [
      kind === 'node'
        ? 'Heat map: repairs nothing (reaches no other router)'
        : 'Heat map: carries no traffic, so nothing to repair (only a backup)',
    ]
  const n = counts.pairs
  const share = (mode: RepairMode) =>
    `${HEAT_MODE_NAME[mode]} ${protectedIn(counts, mode)}/${n} (${percent(protectedIn(counts, mode), n)}%)`
  return [
    kind === 'node'
      ? `Heat map: repairs ${n} destination${n === 1 ? '' : 's'} as the router before a failed link`
      : `Heat map: ${n} repair${n === 1 ? '' : 's'} if this link fails (both ends)`,
    `${share('lfa')} · ${share('rlfa')} · ${share('tilfa')}`,
  ]
}

/** One repair mode's share before and after a what-if change (docs/02-algorithms.md §13). */
export interface ShareChange {
  mode: RepairMode
  /** "40% (8/20)", or "–" with nothing to protect. */
  before: string
  after: string
  /** Percentage points, one decimal; undefined when either side has no pairs. */
  delta: number | undefined
  /** "40% → 50%". */
  change: string
  /** "LFA 40% → 50%", the short form for headings and screen readers. */
  text: string
}

export function shareChange(
  before: CoverageCounts,
  after: CoverageCounts,
  mode: RepairMode,
): ShareChange {
  const pb = percent(protectedIn(before, mode), before.pairs)
  const pa = percent(protectedIn(after, mode), after.pairs)
  const side = (c: CoverageCounts, p: number | undefined) =>
    p === undefined ? '–' : `${p}% (${protectedIn(c, mode)}/${c.pairs})`
  const short = (p: number | undefined) => (p === undefined ? '–' : `${p}%`)
  const change = `${short(pb)} → ${short(pa)}`
  return {
    mode,
    before: side(before, pb),
    after: side(after, pa),
    delta: pb === undefined || pa === undefined ? undefined : Math.round((pa - pb) * 10) / 10,
    change,
    text: `${HEAT_MODE_NAME[mode]} ${change}`,
  }
}

/** "+10 points", "−20 points", "no change". */
export const deltaText = (d: number | undefined) =>
  d === undefined || d === 0 ? 'no change' : `${d > 0 ? '+' : '−'}${Math.abs(d)} points`

/** A destination's pairs on one side: "via E: TI-LFA", "via A: LFA · via C: ✗ none". */
export function pairsText(source: NodeId, pairs: PairMethod[], b?: Bundles): string {
  if (pairs.length === 0) return 'unreachable'
  return pairs
    .map(
      (p) =>
        `via ${hopName(b, source, p.via, p.link)}: ${p.by === null ? '✗ none' : METHOD_NAME[p.by]}`,
    )
    .join(' · ')
}

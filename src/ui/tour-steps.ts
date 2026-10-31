// Guided tour (TODO backlog): load Example 2, fail S–E, read the TI-LFA stack.
// The numbers come from the engine, so the tour can't drift from what the app shows.
import { computeForSource } from '../engine'
import { allPairs } from '../engine/spf'
import type { NodeId, Segment, Topology } from '../engine/types'
import { EXAMPLES, exampleTopology } from '../state/examples'
import { useStore } from '../state/store'

export const TOUR_EXAMPLE = 'ring5'
const S = 'S'
const D = 'E'

const SEEN_KEY = 'lfa-lab-tour-seen'

/** First visit: the tour hasn't been shown yet and the page wasn't opened from a share link. */
export function isFirstVisit(hash: string): boolean {
  if (hash.startsWith('#t=')) return false
  try {
    return localStorage.getItem(SEEN_KEY) === null
  } catch {
    // Blocked storage: don't show the tour on every visit.
    return false
  }
}

export function markTourSeen() {
  try {
    localStorage.setItem(SEEN_KEY, '1')
  } catch {
    // Not saved; the tour may show again next visit.
  }
}

export interface TourFacts {
  /** The S–E link id. */
  link: string
  /** Primary cost S → E. */
  cost: number
  /** S's other neighbor and why it isn't an LFA: dist(N,E) vs dist(N,S) + dist(S,E). */
  neighbor: { id: NodeId; toD: number; viaS: number } | undefined
  hasLfa: boolean
  path: NodeId[]
  segments: Segment[]
  labels: number[]
  srgbBase: number
  sid: Record<NodeId, number>
}

/** What the tour says about S → E protecting S–E, or null if the network isn't Example 2. */
export function tourFacts(t: Topology): TourFacts | null {
  if (!t.nodes.some((n) => n.id === S) || !t.nodes.some((n) => n.id === D)) return null
  const result = computeForSource(t, S, { explain: false }).find((r) => r.dest === D)
  const p = result?.protections.find((x) => x.protectedLink.to === D)
  if (!result || !p || !p.tilfa.path || !p.tilfa.segments || !p.tilfa.labelStack) return null
  const table = allPairs(t)
  const dist = (a: NodeId, b: NodeId) => table.from.get(a)?.dist.get(b) ?? Infinity
  const other = p.lfa.candidates.find((c) => c.neighbor !== D)
  return {
    link: p.protectedLink.id,
    cost: result.cost,
    neighbor: other && {
      id: other.neighbor,
      toD: dist(other.neighbor, D),
      viaS: dist(other.neighbor, S) + dist(S, D),
    },
    hasLfa: p.lfa.best !== undefined,
    path: p.tilfa.path,
    segments: p.tilfa.segments,
    labels: p.tilfa.labelStack,
    srgbBase: t.srgbBase,
    sid: Object.fromEntries(t.nodes.map((n) => [n.id, n.sidIndex])),
  }
}

/** Same routers, SIDs, links and metrics (positions don't matter). */
function sameNetwork(a: Topology, b: Topology): boolean {
  const key = (t: Topology) =>
    JSON.stringify([
      t.srgbBase,
      t.nodes.map((n) => [n.id, n.sidIndex]).sort(),
      t.links
        .map((l) => [l.id, l.a, l.b, l.metricAB, l.metricBA, l.adjSidAB ?? 0, l.adjSidBA ?? 0])
        .sort(),
    ])
  return key(a) === key(b)
}

export const TOUR_STEPS = 5

/**
 * Put the app in the state step `n` talks about. Each step sets the whole state it
 * needs, so Back / Next work even if the user clicked around in between.
 */
export function applyTourStep(n: number) {
  if (n < 1 || n > 3) return
  const s = useStore.getState()
  const ex = EXAMPLES.find((e) => e.key === TOUR_EXAMPLE)!
  if (!sameNetwork(s.topology, exampleTopology(ex))) s.loadExample(TOUR_EXAMPLE)
  const facts = tourFacts(useStore.getState().topology)
  if (!facts) return
  const fail = n >= 2
  useStore.setState({
    source: S,
    allSources: false,
    row: { dest: D, via: D, link: facts.link },
    backup: 'tilfa',
    failedLinks: fail ? [facts.link] : [],
    failedNodes: [],
    simMode: 'tilfa',
    converged: false,
    simDest: fail ? D : null,
    tool: 'select',
    linkStart: null,
    notice: null,
  })
}

/** "Prefix-SID of B (16000 + 4)" or "Adj-SID B→C". */
export function segmentMeaning(seg: Segment, f: TourFacts): string {
  return seg.kind === 'prefix'
    ? `Prefix-SID of ${seg.node} (SRGB ${f.srgbBase} + index ${f.sid[seg.node]})`
    : `Adj-SID of link ${seg.from}→${seg.to}`
}

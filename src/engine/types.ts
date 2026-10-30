// Engine data model. Source: docs/03-architecture.md §4.
// Plain data only, so results can cross the Web Worker boundary as JSON.

export type NodeId = string

export interface RouterNode {
  /** Short unique id, e.g. "S", "R1". */
  id: NodeId
  /** Display name. */
  name?: string
  /** Prefix-SID index; label = srgbBase + sidIndex (RFC 8402, same SRGB everywhere: D9). */
  sidIndex: number
  /** UI only; the engine ignores it. */
  pos?: { x: number; y: number }
}

export interface Link {
  id: string
  a: NodeId
  b: NodeId
  /** Cost a→b (positive integer, IS-IS wide metric). */
  metricAB: number
  /** Cost b→a (the YAML loader defaults it to metricAB). */
  metricBA: number
  /** Adj-SID label a→b; auto-assigned if missing. */
  adjSidAB?: number
  /** Adj-SID label b→a; auto-assigned if missing. */
  adjSidBA?: number
}

export interface Topology {
  name: string
  /** Default 16000. */
  srgbBase: number
  nodes: RouterNode[]
  /** Point-to-point only, no parallel links in the MVP (D4). */
  links: Link[]
}

export type Segment =
  | { kind: 'prefix'; node: NodeId; label: number }
  | { kind: 'adj'; from: NodeId; to: NodeId; label: number }

export interface LfaCandidate {
  neighbor: NodeId
  loopFree: boolean
  downstream: boolean
  nodeProtecting: boolean
  /** c(S,N) + dist(N,D) */
  cost: number
}

export interface ExplainStep {
  rule: string
  text: string
  ok: boolean
  /** e.g. "RFC 5286 §3.1" */
  rfc?: string
}

/** Protection for one (S, D, protected link S–E). */
export interface Protection {
  protectedLink: { from: NodeId; to: NodeId }
  ecmpProtected: boolean
  lfa: { candidates: LfaCandidate[]; best?: NodeId }
  rlfa: {
    pSpace: NodeId[]
    extPSpace: NodeId[]
    qSpace: NodeId[]
    pq: NodeId[]
    best?: NodeId
  }
  tilfa: {
    path?: NodeId[]
    segments?: Segment[]
    labelStack?: number[]
    extraLabels?: number
  }
  explain: ExplainStep[]
}

export interface DestinationResult {
  dest: NodeId
  cost: number
  nextHops: NodeId[]
  /** One per primary next-hop link. */
  protections: Protection[]
}

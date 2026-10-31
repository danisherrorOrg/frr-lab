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
  /** Point-to-point. Two routers may have several links (parallel links, D29); each has its own id. */
  links: Link[]
}

export type Segment =
  | { kind: 'prefix'; node: NodeId; label: number }
  /** `link` names the exact link: with parallel links each one has its own Adj-SID (D29). */
  | { kind: 'adj'; from: NodeId; to: NodeId; link: string; label: number }

/** One alternate next hop: an (outgoing link, neighbor) pair, as in RFC 5286 §3.6. */
export interface LfaCandidate {
  neighbor: NodeId
  /** The link from S to the neighbor (D29: two links to one neighbor are two candidates). */
  link: string
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
  /** `id` names the link: with parallel links (D29) S–E may be one of several. */
  protectedLink: { from: NodeId; to: NodeId; id: string }
  ecmpProtected: boolean
  /** `best` is the chosen neighbor, `bestLink` the link S uses to reach it. */
  lfa: { candidates: LfaCandidate[]; best?: NodeId; bestLink?: string }
  /** RFC 7490 link protection. S and E never appear in any space (D17). */
  rlfa: {
    pSpace: NodeId[]
    extPSpace: NodeId[]
    qSpace: NodeId[]
    /** (extended) P ∩ Q, depending on `extended`. */
    pq: NodeId[]
    /** PQ nodes reached only through a neighbor's P-space → the neighbor to send through (D11). */
    exitVia: Record<NodeId, NodeId>
    /** True when PQ uses extended P-space (the default, D5). */
    extended: boolean
    /** False when an LFA already protects D: no tunnel is used, the spaces are only shown. */
    needed: boolean
    best?: NodeId
  }
  tilfa: {
    path?: NodeId[]
    /** The outgoing interface: S's link to path[1] (RFC 9855 §5). */
    outLink?: string
    segments?: Segment[]
    labelStack?: number[]
    extraLabels?: number
  }
  explain: ExplainStep[]
}

export interface DestinationResult {
  dest: NodeId
  cost: number
  /** Primary next-hop routers, sorted. A router reached over 2 equal links is listed once. */
  nextHops: NodeId[]
  /** One per primary next-hop link, sorted by neighbor, then link id. */
  protections: Protection[]
}

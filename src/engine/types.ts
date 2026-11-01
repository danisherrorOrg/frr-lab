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
  /**
   * Base MPLS Imposition MSD: how many labels this router can put on a packet
   * (RFC 8491 §5). Overrides the network's `msd`; left out = the network's value.
   */
  msd?: number
  /**
   * Neighbors this router never uses as an LFA (RFC 7916 §6.2.4.4: exclude a specific
   * alternate). Every link to them is skipped. Ids of routers, sorted, no duplicates.
   */
  lfaExclude?: NodeId[]
  /**
   * IS-IS overload bit (ISO 10589): other routers never send transit traffic through
   * this router. It is still a destination and still forwards its own traffic. It is
   * never an LFA (RFC 5286 §3.5), a Remote LFA tunnel exit or PQ node (RFC 7490 §5.4).
   * Only `true` is stored.
   */
  overload?: boolean
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
  /** Max SID depth of every router without its own `msd` (RFC 8491 §5). Left out = no limit. */
  msd?: number
  /** How every router picks its LFA (RFC 7916 §6.2). Left out = the D7 order. */
  lfaPolicy?: LfaPolicy
  nodes: RouterNode[]
  /** Point-to-point. Two routers may have several links (parallel links, D29); each has its own id. */
  links: Link[]
}

/**
 * How one LFA criterion is used (RFC 7916 §6.2: "each criterion having a level of preference"):
 * - `prefer`: ranks candidates that pass it first (the default, D7)
 * - `require`: candidates that fail it are not used at all
 * - `ignore`: it plays no part in the choice
 */
export type LfaPreference = 'prefer' | 'require' | 'ignore'

/** LFA selection policy (RFC 7916 §6.2). Left-out fields are `prefer`. */
export interface LfaPolicy {
  /** Inequality 3 (RFC 5286 §3.2; RFC 7916 §6.2.2). */
  nodeProtecting?: LfaPreference
  /** Inequality 2 (RFC 5286 §1; RFC 7916 §6.2.3). */
  downstream?: LfaPreference
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
  /** Loop-free, but a `require` in S's LFA policy rules it out (RFC 7916 §6.2). */
  policyRejected?: 'not-node-protecting' | 'not-downstream'
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
  lfa: {
    candidates: LfaCandidate[]
    best?: NodeId
    bestLink?: string
    /** Neighbors S's LFA policy never uses (RFC 7916 §6.2.4.4); left out when none. */
    excluded?: NodeId[]
  }
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
    /** S's max SID depth, when one is set (RFC 8491 §5). */
    msd?: number
    /**
     * The label stack is longer than `msd`: S's hardware can't impose it, so this
     * repair is not installed and doesn't count as protection (D44).
     */
    tooDeep?: boolean
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

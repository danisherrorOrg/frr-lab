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
  /**
   * IS-IS level (ISO 10589 §7.2.1): '1' (L1 only), '2' (L2 only); left out = L1/L2,
   * as FRR's default `is-type level-1-2` (D56).
   */
  level?: '1' | '2'
  /** IS-IS area (e.g. "49.0001"). Level-1 adjacencies only form inside one area (D56). */
  area?: string
  /** Flex-Algos this router takes part in (RFC 9350 §5); left out = every one defined (D58). */
  algos?: number[]
  /** Prefix-SID index per Flex-Algo; left out = auto (D58). */
  algoSids?: Record<number, number>
  /** SRv6 locator, e.g. "fc00:0:1::/48"; left out = auto from the SID index (D59). */
  locator?: string
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
  /**
   * Shared risk link groups (RFC 4202 §2.3): links in the same group can fail
   * together (a conduit, a fibre, a line card). Names, sorted, no duplicates (D53).
   */
  srlg?: string[]
  /**
   * Set on the links a LAN is made of (D55): the LAN's id. Generated from
   * `Topology.lans`, one link per pair of members; not written to the YAML `links`.
   */
  lan?: string
  /** Circuit type: '1' or '2' only; left out = both levels (D56). */
  level?: '1' | '2'
  /** Admin groups (link colours), RFC 9350 §6 constraints use them (D58). */
  affinity?: string[]
  /** TE metric, both ways (RFC 5305 §3.7); a Flex-Algo on `te` uses it (D58). */
  teMetric?: number
  /** Min one-way delay in µs, both ways (RFC 8570 §4.2); a Flex-Algo on `delay` uses it. */
  delay?: number
}

/** A Flexible Algorithm definition (RFC 9350 §5): its own metric and link constraints (D58). */
export interface FlexAlgo {
  /** 128 to 255. */
  algo: number
  /** Which metric SPF uses: IGP (default), TE, or min delay. */
  metric?: 'igp' | 'te' | 'delay'
  /** Links with any of these colours are left out (RFC 9350 §6.2). */
  excludeAny?: string[]
  /** Only links with at least one of these colours (§6.4). */
  includeAny?: string[]
  /** Only links with all of these colours (§6.5). */
  includeAll?: string[]
}

/**
 * A broadcast LAN (an Ethernet segment with several routers): IS-IS models it as a
 * pseudonode that every member reaches at its own metric and that reaches every
 * member at 0 (ISO 10589 §7.2.3, RFC 5286 §3.6). D55.
 */
export interface Lan {
  /** Unique among routers and LANs. */
  id: string
  /** At least two routers, each once, with its metric to the LAN, sorted by router id. */
  members: { node: NodeId; metric: number }[]
  /** Only at this IS-IS level; left out = both (D56). */
  level?: '1' | '2'
}

export interface Topology {
  name: string
  /** Default 16000. */
  srgbBase: number
  /** Max SID depth of every router without its own `msd` (RFC 8491 §5). Left out = no limit. */
  msd?: number
  /** How every router picks its LFA (RFC 7916 §6.2). Left out = the D7 order. */
  lfaPolicy?: LfaPolicy
  /**
   * What the Remote LFA and TI-LFA backups protect against (RFC 9855 §1, RFC 8102).
   * Left out = `link`, the default; only other values are stored (D51).
   */
  protection?: ProtectionGoal
  nodes: RouterNode[]
  /** Point-to-point. Two routers may have several links (parallel links, D29); each has its own id. */
  links: Link[]
  /** Broadcast LANs (D55). Their member-to-member links are in `links`, with `lan` set. */
  lans?: Lan[]
  /** Flexible Algorithm definitions (RFC 9350, D58). */
  flexAlgos?: FlexAlgo[]
  /** The SR data plane: SR-MPLS (left out) or SRv6 (RFC 8986, D59). */
  dataplane?: 'srv6'
}

/**
 * What a backup is built to survive:
 * - `link`: the protected link S–E fails (RFC 5286, RFC 7490, RFC 9855 link protection)
 * - `node`: the next-hop router E fails, with all its links (RFC 8102, RFC 9855 §1).
 *   Falls back to link protection when D is E itself or nothing avoids E (D51).
 * - `srlg`: every link sharing an SRLG with S–E fails with it (RFC 9855 §1, D53)
 * - `node-srlg`: both: router E and the links of S–E's SRLGs
 */
export type ProtectionGoal = 'link' | 'node' | 'srlg' | 'node-srlg'

/** What one installed backup really protects against (D51, D53). */
export type Protects = ProtectionGoal

/**
 * Why a node-protecting backup fell back to link protection (D51):
 * - `dest-is-next-hop`: D is E itself, so E can't be avoided (02-algorithms.md §4.4)
 * - `none`: no path (TI-LFA) or no node-protecting PQ node (Remote LFA) avoids E
 */
export type NodeFallback = 'dest-is-next-hop' | 'none'

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
  /**
   * SRLG modes only, when S–E has an SRLG (D53): the link S→N and N's path to D
   * avoid every link sharing a group with S–E (RFC 7916 §6.2.4.1).
   */
  srlgDisjoint?: boolean
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
  /** SRLG modes only (D53): the links that share a group with the protected link. */
  srlg?: string[]
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
    /**
     * Node protection (RFC 8102), set when the network asks for it and D ≠ E: the
     * node-protecting extended P-space and the PQ nodes whose path to D avoids E.
     * When `best` comes from here, `exitVia[best]` is this tunnel's exit (D51).
     */
    node?: { pSpace: NodeId[]; pq: NodeId[]; best?: NodeId }
    /** In node mode: what `best` protects against (D51). */
    protects?: Protects
    /** In node mode, when `best` is only link-protecting: why. */
    fallback?: NodeFallback
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
    /**
     * SRv6 networks (D59): the repair list as SIDs, without the destination (the inner
     * packet's address); the max SID depth check counts these.
     */
    srv6?: string[]
    /** In node mode: does the path avoid router E, or only the link (D51)? */
    protects?: Protects
    /** In node mode, when the repair is only link-protecting: why. */
    fallback?: NodeFallback
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

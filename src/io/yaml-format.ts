// The topology YAML format as data (docs/03-architecture.md §5). The loader uses the
// key lists to catch typos, and the in-app guide renders the same list, so the two
// can't drift apart.

export const DEFAULT_SRGB_BASE = 16000
// IS-IS wide metrics are 24 bits (RFC 5305 §3.7).
export const MAX_METRIC = 16_777_215
// MPLS labels are 20 bits (RFC 3032 §2.1).
export const MAX_LABEL = 1_048_575
// BMI-MSD is one octet (RFC 8491 §2). Below 2, even a Remote LFA tunnel (PQ + D) can't be pushed.
export const MIN_MSD = 2
export const MAX_MSD = 255
// RFC 7916 §6.2: each LFA criterion has a level of preference (D45).
export const LFA_PREFERENCES = ['prefer', 'require', 'ignore'] as const
// What Remote LFA and TI-LFA protect against (RFC 8102, RFC 9855 §1, D51).
export const PROTECTION_GOALS = ['link', 'node', 'srlg', 'node-srlg'] as const
/** SRLG names: like router ids, plus "-" (D53). */
export const SRLG_PATTERN = /^[A-Za-z0-9_.-]+$/
/** Router ids: letters, digits, "_" and "." ("-" joins the two ends in link ids, D14). */
export const ID_PATTERN = /^[A-Za-z0-9_.]+$/

const fmt = (n: number) => n.toLocaleString('en-US')

export interface FieldDoc {
  key: string
  required: boolean
  what: string
  rule: string
  example: string
}

export const TOP_FIELDS: FieldDoc[] = [
  {
    key: 'name',
    required: false,
    what: 'Name of the network',
    rule: 'Text. Default "Untitled".',
    example: 'name: Small ring',
  },
  {
    key: 'srgb_base',
    required: false,
    what: 'First label of the SR global block',
    rule: `Whole number 0 to ${fmt(MAX_LABEL)}. Default ${DEFAULT_SRGB_BASE}. Prefix label = srgb_base + sid.`,
    example: 'srgb_base: 16000',
  },
  {
    key: 'msd',
    required: false,
    what: 'Max SID depth of every router',
    rule: `Whole number ${MIN_MSD} to ${MAX_MSD}: the most labels a router can put on a packet (RFC 8491). Left out = no limit. A TI-LFA repair with more labels is flagged and not counted.`,
    example: 'msd: 3',
  },
  {
    key: 'lfa_policy',
    required: false,
    what: 'How every router picks its LFA',
    rule: 'Optional fields node_protecting and downstream (see "LFA policy" below). Left out = prefer both.',
    example: 'lfa_policy: { node_protecting: require, downstream: ignore }',
  },
  {
    key: 'protection',
    required: false,
    what: 'What Remote LFA and TI-LFA backups protect against',
    rule: 'link (default), node, srlg or node-srlg. node = the backup also avoids the next-hop router (RFC 8102, RFC 9855); srlg = it also avoids every link sharing an SRLG with the protected link. Falls back when it can’t.',
    example: 'protection: node',
  },
  {
    key: 'flex_algo',
    required: false,
    what: 'Flexible Algorithms (RFC 9350)',
    rule: 'A list like { algo: 128, metric: delay, exclude_any: [red] } (fields below). Pick one in the sidebar to see its own results.',
    example: 'flex_algo:\n  - { algo: 128, metric: delay, exclude_any: [red] }',
  },
  {
    key: 'dataplane',
    required: false,
    what: 'Segment Routing data plane',
    rule: 'mpls (default) or srv6. srv6 shows TI-LFA repairs as SRv6 SIDs (RFC 8986) from each router’s locator.',
    example: 'dataplane: srv6',
  },
  {
    key: 'lans',
    required: false,
    what: 'Broadcast LANs (Ethernet segments with several routers)',
    rule: 'A list of LANs (fields below). Each member reaches the LAN at its metric; the LAN reaches every member at 0 (an IS-IS pseudonode).',
    example: 'lans:\n  - { id: LAN1, metric: 10, members: [A, B, C] }',
  },
  {
    key: 'nodes',
    required: true,
    what: 'The routers',
    rule: 'A list of routers (fields below).',
    example: 'nodes:\n  - { id: S, sid: 1 }',
  },
  {
    key: 'links',
    required: false,
    what: 'The links',
    rule: 'A list of links (fields below). Can be left out.',
    example: 'links:\n  - { a: S, b: E, metric: 10 }',
  },
]

export const NODE_FIELDS: FieldDoc[] = [
  {
    key: 'id',
    required: true,
    what: 'Router id, used by links',
    rule: 'Unique. Letters, digits, "_" and "." only. Put a number in quotes: "1".',
    example: 'id: PE1',
  },
  {
    key: 'sid',
    required: true,
    what: 'Prefix-SID index',
    rule: `Unique whole number 0 to ${fmt(MAX_LABEL)}.`,
    example: 'sid: 1',
  },
  { key: 'name', required: false, what: 'Display name', rule: 'Text.', example: 'name: Core-1' },
  {
    key: 'msd',
    required: false,
    what: 'Max SID depth of this router',
    rule: `Whole number ${MIN_MSD} to ${MAX_MSD}. Overrides the top-level msd for this router.`,
    example: 'msd: 2',
  },
  {
    key: 'lfa_exclude',
    required: false,
    what: 'Neighbors this router never uses as an LFA',
    rule: 'A list of router ids (not the router itself). Its links to them are skipped (RFC 7916).',
    example: 'lfa_exclude: [B]',
  },
  {
    key: 'overload',
    required: false,
    what: 'IS-IS overload bit: no transit traffic through this router',
    rule: 'true or false. Default false. Still a destination; never an LFA or PQ node.',
    example: 'overload: true',
  },
  {
    key: 'level',
    required: false,
    what: 'IS-IS level of the router',
    rule: '1, 2 or 1-2 (default 1-2, as FRR). Pick a level in the sidebar to see that level’s own results.',
    example: 'level: 2',
  },
  {
    key: 'area',
    required: false,
    what: 'IS-IS area',
    rule: 'Text, e.g. "49.0001" (in quotes). Level-1 adjacencies only form inside one area.',
    example: 'area: "49.0001"',
  },
  {
    key: 'algos',
    required: false,
    what: 'Flex-Algos this router takes part in',
    rule: 'A list of algorithm numbers. Left out = every one in flex_algo.',
    example: 'algos: [128]',
  },
  {
    key: 'algo_sids',
    required: false,
    what: 'Prefix-SID index per Flex-Algo',
    rule: 'A mapping { 128: 101 }. Left out = sid + 1000 for the first algorithm, + 2000 for the second, …',
    example: 'algo_sids: { 128: 101 }',
  },
  {
    key: 'locator',
    required: false,
    what: 'SRv6 locator',
    rule: 'An IPv6 prefix ending in ::/len, like "fc00:0:1::/48" (in quotes). Left out = fc00:0:<sid in hex>::/48.',
    example: 'locator: "fc00:0:1::/48"',
  },
  {
    key: 'pos',
    required: false,
    what: 'Place on the diagram',
    rule: 'Two numbers, x and y. Left out = placed for you.',
    example: 'pos: { x: 120, y: 40 }',
  },
]

const prefRule = `One of ${LFA_PREFERENCES.join(', ')}. Default prefer.`

/** The fields under `lfa_policy` (RFC 7916 §6.2, D45). */
export const LFA_POLICY_FIELDS: FieldDoc[] = [
  {
    key: 'node_protecting',
    required: false,
    what: 'Use LFAs whose path avoids the next-hop router',
    rule: `${prefRule} prefer = rank them first; require = use no other; ignore = don't care.`,
    example: 'node_protecting: require',
  },
  {
    key: 'downstream',
    required: false,
    what: 'Use LFAs closer to the destination than the router',
    rule: `${prefRule} Ranked after node_protecting.`,
    example: 'downstream: ignore',
  },
]

const metricRule = `Whole number 1 to ${fmt(MAX_METRIC)} (IS-IS wide metric).`
const labelRule = `MPLS label 0 to ${fmt(MAX_LABEL)}. Left out = assigned from 24000.`

export const LINK_FIELDS: FieldDoc[] = [
  {
    key: 'a',
    required: true,
    what: 'One end',
    rule: 'The id of a router in nodes.',
    example: 'a: S',
  },
  {
    key: 'b',
    required: true,
    what: 'Other end',
    rule: 'Another router id (not the same as a).',
    example: 'b: E',
  },
  {
    key: 'metric',
    required: true,
    what: 'Cost from a to b',
    rule: metricRule,
    example: 'metric: 10',
  },
  {
    key: 'metric_ba',
    required: false,
    what: 'Cost from b to a',
    rule: `${metricRule} Default: same as metric.`,
    example: 'metric_ba: 20',
  },
  {
    key: 'adj_sid_ab',
    required: false,
    what: 'Adj-SID label on a for this link',
    rule: labelRule,
    example: 'adj_sid_ab: 24001',
  },
  {
    key: 'adj_sid_ba',
    required: false,
    what: 'Adj-SID label on b for this link',
    rule: labelRule,
    example: 'adj_sid_ba: 24002',
  },
  {
    key: 'srlg',
    required: false,
    what: 'Shared risk link groups: links that can fail together',
    rule: 'A list of names (letters, digits, "_", "." and "-"). Links with a name in common share a risk, e.g. one fibre duct.',
    example: 'srlg: [duct-7]',
  },
  {
    key: 'level',
    required: false,
    what: 'Circuit type: the levels this link forms adjacencies at',
    rule: '1 or 2. Left out = both (where both routers allow it).',
    example: 'level: 2',
  },
  {
    key: 'affinity',
    required: false,
    what: 'Link colours (admin groups) for Flex-Algo constraints',
    rule: 'A list of names, like [red, gold].',
    example: 'affinity: [red]',
  },
  {
    key: 'te_metric',
    required: false,
    what: 'TE metric, both ways',
    rule: `${metricRule} A Flex-Algo with metric: te only uses links that have one.`,
    example: 'te_metric: 100',
  },
  {
    key: 'delay',
    required: false,
    what: 'Minimum one-way delay in microseconds, both ways',
    rule: `${metricRule} A Flex-Algo with metric: delay only uses links that have one.`,
    example: 'delay: 1500',
  },
]

/** The fields of one Flex-Algo under `flex_algo` (RFC 9350, D58). */
export const FLEX_ALGO_FIELDS: FieldDoc[] = [
  {
    key: 'algo',
    required: true,
    what: 'Algorithm number',
    rule: '128 to 255, unique.',
    example: 'algo: 128',
  },
  {
    key: 'metric',
    required: false,
    what: 'Metric SPF uses',
    rule: 'igp (default), te or delay.',
    example: 'metric: delay',
  },
  {
    key: 'exclude_any',
    required: false,
    what: 'Leave out links with any of these colours',
    rule: 'A list of affinity names.',
    example: 'exclude_any: [red]',
  },
  {
    key: 'include_any',
    required: false,
    what: 'Use only links with at least one of these colours',
    rule: 'A list of affinity names.',
    example: 'include_any: [gold, silver]',
  },
  {
    key: 'include_all',
    required: false,
    what: 'Use only links with all of these colours',
    rule: 'A list of affinity names.',
    example: 'include_all: [gold]',
  },
]

export const FLEX_METRICS = ['igp', 'te', 'delay'] as const
/** "fc00:0:1::/48": an IPv6 prefix written to end in "::" (D59). */
export const LOCATOR_PATTERN = /^[0-9a-f]{1,4}(:[0-9a-f]{1,4})*::\/(\d{1,3})$/i

/** The fields of one LAN under `lans` (D55). */
export const LAN_FIELDS: FieldDoc[] = [
  {
    key: 'id',
    required: true,
    what: 'LAN id',
    rule: 'Unique among routers and LANs. Letters, digits, "_" and ".".',
    example: 'id: LAN1',
  },
  {
    key: 'members',
    required: true,
    what: 'The routers on the LAN',
    rule: 'Two or more router ids, or { node: A, metric: 20 } for a member with its own metric.',
    example: 'members: [A, B, { node: C, metric: 20 }]',
  },
  {
    key: 'metric',
    required: false,
    what: 'Metric from each member to the LAN',
    rule: `${metricRule} Needed unless every member gives its own.`,
    example: 'metric: 10',
  },
  {
    key: 'level',
    required: false,
    what: 'The IS-IS level the LAN forms adjacencies at',
    rule: '1 or 2. Left out = both.',
    example: 'level: 2',
  },
]

/** The fields of a LAN member written as a mapping. */
export const LAN_MEMBER_FIELDS: FieldDoc[] = [
  {
    key: 'node',
    required: true,
    what: 'Router id',
    rule: 'A router in nodes.',
    example: 'node: C',
  },
  {
    key: 'metric',
    required: false,
    what: 'Its metric to the LAN',
    rule: metricRule,
    example: 'metric: 20',
  },
]

/** IS-IS levels a router can be (D56). */
export const ROUTER_LEVELS = ['1', '2', '1-2'] as const

/** Words people often write instead of the real key (checked before spelling). */
export const KEY_ALIASES: Record<string, string> = {
  routers: 'nodes',
  edges: 'links',
  srgb: 'srgb_base',
  sid_index: 'sid',
  index: 'sid',
  position: 'pos',
  label: 'name',
  from: 'a',
  to: 'b',
  source: 'a',
  target: 'b',
  cost: 'metric',
  metric_ab: 'metric',
  cost_ab: 'metric',
  cost_ba: 'metric_ba',
  reverse_metric: 'metric_ba',
  adj_sid: 'adj_sid_ab',
  max_sid_depth: 'msd',
  bmi_msd: 'msd',
  policy: 'lfa_policy',
  lfa: 'lfa_policy',
  exclude: 'lfa_exclude',
  lfa_excludes: 'lfa_exclude',
  overloaded: 'overload',
  overload_bit: 'overload',
  ol: 'overload',
  node_protection: 'node_protecting',
  protect: 'protection',
  protection_type: 'protection',
  frr: 'protection',
  srlgs: 'srlg',
  shared_risk: 'srlg',
  lan: 'lans',
  broadcast: 'lans',
  is_type: 'level',
  circuit_type: 'level',
  area_address: 'area',
  flex_algos: 'flex_algo',
  flexalgo: 'flex_algo',
  colors: 'affinity',
  colours: 'affinity',
  admin_group: 'affinity',
  te: 'te_metric',
  latency: 'delay',
  data_plane: 'dataplane',
  node_protect: 'node_protecting',
}

/** A small file that loads, shown first in the guide. */
export const STARTER_YAML = `name: Triangle
srgb_base: 16000          # optional, default 16000
nodes:
  - { id: S, sid: 1 }
  - { id: E, sid: 2, name: Edge-2 }            # name is optional
  - { id: D, sid: 3, pos: { x: 200, y: 0 } }   # pos is optional
links:
  - { a: S, b: E, metric: 10 }                 # same cost both ways
  - { a: E, b: D, metric: 10, metric_ba: 20 }  # E→D costs 10, D→E costs 20
  - { a: S, b: D, metric: 30, adj_sid_ab: 24001 }
`

/** The same file written in block style (one field per line); both styles work. */
export const BLOCK_STYLE_YAML = `nodes:
  - id: S
    sid: 1
  - id: E
    sid: 2
links:
  - a: S
    b: E
    metric: 10
`

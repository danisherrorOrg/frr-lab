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
]

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

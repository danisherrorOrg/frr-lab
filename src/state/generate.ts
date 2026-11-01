// Random topology generator (TODO backlog "Data in / out", D50). Pure and seeded:
// the same options always give the same network, so a generated network can be
// shared by its settings and tests can pin it down. No Math.random here.
import type { Link, NodeId, RouterNode, Topology } from '../engine/types'
import { DEFAULT_SRGB_BASE } from '../io/yaml-format'
import { autoLayout, LAYOUT_SPACING } from './layout'

export type Shape = 'ring' | 'grid' | 'leaf-spine' | 'mesh'

export interface GenerateOptions {
  shape: Shape
  /** Total routers. Clamped to the shape's range (SIZE_RANGE). */
  routers: number
  /** Picks the random links of a mesh and the varied metrics. Any whole number. */
  seed: number
  /** Metrics from 5 to 50 in steps of 5, else 10 everywhere. */
  variedMetrics: boolean
}

export const SHAPES: { key: Shape; title: string }[] = [
  { key: 'ring', title: 'Ring' },
  { key: 'grid', title: 'Grid' },
  { key: 'leaf-spine', title: 'Leaf-spine' },
  { key: 'mesh', title: 'Random mesh' },
]

/**
 * Smallest and largest network per shape. A ring needs 3 routers, a grid 2×2,
 * a leaf-spine 2 spines + 2 leaves. 100 routers stays well inside the engine's
 * speed target (200 routers / 600 links, docs/01-requirements.md).
 */
export const SIZE_RANGE: Record<Shape, { min: number; max: number }> = {
  ring: { min: 3, max: 100 },
  grid: { min: 4, max: 100 },
  'leaf-spine': { min: 4, max: 100 },
  mesh: { min: 3, max: 100 },
}

const DEFAULT_METRIC = 10

/** Park–Miller generator from a fixed seed (same as layout.ts), returning 0 ≤ n < max. */
function randomFrom(seed: number) {
  let s = (Math.abs(Math.trunc(seed)) % 2147483646) + 1
  return (max: number) => {
    s = (s * 48271) % 2147483647
    return s % max
  }
}

/** Spines for a leaf-spine of `routers`: 2 up to 8 routers, then 4 (links = spines × leaves). */
export const spineCount = (routers: number) => (routers <= 8 ? 2 : 4)

/** Grid columns: as square as possible, wider than tall. */
export const gridColumns = (routers: number) => Math.ceil(Math.sqrt(routers))

interface Draft {
  nodes: { id: NodeId; pos?: { x: number; y: number } }[]
  pairs: [NodeId, NodeId][]
  name: string
}

function ring(n: number): Draft {
  const r = Math.max(LAYOUT_SPACING, (n * LAYOUT_SPACING) / (2 * Math.PI))
  const nodes = Array.from({ length: n }, (_, i) => {
    const angle = (2 * Math.PI * i) / n - Math.PI / 2
    return {
      id: `R${i + 1}`,
      pos: { x: Math.round(r + r * Math.cos(angle)), y: Math.round(r + r * Math.sin(angle)) },
    }
  })
  const pairs = nodes.map((x, i) => [x.id, nodes[(i + 1) % n]!.id] as [NodeId, NodeId])
  return { nodes, pairs, name: `Ring of ${n}` }
}

function grid(n: number): Draft {
  const cols = gridColumns(n)
  const rows = Math.ceil(n / cols)
  const id = (i: number) => `R${i + 1}`
  const nodes = Array.from({ length: n }, (_, i) => ({
    id: id(i),
    pos: { x: (i % cols) * LAYOUT_SPACING, y: Math.floor(i / cols) * LAYOUT_SPACING },
  }))
  const pairs: [NodeId, NodeId][] = []
  for (let i = 0; i < n; i++) {
    if (i % cols < cols - 1 && i + 1 < n) pairs.push([id(i), id(i + 1)])
    if (i + cols < n) pairs.push([id(i), id(i + cols)])
  }
  const last = n % cols === 0 ? '' : `, last row ${n % cols}`
  return { nodes, pairs, name: `Grid ${rows}×${cols}${last}` }
}

function leafSpine(n: number): Draft {
  const spines = spineCount(n)
  const leaves = n - spines
  const width = (leaves - 1) * LAYOUT_SPACING
  // Spines centred over the leaves.
  const spineGap = spines > 1 ? width / (spines - 1) : 0
  const spine = Array.from({ length: spines }, (_, i) => ({
    id: `SP${i + 1}`,
    pos: { x: Math.round(i * spineGap), y: 0 },
  }))
  const leaf = Array.from({ length: leaves }, (_, i) => ({
    id: `L${i + 1}`,
    pos: { x: i * LAYOUT_SPACING, y: 2 * LAYOUT_SPACING },
  }))
  const pairs = leaf.flatMap((l) => spine.map((s) => [l.id, s.id] as [NodeId, NodeId]))
  return {
    nodes: [...leaf, ...spine],
    pairs,
    name: `Leaf-spine: ${spines} spines, ${leaves} leaves`,
  }
}

/**
 * Connected random mesh: a random tree first (every router joins one placed
 * before it), then extra random links until the average router has 3 links.
 * No parallel links. Positions come from the auto layout.
 */
function mesh(n: number, rnd: (max: number) => number, seed: number): Draft {
  const id = (i: number) => `R${i + 1}`
  const nodes = Array.from({ length: n }, (_, i) => ({ id: id(i) }))
  const key = (a: number, b: number) => (a < b ? `${a}|${b}` : `${b}|${a}`)
  const taken = new Set<string>()
  const pairs: [NodeId, NodeId][] = []
  const join = (a: number, b: number) => {
    taken.add(key(a, b))
    pairs.push([id(a), id(b)])
  }
  for (let i = 1; i < n; i++) join(rnd(i), i)
  const all = (n * (n - 1)) / 2
  const target = Math.min(all, Math.round(n * 1.5))
  // Bounded tries: on small networks most pairs may already be taken.
  for (let tries = 0; pairs.length < target && tries < 50 * n; tries++) {
    const a = rnd(n)
    const b = rnd(n)
    if (a !== b && !taken.has(key(a, b))) join(a, b)
  }
  return { nodes, pairs, name: `Random mesh of ${n} (seed ${seed})` }
}

/** A new network of the chosen shape and size, ready to load. */
export function generateTopology(o: GenerateOptions): Topology {
  const { min, max } = SIZE_RANGE[o.shape]
  const n = Math.min(max, Math.max(min, Math.round(o.routers)))
  const rnd = randomFrom(o.seed)
  const draft =
    o.shape === 'ring'
      ? ring(n)
      : o.shape === 'grid'
        ? grid(n)
        : o.shape === 'leaf-spine'
          ? leafSpine(n)
          : mesh(n, rnd, o.seed)

  const metric = () => (o.variedMetrics ? 5 * (1 + rnd(10)) : DEFAULT_METRIC)
  const nodes: RouterNode[] = draft.nodes.map((x, i) => ({
    id: x.id,
    sidIndex: i + 1,
    ...(x.pos && { pos: x.pos }),
  }))
  // Same id format as the YAML loader and the editor ("a-b"); no parallel links here.
  const links: Link[] = draft.pairs.map(([a, b]) => {
    const m = metric()
    return { id: `${a}-${b}`, a, b, metricAB: m, metricBA: m }
  })
  const t: Topology = { name: draft.name, srgbBase: DEFAULT_SRGB_BASE, nodes, links }
  return o.shape === 'mesh' ? autoLayout(t) : t
}

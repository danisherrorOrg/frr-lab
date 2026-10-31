// "Auto layout" for the canvas (Phase 9.5): a small Fruchterman–Reingold force
// layout. Written here instead of using a Cytoscape layout so it is pure and
// deterministic (same topology → same picture) and can be tested without a browser.
import type { NodeId, Topology } from '../engine/types'

/** The distance the layout aims for between linked routers, in canvas pixels. */
export const LAYOUT_SPACING = 140

const ITERATIONS = 300
/** Pull towards the middle, so routers with no links (and separate parts) stay close. */
const GRAVITY = 0.5
/** Up to this many routers, try several starts and keep the one with the fewest crossings. */
const TRY_STARTS = 60

/** Extra seeded-shuffle starts for small networks. */
const SHUFFLES = 6

type Pos = { x: number; y: number }

/** `count` shuffles of `ids` from a fixed-seed generator (Park–Miller), never Math.random. */
function shuffles(ids: NodeId[], count: number): NodeId[][] {
  let seed = 12345
  const next = (max: number) => {
    seed = (seed * 48271) % 2147483647
    return seed % max
  }
  return Array.from({ length: count }, () => {
    const a = [...ids]
    for (let i = a.length - 1; i > 0; i--) {
      const j = next(i + 1)
      ;[a[i], a[j]] = [a[j]!, a[i]!]
    }
    return a
  })
}

/** Breadth-first order from `first`, then from each unvisited router by id (other parts). */
function bfsOrder(ids: NodeId[], nbrs: Map<NodeId, NodeId[]>, first: NodeId): NodeId[] {
  const order: NodeId[] = []
  const seen = new Set<NodeId>()
  for (const start of [first, ...ids]) {
    if (seen.has(start)) continue
    seen.add(start)
    const queue = [start]
    for (let q = 0; q < queue.length; q++) {
      const x = queue[q]!
      order.push(x)
      for (const y of nbrs.get(x)!) {
        if (!seen.has(y)) {
          seen.add(y)
          queue.push(y)
        }
      }
    }
  }
  return order
}

/** Force layout from a circle in this order. Returns positions by router id. */
function force(order: NodeId[], edges: [NodeId, NodeId][]): Map<NodeId, Pos> {
  const n = order.length
  const index = new Map(order.map((id, i) => [id, i]))
  const pairs = edges.map(([a, b]) => [index.get(a)!, index.get(b)!] as const)
  const k = LAYOUT_SPACING
  const radius = Math.max(k, (n * k) / (2 * Math.PI))
  const x = order.map((_, i) => radius * Math.cos((2 * Math.PI * i) / n - Math.PI / 2))
  const y = order.map((_, i) => radius * Math.sin((2 * Math.PI * i) / n - Math.PI / 2))
  const dx = new Float64Array(n)
  const dy = new Float64Array(n)
  /** Add a force (fx, fy) on router i. */
  const push = (i: number, fx: number, fy: number) => {
    dx[i] = dx[i]! + fx
    dy[i] = dy[i]! + fy
  }

  for (let it = 0; it < ITERATIONS; it++) {
    // The step limit cools from a quarter of the circle down to almost nothing.
    const temp = (radius / 4) * (1 - it / ITERATIONS) + 1
    dx.fill(0)
    dy.fill(0)
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        let ex = x[i]! - x[j]!
        let ey = y[i]! - y[j]!
        let d = Math.hypot(ex, ey)
        if (d < 0.01) {
          // Two routers on one spot: push them apart in a fixed direction.
          ex = 0.01 * (j - i)
          ey = 0.01
          d = Math.hypot(ex, ey)
        }
        const f = (k * k) / d / d
        push(i, ex * f, ey * f)
        push(j, -ex * f, -ey * f)
      }
    }
    for (const [i, j] of pairs) {
      const ex = x[i]! - x[j]!
      const ey = y[i]! - y[j]!
      const f = Math.hypot(ex, ey) / k
      push(i, -ex * f, -ey * f)
      push(j, ex * f, ey * f)
    }
    for (let i = 0; i < n; i++) {
      push(i, -x[i]! * GRAVITY, -y[i]! * GRAVITY)
      const d = Math.hypot(dx[i]!, dy[i]!)
      if (d > 0) {
        const step = Math.min(d, temp) / d
        x[i] = x[i]! + dx[i]! * step
        y[i] = y[i]! + dy[i]! * step
      }
    }
  }
  return new Map(order.map((id, i) => [id, { x: x[i]!, y: y[i]! }]))
}

/** How many pairs of links cross (links that share a router never count). */
function crossings(pos: Map<NodeId, Pos>, edges: [NodeId, NodeId][]): number {
  const side = (a: Pos, b: Pos, c: Pos) =>
    Math.sign((b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x))
  let count = 0
  for (let i = 0; i < edges.length; i++) {
    const [a, b] = edges[i]!
    for (let j = i + 1; j < edges.length; j++) {
      const [c, d] = edges[j]!
      if (a === c || a === d || b === c || b === d) continue
      const [p, q, r, s] = [pos.get(a)!, pos.get(b)!, pos.get(c)!, pos.get(d)!]
      if (side(p, q, r) * side(p, q, s) < 0 && side(r, s, p) * side(r, s, q) < 0) count++
    }
  }
  return count
}

/** Turn the picture so its longest spread runs left to right: canvases are wide. */
function landscape(pos: Map<NodeId, Pos>): Map<NodeId, Pos> {
  const ps = [...pos.values()]
  const mx = ps.reduce((s, p) => s + p.x, 0) / ps.length
  const my = ps.reduce((s, p) => s + p.y, 0) / ps.length
  let sxx = 0
  let syy = 0
  let sxy = 0
  for (const p of ps) {
    sxx += (p.x - mx) ** 2
    syy += (p.y - my) ** 2
    sxy += (p.x - mx) * (p.y - my)
  }
  // The main axis of the points (principal component), turned onto the x axis.
  const angle = -0.5 * Math.atan2(2 * sxy, sxx - syy)
  const [cos, sin] = [Math.cos(angle), Math.sin(angle)]
  return new Map(
    [...pos].map(([id, p]) => [
      id,
      { x: (p.x - mx) * cos - (p.y - my) * sin, y: (p.x - mx) * sin + (p.y - my) * cos },
    ]),
  )
}

/**
 * New positions for every router; ids, links and everything else stay the same.
 * Starts from a circle in breadth-first order (neighbors start close, fewer
 * crossings), then pushes routers apart and pulls linked ones together. Small
 * networks try a few starts and keep the one with the fewest crossing links.
 */
export function autoLayout(t: Topology): Topology {
  const ids = t.nodes.map((n) => n.id).sort()
  if (ids.length === 0) return t
  const nbrs = new Map<NodeId, NodeId[]>(ids.map((id) => [id, []]))
  // Parallel links pull once: the layout cares which routers are joined, not how often.
  const seen = new Set<string>()
  const edges: [NodeId, NodeId][] = []
  for (const l of t.links) {
    const [a, b] = l.a < l.b ? [l.a, l.b] : [l.b, l.a]
    if (a === b || seen.has(`${a}|${b}`)) continue
    seen.add(`${a}|${b}`)
    edges.push([a, b])
    nbrs.get(a)!.push(b)
    nbrs.get(b)!.push(a)
  }
  for (const list of nbrs.values()) list.sort()

  // Starts: from the lowest id, from the best-connected router, plain id order, then
  // a few shuffles from a fixed seed (so the answer is still always the same).
  const hub = [...ids].sort((p, q) => nbrs.get(q)!.length - nbrs.get(p)!.length)[0]!
  const starts =
    ids.length <= TRY_STARTS
      ? [bfsOrder(ids, nbrs, ids[0]!), bfsOrder(ids, nbrs, hub), ids, ...shuffles(ids, SHUFFLES)]
      : [bfsOrder(ids, nbrs, ids[0]!)]
  let best = force(starts[0]!, edges)
  let fewest = starts.length > 1 ? crossings(best, edges) : 0
  for (const order of starts.slice(1)) {
    if (fewest === 0) break
    const pos = force(order, edges)
    const c = crossings(pos, edges)
    if (c < fewest) [best, fewest] = [pos, c]
  }

  const turned = landscape(best)
  const minX = Math.min(...[...turned.values()].map((p) => p.x))
  const minY = Math.min(...[...turned.values()].map((p) => p.y))
  return {
    ...t,
    nodes: t.nodes.map((node) => {
      const p = turned.get(node.id)!
      return { ...node, pos: { x: Math.round(p.x - minX), y: Math.round(p.y - minY) } }
    }),
  }
}

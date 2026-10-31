import { useId, useMemo } from 'react'
import type { NodeId, Topology } from '../engine/types'
import { COLORS } from './canvas'

interface Props {
  topology: Topology
  s: NodeId
  d: NodeId
  /** The path to draw, and the link of each hop (D29: which link of a bundle). */
  path?: NodeId[]
  links?: (string | undefined)[]
  /** Links that are down: red, dotted, with ✕. */
  down: ReadonlySet<string>
  /** Routers that are down: greyed out with a dashed red ring. */
  downNodes?: readonly NodeId[]
  /** A router to ring: the LFA neighbor, the PQ node, a router that repairs. */
  mark?: NodeId
  /** Put ★ over `mark` (the chosen PQ node, as on the main diagram). */
  star?: boolean
  /** The path is drawn as `primary` (blue) or `backup` (orange). */
  kind?: 'primary' | 'backup'
  label: string
}

const W = 240
const H = 150
const PAD = 16

/**
 * A small copy of the diagram with one path on it, so several can be seen at once
 * (compare view, docs/02-algorithms.md §10). Positions come from the topology;
 * routers without one are put on a circle.
 */
export function MiniMap({
  topology: t,
  s,
  d,
  path,
  links,
  down,
  downNodes = [],
  mark,
  star = false,
  kind = 'backup',
  label,
}: Props) {
  const marker = useId()
  const color = COLORS[kind]
  const pos = useMemo(() => {
    const raw = new Map<NodeId, { x: number; y: number }>()
    t.nodes.forEach((n, i) => {
      const a = (2 * Math.PI * i) / t.nodes.length
      raw.set(n.id, n.pos ?? { x: Math.cos(a) * 100, y: Math.sin(a) * 100 })
    })
    const xs = [...raw.values()].map((p) => p.x)
    const ys = [...raw.values()].map((p) => p.y)
    const [x0, y0] = [Math.min(...xs), Math.min(...ys)]
    const w = Math.max(...xs) - x0 || 1
    const h = Math.max(...ys) - y0 || 1
    const k = Math.min((W - 2 * PAD) / w, (H - 2 * PAD) / h)
    const dx = (W - w * k) / 2
    const dy = (H - h * k) / 2
    const out = new Map<NodeId, { x: number; y: number }>()
    for (const [id, p] of raw) out.set(id, { x: dx + (p.x - x0) * k, y: dy + (p.y - y0) * k })
    return out
  }, [t])

  // Links of a bundle are spread apart, so the one the path takes can be seen (D29).
  const offset = useMemo(() => {
    const groups = new Map<string, string[]>()
    for (const l of t.links) {
      const k = l.a < l.b ? `${l.a}|${l.b}` : `${l.b}|${l.a}`
      groups.set(k, [...(groups.get(k) ?? []), l.id])
    }
    const out = new Map<string, number>()
    for (const ids of groups.values())
      ids.forEach((id, i) => out.set(id, (i - (ids.length - 1) / 2) * 7))
    return out
  }, [t])

  const ends = (linkId: string | undefined, from: NodeId, to: NodeId, trim = 0) => {
    const l =
      t.links.find((x) => x.id === linkId) ??
      t.links.find((x) => (x.a === from && x.b === to) || (x.a === to && x.b === from))
    const p = pos.get(from)!
    const q = pos.get(to)!
    const len = Math.hypot(q.x - p.x, q.y - p.y) || 1
    const [ux, uy] = [(q.x - p.x) / len, (q.y - p.y) / len]
    // Offset relative to the link's own a→b direction, so both ends agree.
    const sign = l?.a === from ? 1 : -1
    const off = (l ? (offset.get(l.id) ?? 0) : 0) * sign
    const [ox, oy] = [-uy * off, ux * off]
    return {
      x1: p.x + ox + ux * trim,
      y1: p.y + oy + uy * trim,
      x2: q.x + ox - ux * trim,
      y2: q.y + oy - uy * trim,
    }
  }
  const isDown = (id: string) => {
    const l = t.links.find((x) => x.id === id)!
    return down.has(id) || downNodes.includes(l.a) || downNodes.includes(l.b)
  }

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      role="img"
      aria-label={label}
      className="mx-auto my-1 h-auto w-full max-w-72"
    >
      <defs>
        <marker
          id={marker}
          viewBox="0 0 10 10"
          refX="9"
          refY="5"
          markerWidth="5"
          markerHeight="5"
          orient="auto"
        >
          <path d="M0,0 L10,5 L0,10 z" fill={color} />
        </marker>
      </defs>
      {t.links.map((l) => {
        const off = isDown(l.id)
        return (
          <line
            key={l.id}
            {...ends(l.id, l.a, l.b)}
            strokeWidth={off ? 2.5 : 1.5}
            strokeDasharray={off ? '3 3' : undefined}
            className={off ? 'stroke-red-600' : 'stroke-slate-300 dark:stroke-slate-600'}
          />
        )
      })}
      {t.links
        .filter((l) => down.has(l.id))
        .map((l) => {
          const e = ends(l.id, l.a, l.b)
          return (
            <text
              key={l.id}
              x={(e.x1 + e.x2) / 2}
              y={(e.y1 + e.y2) / 2 + 4}
              textAnchor="middle"
              fontSize="12"
              fontWeight="bold"
              className="fill-red-600"
            >
              ✕
            </text>
          )
        })}
      {path?.slice(1).map((to, i) => (
        <line
          key={i}
          {...ends(links?.[i], path[i]!, to, 11)}
          stroke={color}
          strokeWidth="3.5"
          markerEnd={`url(#${marker})`}
        />
      ))}
      {t.nodes.map((n) => {
        const p = pos.get(n.id)!
        const off = downNodes.includes(n.id)
        const ring = off
          ? 'stroke-red-600'
          : n.id === s
            ? 'stroke-blue-700'
            : n.id === d
              ? 'stroke-orange-700'
              : n.id === mark
                ? 'stroke-yellow-700'
                : 'stroke-slate-500'
        const thick = off || n.id === s || n.id === d || n.id === mark
        return (
          <g key={n.id} opacity={off ? 0.6 : 1}>
            <circle
              cx={p.x}
              cy={p.y}
              r="10"
              strokeWidth={thick ? 2.5 : 1}
              strokeDasharray={off ? '3 2' : undefined}
              className={`fill-slate-100 dark:fill-slate-700 ${ring}`}
            />
            <text
              x={p.x}
              y={p.y + 3.5}
              textAnchor="middle"
              fontSize="9"
              fontWeight="bold"
              className="fill-slate-900 dark:fill-slate-100"
            >
              {n.id}
            </text>
            {star && n.id === mark && (
              <text
                x={p.x}
                y={p.y - 13}
                textAnchor="middle"
                fontSize="10"
                className="fill-yellow-700 dark:fill-yellow-400"
              >
                ★
              </text>
            )}
          </g>
        )
      })}
    </svg>
  )
}

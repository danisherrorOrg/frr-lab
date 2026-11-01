import fc from 'fast-check'
import type { Link, Topology } from '../src/engine/types'
import { uniqueLinkId } from '../src/io/yaml'

/**
 * Random connected topologies for property tests (docs/05-testing.md §3):
 * 4–30 routers, metrics 1–20, no self-loops. A random spanning tree keeps it
 * connected; extra links add cycles and ECMP. With `parallel`, extra links may
 * join routers that are already linked (bundles, D29), with metrics 1–5 so equal
 * links are common. With `overload`, about one router in four has the overload bit.
 */
export function connectedTopology(
  opts: { symmetric?: boolean; parallel?: boolean; overload?: boolean } = {},
): fc.Arbitrary<Topology> {
  const base = connected(opts)
  if (!opts.overload) return base
  return base.chain((t) =>
    fc
      .array(fc.nat({ max: 3 }), { minLength: t.nodes.length, maxLength: t.nodes.length })
      .map((ol) => ({
        ...t,
        nodes: t.nodes.map((n, i) => (ol[i] === 0 ? { ...n, overload: true } : n)),
      })),
  )
}

function connected(opts: { symmetric?: boolean; parallel?: boolean }): fc.Arbitrary<Topology> {
  return fc.integer({ min: 4, max: 30 }).chain((n) =>
    fc
      .record({
        parents: fc.array(fc.nat(), { minLength: n - 1, maxLength: n - 1 }),
        extra: fc.array(fc.tuple(fc.nat({ max: n - 1 }), fc.nat({ max: n - 1 })), {
          maxLength: 2 * n,
        }),
        metrics: fc.array(
          fc.tuple(fc.integer({ min: 1, max: 20 }), fc.integer({ min: 1, max: 20 })),
          {
            minLength: 3 * n,
            maxLength: 3 * n,
          },
        ),
      })
      .map(({ parents, extra, metrics }) => {
        const id = (i: number) => `R${i}`
        const pairs: [number, number][] = parents.map((p, i) => [p % (i + 1), i + 1])
        const seen = new Set(pairs.map(([a, b]) => `${Math.min(a, b)}:${Math.max(a, b)}`))
        for (const [k, [a0, b0]] of extra.entries()) {
          // With `parallel`, every other extra link copies an existing pair, so bundles are common.
          const [a, b] = opts.parallel && k % 2 === 0 ? pairs[a0 % pairs.length]! : [a0, b0]
          const key = `${Math.min(a, b)}:${Math.max(a, b)}`
          if (a !== b && (opts.parallel || !seen.has(key))) {
            seen.add(key)
            pairs.push([a, b])
          }
        }
        const ids = new Set<string>()
        const links: Link[] = pairs.map(([a, b], i) => {
          const [ab0, ba0] = metrics[i] ?? [1, 1]
          const [ab, ba] = opts.parallel ? [1 + (ab0 % 5), 1 + (ba0 % 5)] : [ab0, ba0]
          const linkId = uniqueLinkId(`${id(a)}-${id(b)}`, ids)
          ids.add(linkId)
          return {
            id: linkId,
            a: id(a),
            b: id(b),
            metricAB: ab,
            metricBA: opts.symmetric ? ab : ba,
          }
        })
        return {
          name: 'random',
          srgbBase: 16000,
          nodes: Array.from({ length: n }, (_, i) => ({ id: id(i), sidIndex: i })),
          links,
        }
      }),
  )
}

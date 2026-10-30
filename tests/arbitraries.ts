import fc from 'fast-check'
import type { Link, Topology } from '../src/engine/types'

/**
 * Random connected topologies for property tests (docs/05-testing.md §3):
 * 4–30 routers, metrics 1–20, no self-loops or parallel links.
 * A random spanning tree keeps it connected; extra links add cycles and ECMP.
 */
export function connectedTopology(opts: { symmetric?: boolean } = {}): fc.Arbitrary<Topology> {
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
        for (const [a, b] of extra) {
          const key = `${Math.min(a, b)}:${Math.max(a, b)}`
          if (a !== b && !seen.has(key)) {
            seen.add(key)
            pairs.push([a, b])
          }
        }
        const links: Link[] = pairs.map(([a, b], i) => {
          const [ab, ba] = metrics[i] ?? [1, 1]
          return {
            id: `${id(a)}-${id(b)}`,
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

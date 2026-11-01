import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import type { Graph } from '../../src/engine/graph'
import { allPairs, avoidsLink, dist, reverseSpf, spf } from '../../src/engine/spf'
import type { Topology } from '../../src/engine/types'
import { connectedTopology } from '../arbitraries'

// Property tests from docs/05-testing.md §3 (items 1 and 7), plus checks that
// tie reverse SPF, avoidsLink and ordering back to plain forward SPF.
describe('SPF properties', () => {
  it('item 1: triangle rule on every edge, and dist(X,X) = 0', () => {
    fc.assert(
      fc.property(connectedTopology(), (topo) => {
        const t = allPairs(topo)
        for (const x of t.graph.nodes) {
          expect(dist(t, x, x)).toBe(0)
          for (const edge of t.graph.out.get(x) ?? []) {
            for (const y of t.graph.nodes) {
              expect(dist(t, x, y)).toBeLessThanOrEqual(edge.metric + dist(t, edge.to, y))
            }
          }
        }
      }),
    )
  })

  it('connected graphs: every router reaches every other', () => {
    fc.assert(
      fc.property(connectedTopology(), (topo) => {
        const t = allPairs(topo)
        for (const x of t.graph.nodes) expect(t.from.get(x)?.dist.size).toBe(t.graph.nodes.length)
      }),
    )
  })

  it('item 7: with symmetric metrics, dist(X,Y) = dist(Y,X)', () => {
    fc.assert(
      fc.property(connectedTopology({ symmetric: true }), (topo) => {
        const t = allPairs(topo)
        for (const x of t.graph.nodes) {
          for (const y of t.graph.nodes) expect(dist(t, x, y)).toBe(dist(t, y, x))
        }
      }),
    )
  })

  it('reverse SPF to R equals the all-pairs column dist(·, R)', () => {
    fc.assert(
      fc.property(connectedTopology(), (topo) => {
        const t = allPairs(topo)
        for (const r of t.graph.nodes) {
          const rev = reverseSpf(t.graph, r)
          for (const y of t.graph.nodes) expect(rev.dist.get(y)).toBe(dist(t, y, r))
        }
      }),
    )
  })

  it('every predecessor and first hop lies on a shortest path', () => {
    fc.assert(
      fc.property(connectedTopology(), (topo) => {
        const t = allPairs(topo)
        for (const [root, r] of t.from) {
          for (const [y, preds] of r.preds) {
            for (const p of preds) {
              const c = t.graph.out.get(p)?.find((e) => e.to === y)?.metric ?? NaN
              expect(dist(t, root, p) + c).toBe(dist(t, root, y))
            }
          }
          for (const [y, hops] of r.firstHops) {
            for (const h of hops) {
              const c = t.graph.out.get(root)?.find((e) => e.to === h)?.metric ?? NaN
              expect(c + dist(t, h, y)).toBe(dist(t, root, y))
            }
          }
        }
      }),
    )
  })

  it('avoidsLink true ⇒ removing link S→E leaves dist(X,Y) unchanged', () => {
    fc.assert(
      fc.property(connectedTopology(), (topo) => {
        const t = allPairs(topo)
        const link = topo.links[0]!
        const [s, e] = [link.a, link.b]
        const cut = withoutEdge(t.graph, s, e)
        for (const x of t.graph.nodes) {
          const after = spf(cut, x)
          for (const y of t.graph.nodes) {
            if (avoidsLink(t, x, y, s, e)) expect(after.dist.get(y)).toBe(dist(t, x, y))
          }
        }
      }),
    )
  })

  it('results do not depend on the order of routers and links in the file', () => {
    fc.assert(
      fc.property(
        connectedTopology().chain((topo) =>
          fc.tuple(
            fc.constant(topo),
            fc.shuffledSubarray(topo.nodes, { minLength: topo.nodes.length }),
            fc.shuffledSubarray(topo.links, { minLength: topo.links.length }),
          ),
        ),
        ([topo, nodes, links]) => {
          const shuffled: Topology = { ...topo, nodes, links }
          const a = allPairs(topo)
          const b = allPairs(shuffled)
          expect(b.graph.nodes).toEqual(a.graph.nodes)
          for (const x of a.graph.nodes) {
            const [ra, rb] = [a.from.get(x)!, b.from.get(x)!]
            expect(Object.fromEntries(rb.dist)).toEqual(Object.fromEntries(ra.dist))
            expect(Object.fromEntries(rb.preds)).toEqual(Object.fromEntries(ra.preds))
            expect(Object.fromEntries(rb.firstHops)).toEqual(Object.fromEntries(ra.firstHops))
          }
        },
      ),
    )
  })
})

/** Copy of the graph without the one directed edge S→E. */
function withoutEdge(graph: Graph, s: string, e: string): Graph {
  const keep = (edge: { from: string; to: string }) => !(edge.from === s && edge.to === e)
  return {
    nodes: graph.nodes,
    out: new Map([...graph.out].map(([k, v]) => [k, v.filter(keep)])),
    in: new Map([...graph.in].map(([k, v]) => [k, v.filter(keep)])),
    overloaded: graph.overloaded,
  }
}

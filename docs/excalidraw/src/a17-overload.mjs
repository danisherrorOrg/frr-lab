// A17 · Overload bit (docs/02-algorithms.md §16), drawn on Example 1
// (examples/01-square.yaml) with N overloaded, S → D over S–E.
import { Scene, C } from '../lib/scene.mjs'

export default function draw() {
  const s = new Scene('a17')
  const W = 1640
  const G = 20

  s.text(0, 0, 'A17 · Overload bit: reach me, but never through me', { size: 40, color: C.blue.s })
  s.text(
    0,
    58,
    '§16 of docs/02-algorithms.md  ·  ISO 10589, RFC 5286 §3.5, RFC 7490 §5.4  ·  code: src/engine/spf.ts (viaCost, linkPathCost)',
    { size: 18, color: C.muted, maxW: W },
  )

  const r1 = s.row(0, 110, G, [
    {
      w: 600,
      title: 'Example 1, N overloaded, S → D',
      color: C.blue,
      drawH: 400,
      body: [
        { note: 'Blue: S’s normal path S→E→D (20).', color: C.blue.s },
        { note: 'Red dashed: the failed link S–E.', color: C.red.s },
        {
          note: 'Gray dashed: N has the overload bit. S–N–D is the only other path, and it passes through N.',
        },
        { note: 'Result: no LFA, no PQ node, no TI-LFA. D is cut off.', color: C.red.s },
      ],
    },
    {
      w: W - 600 - G,
      title: 'How it works: an overloaded router can be an end of a path, never the middle',
      color: C.blue,
      body: [
        { head: '1. SPF' },
        'Dijkstra reaches an overloaded router but doesn’t relax its links, unless it is the root. Reverse SPF does the same. So dist(X,Y) is the cheapest path with no overloaded router inside it.',
        { head: '2. "Path through M" counts as ∞ when M is overloaded and in the middle' },
        {
          mono: [
            'Check                       Right-hand side              ∞ when',
            '--------------------------  ---------------------------  -----------------------------------',
            'Avoids link S→E (B1)        dist(X,S)+c(S,E)+dist(E,Y)   S overloaded and X ≠ S, or E overloaded and Y ≠ E',
            'LFA loop-free (B3)          dist(N,S)+dist(S,D)          S overloaded',
            'LFA node-protecting (B5)    dist(N,E)+dist(E,D)          E overloaded and D ≠ E',
            'P-space (B8)                c(S,E)+dist(E,Y)             E overloaded',
            'Extended P-space (B9)       dist(N,S)+dist(S,Y)          S overloaded',
            'Q-space (B10)               dist(Y,S)+c(S,E)             S overloaded',
          ].join('\n'),
          size: 14,
        },
        { head: '3. Never a backup' },
        '•  LFA: "S MUST NOT consider using N_i as an alternate" (RFC 5286 §3.5), skipped with reason overload.\n•  Remote LFA: never a tunnel exit, never a PQ node (RFC 7490 §5.4). It may still be in P or Q.\n•  TI-LFA: the post-convergence SPF follows the same rule, so it is never inside the repair path.',
        { head: 'Worked: Example 1, N overloaded, S → D' },
        {
          mono: 'LFA:     Via N: skipped, N has the overload bit set\nP(S) = {N}: 15 < 10+20 = 30 ✓      Q(E) = {D, N}: N 20 < 15+10 = 25 ✓\nPQ:      N is in both, but overloaded → no PQ node\nTI-LFA:  the only path left, S-N-D, passes through N → D can’t be reached',
          size: 15,
        },
      ],
    },
  ])

  {
    const p = r1.panels[0]
    const ox = p.drawX
    const oy = p.drawY
    const o = { parent: p.id }
    const S = s.router('S', ox + 110, oy + 80, { ...o, bold: true })
    const E = s.router('E', ox + 420, oy + 80, o)
    const N = s.router('N', ox + 110, oy + 330, {
      ...o,
      color: C.gray,
      dashed: true,
      fill: C.gray.f,
    })
    const D = s.router('D', ox + 420, oy + 330, { ...o, color: C.purple })
    s.link(S, E, 10, { parent: p.id, side: -1, color: C.red.s, width: 3, dashed: true })
    s.link(E, D, 10, { parent: p.id, side: 1, color: C.blue.s, width: 4, arrow: true })
    s.link(S, N, 15, { parent: p.id, side: -1, color: C.muted, dashed: true })
    s.link(N, D, 10, { parent: p.id, side: 1, color: C.muted, dashed: true })
    s.label(N.cx + 4, N.cy + 54, 'overload bit: no transit', {
      size: 16,
      color: C.muted,
      parent: p.id,
    })
    s.label(S.cx, S.cy - 52, 'source', { size: 16, color: C.muted, parent: p.id })
    s.label(D.cx, D.cy + 52, 'destination', { size: 16, color: C.purple.s, parent: p.id })
    s.label(E.cx, E.cy - 52, 'primary next hop', { size: 16, color: C.blue.s, parent: p.id })
  }

  const w3 = (W - 2 * G) / 3
  const r2 = s.row(0, r1.bottom + G, G, [
    {
      w: w3,
      title: 'It can also create an LFA',
      color: C.green,
      body: [
        'Kite: N–S 1, S–E 1, E–D 1, N–D 10. S is overloaded; S → D.',
        {
          mono: 'no bit:  dist(N,D) = 3 (N-S-E-D)\n         3 < 1+2         ✗ not loop-free\nS bit:   dist(N,D) = 10\n         10 < ∞          ✓ loop-free\n         10 < 11+1 = 12  ✓ node-protecting\n         10 < 2          ✗ not downstream',
          size: 15,
        },
        { note: 'N never sends traffic back through S. TI-LFA: S-N-D, [PrefixSID(D)] = 16004.' },
      ],
    },
    {
      w: w3,
      title: 'More worked checks',
      color: C.teal,
      body: [
        {
          mono: 'Ex. 2, B overloaded:\n  dist(A,C) = 3 (A-S-E-C), not A-B-C\n  B still reached: dist(S,B) = 2\nEx. 2, C overloaded, S → E:\n  ext. P = {A, B, C}, Q(E) = {C}\n  C overloaded → no PQ node\nEx. 4, P1 overloaded (what-if, A14):\n  pairs 35 → 31, TI-LFA 35 → 21',
          size: 15,
        },
      ],
    },
    {
      w: w3,
      title: 'What stays the same',
      color: C.gray,
      body: [
        '•  An overloaded router is still a destination, and it still forwards its own traffic (it is the root of its own SPF).\n•  ECMP: unchanged. It is only a primary next hop for its own address.\n•  Failure simulation (A9): nothing new; every table follows the rules above.',
        { note: 'In YAML: overload: true on the router.' },
      ],
    },
  ])

  const t = s.panel(0, r2.bottom + G, W, {
    title: 'Takeaway',
    color: C.yellow,
    body: [
      'A router with the overload bit can be reached but is never passed through, so it is never an LFA, a PQ node or a hop inside a TI-LFA path. Any check that adds up a "path through" it counts that path as ∞. That can remove backups (Example 1) or create one (the kite).',
    ],
  })
  s.text(
    0,
    t.y + t.h + 14,
    'Sources: docs/02-algorithms.md §16  ·  docs/learn/01, 10 (Overload bit)  ·  examples/01-square.yaml, 02-ring5.yaml  ·  checked with computeForSource(), whatIf()',
    { size: 16, color: C.muted, maxW: W },
  )
  return s
}

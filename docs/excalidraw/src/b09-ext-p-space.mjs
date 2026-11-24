// B9 · Extended P-space (docs/02-algorithms.md §3, RFC 7490 §5.2.1.2 and §5.3),
// drawn on Example 8 (examples/08-node-protection.yaml), link S–E: plain P(S) = {N},
// extended adds B and C through neighbor N. Numbers from computeForSource().
import { Scene, C } from '../lib/scene.mjs'

export default function draw() {
  const s = new Scene('b09')
  const W = 1640
  const G = 20

  s.text(0, 0, 'B9 · Extended P-space: send out through a neighbor first', {
    size: 40,
    color: C.blue.s,
  })
  s.text(
    0,
    58,
    '§3 of docs/02-algorithms.md  ·  RFC 7490 §5.2.1.2, §5.3, §5.4  ·  DECISIONS.md D5, D17  ·  code: src/engine/rlfa.ts (computeRlfa → extPSpace, exitVia)',
    { size: 18, color: C.muted, maxW: W },
  )

  const r1 = s.row(0, 110, G, [
    {
      w: 600,
      title: 'Example 8: link S–E, S’s other neighbor is N',
      color: C.blue,
      drawH: 380,
      body: [
        { note: 'Red dashed: the protected link S–E.', color: C.red.s },
        { note: 'Green: plain P(S) = {N}. Every other router is a tie (B8).', color: C.green.s },
        {
          note: 'Teal arrows: N’s own shortest paths N → B → C. N doesn’t go back through S, so B and C join: extended P-space = {N, B, C}.',
          color: C.teal.s,
        },
        { note: 'Gray: D. N’s path to D ties with going through S.' },
      ],
    },
    {
      w: W - 600 - G,
      title: 'The rule: Y is in P(N) if N’s path to Y doesn’t come back through S',
      color: C.blue,
      body: [
        {
          mono: 'Y ∈ P(N)   ⇔   dist(N,Y)  <  dist(N,S) + dist(S,Y)\n\nextended P-space  =  P(S)  ∪  P(N) for every other neighbor N',
          size: 17,
        },
        '•  S hands the packet to neighbor N (the tunnel goes out through N). N forwards on its normal table, so the path from N on is N’s shortest path to Y.\n•  This is Inequality 1 (B3) with Y in place of D: N won’t send it back to S, and so never over S–E.\n•  S stores the exit neighbor with each extra node: the tunnel must leave through N, because S’s own path to Y may use S–E.',
        { head: 'Worked checks, Example 8 (from the engine)' },
        {
          mono: [
            'Y    P(S): dist(S,Y) < c(S,E) + dist(E,Y)   P(N): dist(N,Y) < dist(N,S) + dist(S,Y)',
            '---  -----------------------------------   ---------------------------------------',
            'N    2 < 2 + 4 = 6   ✓                       (N itself)',
            'B    3 < 2 + 1 = 3   ✗ tie                   3 < 2 + 3 = 5   ✓  exit via N',
            'C    6 < 2 + 4 = 6   ✗ tie                   6 < 2 + 6 = 8   ✓  exit via N',
            'D    4 < 2 + 2 = 4   ✗ tie                   6 < 2 + 4 = 6   ✗',
          ].join('\n'),
          size: 15,
        },
        { head: 'What it changes in each example' },
        {
          mono: [
            'Example        Plain P(S)   Extended adds        PQ plain   PQ extended',
            '-------------  -----------  -------------------  ---------  -----------',
            '2  ring        {A, B}       C via A (2 < 3)      {B}        {B, C}',
            '3  ring, B–C   {A, B}       nothing (3 = 3)      {}         {}',
            '4  PE1–P1      {P2, P4}     PE2 via P2 (20<40)   {}         {PE2}',
            '8  S–E         {N}          B, C via N           {}         {B, C}',
          ].join('\n'),
          size: 15,
        },
        {
          note: 'In Examples 4 and 8, Remote LFA only works with extended P-space. In the ring the choice stays B either way (B11).',
        },
      ],
    },
  ])

  {
    const p = r1.panels[0]
    const ox = p.drawX
    const oy = p.drawY
    const o = { parent: p.id, r: 30 }
    const N = s.router('N', ox + 60, oy + 70, { ...o, color: C.green })
    const B = s.router('B', ox + 290, oy + 70, { ...o, color: C.teal })
    const Cn = s.router('C', ox + 510, oy + 70, { ...o, color: C.teal })
    const S = s.router('S', ox + 60, oy + 310, { ...o, bold: true })
    const E = s.router('E', ox + 290, oy + 310, { ...o, color: C.red })
    const D = s.router('D', ox + 510, oy + 310, { ...o, color: C.gray })
    s.link(S, E, 2, { parent: p.id, side: 1, color: C.red.s, width: 3, dashed: true })
    s.link(S, N, 2, { parent: p.id, side: 1, color: C.green.s, width: 4, arrow: true })
    s.link(N, B, 3, { parent: p.id, side: -1, color: C.teal.s, width: 4, arrow: true })
    s.link(B, Cn, 3, { parent: p.id, side: -1, color: C.teal.s, width: 4, arrow: true })
    s.link(E, B, 1, { parent: p.id, side: 1 })
    s.link(E, D, 2, { parent: p.id, side: 1 })
    s.link(Cn, D, 3, { parent: p.id, side: -1 })
    const tag = (r, dy, t, col) =>
      s.label(r.cx, r.cy + dy, t, { size: 16, color: col, parent: p.id })
    tag(N, -50, 'P(S)', C.green.s)
    tag(B, -50, 'via N', C.teal.s)
    tag(Cn, -50, 'via N', C.teal.s)
    tag(S, 50, 'source', C.muted)
    tag(E, 50, 'E', C.red.s)
    tag(D, 50, 'not in P', C.muted)
  }

  const w3 = (W - 2 * G) / 3
  const r2 = s.row(0, r1.bottom + G, G, [
    {
      w: w3,
      title: 'Which neighbor is the exit',
      color: C.green,
      body: [
        'If Y is in the P-space of several neighbors, use the cheapest way in: lowest c(S,N) + dist(N,Y), then lowest router id.',
        {
          note: 'Example 8: B via N costs 2 + 3 = 5, C via N costs 2 + 6 = 8. Example 4: PE2 via P2 costs 10 + 20 = 30. These costs pick the PQ node (B11).',
        },
      ],
    },
    {
      w: w3,
      title: 'Two formulas in the RFC',
      color: C.orange,
      body: [
        'RFC 7490 §5.2.1.2 (prose): dist(N,Y) < dist(N,S) + c(S,E) + dist(E,Y). The §5.3 pseudocode uses Inequality 1, as here.',
        {
          note: 'D17: once P(S) is added, both give the same set. A node passing only the prose test is a tie in Inequality 1, and then it is already in P(S).',
        },
      ],
    },
    {
      w: w3,
      title: 'Edge cases',
      color: C.gray,
      body: [
        '•  Exits skipped (B6, A17): a neighbor whose link has the max metric, or with the overload bit.\n•  On by default (D5). The sidebar box "Extended P-space (RLFA)" switches to plain P-space.\n•  Only used to find PQ nodes. LFA itself never tunnels.',
      ],
    },
  ])

  const t = s.panel(0, r2.bottom + G, W, {
    title: 'Takeaway',
    color: C.yellow,
    body: [
      'S can tunnel out through any other neighbor N, and N then forwards normally. So every router N reaches without coming back through S is safe too: dist(N,Y) < dist(N,S) + dist(S,Y). That bigger set often holds the PQ node that plain P-space misses (Examples 4 and 8).',
    ],
  })
  s.text(
    0,
    t.y + t.h + 14,
    'Sources: docs/02-algorithms.md §3, §6  ·  docs/learn/05-remote-lfa.md (Extended P-space)  ·  examples/08-node-protection.yaml, 02-ring5.yaml, 03-ring5-highmetric.yaml, 04-isp-core.yaml  ·  checked with computeForSource()',
    { size: 16, color: C.muted, maxW: W },
  )
  return s
}

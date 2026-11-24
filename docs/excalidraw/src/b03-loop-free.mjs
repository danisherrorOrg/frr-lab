// B3 · Loop-free, Inequality 1 (docs/02-algorithms.md §2, RFC 5286), drawn on
// Example 2 (examples/02-ring5.yaml): neighbor A fails for D = E, passes for D = C.
import { Scene, C } from '../lib/scene.mjs'

export default function draw() {
  const s = new Scene('b03')
  const W = 1640
  const G = 20

  s.text(0, 0, 'B3 · Loop-free: N won’t send it back to S', { size: 40, color: C.blue.s })
  s.text(
    0,
    58,
    '§2 of docs/02-algorithms.md  ·  RFC 5286 §1 (Inequality 1), required by §3.1  ·  code: src/engine/lfa.ts (loopFree, computeLfa)',
    { size: 18, color: C.muted, maxW: W },
  )

  const r1 = s.row(0, 110, G, [
    {
      w: 600,
      title: 'Example 2: the ring, link S–E fails, every metric 1',
      color: C.blue,
      drawH: 400,
      body: [
        { note: 'Red dashed: the failed link S–E. S’s only other neighbor is A.', color: C.red.s },
        {
          note: 'Red arrows: A’s own shortest path to E is A → S → E (2). It goes back through S: no LFA for E.',
          color: C.red.s,
        },
        {
          note: 'Green arrows: A’s shortest path to C is A → B → C (2). It avoids S: A is an LFA for C.',
          color: C.green.s,
        },
      ],
    },
    {
      w: W - 600 - G,
      title: 'The rule: N’s best path must be cheaper than any path through S',
      color: C.blue,
      body: [
        { mono: 'loop-free   ⇔   dist(N,D)  <  dist(N,S) + dist(S,D)', size: 18 },
        '•  The right side is N’s cheapest path to D that goes through S: N → … → S, then S’s own path to D.\n•  If N’s real best path is strictly cheaper, N doesn’t go through S, so traffic S hands to N never comes back.\n•  A tie (=) fails: N might pick the path through S (ECMP), so S can’t count on it.\n•  This is the only check an LFA must pass. B4 and B5 are stronger, optional ones.',
        { head: 'Worked checks (from the engine)' },
        {
          mono: [
            'Example        S → D      N    dist(N,D)  dist(N,S) + dist(S,D)   Result',
            '-------------  ---------  ---  ---------  ----------------------  -------------',
            '2  ring        S → E      A    2          1 + 1  = 2              2 = 2    ✗',
            '2  ring        S → C      A    2          1 + 2  = 3              2 < 3    ✓',
            '1  square      S → D      N    10         15 + 20 = 35            10 < 35  ✓',
            '4  ISP core    PE1 → P4   P1   20         10 + 20 = 30            20 < 30  ✓',
            '4  ISP core    PE1 → P1   P2   20         10 + 10 = 20            20 = 20  ✗',
          ].join('\n'),
          size: 14,
        },
        {
          note: 'Example 4, PE1 → P4 (primary via P2): P1 reaches P4 over the diagonal P1→P4 = 20. Back the other way it costs 40. If it were 40 both ways, dist(P1,P4) would be 30 (P1 → PE1 → P2 → P4) and 30 < 30 fails. The test is per direction.',
        },
        {
          note: 'Over the whole ring, LFA protects 50% of the (destination, link) pairs. The rest need Remote LFA (A3) or TI-LFA (A5).',
        },
      ],
    },
  ])

  {
    const p = r1.panels[0]
    const ox = p.drawX
    const oy = p.drawY
    const o = { parent: p.id }
    const S = s.router('S', ox + 130, oy + 70, { ...o, bold: true })
    const E = s.router('E', ox + 430, oy + 70, { ...o, color: C.purple })
    const Cn = s.router('C', ox + 500, oy + 300, { ...o, color: C.purple })
    const B = s.router('B', ox + 280, oy + 350, o)
    const A = s.router('A', ox + 60, oy + 300, { ...o, color: C.green })
    s.link(S, E, 1, { ...o, side: -1, color: C.red.s, width: 3, dashed: true })
    s.link(E, Cn, 1, { ...o, side: -1 })
    s.link(Cn, B, 1, { ...o, side: -1, color: C.green.s, width: 4, arrow: 'both' })
    s.link(B, A, 1, { ...o, side: -1, color: C.green.s, width: 4, arrow: 'both' })
    s.link(A, S, 1, { ...o, side: -1, color: C.red.s, width: 4, arrow: true })
    s.label(S.cx, S.cy - 54, 'source', { size: 16, color: C.muted, parent: p.id })
    s.label(E.cx, E.cy - 54, 'D = E', { size: 16, color: C.purple.s, parent: p.id })
    s.label(Cn.cx, Cn.cy + 52, 'D = C', { size: 16, color: C.purple.s, parent: p.id })
    s.label(A.cx - 4, A.cy + 52, 'neighbor N = A', { size: 16, color: C.green.s, parent: p.id })
    s.label(ox + 290, oy + 170, 'D = E:  2 < 1 + 1 = 2  ✗', {
      size: 15,
      family: 'mono',
      color: C.red.s,
      parent: p.id,
    })
    s.label(ox + 290, oy + 205, 'D = C:  2 < 1 + 2 = 3  ✓', {
      size: 15,
      family: 'mono',
      color: C.green.s,
      parent: p.id,
    })
  }

  const w3 = (W - 2 * G) / 3
  const r2 = s.row(0, r1.bottom + G, G, [
    {
      w: w3,
      title: 'Without it: a loop',
      color: C.red,
      body: [
        'Ring, D = E. If S used A anyway, A looks up E in its normal table: next hop S. S sends to A, A sends to S, …',
        { mono: 'S → A → S → A → …   (until TTL runs out)', size: 15 },
        'The traffic never arrives, and it eats the S–A link while it bounces. So a candidate that fails this check is never used, whatever the policy says (A16).',
      ],
    },
    {
      w: w3,
      title: 'Related rules',
      color: C.green,
      body: [
        {
          mono: 'B1  same idea, path forced over\n    the link S→E instead of router S\nB4  downstream: dist(N,D) < dist(S,D)\n    implies loop-free\nB5  node-protecting: avoids router E\nB7  only loop-free ones are ranked\nB9  extended P-space: the same test\n    for every router Y, not only D',
          size: 14,
        },
      ],
    },
    {
      w: w3,
      title: 'Edge cases',
      color: C.gray,
      body: [
        '•  Overload bit on S (A17): N can’t pass through S, so the right side is ∞ and the check passes.\n•  Max metric or excluded neighbor (B6): skipped before this check.\n•  Parallel links (A10): another link to E itself is loop-free, since dist(E,D) < dist(E,S) + dist(S,D).\n•  Other ECMP next hops are candidates too (B2).',
      ],
    },
  ])

  const t = s.panel(0, r2.bottom + G, W, {
    title: 'Takeaway',
    color: C.yellow,
    body: [
      'A neighbor is a safe backup only if its own shortest path to D is strictly cheaper than any path back through S: dist(N,D) < dist(N,S) + dist(S,D). A tie fails. In a ring the neighbor on the far side passes for destinations near it (C) and fails for those near S (E).',
    ],
  })
  s.text(
    0,
    t.y + t.h + 14,
    'Sources: docs/02-algorithms.md §2, §6  ·  docs/learn/04-lfa.md (Inequality 1, the ring problem)  ·  examples/02-ring5.yaml, 01-square.yaml, 04-isp-core.yaml  ·  checked with computeLfa()',
    { size: 16, color: C.muted, maxW: W },
  )
  return s
}

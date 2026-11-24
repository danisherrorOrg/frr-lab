// B8 · P-space (docs/02-algorithms.md §3, RFC 7490 §5.2.1.1), drawn on Example 4
// (examples/04-isp-core.yaml): PE1 protects its link to P1. Numbers from computeForSource().
import { Scene, C } from '../lib/scene.mjs'

export default function draw() {
  const s = new Scene('b08')
  const W = 1640
  const G = 20

  s.text(0, 0, 'B8 · P-space: where S can send without the failed link', {
    size: 40,
    color: C.blue.s,
  })
  s.text(
    0,
    58,
    '§3 of docs/02-algorithms.md  ·  RFC 7490 §5.2.1.1  ·  DECISIONS.md D17  ·  code: src/engine/rlfa.ts (computeRlfa → pSpace)',
    { size: 18, color: C.muted, maxW: W },
  )

  const r1 = s.row(0, 110, G, [
    {
      w: 600,
      title: 'Example 4: the ISP core, PE1 protects link PE1–P1',
      color: C.blue,
      drawH: 400,
      body: [
        {
          note: 'Red dashed: the protected link PE1–P1 (S = PE1, E = P1, c = 10).',
          color: C.red.s,
        },
        {
          note: 'Green: P(PE1) = {P2, P4}. PE1’s shortest paths to them start with PE1–P2.',
          color: C.green.s,
        },
        {
          note: 'Gray: P3 and PE2 tie. PE1’s shortest path to each goes over PE1–P1, so they are out.',
        },
        { note: 'Diagonal P1–P4: 20 from P1 to P4, 40 back.' },
      ],
    },
    {
      w: W - 600 - G,
      title: 'The rule: S’s own shortest path to Y doesn’t start with S–E',
      color: C.blue,
      body: [
        { mono: 'Y ∈ P(S)   ⇔   dist(S,Y)  <  c(S,E) + dist(E,Y)', size: 18 },
        '•  The right side is the cheapest path from S to Y that starts with the link S–E.\n•  Strictly cheaper ⇒ no shortest path from S to Y uses S–E. It is B1 with X = S.\n•  A tie means one of S’s shortest paths to Y is the one over S–E: Y is out.\n•  After S–E fails, S can still reach every Y in P(S) on its normal table: no tunnel is needed to get there.',
        { head: 'Worked checks, Example 4 (from the engine)' },
        {
          mono: [
            'Y     dist(PE1,Y)   c(PE1,P1) + dist(P1,Y)   In P(PE1)?',
            '----  -----------   ----------------------   ------------------------------',
            'P2    10            10 + 20 = 30             ✓ 10 < 30',
            'P3    20            10 + 10 = 20             ✗ tie: PE1 → P1 → P3 is the path',
            'P4    20            10 + 20 = 30             ✓ 20 < 30   (P1 → P4 is 20)',
            'PE2   30            10 + 20 = 30             ✗ tie: PE1 → P1 → P3 → PE2 is one',
          ].join('\n'),
          size: 15,
        },
        { mono: 'P(PE1) for link PE1–P1 = {P2, P4}', size: 16, color: C.green.s },
        { head: 'Other examples' },
        {
          mono: [
            'Example        Link   P(S)     Out on a tie',
            '-------------  -----  -------  ------------------------------------',
            '2  ring        S–E    {A, B}   C: 2 = 1 + 1',
            '3  ring, B–C   S–E    {A, B}   C: 2 = 1 + 1',
            '8              S–E    {N}      B: 3 = 2 + 1,  C: 6 = 2 + 4,  D: 4 = 2 + 2',
          ].join('\n'),
          size: 15,
        },
      ],
    },
  ])

  {
    const p = r1.panels[0]
    const ox = p.drawX
    const oy = p.drawY
    const o = { parent: p.id, r: 30 }
    const PE1 = s.router('PE1', ox + 40, oy + 195, { ...o, bold: true })
    const P1 = s.router('P1', ox + 190, oy + 70, { ...o, color: C.red })
    const P2 = s.router('P2', ox + 190, oy + 320, { ...o, color: C.green })
    const P3 = s.router('P3', ox + 390, oy + 70, { ...o, color: C.gray })
    const P4 = s.router('P4', ox + 390, oy + 320, { ...o, color: C.green })
    const PE2 = s.router('PE2', ox + 530, oy + 195, { ...o, color: C.gray })
    s.link(PE1, P1, 10, { parent: p.id, side: -1, color: C.red.s, width: 3, dashed: true })
    s.link(PE1, P2, 10, { parent: p.id, side: 1, color: C.green.s, width: 4, arrow: true })
    s.link(P2, P4, 10, { parent: p.id, side: 1, color: C.green.s, width: 4, arrow: true })
    s.link(P1, P2, 30, { parent: p.id, side: 1 })
    s.link(P1, P3, 10, { parent: p.id, side: -1 })
    s.link(P3, P4, 30, { parent: p.id, side: -1 })
    s.link(P1, P4, '20 / 40', { parent: p.id, side: -1, at: 0.42, msize: 17 })
    s.link(P3, PE2, 10, { parent: p.id, side: -1 })
    s.link(P4, PE2, 10, { parent: p.id, side: 1 })
    const tag = (r, dy, t, col) =>
      s.label(r.cx, r.cy + dy, t, { size: 16, color: col, parent: p.id })
    tag(PE1, -50, 'S', C.muted)
    tag(P1, -50, 'E', C.red.s)
    tag(P2, 50, 'P ✓', C.green.s)
    tag(P4, 50, 'P ✓', C.green.s)
    tag(P3, -50, 'tie: out', C.muted)
    tag(PE2, -50, 'tie: out', C.muted)
  }

  const w3 = (W - 2 * G) / 3
  const r2 = s.row(0, r1.bottom + G, G, [
    {
      w: w3,
      title: 'One P-space per link, not per D',
      color: C.green,
      body: [
        'The test never mentions D. S works out P-space once for each protected link and uses it for every destination behind E (RFC 7490 §5.2.1.3).',
        {
          note: 'In Example 4, PE1 → P1 and PE1 → P3 both lose PE1–P1 and share P(PE1) = {P2, P4}.',
        },
      ],
    },
    {
      w: w3,
      title: 'Plain P-space is often too small',
      color: C.red,
      body: [
        'Q(P1) = {P3, PE2} (B10). Plain P ∩ Q = {P2, P4} ∩ {P3, PE2} = {}: no PQ node.',
        'Extended P-space (B9) adds PE2 through neighbor P2, and Remote LFA works. Example 8 is the same: P(S) = {N}, and N is not in Q.',
      ],
    },
    {
      w: w3,
      title: 'Edge cases',
      color: C.gray,
      body: [
        '•  S and E are never listed: S can’t pass the test, E is always a tie (D17).\n•  Forward distances from S (forward SPF, A1). Metrics can differ per direction.\n•  Parallel links (A10): c(S,E) is the metric of the protected link, not the bundle.',
      ],
    },
  ])

  const t = s.panel(0, r2.bottom + G, W, {
    title: 'Takeaway',
    color: C.yellow,
    body: [
      'P-space is every router S already reaches without the failed link: dist(S,Y) < c(S,E) + dist(E,Y). A tie means the link is on a shortest path, so the router is out. It is the "S side" of Remote LFA; the "E side" is Q-space (B10), and a router in both is a PQ node (B11).',
    ],
  })
  s.text(
    0,
    t.y + t.h + 14,
    'Sources: docs/02-algorithms.md §3, §6  ·  docs/learn/05-remote-lfa.md (P-space)  ·  examples/04-isp-core.yaml, 02-ring5.yaml, 03-ring5-highmetric.yaml, 08-node-protection.yaml  ·  checked with computeForSource()',
    { size: 16, color: C.muted, maxW: W },
  )
  return s
}

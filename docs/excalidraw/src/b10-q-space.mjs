// B10 · Q-space (docs/02-algorithms.md §3, RFC 7490 §5.2.1.3), drawn on Example 4
// (examples/04-isp-core.yaml): PE1 protects link PE1–P1, so E = P1.
// The asymmetric diagonal P1–P4 (20 one way, 40 back) shows why Q-space needs
// distances towards E (reverse SPF). Numbers from computeForSource().
import { Scene, C } from '../lib/scene.mjs'

export default function draw() {
  const s = new Scene('b10')
  const W = 1640
  const G = 20

  s.text(0, 0, 'B10 · Q-space: who reaches E without the failed link', {
    size: 40,
    color: C.blue.s,
  })
  s.text(
    0,
    58,
    '§3 of docs/02-algorithms.md  ·  RFC 7490 §5.2.1.3, §5.3  ·  DECISIONS.md D17  ·  code: src/engine/rlfa.ts (computeRlfa → qSpace), spf.ts (reverse SPF)',
    { size: 18, color: C.muted, maxW: W },
  )

  const r1 = s.row(0, 110, G, [
    {
      w: 600,
      title: 'Example 4: the ISP core, link PE1–P1, E = P1',
      color: C.blue,
      drawH: 400,
      body: [
        { note: 'Red dashed: the protected link PE1–P1 (c = 10).', color: C.red.s },
        {
          note: 'Purple arrows: shortest paths towards E. P3 → P1 and PE2 → P3 → P1 avoid PE1–P1: Q(P1) = {P3, PE2}.',
          color: C.purple.s,
        },
        {
          note: 'Gray: P2 and P4 tie. Their shortest path to P1 (for P4, one of two) ends PE1 → P1.',
        },
        {
          note: 'Diagonal: P1 → P4 is 20, but P4 → P1 is 40. Q-space only looks towards P1.',
          color: C.orange.s,
        },
      ],
    },
    {
      w: W - 600 - G,
      title: 'The rule: Y’s own shortest path to E doesn’t end with S–E',
      color: C.blue,
      body: [
        { mono: 'Y ∈ Q(E)   ⇔   dist(Y,E)  <  dist(Y,S) + c(S,E)', size: 18 },
        '•  The right side is Y’s cheapest path to E that ends with the link S–E: Y → … → S, then S → E.\n•  Strictly cheaper ⇒ no shortest path from Y to E crosses S–E, so a packet dropped at Y reaches E safely. E then forwards it to D.\n•  Note the direction: dist(Y,E) is from Y towards E. With per-direction metrics it comes from a reverse SPF rooted at E (A1, §1.2).',
        { head: 'Worked checks, Example 4 (from the engine)' },
        {
          mono: [
            'Y     dist(Y,P1)   dist(Y,PE1) + c(PE1,P1)   In Q(P1)?',
            '----  ----------   -----------------------   ------------------------------',
            'P2    20           10 + 10 = 20              ✗ tie: P2 → PE1 → P1 is the path',
            'P3    10           20 + 10 = 30              ✓ 10 < 30',
            'P4    30           20 + 10 = 30              ✗ tie: P4 → P2 → PE1 → P1 is one',
            'PE2   20           30 + 10 = 40              ✓ 20 < 40   (PE2 → P3 → P1)',
          ].join('\n'),
          size: 15,
        },
        { mono: 'Q(P1) for link PE1–P1 = {P3, PE2}', size: 16, color: C.purple.s },
        { head: 'The wrong direction gives the wrong answer' },
        {
          mono: 'P4 with dist(P1,P4) = 20 (from E):   20 < 30  ✓   wrong, P4 would join Q\nP4 with dist(P4,P1) = 30 (to E):     30 < 30  ✗   right: 40 direct, 30 via P2 or PE2',
          size: 15,
        },
        { head: 'Other examples' },
        {
          mono: [
            'Example        Link   Q(E)        Out on a tie',
            '-------------  -----  ----------  ----------------------------',
            '2  ring        S–E    {B, C}      A: 2 = 1 + 1',
            '3  ring, B–C   S–E    {C}         A: 2 = 1 + 1,  B: 3 = 2 + 1',
            '8              S–E    {B, C, D}   N: 4 = 2 + 2',
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
    const P2 = s.router('P2', ox + 190, oy + 320, { ...o, color: C.gray })
    const P3 = s.router('P3', ox + 390, oy + 70, { ...o, color: C.purple })
    const P4 = s.router('P4', ox + 390, oy + 320, { ...o, color: C.gray })
    const PE2 = s.router('PE2', ox + 530, oy + 195, { ...o, color: C.purple })
    s.link(PE1, P1, 10, { parent: p.id, side: -1, color: C.red.s, width: 3, dashed: true })
    s.link(PE1, P2, 10, { parent: p.id, side: 1 })
    s.link(P2, P4, 10, { parent: p.id, side: 1 })
    s.link(P1, P2, 30, { parent: p.id, side: 1 })
    s.link(P3, P1, 10, { parent: p.id, side: 1, color: C.purple.s, width: 4, arrow: true })
    s.link(P3, P4, 30, { parent: p.id, side: -1 })
    s.link(P1, P4, '20 / 40', {
      parent: p.id,
      side: -1,
      at: 0.42,
      msize: 17,
      color: C.orange.s,
      width: 3,
      mcolor: C.orange.s,
    })
    s.link(PE2, P3, 10, { parent: p.id, side: 1, color: C.purple.s, width: 4, arrow: true })
    s.link(P4, PE2, 10, { parent: p.id, side: 1 })
    const tag = (r, dy, t, col) =>
      s.label(r.cx, r.cy + dy, t, { size: 16, color: col, parent: p.id })
    tag(PE1, -50, 'S', C.muted)
    tag(P1, -50, 'E', C.red.s)
    tag(P3, -50, 'Q', C.purple.s)
    tag(PE2, -50, 'Q', C.purple.s)
    tag(P2, 50, 'tie: out', C.muted)
    tag(P4, 50, 'tie: out', C.muted)
  }

  const w3 = (W - 2 * G) / 3
  const r2 = s.row(0, r1.bottom + G, G, [
    {
      w: w3,
      title: 'Why aim for E, not D',
      color: C.green,
      body: [
        'Remote LFA always aims for E. Once the packet is at E, E’s normal path to every D behind it is fine. So one Q-space per link serves every destination (RFC 7490 §5.2.1.3).',
        {
          note: 'Node protection (B12) can’t aim for E, so it adds a check per D.',
        },
      ],
    },
    {
      w: w3,
      title: 'c(S,E) or dist(S,E)?',
      color: C.orange,
      body: [
        'RFC 7490 writes dist(Y,S) + dist(S,E). We write c(S,E).',
        {
          note: 'D17: they are equal whenever S–E is a primary link, since then dist(S,E) = c(S,E). c(S,E) is also exactly the avoid-check of B1.',
        },
      ],
    },
    {
      w: w3,
      title: 'Edge cases',
      color: C.gray,
      body: [
        '•  S and E are never listed (D17).\n•  Overload (A17): if S is overloaded, the right side is ∞. An overloaded Y stays in Q but is never a tunnel end (B11, RFC 7490 §5.4).\n•  Parallel links (A10): c(S,E) is the protected link’s own metric.',
      ],
    },
  ])

  const t = s.panel(0, r2.bottom + G, W, {
    title: 'Takeaway',
    color: C.yellow,
    body: [
      'Q-space is every router whose own shortest path to E avoids the failed link: dist(Y,E) < dist(Y,S) + c(S,E). It is measured towards E, so per-direction metrics need a reverse SPF. In Example 4 the wrong direction would wrongly add P4.',
    ],
  })
  s.text(
    0,
    t.y + t.h + 14,
    'Sources: docs/02-algorithms.md §1.2, §3, §6  ·  docs/learn/05-remote-lfa.md (Q-space)  ·  examples/04-isp-core.yaml, 02-ring5.yaml, 03-ring5-highmetric.yaml, 08-node-protection.yaml  ·  checked with computeForSource()',
    { size: 16, color: C.muted, maxW: W },
  )
  return s
}

// B11 · PQ node and best PQ (docs/02-algorithms.md §3, RFC 7490 §5.2.1, §5.2.2),
// drawn on Example 4 (examples/04-isp-core.yaml): PE1 protects link PE1–P1.
// Extended P = {P2, P4, PE2}, Q = {P3, PE2}, PQ = {PE2} via P2. From computeForSource().
import { Scene, C } from '../lib/scene.mjs'

export default function draw() {
  const s = new Scene('b11')
  const W = 1640
  const G = 20

  s.text(0, 0, 'B11 · PQ node: in both spaces, and the cheapest one wins', {
    size: 40,
    color: C.blue.s,
  })
  s.text(
    0,
    58,
    '§3 of docs/02-algorithms.md  ·  RFC 7490 §5.2.1, §5.2.2, §5.4  ·  DECISIONS.md D11, D17  ·  code: src/engine/rlfa.ts (computeRlfa → pq, best, exitVia)',
    { size: 18, color: C.muted, maxW: W },
  )

  const r1 = s.row(0, 110, G, [
    {
      w: 600,
      title: 'Example 4: link PE1–P1, the PQ node is PE2',
      color: C.blue,
      drawH: 400,
      body: [
        { note: 'Red dashed: the protected link PE1–P1.', color: C.red.s },
        {
          note: 'Teal arrows: the tunnel PE1 → P2 → P4 → PE2, sent out through P2 (cost 30). One label: PE2’s Prefix-SID 16012.',
          color: C.teal.s,
        },
        {
          note: 'Purple arrows: PE2 takes the label off and forwards normally, PE2 → P3 → P1 (20), then on to D.',
          color: C.purple.s,
        },
      ],
    },
    {
      w: W - 600 - G,
      title: 'The rule: PQ = (extended) P ∩ Q, then lowest cost from S',
      color: C.blue,
      body: [
        {
          mono: 'PQ  =  extended P-space (B9)  ∩  Q-space (B10)\n\nbest PQ  =  lowest cost from S:   dist(S,Y)          if Y ∈ P(S)\n                                   c(S,N) + dist(N,Y) if Y only in P(N)\n            then lowest router id',
          size: 16,
        },
        '•  A PQ node is reached from S without S–E (P) and reaches E without S–E (Q). S tunnels the packet there; the PQ node forwards it normally.\n•  The cost is how S gets in: its own path for a plain-P node, or out through the exit neighbor N (B9).\n•  RFC 7490 §5.2.2 RECOMMENDS lowest cost S → P, then lowest node id (D17 replaced D11’s older rule).',
        { head: 'Example 4 in full (from the engine)' },
        {
          mono: [
            'Extended P(PE1) = {P2, P4} ∪ {PE2 via P2}   (B8, B9)',
            'Q(P1)           = {P3, PE2}                  (B10)',
            'PQ              = {PE2}',
            'Cost            = c(PE1,P2) + dist(P2,PE2) = 10 + 20 = 30, sent out through P2',
          ].join('\n'),
          size: 15,
        },
        { head: 'Choosing when there are several' },
        {
          mono: [
            'Example        PQ nodes       Cost from S                     Best',
            '-------------  -------------  ------------------------------  -------------',
            '2  ring        {B, C}         B: dist(S,B) = 2                B',
            '                              C: via A, 1 + 2 = 3',
            '8  S–E         {B, C}         B: via N, 2 + 3 = 5             B  (link mode)',
            '                              C: via N, 2 + 6 = 8',
            '4  PE1–P1      {PE2}          PE2: via P2, 10 + 20 = 30       PE2',
            '3  ring, B–C   {}             P {A, B} and Q {C} don’t meet   none → TI-LFA',
          ].join('\n'),
          size: 15,
        },
        {
          note: 'Step 2 (lowest router id) needs two PQ nodes at the same cost. None of the examples has that.',
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
    const P2 = s.router('P2', ox + 190, oy + 320, { ...o, color: C.teal })
    const P3 = s.router('P3', ox + 390, oy + 70, { ...o, color: C.purple })
    const P4 = s.router('P4', ox + 390, oy + 320, { ...o, color: C.teal })
    const PE2 = s.router('PE2', ox + 530, oy + 195, { ...o, color: C.green, bold: true })
    s.link(PE1, P1, 10, { parent: p.id, side: -1, color: C.red.s, width: 3, dashed: true })
    s.link(PE1, P2, 10, { parent: p.id, side: 1, color: C.teal.s, width: 4, arrow: true })
    s.link(P2, P4, 10, { parent: p.id, side: 1, color: C.teal.s, width: 4, arrow: true })
    s.link(P4, PE2, 10, { parent: p.id, side: 1, color: C.teal.s, width: 4, arrow: true })
    s.link(P1, P2, 30, { parent: p.id, side: 1 })
    s.link(P3, P1, 10, { parent: p.id, side: 1, color: C.purple.s, width: 4, arrow: true })
    s.link(P3, P4, 30, { parent: p.id, side: -1 })
    s.link(P1, P4, '20 / 40', { parent: p.id, side: -1, at: 0.42, msize: 17 })
    s.link(PE2, P3, 10, { parent: p.id, side: 1, color: C.purple.s, width: 4, arrow: true })
    const tag = (r, dy, t, col) =>
      s.label(r.cx, r.cy + dy, t, { size: 16, color: col, parent: p.id })
    tag(PE1, -50, 'S', C.muted)
    tag(P1, -50, 'E', C.red.s)
    tag(P2, 50, 'exit neighbor', C.teal.s)
    tag(P3, -50, 'Q only', C.purple.s)
    tag(P4, 50, 'P only', C.teal.s)
    tag(PE2, -50, 'PQ node', C.green.s)
  }

  const w3 = (W - 2 * G) / 3
  const r2 = s.row(0, r1.bottom + G, G, [
    {
      w: w3,
      title: 'One PQ node per link',
      color: C.green,
      body: [
        'P and Q don’t mention D, so the choice doesn’t either. PE2 serves PE1 → P1 and PE1 → P3 alike.',
        {
          note: 'Node protection (B12) is the exception: it is chosen per D.',
        },
      ],
    },
    {
      w: w3,
      title: 'Never a tunnel end',
      color: C.red,
      body: [
        '•  A router with the overload bit, even in both spaces (RFC 7490 §5.4, listed as overloadedPq).\n•  S and E: never in any space (D17).\n•  A PQ node reached only through a max-metric or overloaded neighbor (B6, B9).',
      ],
    },
    {
      w: w3,
      title: 'Used only without an LFA (B13)',
      color: C.gray,
      body: [
        'PQ nodes are worked out and shown on every row, for teaching. The tunnel is installed only when there is no LFA. With no PQ node at all, TI-LFA (A5) still repairs.',
      ],
    },
  ])

  const t = s.panel(0, r2.bottom + G, W, {
    title: 'Takeaway',
    color: C.yellow,
    body: [
      'A PQ node is a router S can reach without the failed link that also reaches E without it. S tunnels to the cheapest one (lowest cost from S, then lowest id), going out through the exit neighbor if it is only in extended P-space. In Example 4 that is PE2, through P2.',
    ],
  })
  s.text(
    0,
    t.y + t.h + 14,
    'Sources: docs/02-algorithms.md §3, §6  ·  docs/learn/05-remote-lfa.md (PQ nodes, Which PQ node?)  ·  examples/04-isp-core.yaml, 02-ring5.yaml, 03-ring5-highmetric.yaml, 08-node-protection.yaml  ·  checked with computeForSource()',
    { size: 16, color: C.muted, maxW: W },
  )
  return s
}

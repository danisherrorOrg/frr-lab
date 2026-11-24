// B16 · Clean-up of the first segment (docs/02-algorithms.md §4.2, RFC 9855 §5.1,
// DECISIONS.md D11), drawn on Example 3 (examples/03-ring5-highmetric.yaml) from B:
// link B–A fails, the walk starts with AdjSID(B→C), which only reaches the first hop.
import { Scene, C } from '../lib/scene.mjs'

export default function draw() {
  const s = new Scene('b16')
  const W = 1640
  const G = 20

  s.text(0, 0, 'B16 · Clean-up: drop a first segment that only reaches the first hop', {
    size: 40,
    color: C.blue.s,
  })
  s.text(
    0,
    58,
    '§4.2 of docs/02-algorithms.md  ·  RFC 9855 §5 (outgoing interface + repair list), §5.1  ·  DECISIONS.md D11  ·  code: src/engine/tilfa.ts',
    { size: 18, color: C.muted, maxW: W },
  )

  const r1 = s.row(0, 110, G, [
    {
      w: 600,
      title: 'Example 3 from B: B → A, link B–A fails',
      color: C.blue,
      drawH: 400,
      body: [
        {
          note: 'Ring, every link 1 except B–C = 10. Here the source (S in the rule) is router B.',
        },
        { note: 'Red dashed: the failed link B–A.', color: C.red.s },
        {
          note: 'Green: the post-convergence path B → C → E → S → A (13). Its first hop is C.',
          color: C.green.s,
        },
        {
          note: 'Orange: the walk starts with AdjSID(B→C), since B’s old path to C is B → A → S → E → C (4). But the repair leaves B on the link B–C anyway, so that label adds nothing: it is dropped.',
          color: C.orange.s,
        },
      ],
    },
    {
      w: W - 600 - G,
      title: 'The rule: the outgoing link already gets you to the first hop',
      color: C.blue,
      body: [
        {
          mono: 'first hop N = the router after S on the post-convergence path\nfirst segment = PrefixSID(N) or AdjSID(S→N)   →  drop it\nexception: N is D itself  →  keep PrefixSID(D) (the destination’s label, B17)',
          size: 16,
        },
        '•  RFC 9855 §5: a repair is an outgoing interface plus a repair list. The interface is always the path’s first link, so the packet arrives at N with no help.\n•  A label for N would only be popped by N straight away. Dropping it saves a label, and labels are limited (MSD, A15).\n•  The greedy walk (B15) can’t know this: from S, N is often the furthest safe Prefix-SID, or the next hop needs an Adj-SID.',
        { head: 'Example 3 from B, step by step (from the engine)' },
        {
          mono: [
            'From  Try Y  (a)          (b)                          Segment',
            '----  -----  -----------  ---------------------------  -------------',
            'B     C      4 vs 10  ✗   4 < 0 + 1 + 3 = 4   ✗        AdjSID(B→C)',
            'C     A      3 = 3    ✓   3 < 4 + 1 + 0 = 5   ✓        PrefixSID(A)',
            'clean-up: AdjSID(B→C) only reaches the first hop C  →  dropped',
            'result:   [PrefixSID(A)] = 16003, out via C, 0 extra labels',
          ].join('\n'),
          size: 14,
        },
        { head: 'Every kind of clean-up in the examples' },
        {
          mono: [
            'Example        Row         Walk                             Dropped          Final',
            '-------------  ----------  -------------------------------  ---------------  ------------------------',
            '1  square      S → D       [P(N), P(D)]                     P(N)             [P(D)] = 16004',
            '3  ring, B–C   B → A       [Adj(B→C), P(A)]                 Adj(B→C)         [P(A)] = 16003',
            '4  ISP core    PE1 → P1    [P(P2), Adj(P2→P1)]              P(P2)            [Adj(P2→P1), P(P1)]',
            '5  leaf-spine  SP1 → L1    [P(L2), P(SP2), P(L1)]           P(L2)            [P(SP2), P(L1)]',
            '7  parallel    S → E       [Adj(S→E over S-E#2)]  (N = D)   Adj(S→E)         [P(E)] = 16002',
          ].join('\n'),
          size: 14,
        },
        {
          note: 'P = PrefixSID, Adj = AdjSID. In rows 4 and 7 the destination’s label is added back afterwards (B17).',
        },
      ],
    },
  ])

  {
    const p = r1.panels[0]
    const ox = p.drawX
    const oy = p.drawY
    const o = { parent: p.id }
    const S = s.router('S', ox + 130, oy + 70, o)
    const E = s.router('E', ox + 430, oy + 70, o)
    const Cn = s.router('C', ox + 500, oy + 280, { ...o, color: C.green })
    const B = s.router('B', ox + 280, oy + 325, { ...o, bold: true })
    const A = s.router('A', ox + 60, oy + 280, { ...o, color: C.purple })
    s.link(B, A, 1, { ...o, side: 1, color: C.red.s, width: 3, dashed: true })
    s.link(B, Cn, 10, { ...o, side: 1, color: C.green.s, width: 4, arrow: true })
    s.link(Cn, E, 1, { ...o, side: 1, color: C.green.s, width: 4, arrow: true })
    s.link(E, S, 1, { ...o, side: 1, color: C.green.s, width: 4, arrow: true })
    s.link(S, A, 1, { ...o, side: 1, color: C.green.s, width: 4, arrow: true })
    s.label(B.cx, B.cy + 52, 'source', { size: 16, color: C.muted, parent: p.id })
    s.label(A.cx, A.cy + 52, 'destination', { size: 16, color: C.purple.s, parent: p.id })
    s.label(Cn.cx, Cn.cy + 52, 'first hop N', { size: 16, color: C.green.s, parent: p.id })
    s.label(ox + 290, oy + 175, 'AdjSID(B→C): dropped', {
      size: 15,
      family: 'mono',
      color: C.orange.s,
      parent: p.id,
    })
    s.label(ox + 290, oy + 205, 'PrefixSID(A): kept', {
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
      title: 'Why the exception never bites',
      color: C.green,
      body: [
        'If N is D, could the walk start with PrefixSID(D)? No: S–E is a primary link for D, so S’s old path to D uses it and check (b) fails. The walk gives AdjSID(S→D) instead, which is dropped, and B17 adds PrefixSID(D) back.',
        { note: 'Example 7, S → E over the second link S-E#2 shows exactly that.' },
      ],
    },
    {
      w: w3,
      title: 'Without it',
      color: C.red,
      body: [
        'Example 1 would need [16003, 16004]: 1 extra label for what is really a plain LFA (S → N → D). With the clean-up it is [16004], 0 extra labels, the same as the LFA.',
        { note: 'Found when the worked examples were first checked with a script (D11).' },
      ],
    },
    {
      w: w3,
      title: 'Edge cases',
      color: C.gray,
      body: [
        '•  Only the first segment is checked. Later Adj-SIDs stay: they force a link the old tables wouldn’t use.\n•  Parallel links (A10): "out via E over S-E#2" names the exact link, so its Adj-SID can go too.\n•  Node mode (B19): the same rule.',
      ],
    },
  ])

  const t = s.panel(0, r2.bottom + G, W, {
    title: 'Takeaway',
    color: C.yellow,
    body: [
      'A TI-LFA repair always leaves S on the first link of the post-convergence path, so a first segment that only gets to that first hop (a PrefixSID or an AdjSID) is wasted and dropped. That is why a repair whose first hop is already an LFA needs 0 extra labels.',
    ],
  })
  s.text(
    0,
    t.y + t.h + 14,
    'Sources: docs/02-algorithms.md §4.2, §6 (Example 1)  ·  docs/learn/07-ti-lfa.md (clean-up rules)  ·  examples/03-ring5-highmetric.yaml, 01-square.yaml, 04-isp-core.yaml, 05-leaf-spine.yaml, 07-parallel.yaml  ·  checked with computeForSource()',
    { size: 16, color: C.muted, maxW: W },
  )
  return s
}

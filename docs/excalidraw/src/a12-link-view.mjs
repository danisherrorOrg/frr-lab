// A12 · Per-link view (docs/02-algorithms.md §11), drawn on Example 2
// (examples/02-ring5.yaml), link S–E, with Example 4 as a second check.
import { Scene, C } from '../lib/scene.mjs'

export default function draw() {
  const s = new Scene('a12')
  const W = 1640
  const G = 20

  s.text(0, 0, 'A12 · Per-link view: if this link fails, who repairs?', {
    size: 40,
    color: C.blue.s,
  })
  s.text(
    0,
    58,
    '§11 of docs/02-algorithms.md  ·  the results table regrouped by link; nothing new is decided  ·  code: src/engine/link-view.ts',
    { size: 18, color: C.muted, maxW: W },
  )

  const r1 = s.row(0, 110, G, [
    {
      w: 600,
      title: 'Example 2: what uses link S–E?',
      color: C.blue,
      drawH: 430,
      body: [
        { note: 'Every metric is 1. Right-click a link → "What uses this link?".' },
        { note: 'Orange: the link being asked about, S–E.', color: C.orange.s },
        {
          note: 'Tags above S and E: the destinations each end repairs if S–E fails, and how.',
        },
        { note: 'Each direction: 2 destinations, 3 flows.' },
      ],
    },
    {
      w: W - 600 - G,
      title: 'How it works: two questions for each direction X→Y',
      color: C.blue,
      body: [
        { head: '1. Who repairs, and how?' },
        'FRR is local repair: whoever sent the packet, X repairs it with its own backup for (D, X–Y). So the destinations are the rows of X’s results table whose primary link is X→Y, and "how" is that row’s simplest method (ECMP → LFA → Remote LFA → TI-LFA).',
        { head: '2. Whose traffic crosses it?' },
        'Router W ≠ D sends traffic to D over X→Y when some shortest path uses it (a tie counts as "uses", like B1):',
        { mono: 'dist(W,X) + c(X→Y) + dist(Y,D) = dist(W,D)' },
        {
          mono: 'W = A, D = E, over S→E:   1 + 1 + 0 = 2 = dist(A,E)   ✓   A sends to E over S–E\nW = B, D = E, over S→E:   2 + 1 + 0 = 3 ≠ 2           ✗   B goes B→C→E\nW = A, D = C, over S→E:   1 + 1 + 1 = 3 ≠ 2           ✗   A goes A→B→C',
        },
        { head: 'Result for link S–E' },
        {
          mono: [
            'Direction  Destination  Repaired by        Traffic from',
            '---------  -----------  -----------------  ------------',
            'S→E        C            S: LFA A           S',
            '           E            S: Remote LFA, B   A, S',
            'E→S        A            E: LFA C           E',
            '           S            E: Remote LFA, B   C, E',
            '',
            'each way:  1 LFA, 1 Remote LFA, 3 flows (a flow = one (W, D) pair)',
          ].join('\n'),
        },
        {
          note: 'Every W found in step 2 has a row in step 1: shortest sub-paths are shortest, so X’s own path to D starts on this link. X itself is always listed.',
        },
      ],
    },
  ])

  {
    const p = r1.panels[0]
    const ox = p.drawX
    const oy = p.drawY
    const S = s.router('S', ox + 150, oy + 130, { parent: p.id, bold: true })
    const E = s.router('E', ox + 420, oy + 130, { parent: p.id })
    const Cn = s.router('C', ox + 490, oy + 320, { parent: p.id })
    const B = s.router('B', ox + 290, oy + 370, { parent: p.id })
    const A = s.router('A', ox + 80, oy + 320, { parent: p.id })
    s.link(S, E, 1, { parent: p.id, side: 1, color: C.orange.s, width: 6 })
    s.link(E, Cn, 1, { parent: p.id, side: -1 })
    s.link(Cn, B, 1, { parent: p.id, side: -1 })
    s.link(B, A, 1, { parent: p.id, side: -1 })
    s.link(A, S, 1, { parent: p.id, side: -1 })
    const tag = (cx, cy, t, color) => s.label(cx, cy, t, { size: 15, color, parent: p.id })
    tag(S.cx, S.cy - 102, 'S→E fails, S repairs:', C.ink)
    tag(S.cx, S.cy - 79, 'C by LFA A', C.green.s)
    tag(S.cx, S.cy - 56, 'E by Remote LFA B', C.orange.s)
    tag(E.cx, E.cy - 102, 'E→S fails, E repairs:', C.ink)
    tag(E.cx, E.cy - 79, 'A by LFA C', C.green.s)
    tag(E.cx, E.cy - 56, 'S by Remote LFA B', C.orange.s)
  }

  const w3 = (W - 2 * G) / 3
  const r2 = s.row(0, r1.bottom + G, G, [
    {
      w: w3 * 2 + G,
      title: 'Example 4, link PE1–P1',
      color: C.teal,
      body: [
        {
          mono: [
            'Direction  Destination  Repaired by               Traffic from',
            '---------  -----------  ------------------------  -----------------------------------',
            'PE1→P1     P1           Remote LFA PE2 via P2     P2, P4, PE1  (P4-P2-PE1-P1 = 30 < 40)',
            '           P3           Remote LFA                P2, PE1',
            '           PE2          ECMP                      PE1',
            'P1→PE1     P2           LFA P2                    P1, P3',
            '           PE1          LFA P2                    P1, P3, PE2  (PE2’s two paths tie at 30)',
          ].join('\n'),
          size: 15,
        },
        {
          note: 'P4 sends to P1 the long way round through PE1, because P4→P1 costs 40 while P4-P2-PE1-P1 costs 10 + 10 + 10 = 30.',
        },
      ],
    },
    {
      w: w3,
      title: 'A link that carries nothing',
      color: C.gray,
      body: [
        'A link on no shortest path carries no traffic either way. It can only ever be a backup.',
        '•  Example 7, S-E#2: 20 > 10\n•  Example 4, P1–P2',
        { note: 'The heat map (A13) shows "–" on such a link.' },
      ],
    },
  ])

  const t = s.panel(0, r2.bottom + G, W, {
    title: 'Takeaway',
    color: C.yellow,
    body: [
      'The per-link view turns the results table around: for one link, which destinations need a repair, which router repairs them and how, and whose traffic is on it. A property test checks that the rows match each repairing router’s own rows and the "uses the link" test.',
    ],
  })
  s.text(
    0,
    t.y + t.h + 14,
    'Sources: docs/02-algorithms.md §11  ·  docs/learn/10-design-checks.md (Per-link view)  ·  examples/02-ring5.yaml, 04-isp-core.yaml  ·  checked with linkView()',
    { size: 16, color: C.muted, maxW: W },
  )
  return s
}

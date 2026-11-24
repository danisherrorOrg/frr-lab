// B1 · Path avoids link S→E (docs/02-algorithms.md §1.5), drawn on Example 1
// (examples/01-square.yaml), with Example 5 (leaf-spine) for the tie.
import { Scene, C } from '../lib/scene.mjs'

export default function draw() {
  const s = new Scene('b01')
  const W = 1640
  const G = 20

  s.text(0, 0, 'B1 · Path avoids link S→E', { size: 40, color: C.blue.s })
  s.text(
    0,
    58,
    '§1.5 of docs/02-algorithms.md  ·  the test behind every inequality in RFC 5286, RFC 7490 and RFC 9855  ·  code: src/engine/spf.ts (avoidsLink, linkPathCost)',
    { size: 18, color: C.muted, maxW: W },
  )

  const r1 = s.row(0, 110, G, [
    {
      w: 600,
      title: 'Example 1: does N’s path to D use S→E?',
      color: C.blue,
      drawH: 400,
      body: [
        { note: 'Green: N’s shortest path to D, N→D (10).', color: C.green.s },
        {
          note: 'Red dashed: the cheapest path from N to D forced through S→E: N→S→E→D (15 + 10 + 10 = 35).',
          color: C.red.s,
        },
        { note: '10 < 35, so no shortest path from N to D uses S→E.' },
      ],
    },
    {
      w: W - 600 - G,
      title: 'The rule: compare with the cheapest path forced over the link',
      color: C.blue,
      body: [
        {
          mono: 'all shortest paths X → Y avoid S→E   ⇔   dist(X,Y) < dist(X,S) + c(S,E) + dist(E,Y)',
          size: 17,
        },
        '•  The right side is the cheapest X → … → S → E → … → Y. It needs only the distance table: no path has to be listed.\n•  Strictly less: then even the cheapest path over the link is more expensive, so no shortest path uses it.\n•  Equal (a tie): some equal-cost path may use the link. That counts as "uses the link", the safe choice.',
        { head: 'Worked checks' },
        {
          mono: [
            'Example  X → Y    Link     Left       Right                          Result',
            '-------  -------  -------  ---------  -----------------------------  ------------------------',
            '1        N → D    S→E      10         15 + 10 + 10 = 35              10 < 35  ✓  avoids',
            '1        S → D    S→E      20          0 + 10 + 10 = 20              20 = 20  ✗  uses (primary)',
            '1        E → S    S→E      10         10 + 10 + 10 = 30              10 < 30  ✓  avoids S→E',
            '5        L1 → L2  L1→SP1   20          0 + 10 + 10 = 20              tie      ✗  uses',
            '5        SP2 → L2 L1→SP1   10         10 + 10 + 10 = 30              10 < 30  ✓  avoids',
          ].join('\n'),
          size: 14,
        },
        {
          note: 'Row 3: E → S goes over E→S, the other direction. The test is per direction, like the metrics: c(S,E) may differ from c(E,S).',
        },
        {
          note: 'Row 4: L1 reaches L2 over SP1 and over SP2 (both 20). One of the two uses L1→SP1, so the answer is "uses".',
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
    const N = s.router('N', ox + 110, oy + 340, { ...o, color: C.green })
    const D = s.router('D', ox + 420, oy + 340, { ...o, color: C.purple })
    s.link(N, S, 15, { ...o, side: 1, color: C.red.s, width: 3, dashed: true, arrow: true })
    s.link(S, E, 'c(S,E) = 10', {
      ...o,
      side: -1,
      color: C.red.s,
      width: 3,
      dashed: true,
      arrow: true,
      mcolor: C.red.s,
    })
    s.link(E, D, 10, { ...o, side: 1, color: C.red.s, width: 3, dashed: true, arrow: true })
    s.link(N, D, 10, { ...o, side: 1, color: C.green.s, width: 4, arrow: true })
    s.label(N.cx, N.cy + 52, 'X = N', { size: 16, color: C.green.s, parent: p.id })
    s.label(D.cx, D.cy + 52, 'Y = D', { size: 16, color: C.purple.s, parent: p.id })
    s.label(ox + 265, oy + 200, 'dist(N,D)=10 < 35', {
      size: 15,
      family: 'mono',
      color: C.ink,
      parent: p.id,
    })
  }

  const w3 = (W - 2 * G) / 3
  const r2 = s.row(0, r1.bottom + G, G, [
    {
      w: w3,
      title: 'Where it is used',
      color: C.green,
      body: [
        {
          mono: 'B2   ECMP: X = other next hop, Y = D\nB8   P-space: X = S, Y = each router\nB10  Q-space: X = each router, Y = E\nB15  TI-LFA walk, check (b): every\n     Prefix-SID segment X → Y\nA19  SRLG: once per shared link',
          size: 14,
        },
        {
          note: 'LFA’s loop-free test (B3) is the same idea with the path forced through router S.',
        },
      ],
    },
    {
      w: w3,
      title: 'Why a tie counts as "uses"',
      color: C.red,
      body: [
        'With equal cost paths, routers share traffic over all of them (ECMP). If one of them crosses S→E, some traffic does too, so it can’t be counted on as a backup.',
        {
          note: 'The per-link view (A12) asks the opposite question and uses "=" on purpose: does some shortest path use it?',
        },
      ],
    },
    {
      w: w3,
      title: 'Edge cases',
      color: C.gray,
      body: [
        '•  Parallel links (A10): c(S,E) is the metric of the one link meant, not the bundle’s.\n•  Overload bit (A17): if S or E would be transit and is overloaded, the right side is ∞.\n•  LAN (A21): S’s other LAN links are checked too, as for an SRLG.',
      ],
    },
  ])

  const t = s.panel(0, r2.bottom + G, W, {
    title: 'Takeaway',
    color: C.yellow,
    body: [
      'To know whether X’s traffic to Y crosses the link S→E, compare dist(X,Y) with the cheapest path forced over that link. Strictly smaller means no shortest path uses it; a tie counts as "uses", because ECMP may send some traffic over it.',
    ],
  })
  s.text(
    0,
    t.y + t.h + 14,
    'Sources: docs/02-algorithms.md §1.4–1.5  ·  docs/learn/02-shortest-paths.md ("Does this path use that link?")  ·  examples/01-square.yaml, 05-leaf-spine.yaml',
    { size: 16, color: C.muted, maxW: W },
  )
  return s
}

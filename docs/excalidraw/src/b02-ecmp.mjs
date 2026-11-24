// B2 · ECMP-protected (docs/02-algorithms.md §1.4), drawn on Example 5
// (examples/05-leaf-spine.yaml): L1 → L2 with link L1–SP1 failing.
import { Scene, C } from '../lib/scene.mjs'

export default function draw() {
  const s = new Scene('b02')
  const W = 1640
  const G = 20

  s.text(0, 0, 'B2 · ECMP-protected: the other next hop is the backup', {
    size: 40,
    color: C.blue.s,
  })
  s.text(
    0,
    58,
    '§1.4 of docs/02-algorithms.md  ·  RFC 5286 §3.4 (other primary next hops)  ·  code: src/engine/lfa.ts (ecmpProtectorLinks)',
    { size: 18, color: C.muted, maxW: W },
  )

  const r1 = s.row(0, 110, G, [
    {
      w: 600,
      title: 'Example 5: L1 → L2, link L1–SP1 fails',
      color: C.blue,
      drawH: 360,
      body: [
        {
          note: 'Leaf-spine, every link 10. L1 reaches L2 over SP1 and over SP2, both 20: two primary next hops.',
        },
        { note: 'Red dashed: the failed link L1–SP1.', color: C.red.s },
        {
          note: 'Blue: SP1→L2, the rest of the primary path L1 can no longer reach.',
          color: C.blue.s,
        },
        {
          note: 'Green: the other primary next hop, L1→SP2→L2, keeps forwarding. Nothing new is installed.',
          color: C.green.s,
        },
      ],
    },
    {
      w: W - 600 - G,
      title: 'The rule: another primary next hop that avoids the failed link',
      color: C.blue,
      body: [
        'D is ECMP-protected against the failure of primary link S→E when S has another primary next hop N (on a shortest path to D) whose own path to D avoids S→E (B1, with X = N, Y = D):',
        {
          mono: 'N ≠ the failed link’s next hop, and   dist(N,D) < dist(N,S) + c(S,E) + dist(E,D)',
          size: 16,
        },
        {
          mono: [
            'L1 → L2, fail L1–SP1:  other next hop SP2',
            '   dist(SP2,L2) = 10 < dist(SP2,L1) + c(L1,SP1) + dist(SP1,L2) = 10 + 10 + 10 = 30   ✓',
            'L1 → L2, fail L1–SP2:  other next hop SP1',
            '   dist(SP1,L2) = 10 < dist(SP1,L1) + c(L1,SP2) + dist(SP2,L2) = 10 + 10 + 10 = 30   ✓',
            'L1 → SP1, fail L1–SP1: only one next hop (dist(L1,SP1) = 10, via SP2 it is 30)   ✗',
          ].join('\n'),
          size: 14,
        },
        { head: 'Why it comes first' },
        'S already forwards over N. When S→E fails, S just stops using it: no tunnel, no labels, no switch to a pre-computed backup. So the results table credits a pair to ECMP before LFA, Remote LFA and TI-LFA (B20). In coverage it counts as LFA too.',
        {
          mono: 'L1 as the source:   8 pairs, ECMP 6 (L2, L3, L4 × 2 links),\n                    the 2 spines need Remote LFA (PQ L2) or TI-LFA\nEvery router:      48 pairs, ECMP 32',
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
    const SP1 = s.router('SP1', ox + 170, oy + 70, { ...o, r: 34 })
    const SP2 = s.router('SP2', ox + 400, oy + 70, { ...o, r: 34, color: C.green })
    const L1 = s.router('L1', ox + 40, oy + 290, { ...o, bold: true })
    const L2 = s.router('L2', ox + 210, oy + 290, { ...o, color: C.purple })
    const L3 = s.router('L3', ox + 370, oy + 290, o)
    const L4 = s.router('L4', ox + 520, oy + 290, o)
    s.link(L1, SP1, null, { ...o, color: C.red.s, width: 3, dashed: true })
    s.link(L1, SP2, null, { ...o, color: C.green.s, width: 4, arrow: true })
    s.link(SP2, L2, null, { ...o, color: C.green.s, width: 4, arrow: true })
    s.link(SP1, L2, null, { ...o, color: C.blue.s, width: 3 })
    for (const L of [L3, L4]) {
      s.link(SP1, L, null, o)
      s.link(SP2, L, null, o)
    }
    s.label(L1.cx, L1.cy + 52, 'source', { size: 16, color: C.muted, parent: p.id })
    s.label(L2.cx, L2.cy + 52, 'destination', { size: 16, color: C.purple.s, parent: p.id })
    s.label(SP2.cx + 4, SP2.cy - 54, 'other next hop', { size: 16, color: C.green.s, parent: p.id })
    s.label(SP1.cx, SP1.cy - 54, 'failed next hop', { size: 16, color: C.red.s, parent: p.id })
  }

  const w3 = (W - 2 * G) / 3
  const r2 = s.row(0, r1.bottom + G, G, [
    {
      w: w3,
      title: 'Also an LFA',
      color: C.green,
      body: [
        'RFC 5286 §3.4: other primary next hops count as LFA candidates too. For L1 → L2 over L1–SP1, SP2 is also the best LFA. The table still says ECMP, the simpler of the two (B20).',
      ],
    },
    {
      w: w3,
      title: 'When it fails',
      color: C.red,
      body: [
        '•  Only one primary next hop (L1 → SP1).\n•  The other next hop is on the same LAN: it goes down with S’s interface (A21).\n•  The other next hop’s path crosses S→E (B1 gives a tie or worse).',
      ],
    },
    {
      w: w3,
      title: 'Edge cases',
      color: C.gray,
      body: [
        '•  Parallel links (A10): another equal-cost link to E itself counts.\n•  An excluded neighbor (A16) still counts: ECMP is normal forwarding, not an alternate.\n•  Overload bit (A17): no change; an overloaded router is a next hop only for its own address.',
      ],
    },
  ])

  const t = s.panel(0, r2.bottom + G, W, {
    title: 'Takeaway',
    color: C.yellow,
    body: [
      'If S already has two equal-cost next hops for D and one of them doesn’t use the failed link, the traffic keeps flowing over that one with nothing to compute or install. That is the simplest protection there is, so it is credited first.',
    ],
  })
  s.text(
    0,
    t.y + t.h + 14,
    'Sources: docs/02-algorithms.md §1.4, §5  ·  docs/learn/02-shortest-paths.md (ECMP)  ·  examples/05-leaf-spine.yaml  ·  checked with computeForSource(), computeCoverage()',
    { size: 16, color: C.muted, maxW: W },
  )
  return s
}

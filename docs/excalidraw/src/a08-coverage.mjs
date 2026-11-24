// A8 · Coverage numbers (docs/02-algorithms.md §5), drawn on Example 2
// (examples/02-ring5.yaml), with Example 3 for every router as the source.
import { Scene, C } from '../lib/scene.mjs'

export default function draw() {
  const s = new Scene('a08')
  const W = 1640
  const G = 20

  s.text(0, 0, 'A8 · Coverage numbers', { size: 40, color: C.blue.s })
  s.text(
    0,
    58,
    '§5 of docs/02-algorithms.md  ·  what share of (destination, primary link) pairs each method protects  ·  code: src/engine/coverage.ts, rows.ts',
    { size: 18, color: C.muted, maxW: W },
  )

  const r1 = s.row(0, 110, G, [
    {
      w: 600,
      title: 'Example 2: S’s four pairs',
      color: C.blue,
      drawH: 420,
      body: [
        {
          note: 'Every metric is 1. S reaches A and B over S–A, and C and E over S–E: four pairs.',
        },
        { note: 'Blue arrows: S’s two primary links.', color: C.blue.s },
        {
          note: 'Each tag: the pair’s primary link and the simplest method that protects it.',
        },
      ],
    },
    {
      w: W - 600 - G,
      title: 'How it works: count pairs, then shares',
      color: C.blue,
      body: [
        { head: 'A pair = (destination D, primary next-hop link S–E)' },
        'A destination with two ECMP next hops gives two pairs. Routers S can’t reach give none.',
        {
          mono: 'LFA coverage    = pairs protected by LFA (or ECMP)   / all pairs\nRLFA coverage   = pairs protected by LFA or Remote LFA / all pairs\nTI-LFA coverage = pairs protected by TI-LFA            / all pairs',
        },
        { head: 'Example 2, source S' },
        {
          mono: [
            'D   link  LFA         Remote LFA   TI-LFA              counted as',
            '--  ----  ----------  -----------  ------------------  ----------',
            'A   S–A   none        PQ C         ✓                   Remote LFA',
            'B   S–A   E           (not run)    ✓                   LFA',
            'C   S–E   A           (not run)    ✓                   LFA',
            'E   S–E   none        PQ B         [16004, 16002]      Remote LFA',
            '',
            'S:   LFA 2/4 = 50%     LFA or RLFA 4/4 = 100%     TI-LFA 4/4 = 100%',
          ].join('\n'),
        },
        { head: 'Every router as the source ("all sources")' },
        'Run the same count for every router and add them up. The ring is symmetric, so every router has 4 pairs and 2 LFAs:',
        {
          mono: 'all:  20 pairs    LFA 10/20 = 50%    LFA or RLFA 20/20 = 100%    TI-LFA 20/20 = 100%',
        },
        {
          note: 'Remote LFA only runs when there is no LFA (B13), so "RLFA coverage" always includes the LFA pairs.',
        },
      ],
    },
  ])

  // Ring with S's four pairs.
  {
    const p = r1.panels[0]
    const ox = p.drawX
    const oy = p.drawY
    const S = s.router('S', ox + 150, oy + 90, { parent: p.id, bold: true })
    const E = s.router('E', ox + 420, oy + 90, { parent: p.id })
    const Cn = s.router('C', ox + 490, oy + 290, { parent: p.id })
    const B = s.router('B', ox + 290, oy + 330, { parent: p.id })
    const A = s.router('A', ox + 80, oy + 290, { parent: p.id })
    s.link(S, E, 1, { parent: p.id, side: -1, color: C.blue.s, width: 4, arrow: true })
    s.link(E, Cn, 1, { parent: p.id, side: -1 })
    s.link(Cn, B, 1, { parent: p.id, side: -1 })
    s.link(B, A, 1, { parent: p.id, side: 1 })
    s.link(S, A, 1, { parent: p.id, side: 1, color: C.blue.s, width: 4, arrow: true })
    const tag = (cx, cy, t, color) => s.label(cx, cy, t, { size: 16, color, parent: p.id })
    tag(S.cx, S.cy - 56, 'source S', C.muted)
    tag(E.cx, E.cy - 72, 'E via S–E', C.ink)
    tag(E.cx, E.cy - 49, 'Remote LFA (PQ B)', C.orange.s)
    tag(Cn.cx, Cn.cy + 46, 'C via S–E', C.ink)
    tag(Cn.cx, Cn.cy + 69, 'LFA A', C.green.s)
    tag(B.cx, B.cy + 46, 'B via S–A', C.ink)
    tag(B.cx, B.cy + 69, 'LFA E', C.green.s)
    tag(A.cx, A.cy + 46, 'A via S–A', C.ink)
    tag(A.cx + 20, A.cy + 69, 'Remote LFA (PQ C)', C.orange.s)
  }

  const w3 = (W - 2 * G) / 3
  const r2 = s.row(0, r1.bottom + G, G, [
    {
      w: w3,
      title: 'Example 3: every router as the source',
      color: C.red,
      body: [
        'Same ring, B–C = 10.',
        {
          mono: 'source  pairs  LFA  LFA/RLFA  TI-LFA\n------  -----  ---  --------  ------\nA       4      0    0         4\nB       4      4    4         4\nC       4      4    4         4\nE       4      0    0         4\nS       4      0    0         4\n------  -----  ---  --------  ------\nall     20     8    8         20\n               40%  40%       100%',
          size: 15,
        },
      ],
    },
    {
      w: w3,
      title: 'The unprotected list',
      color: C.orange,
      body: [
        'Every pair LFA doesn’t protect, with the reason from the strongest method that fails:',
        '•  no-lfa: Remote LFA or TI-LFA saves it\n•  no-rlfa: only TI-LFA saves it\n•  too-deep: only TI-LFA, but deeper than S’s Max SID depth (A15)\n•  partitioned: nothing; the link is the only way to D',
        {
          mono: 'Ex. 2: 10 pairs, all no-lfa\nEx. 3: 12 pairs, all no-rlfa\n       e.g. S → E over S–E',
          size: 15,
        },
        { note: 'Export the list as CSV from the Coverage report.' },
      ],
    },
    {
      w: w3,
      title: 'What "100%" means',
      color: C.purple,
      body: [
        'TI-LFA 100% = every pair has a repair for one link failure. It is below 100% only if the network splits (partitioned) or a stack is too deep.',
        'It does not mean every router failure or double failure is survived (A9).',
        { note: 'Pairs, not destinations: a pair is one place a repair is needed.' },
      ],
    },
  ])

  const r3 = s.row(0, r2.bottom + G, G, [
    {
      w: w3,
      title: 'ECMP is counted too',
      color: C.teal,
      body: [
        'ECMP-protected pairs are counted on their own, and also as LFA: the other next hop is always a downstream LFA (B2).',
      ],
    },
    {
      w: w3,
      title: 'Node mode adds a count',
      color: C.gray,
      body: [
        'With protection: node, also count the pairs with D ≠ E, and of those the ones whose backups avoid router E.',
        { mono: 'Example 8, from S: 3 pairs, 3 and 3', size: 15 },
      ],
    },
    {
      w: w3,
      title: 'One row per pair (rows.ts)',
      color: C.green,
      body: [
        'computeAllSources() keeps one row per pair with protectedBy, the simplest method in the order ECMP → LFA → Remote LFA → TI-LFA (B20).',
      ],
    },
  ])

  const t = s.panel(0, r3.bottom + G, W, {
    title: 'Takeaway',
    color: C.yellow,
    body: [
      'Coverage counts (destination, primary link) pairs and asks which method protects each. On the plain ring LFA gets 50% and Remote LFA lifts it to 100%; with one expensive link LFA and Remote LFA drop to 40%, while TI-LFA stays at 100%.',
    ],
  })
  s.text(
    0,
    t.y + t.h + 14,
    'Sources: docs/02-algorithms.md §5  ·  docs/learn/08-comparison.md, 10-design-checks.md  ·  examples/02-ring5.yaml, 03-ring5-highmetric.yaml  ·  numbers checked with computeCoverage()',
    { size: 16, color: C.muted, maxW: W },
  )
  return s
}

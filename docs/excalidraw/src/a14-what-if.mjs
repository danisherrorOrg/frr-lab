// A14 · What-if diff (docs/02-algorithms.md §13), drawn on Example 3
// (examples/03-ring5-highmetric.yaml) with C–B changed from 10 to 1.
import { Scene, C } from '../lib/scene.mjs'

export default function draw() {
  const s = new Scene('a14')
  const W = 1640
  const G = 20

  s.text(0, 0, 'A14 · What-if diff: try a change before making it', { size: 40, color: C.blue.s })
  s.text(
    0,
    58,
    '§13 of docs/02-algorithms.md  ·  coverage of two versions of the network, side by side; nothing new is decided  ·  code: src/engine/what-if.ts',
    { size: 18, color: C.muted, maxW: W },
  )

  const r1 = s.row(0, 110, G, [
    {
      w: 600,
      title: 'Example 3: change C–B from 10 to 1',
      color: C.blue,
      drawH: 470,
      body: [
        { note: 'All other metrics are 1. The new metric turns Example 3 into Example 2.' },
        { note: 'Orange: the link being changed.', color: C.orange.s },
        {
          note: 'Tags: each router’s own coverage as the source, before → after, out of its 4 pairs.',
        },
        { note: 'Green: better in that mode. Red: worse.', color: C.ink },
      ],
    },
    {
      w: W - 600 - G,
      title: 'How it works: whatIf(before, after)',
      color: C.blue,
      body: [
        { head: '1. Totals and per router' },
        'Each side is the all-sources coverage of A8. The UI shows each mode as "before → after" and the change in points.',
        {
          mono: 'LFA          8/20 = 40%  →  10/20 =  50%   (+10 points)\nLFA + RLFA   8/20 = 40%  →  20/20 = 100%   (+60 points)\nTI-LFA      20/20 = 100% → 20/20 = 100%   (no change)',
        },
        { head: '2. Per destination: (S, D) is listed if its pairs differ' },
        'For each (S, D), each side gives a list of (primary link, simplest method). Strength follows the repair modes:',
        { mono: 'LFA or ECMP = 3   Remote LFA = 2   TI-LFA = 1   none = 0' },
        '•  better / worse: the weakest pair’s strength went up / down\n•  rerouted: other primary links, same weakest strength\n•  ECMP ↔ LFA is not a change: both are protected in every mode',
        { head: 'Worked: 12 better, 4 worse, 2 rerouted' },
        {
          mono: [
            'S→E  better    S–E TI-LFA (1)    →  S–E Remote LFA (2)',
            'S→C  better    S–E TI-LFA (1)    →  S–E LFA (3)',
            'B→A  worse     B–A LFA C (3)     →  B–A Remote LFA (2)',
            '               C no longer loop-free:  dist(C,A)=2 < dist(C,B)+dist(B,A) = 1+1 = 2 ✗',
            '               (before: 3 < 10+1 ✓)',
            'B→E  rerouted  B–A LFA (3)       →  C–B LFA (3)   B now goes B→C→E (2 < 3)',
          ].join('\n'),
          size: 15,
        },
        {
          note: 'Worse: B→A, B→C, C→B, C→E. Rerouted: B→E, C→A. The other 12 are better.',
        },
      ],
    },
  ])

  {
    const p = r1.panels[0]
    const ox = p.drawX
    const oy = p.drawY
    const o = { parent: p.id }
    const S = s.router('S', ox + 70, oy + 200, o)
    const E = s.router('E', ox + 270, oy + 110, o)
    const Cn = s.router('C', ox + 480, oy + 200, o)
    const B = s.router('B', ox + 390, oy + 370, o)
    const A = s.router('A', ox + 150, oy + 370, o)
    s.link(S, E, 1, { ...o, side: 1 })
    s.link(E, Cn, 1, { ...o, side: 1 })
    s.link(Cn, B, '10 → 1', { ...o, side: 1, color: C.orange.s, width: 6, mcolor: C.orange.s })
    s.link(B, A, 1, { ...o, side: -1 })
    s.link(A, S, 1, { ...o, side: 1 })
    const tag = (r, dy, lfa, rlfa, lc, rc) => {
      s.label(r.cx, r.cy + dy, `LFA ${lfa}`, { size: 16, color: lc, parent: p.id })
      s.label(r.cx, r.cy + dy + 24, `RLFA ${rlfa}`, { size: 16, color: rc, parent: p.id })
    }
    tag(S, -98, '0 → 2', '0 → 4', C.green.s, C.green.s)
    tag(E, -98, '0 → 2', '0 → 4', C.green.s, C.green.s)
    tag(Cn, -98, '4 → 2', '4 → 4', C.red.s, C.muted)
    tag(B, 48, '4 → 2', '4 → 4', C.red.s, C.muted)
    tag(A, 48, '0 → 2', '0 → 4', C.green.s, C.green.s)
  }

  const w3 = (W - 2 * G) / 3
  const r2 = s.row(0, r1.bottom + G, G, [
    {
      w: w3,
      title: 'A change can make it worse',
      color: C.red,
      body: [
        'Example 2, S–E from 1 to 3:',
        {
          mono: 'LFA          50% →  50%\nLFA + RLFA  100% →  80%\nTI-LFA      100% → 100%',
          size: 16,
        },
        { note: 'Worse: A→C, B→A, B→C, B→E, B→S, C→A.' },
      ],
    },
    {
      w: w3,
      title: 'What-if: overload a router',
      color: C.purple,
      body: [
        'The same diff for setting one router’s overload bit (A17). Example 4, P1 overloaded:',
        {
          mono: 'pairs        35 → 31\nLFA          27 → 13\nLFA + RLFA   35 → 15\nTI-LFA       35 → 21',
          size: 16,
        },
        { note: '16 destinations worse, 2 rerouted.' },
      ],
    },
    {
      w: w3,
      title: 'What it doesn’t do',
      color: C.gray,
      body: [
        '•  It compares the plan on the full network, like the coverage report. Links and routers failed in the simulation are not taken out.\n•  A D with no pairs on one side (unreachable) is "rerouted". A metric change never causes this.',
        { note: 'Swapping before and after swaps "better" and "worse" (a property test).' },
      ],
    },
  ])

  const t = s.panel(0, r2.bottom + G, W, {
    title: 'Takeaway',
    color: C.yellow,
    body: [
      'The what-if diff runs the coverage report on the network before and after one change, and lists every source and destination whose protection got better or worse. In Example 3, one metric change (C–B 10 → 1) lets Remote LFA cover the whole ring, but 4 destinations lose their LFA.',
    ],
  })
  s.text(
    0,
    t.y + t.h + 14,
    'Sources: docs/02-algorithms.md §13  ·  docs/learn/10-design-checks.md (What-if)  ·  examples/03-ring5-highmetric.yaml, 02-ring5.yaml, 04-isp-core.yaml  ·  checked with whatIf()',
    { size: 16, color: C.muted, maxW: W },
  )
  return s
}

// A18 · Weakest spots (docs/02-algorithms.md §17), drawn on Example 3
// (examples/03-ring5-highmetric.yaml) in LFA-only mode, with Example 6 as the router lesson.
import { Scene, C } from '../lib/scene.mjs'

export default function draw() {
  const s = new Scene('a18')
  const W = 1640
  const G = 20

  s.text(0, 0, 'A18 · Weakest spots: which single failure hurts most?', {
    size: 40,
    color: C.blue.s,
  })
  s.text(
    0,
    58,
    '§17 of docs/02-algorithms.md  ·  each link and router failed on its own; counts from the simulation (A9)  ·  code: src/engine/weak-spots.ts',
    { size: 18, color: C.muted, maxW: W },
  )

  const r1 = s.row(0, 110, G, [
    {
      w: 600,
      title: 'Example 3, LFA only: lost flows per failure',
      color: C.blue,
      drawH: 440,
      body: [
        { note: 'All metrics 1, except C–B = 10. 20 flows: 5 sources × 4 destinations.' },
        {
          note: 'Each link and router: lost / affected flows when it alone fails. Red: every affected flow is lost. Orange: some are. Gray: none.',
        },
        {
          note: 'Router counts leave out flows to and from the router itself (no backup can save them).',
        },
      ],
    },
    {
      w: W - 600 - G,
      title: 'How it works: one failure at a time, every router as the source',
      color: C.blue,
      body: [
        'A flow = (source W, destination D), D reachable from W. For each link or router X:',
        '•  affected: flows whose normal path (lowest-id ties) crosses X\n•  then, as in the simulation: repaired, dropped, looped, or unreachable (no path is left at all)',
        {
          mono: 'unprotected = dropped + looped + unreachable\nsort: unprotected ↓, affected ↓, links before routers, id',
        },
        { head: 'Example 3, LFA only (the same in LFA + Remote LFA: no PQ nodes)' },
        {
          mono: [
            'Rank  Failure    Affected  Repaired  Dropped  Unprotected',
            '----  ---------  --------  --------  -------  -----------',
            '1     link A–S   12        0         12       12 of 12',
            '2     link S–E   12        0         12       12 of 12',
            '3     router S    8        0          8        8 of 8',
            '4     link B–A    8        4          4        4 of 8',
            '5     link E–C    8        4          4        4 of 8',
            '6     router A    6        3          3        3 of 6',
            '7     router E    6        3          3        3 of 6',
            '8     link C–B    0        –          –        carries nothing',
          ].join('\n'),
          size: 15,
        },
        {
          note: 'TI-LFA mode: nothing unprotected. Ties are then sorted by affected: A–S 12, S–E 12, B–A 8, E–C 8, router S 8.',
        },
        { head: 'Speed' },
        'Backups are planned once per router; they don’t depend on what fails. With one link down at most one router repairs and nothing loops, so a link’s flows are just looked up. A router failure walks only the flows that pass it. 200 routers / 600 links: about 2 s (13 s with one full simulation per failure).',
      ],
    },
  ])

  {
    const p = r1.panels[0]
    const ox = p.drawX
    const oy = p.drawY
    const o = { parent: p.id }
    const S = s.router('S', ox + 70, oy + 170, { ...o, color: C.red, bold: true })
    const E = s.router('E', ox + 270, oy + 90, { ...o, color: C.orange })
    const Cn = s.router('C', ox + 480, oy + 170, { ...o, color: C.gray })
    const B = s.router('B', ox + 390, oy + 370, { ...o, color: C.gray })
    const A = s.router('A', ox + 150, oy + 370, { ...o, color: C.orange })
    const m = { msize: 17 }
    s.link(S, E, '12/12', { ...o, ...m, side: 1, color: C.red.s, width: 5, mcolor: C.red.s })
    s.link(E, Cn, '4/8', { ...o, ...m, side: 1, color: C.orange.s, width: 4, mcolor: C.orange.s })
    s.link(Cn, B, '0/0  (10)', {
      ...o,
      ...m,
      side: 1,
      color: C.muted,
      dashed: true,
      mcolor: C.muted,
    })
    s.link(B, A, '4/8', { ...o, ...m, side: -1, color: C.orange.s, width: 4, mcolor: C.orange.s })
    s.link(A, S, '12/12', { ...o, ...m, side: 1, color: C.red.s, width: 5, mcolor: C.red.s })
    const tag = (r, dy, t, color) => s.label(r.cx, r.cy + dy, t, { size: 17, color, parent: p.id })
    tag(S, -54, '8/8', C.red.s)
    tag(E, -54, '3/6', C.orange.s)
    tag(Cn, -54, '0/0', C.muted)
    tag(B, 54, '0/0', C.muted)
    tag(A, 54, '3/6', C.orange.s)
  }

  const w3 = (W - 2 * G) / 3
  const r2 = s.row(0, r1.bottom + G, G, [
    {
      w: w3,
      title: 'Example 6: router E loops',
      color: C.red,
      body: [
        {
          mono: 'TI-LFA mode, weakest first:\nrouter E   2 of 4 flows loop\nevery link 0 unprotected',
          size: 16,
        },
        'S and N both use link-protecting TI-LFA through E. With router E down, the repairs bounce between S and N (A9).',
      ],
    },
    {
      w: w3,
      title: 'And the other way round',
      color: C.orange,
      body: [
        {
          mono: 'Example 6, LFA only:\nlink E–D   5 of 8 dropped\nrouter E   0 of 4  (N’s LFA M)',
          size: 16,
        },
        {
          mono: 'Example 1, N overloaded, TI-LFA:\nlink E–D   5 of 6 lost\n           (4 unreachable, 1 dropped)',
          size: 16,
        },
        { note: 'E–D cuts N off from E and S: no path is left.' },
      ],
    },
    {
      w: w3,
      title: 'Not the heat map',
      color: C.gray,
      body: [
        'The heat map (A13) counts the pairs each router plans for its own links. Weakest spots fails links and whole routers, follows every source’s traffic across the failure and counts what really happens to it.',
        { note: 'A test checks each count against simulateAllSources() for that one failure.' },
      ],
    },
  ])

  const t = s.panel(0, r2.bottom + G, W, {
    title: 'Takeaway',
    color: C.yellow,
    body: [
      'Weakest spots ranks every single link and router failure by how much traffic it loses. In Example 3 with LFA only, losing A–S or S–E drops all 12 flows that use it. Because it fails routers too, it finds problems the coverage numbers can’t show, like router E in Example 6.',
    ],
  })
  s.text(
    0,
    t.y + t.h + 14,
    'Sources: docs/02-algorithms.md §17  ·  docs/learn/10-design-checks.md (Weakest spots)  ·  examples/03, 06, 01  ·  checked with weakSpots()',
    { size: 16, color: C.muted, maxW: W },
  )
  return s
}

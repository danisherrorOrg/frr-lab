// A13 · Coverage heat map (docs/02-algorithms.md §12), drawn on Example 3
// (examples/03-ring5-highmetric.yaml) in LFA mode, every router as the source.
import { Scene, C } from '../lib/scene.mjs'

export default function draw() {
  const s = new Scene('a13')
  const W = 1640
  const G = 20

  s.text(0, 0, 'A13 · Coverage heat map: where are the gaps?', { size: 40, color: C.blue.s })
  s.text(
    0,
    58,
    '§12 of docs/02-algorithms.md  ·  the §5 coverage numbers grouped by router and by link; nothing new is decided  ·  code: src/engine/heat-map.ts',
    { size: 18, color: C.muted, maxW: W },
  )

  const r1 = s.row(0, 110, G, [
    {
      w: 600,
      title: 'Example 3, heat map in LFA mode',
      color: C.blue,
      drawH: 440,
      body: [
        { note: 'All metrics 1, except C–B = 10. Each router and link shows its LFA share.' },
        { note: 'Green: 100%. Amber: 75–99%. Red: under 50%.', color: C.ink },
        { note: 'Gray dashed "–": 0 pairs. No shortest path uses C–B; it is only a backup.' },
        { note: 'The % is written on each one, so colour is never the only signal.' },
      ],
    },
    {
      w: W - 600 - G,
      title: 'How it works: run every router once, count each pair twice',
      color: C.blue,
      body: [
        'A pair = (destination D, primary link S–E), as in A8. coverageMap() runs computeForSource() for every router, then adds each pair to:',
        '•  the router R that repairs it (the PLR, R = S): R’s own coverage row\n•  the link it protects, S–E, with both directions added up',
        {
          mono: 'share in a mode = pairs protected in that mode / pairs\nmodes: LFA (ECMP counts as LFA) · LFA + Remote LFA · TI-LFA',
        },
        { head: 'Example 3, every router as the source' },
        {
          mono: [
            'Router  Pairs  LFA        LFA + RLFA  TI-LFA      Link  Pairs  LFA        LFA + RLFA  TI-LFA',
            '------  -----  ---------  ----------  ----------  ----  -----  ---------  ----------  ----------',
            'S       4      0    0%    0    0%     4   100%    S–E   5      0    0%    0    0%     5   100%',
            'E       4      0    0%    0    0%     4   100%    A–S   5      0    0%    0    0%     5   100%',
            'A       4      0    0%    0    0%     4   100%    B–A   5      4   80%    4   80%     5   100%',
            'B       4      4  100%    4  100%     4   100%    E–C   5      4   80%    4   80%     5   100%',
            'C       4      4  100%    4  100%     4   100%    C–B   0      –          –           –',
            '------  -----                                     ----  -----',
            'total   20     8   40%    8   40%    20   100%    total 20     8   40%    8   40%    20   100%',
          ].join('\n'),
          size: 14,
        },
        { head: 'Where a link’s 5 pairs come from (FRR is local repair)' },
        {
          mono: 'S–E:  S over S→E: E, C (2)     +  E over E→S: S, A, B (3)     = 5, no LFA\nB–A:  B over B→A: A, S, E, C (4, LFA C)  +  A over A→B: B (1, TI-LFA only)  = 4/5 LFA',
          size: 15,
        },
        {
          note: 'Every pair has exactly one router and one link, so both columns add up to the all-sources total (20).',
        },
      ],
    },
  ])

  {
    const p = r1.panels[0]
    const ox = p.drawX
    const oy = p.drawY
    const o = { parent: p.id }
    // Positions follow examples/03-ring5-highmetric.yaml.
    const S = s.router('S', ox + 70, oy + 150, { ...o, color: C.red })
    const E = s.router('E', ox + 270, oy + 60, { ...o, color: C.red })
    const Cn = s.router('C', ox + 480, oy + 150, { ...o, color: C.green })
    const B = s.router('B', ox + 390, oy + 360, { ...o, color: C.green })
    const A = s.router('A', ox + 150, oy + 360, { ...o, color: C.red })
    const tag = (r, dx, dy, t, color) =>
      s.label(r.cx + dx, r.cy + dy, t, { size: 17, color, parent: p.id })
    s.link(S, E, '0/5  0%', {
      parent: p.id,
      side: 1,
      color: C.red.s,
      width: 5,
      mcolor: C.red.s,
      msize: 17,
    })
    s.link(E, Cn, '4/5  80%', {
      parent: p.id,
      side: 1,
      color: C.yellow.s,
      width: 5,
      mcolor: C.yellow.s,
      msize: 17,
    })
    s.link(Cn, B, '–  (10)', {
      parent: p.id,
      side: 1,
      color: C.muted,
      dashed: true,
      mcolor: C.muted,
      msize: 17,
    })
    s.link(B, A, '4/5  80%', {
      parent: p.id,
      side: 1,
      color: C.yellow.s,
      width: 5,
      mcolor: C.yellow.s,
      msize: 17,
    })
    s.link(A, S, '0/5  0%', {
      parent: p.id,
      side: 1,
      color: C.red.s,
      width: 5,
      mcolor: C.red.s,
      msize: 17,
    })
    tag(S, 0, -54, '0/4  0%', C.red.s)
    tag(E, 0, -54, '0/4  0%', C.red.s)
    tag(Cn, 0, -54, '4/4  100%', C.green.s)
    tag(B, 0, 54, '4/4  100%', C.green.s)
    tag(A, 0, 54, '0/4  0%', C.red.s)
  }

  const w3 = (W - 2 * G) / 3
  const r2 = s.row(0, r1.bottom + G, G, [
    {
      w: w3,
      title: 'Buckets on the canvas',
      color: C.green,
      body: [
        {
          mono: '100%      ✓   green\n75–99%        amber\n50–74%        orange\nunder 50%     red\n0 pairs   –   gray',
          size: 16,
        },
        'Same Example 3 in TI-LFA mode: every router and link 100% (C–B still "–").',
        {
          note: 'Example 2 (C–B = 1): every router and every link 2/4 = 50% LFA, 4/4 with Remote LFA.',
        },
      ],
    },
    {
      w: w3,
      title: 'A router’s % is not "what if R fails"',
      color: C.orange,
      body: [
        'Router R’s number is link protection: "if one of R’s own links fails, how much of R’s traffic has a backup?"',
        'Router B at 100% says nothing about what happens when B itself fails. For that, fail the router: Weakest spots (A18) or the simulation (A9).',
        {
          note: 'In node mode (A6) the counted backups are the node-protecting ones where they exist.',
        },
      ],
    },
    {
      w: w3,
      title: 'A "–" link',
      color: C.gray,
      body: [
        'A link on no shortest path is no pair’s primary link, so it has 0 pairs. It is never "unprotected"; it can only carry backup traffic.',
        { mono: 'Ex. 3, C–B (metric 10): 0 pairs\nEx. 7, S-E#2 (20 > 10): 0 pairs', size: 15 },
        { note: 'A link’s pairs are the per-link view’s rows (A12) counted.' },
      ],
    },
  ])

  const t = s.panel(0, r2.bottom + G, W, {
    title: 'Takeaway',
    color: C.yellow,
    body: [
      'The heat map shows where the gaps are: each router and link gets the share of its pairs that have a backup in the chosen repair mode. In Example 3 with LFA only, S, E, A and the links S–E and A–S are at 0%; only TI-LFA covers them.',
    ],
  })
  s.text(
    0,
    t.y + t.h + 14,
    'Sources: docs/02-algorithms.md §12  ·  docs/learn/10-design-checks.md (Heat map)  ·  examples/03-ring5-highmetric.yaml, 02-ring5.yaml  ·  checked with coverageMap()',
    { size: 16, color: C.muted, maxW: W },
  )
  return s
}

// A15 · Max SID depth (docs/02-algorithms.md §14), drawn on Example 3
// (examples/03-ring5-highmetric.yaml) with msd: 2, S → E over S–E.
import { Scene, C } from '../lib/scene.mjs'

export default function draw() {
  const s = new Scene('a15')
  const W = 1640
  const G = 20

  s.text(0, 0, 'A15 · Max SID depth: is the label stack too deep?', { size: 40, color: C.blue.s })
  s.text(
    0,
    58,
    '§14 of docs/02-algorithms.md  ·  RFC 8491 (BMI-MSD), RFC 9855 §3  ·  code: src/engine/msd.ts',
    { size: 18, color: C.muted, maxW: W },
  )

  const r1 = s.row(0, 110, G, [
    {
      w: 600,
      title: 'Example 3, msd: 2, S → E',
      color: C.blue,
      drawH: 400,
      body: [
        { note: 'All metrics 1, except C–B = 10. Every router can impose 2 labels.' },
        { note: 'Red dashed: the failed link S–E.', color: C.red.s },
        { note: 'Green: the TI-LFA repair S→A→B→C→E (13).', color: C.green.s },
        { note: 'Right: the stack S would have to impose, top first, before PHP.' },
      ],
    },
    {
      w: W - 600 - G,
      title: 'How it works: count every label S imposes, compare with S’s MSD',
      color: C.blue,
      body: [
        { head: '1. Which MSD?' },
        { mono: 'msdOf(S) = S’s own msd, else the network’s msd, else no limit' },
        {
          note: 'RFC 8491 also has a per-link MSD; LFA Lab models only the node value. Range 2 to 255 (one octet).',
        },
        { head: '2. How deep is the repair?' },
        'Labels imposed = labels swapped + labels pushed (RFC 8491 §1.1). S swaps D’s own label and pushes the repair list, so the whole stack of A5 counts:',
        { mono: 'depth = labelStack.length = extra labels + 1\ntoo deep  ⇔  depth > msd' },
        {
          mono: 'S → E:  [16004, 24005, 16002]\n        3 labels (1 swapped + 2 pushed) > MSD 2 of S  ✗',
          color: C.red.s,
        },
        { head: '3. What "too deep" changes' },
        '•  The repair is still worked out and shown, marked tooDeep, but S can’t install it.\n•  It isn’t counted as TI-LFA; it is counted apart as tooDeep (tilfa + tooDeep = TI-LFA with no limit).\n•  "Protected by" skips it, and so do the heat map (A13) and what-if (A14).\n•  Simulation, TI-LFA mode: no backup, traffic dropped with reason too-deep.',
        { note: 'No limit (the default) changes nothing: every earlier result stays the same.' },
      ],
    },
  ])

  {
    const p = r1.panels[0]
    const ox = p.drawX
    const oy = p.drawY
    const o = { parent: p.id }
    const S = s.router('S', ox + 40, oy + 130, { ...o, bold: true })
    const E = s.router('E', ox + 180, oy + 40, { ...o, color: C.purple })
    const Cn = s.router('C', ox + 320, oy + 130, o)
    const B = s.router('B', ox + 260, oy + 330, o)
    const A = s.router('A', ox + 90, oy + 330, o)
    const grn = { parent: p.id, color: C.green.s, width: 4, arrow: true }
    s.link(S, E, 1, { parent: p.id, side: 1, color: C.red.s, width: 3, dashed: true })
    s.link(S, A, 1, { ...grn, side: -1 })
    s.link(A, B, 1, { ...grn, side: 1 })
    s.link(B, Cn, '10', { ...grn, side: 1 })
    s.link(Cn, E, 1, { ...grn, side: 1 })
    s.label(B.cx + 10, B.cy + 52, 'Adj-SID B→C 24005', { size: 15, color: C.green.s, parent: p.id })

    // The label stack S would push, top first.
    const sx = ox + 400
    const sw = 160
    s.label(sx + sw / 2, oy + 14, 'Stack at S', { size: 17, color: C.ink, parent: p.id })
    const rows = [
      ['16004', 'Prefix B', C.green],
      ['24005', 'Adj B→C', C.green],
      ['16002', 'Prefix E', C.purple],
    ]
    rows.forEach(([lab, what, col], i) => {
      const y = oy + 40 + i * 62
      const id = s.rect(sx, y, sw, 52, { stroke: col.s, fill: col.f, parent: p.id, sharp: true })
      s.label(sx + sw / 2, y + 15, lab, { size: 18, family: 'mono', color: col.s, parent: id })
      s.label(sx + sw / 2, y + 39, what, { size: 14, color: C.muted, parent: id })
    })
    s.label(sx + sw / 2, oy + 238, '3 labels', { size: 18, color: C.ink, parent: p.id })
    s.label(sx + sw / 2, oy + 264, '> MSD 2 ✗', {
      size: 20,
      family: 'mono',
      color: C.red.s,
      parent: p.id,
    })
    s.label(sx + sw / 2, oy + 298, 'too deep:', { size: 16, color: C.red.s, parent: p.id })
    s.label(sx + sw / 2, oy + 320, 'not installed', { size: 16, color: C.red.s, parent: p.id })
  }

  const w3 = (W - 2 * G) / 3
  const r2 = s.row(0, r1.bottom + G, G, [
    {
      w: w3 * 2 + G,
      title: 'Example 3, msd: 2: the 6 too-deep repairs',
      color: C.red,
      body: [
        {
          mono: [
            'PLR  D  Link  Label stack              Depth',
            '---  -  ----  -----------------------  -----',
            'S    A  A–S   16005  24006  16003      3 > 2',
            'S    B  A–S   16005  24006  16004      3 > 2',
            'S    C  S–E   16004  24005  16005      3 > 2',
            'S    E  S–E   16004  24005  16002      3 > 2',
            'A    B  B–A   16005  24006  16004      3 > 2',
            'E    C  E–C   16004  24005  16005      3 > 2',
          ].join('\n'),
          size: 15,
        },
        {
          mono: 'msd 2:            TI-LFA 14/20, too deep 6 (S 4, A 1, E 1)   LFA, Remote LFA 8/20 unchanged\nmsd 3:            TI-LFA 20/20, nothing too deep\nmsd 3, S msd 2:   TI-LFA 16/20, too deep 4 (all S’s)',
          size: 15,
        },
        {
          note: 'Simulation, S–E down, TI-LFA mode: traffic from S to C and to E is dropped at S, reason too-deep.',
        },
      ],
    },
    {
      w: w3,
      title: 'Edge cases',
      color: C.gray,
      body: [
        '•  LFA and Remote LFA always fit: at most 2 labels (PQ label + D’s label). That is why MSD 1 isn’t modelled.\n•  No shorter list is tried. The greedy walk (B15) already takes the furthest Prefix-SID at each step; LFA Lab always repairs along the post-convergence path (B14).\n•  SRv6 (A25): the same repair is 2 SIDs and fits MSD 2.',
      ],
    },
  ])

  const t = s.panel(0, r2.bottom + G, W, {
    title: 'Takeaway',
    color: C.yellow,
    body: [
      'A TI-LFA repair only counts if the router can push it. If the label stack is longer than the router’s MSD, the repair is shown but marked "too deep" and counted as unprotected. In Example 3 with MSD 2, 6 of 20 pairs need 3 labels, so TI-LFA coverage drops from 100% to 70%.',
    ],
  })
  s.text(
    0,
    t.y + t.h + 14,
    'Sources: docs/02-algorithms.md §14  ·  docs/learn/06, 07, 10  ·  examples/03-ring5-highmetric.yaml  ·  checked with computeCoverage(), simulateFailure()',
    { size: 16, color: C.muted, maxW: W },
  )
  return s
}

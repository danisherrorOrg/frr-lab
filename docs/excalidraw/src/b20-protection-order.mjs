// B20 · Protection order: each pair is credited to the simplest method that protects it,
// ECMP → LFA → Remote LFA → TI-LFA (docs/02-algorithms.md §5, D19, D31), drawn on
// Example 4 (examples/04-isp-core.yaml) from PE1. Rows and totals from protectedBy()
// over computeForSource() for every router.
import { Scene, C } from '../lib/scene.mjs'

export default function draw() {
  const s = new Scene('b20')
  const W = 1640
  const G = 20

  s.text(0, 0, 'B20 · Protection order: credit each pair to the simplest method', {
    size: 40,
    color: C.blue.s,
  })
  s.text(
    0,
    58,
    '§5 of docs/02-algorithms.md  ·  RFC 5286, RFC 7490, RFC 9855  ·  DECISIONS.md D19, D31  ·  code: src/engine/rows.ts (protectedBy), coverage.ts',
    { size: 18, color: C.muted, maxW: W },
  )

  const steps = [
    { t: 'ECMP', d: 'Another primary next hop avoids the link (B2)', c: C.teal },
    { t: 'LFA', d: 'A best LFA exists (B3–B7)', c: C.green },
    { t: 'Remote LFA', d: 'No LFA, and a PQ node exists (B11, B13)', c: C.orange },
    { t: 'TI-LFA', d: 'A repair exists and fits the MSD (B14–B17)', c: C.blue },
    { t: 'Unprotected', d: 'Nothing works: a bridge, or too deep', c: C.red },
  ]
  const BH = 120

  const r1 = s.row(0, 110, G, [
    {
      w: 600,
      title: 'Example 4, source PE1',
      color: C.blue,
      drawH: 300,
      body: [
        {
          note: 'Router colour = the method each destination is credited to: teal ECMP, green LFA, orange Remote LFA. The diagonal P1–P4 costs 20 from P1 and 40 back.',
        },
      ],
    },
    {
      w: W - 600 - G,
      title: 'The rule: try the methods in order, stop at the first that works',
      color: C.blue,
      drawH: BH + 34,
      body: [
        {
          mono: [
            'Dest  Via  ECMP  LFA   Remote LFA      TI-LFA labels   Credited to',
            '----  ---  ----  ----  --------------  --------------  -----------',
            'PE2   P1   yes   P2    not run         16004 16012     ECMP',
            'PE2   P2   yes   P1    not run         16003 16012     ECMP',
            'P4    P2   no    P1    not run         16004           LFA',
            'P1    P1   no    none  PQ PE2 via P2   24000 16001     Remote LFA',
            'P2    P2   no    none  PQ P4 via P1    24000 16002     Remote LFA',
            'P3    P1   no    none  PQ PE2 via P2   16004 16003     Remote LFA',
          ].join('\n'),
          size: 15,
        },
        {
          note: 'Every row also has a TI-LFA repair, and the ECMP rows also have an LFA. Each row still counts once, under the first method that works. "Not run": Remote LFA is only tried when there is no LFA (B13).',
        },
        {
          note: 'Example 3 adds the fourth step: from S, all 4 destinations have no LFA and no PQ node, so all 4 go to TI-LFA (S → C: 16004, 24005, 16005).',
          color: C.blue.s,
        },
      ],
    },
  ])

  {
    const p = r1.panels[0]
    const ox = p.drawX + 40
    const oy = p.drawY + 50
    const o = { parent: p.id }
    const PE1 = s.router('PE1', ox, oy + 100, { ...o, bold: true, r: 34 })
    const P1 = s.router('P1', ox + 150, oy, { ...o, color: C.orange })
    const P2 = s.router('P2', ox + 150, oy + 200, { ...o, color: C.orange })
    const P3 = s.router('P3', ox + 350, oy, { ...o, color: C.orange })
    const P4 = s.router('P4', ox + 350, oy + 200, { ...o, color: C.green })
    const PE2 = s.router('PE2', ox + 490, oy + 100, { ...o, color: C.teal, r: 34 })
    s.link(PE1, P1, 10, { ...o, side: -1 })
    s.link(PE1, P2, 10, { ...o, side: 1 })
    s.link(P1, P2, 30, { ...o, side: -1, at: 0.3 })
    s.link(P1, P3, 10, { ...o, side: -1 })
    s.link(P2, P4, 10, { ...o, side: 1 })
    s.link(P3, P4, 30, { ...o, side: 1, at: 0.3 })
    s.link(P1, P4, '20 / 40', { ...o, side: 1, msize: 16, at: 0.5 })
    s.link(P3, PE2, 10, { ...o, side: -1 })
    s.link(P4, PE2, 10, { ...o, side: 1 })
    s.label(PE1.cx, PE1.cy + 52, 'source', { size: 16, color: C.muted, parent: p.id })
  }

  {
    const p = r1.panels[1]
    const n = steps.length
    const gap = 36
    const bw = (p.drawW - (n - 1) * gap) / n
    const y = p.drawY
    let prev = null
    steps.forEach((st, i) => {
      const x = p.drawX + i * (bw + gap)
      const id = s.rect(x, y, bw, BH, {
        stroke: st.c.s,
        fill: '#ffffff',
        strokeWidth: 2,
        parent: p.id,
      })
      s.text(x + 12, y + 10, `${i + 1}. ${st.t}`, { size: 18, color: st.c.s, parent: id })
      s.text(x + 12, y + 40, st.d, { size: 14, color: C.ink, maxW: bw - 24, parent: id })
      if (prev)
        s.line(
          [
            [prev.x + bw + 4, y + BH / 2],
            [x - 4, y + BH / 2],
          ],
          { arrow: true, stroke: C.muted, strokeWidth: 2, parent: p.id, ends: [prev.id, id] },
        )
      prev = { x, id }
    })
    s.text(
      p.drawX,
      y + BH + 8,
      'Each arrow means "no: try the next one". The first "yes" gets the pair.',
      {
        size: 15,
        color: C.muted,
        parent: p.id,
      },
    )
  }

  const r2 = s.row(0, r1.bottom + G, G, [
    {
      w: 900,
      title: 'Every example, every router as source (from the engine)',
      color: C.green,
      body: [
        {
          mono: [
            'Example              Pairs  ECMP  LFA  Remote LFA  TI-LFA  None',
            '-------------------  -----  ----  ---  ----------  ------  ----',
            ' 1  square              12     0    8           4       0     0',
            ' 2  ring                20     0   10          10       0     0',
            ' 3  ring, B–C = 10      20     0    8           0      12     0',
            ' 4  ISP core            35    10   17           8       0     0',
            ' 5  leaf-spine          48    32    0          16       0     0',
            ' 6  link-protecting     22     4   14           4       0     0',
            ' 7  parallel            16     8    7           1       0     0',
            ' 8  node protection     33     6   18           9       0     0',
            ' 9  SRLG                32     4   16          12       0     0',
            '10  LAN + levels        23     4   14           0       0     5',
            '11  Flex-Algo           24     8   10           5       1     0',
          ].join('\n'),
          size: 15,
        },
        {
          note: 'Each row adds up to its pairs. The coverage numbers (A8) are running totals of these columns: LFA coverage = (ECMP + LFA) / pairs, so Example 4 has 27 / 35.',
        },
      ],
    },
    {
      w: W - 900 - G,
      title: 'Why simplest first',
      color: C.purple,
      body: [
        '•  ECMP: nothing to add. The router already has a second path and just stops using the failed one.\n•  LFA: one more next hop in the table. No tunnel, no labels.\n•  Remote LFA: a tunnel to the PQ node.\n•  TI-LFA: a label stack built from the post-convergence path.\n\nCrediting each pair once to the simplest working method shows how much protection each extra feature really buys. In Example 4, Remote LFA closes the last 8 of 35 pairs; TI-LFA adds nothing new.',
      ],
    },
  ])

  const w3 = (W - 2 * G) / 3
  const r3 = s.row(0, r2.bottom + G, G, [
    {
      w: w3,
      title: 'Too deep counts as nothing',
      color: C.orange,
      body: [
        'A TI-LFA repair with more labels than S’s Max SID depth is not installed, so it protects nothing and the pair falls through to "unprotected" (A15, D44).',
      ],
    },
    {
      w: w3,
      title: '"None" means partitioned',
      color: C.red,
      body: [
        'Example 10: R5 has one link, to R4. Its 4 pairs from R5 and the pair R4 → R5 all use that link, and no method can go round it: 5 pairs, nothing protects them.',
      ],
    },
    {
      w: w3,
      title: 'Where you see it',
      color: C.gray,
      body: [
        '•  Results table: the Status column.\n•  Coverage numbers and the unprotected list (A8).\n•  CSV export: the protected_by column.\n•  Compare view (A11) shows all methods side by side.',
      ],
    },
  ])

  const t = s.panel(0, r3.bottom + G, W, {
    title: 'Takeaway',
    color: C.yellow,
    body: [
      'Many pairs are protected by more than one method. LFA Lab credits each one once, to the simplest that works: ECMP, then LFA, then Remote LFA, then TI-LFA. From PE1 in Example 4: 2 ECMP, 1 LFA, 3 Remote LFA, though every row also has a TI-LFA repair.',
    ],
  })
  s.text(
    0,
    t.y + t.h + 14,
    'Sources: docs/02-algorithms.md §5, §14  ·  docs/learn/08-comparison.md  ·  DECISIONS.md D19, D31, D44  ·  examples/04-isp-core.yaml, 03-ring5-highmetric.yaml, 10-lan-levels.yaml (and all of examples/ for the totals)',
    { size: 16, color: C.muted, maxW: W },
  )
  return s
}

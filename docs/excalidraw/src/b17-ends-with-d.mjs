// B17 · The list always ends with PrefixSID(D) (docs/02-algorithms.md §4.2, §4.3,
// RFC 9855 §7.1), drawn on Example 3 (examples/03-ring5-highmetric.yaml), S → C:
// the walk ends with AdjSID(B→C), so PrefixSID(C) is added. From computeForSource().
import { Scene, C } from '../lib/scene.mjs'

export default function draw() {
  const s = new Scene('b17')
  const W = 1640
  const G = 20

  s.text(0, 0, 'B17 · The list ends with PrefixSID(D): the packet’s own label', {
    size: 40,
    color: C.blue.s,
  })
  s.text(
    0,
    58,
    '§4.2, §4.3 of docs/02-algorithms.md  ·  RFC 9855 §7.1  ·  RFC 8660 (SR over MPLS)  ·  code: src/engine/tilfa.ts, labels.ts',
    { size: 18, color: C.muted, maxW: W },
  )

  const stack = [
    { t: '16004   PrefixSID(B)', c: C.green, role: 'repair list' },
    { t: '24005   AdjSID(B→C)', c: C.green, role: 'repair list' },
    { t: '16005   PrefixSID(C)', c: C.purple, role: 'destination’s own label (added)' },
  ]
  const SB = 46

  const r1 = s.row(0, 110, G, [
    {
      w: 600,
      title: 'Example 3: S → C, link S–E fails',
      color: C.blue,
      drawH: 300 + 34 + stack.length * SB + 10,
      body: [
        { note: 'Ring, every link 1 except B–C = 10.' },
        {
          note: 'Green: the post-convergence path S → A → B → C (12). The walk gives PrefixSID(B), then AdjSID(B→C) to force the costly link.',
          color: C.green.s,
        },
        {
          note: 'Purple: the walk ends on an Adj-SID, so C’s own Prefix-SID is added under it.',
          color: C.purple.s,
        },
      ],
    },
    {
      w: W - 600 - G,
      title: 'The rule: D’s label stays at the bottom, the repair goes on top',
      color: C.blue,
      body: [
        {
          mono: 'last segment is PrefixSID(D)   →  nothing to add\nlast segment is AdjSID(X→D)    →  add PrefixSID(D) after it\nlist empty after clean-up      →  the list is just [PrefixSID(D)]\n\nextra labels  =  segments − 1',
          size: 16,
        },
        '•  Before the failure the packet already carries D’s label (SRGB 16000 + D’s SID index). The repair list is pushed on top of it (RFC 9855 §7.1), so D’s label is always the last one.\n•  An Adj-SID only moves the packet over one link. After it, the packet still needs D’s label, or the far end wouldn’t know where it goes.\n•  "Extra labels" counts only the repair list: the segments minus D’s own label.',
        { head: 'All three endings in the examples (from the engine)' },
        {
          mono: [
            'Example        Row        Walk (after clean-up)       Added   Labels (top first)       Extra',
            '-------------  ---------  --------------------------  ------  -----------------------  -----',
            '2  ring        S → E      [P(B), P(E)]                –       16004, 16002             1',
            '5  leaf-spine  SP1 → L1   [P(SP2), P(L1)]             –       16002, 16011             1',
            '3  ring, B–C   S → C      [P(B), Adj(B→C)]            P(C)    16004, 24005, 16005      2',
            '4  ISP core    PE1 → P1   [Adj(P2→P1)]                P(P1)   24000, 16001             1',
            '4  ISP core    PE2 → P3   [Adj(P4→P3)]                P(P3)   24002, 16003             1',
            '7  parallel    S → E      [ ]                         P(E)    16002                    0',
            '1  square      S → D      [P(D)]                      –       16004                    0',
          ].join('\n'),
          size: 14,
        },
        {
          note: 'P = PrefixSID, Adj = AdjSID. Labels are shown top first, before penultimate-hop popping (§4.3).',
        },
      ],
    },
  ])

  {
    const p = r1.panels[0]
    const ox = p.drawX
    const oy = p.drawY
    const o = { parent: p.id }
    const S = s.router('S', ox + 130, oy + 50, { ...o, bold: true })
    const E = s.router('E', ox + 430, oy + 50, o)
    const Cn = s.router('C', ox + 500, oy + 230, { ...o, color: C.purple })
    const B = s.router('B', ox + 280, oy + 260, o)
    const A = s.router('A', ox + 60, oy + 230, o)
    s.link(S, E, 1, { ...o, side: -1, color: C.red.s, width: 3, dashed: true })
    s.link(E, Cn, 1, { ...o, side: -1 })
    s.link(S, A, 1, { ...o, side: -1, color: C.green.s, width: 4, arrow: true })
    s.link(A, B, 1, { ...o, side: -1, color: C.green.s, width: 4, arrow: true })
    s.link(B, Cn, 10, { ...o, side: -1, color: C.purple.s, width: 4, arrow: true })
    s.label(S.cx, S.cy - 46, 'source', { size: 16, color: C.muted, parent: p.id })
    s.label(Cn.cx, Cn.cy + 50, 'destination', { size: 16, color: C.purple.s, parent: p.id })
    s.label(ox + 290, oy + 140, 'PrefixSID(B), then AdjSID(B→C)', {
      size: 15,
      family: 'mono',
      color: C.green.s,
      parent: p.id,
    })

    const sy = oy + 334
    s.text(ox, sy - 30, 'Label stack S pushes (top first):', {
      size: 16,
      color: C.ink,
      parent: p.id,
    })
    const bw = 300
    stack.forEach((b, i) => {
      const y = sy + i * SB
      const id = s.rect(ox, y, bw, SB - 6, {
        stroke: b.c.s,
        fill: b.c.f,
        strokeWidth: 2,
        sharp: true,
        parent: p.id,
      })
      s.label(ox + bw / 2, y + (SB - 6) / 2, b.t, {
        size: 16,
        family: 'mono',
        color: b.c.s,
        parent: id,
      })
      s.text(ox + bw + 14, y + 9, b.role, { size: 15, color: b.c.s, parent: p.id })
    })
  }

  const w3 = (W - 2 * G) / 3
  const r2 = s.row(0, r1.bottom + G, G, [
    {
      w: w3,
      title: 'It counts towards MSD (A15)',
      color: C.orange,
      body: [
        'S must push the whole stack, D’s label included. Example 3, S → E is 16004, 24005, 16002: 3 labels. With msd: 2 the repair is "too deep" and counts as unprotected.',
        { note: 'On SRv6 (A25) the same repair is 2 SIDs and fits.' },
      ],
    },
    {
      w: w3,
      title: 'Why Example 1 shows 0 extra labels',
      color: C.green,
      body: [
        'After the clean-up (B16) only PrefixSID(D) is left: the packet keeps its own label 16004 and is just sent out to N. Nothing extra is pushed: the same as the LFA.',
      ],
    },
    {
      w: w3,
      title: 'Edge cases',
      color: C.gray,
      body: [
        '•  Node mode (B19): the same rule. Example 8 ends [P(C), P(D)] = 16005, 16006.\n•  With PHP on, the last router before D pops D’s label (packet walk, A7). The stack is shown before that.\n•  Label values: B18.',
      ],
    },
  ])

  const t = s.panel(0, r2.bottom + G, W, {
    title: 'Takeaway',
    color: C.yellow,
    body: [
      'The repair list goes on top of the label the packet already carries, so the list always ends with PrefixSID(D). If the walk ends with an Adj-SID into D, D’s label is added after it. Only the labels above it count as extra: Example 3, S → C has 3 labels, 2 of them extra.',
    ],
  })
  s.text(
    0,
    t.y + t.h + 14,
    'Sources: docs/02-algorithms.md §4.2, §4.3, §6 (Example 3)  ·  docs/learn/07-ti-lfa.md (clean-up rules, Max SID depth)  ·  examples/03-ring5-highmetric.yaml, 02-ring5.yaml, 04-isp-core.yaml, 05-leaf-spine.yaml, 07-parallel.yaml',
    { size: 16, color: C.muted, maxW: W },
  )
  return s
}

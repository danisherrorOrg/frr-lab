// A25 · SRv6 encoding of TI-LFA (docs/02-algorithms.md §24), drawn on Example 3
// (examples/03-ring5-highmetric.yaml) with dataplane: srv6, S → E over S–E.
import { Scene, C } from '../lib/scene.mjs'

export default function draw() {
  const s = new Scene('a25')
  const W = 1640
  const G = 20

  s.text(0, 0, 'A25 · SRv6: the same repair, written as IPv6 SIDs', { size: 40, color: C.blue.s })
  s.text(
    0,
    58,
    '§24 of docs/02-algorithms.md  ·  RFC 9855 §7.2, RFC 8986 §3.1, §4.1, §4.2, §5 (H.Encaps), RFC 9352 §4  ·  code: src/engine/srv6.ts',
    { size: 18, color: C.muted, maxW: W },
  )

  const r1 = s.row(0, 110, G, [
    {
      w: 600,
      title: 'Example 3, dataplane: srv6, S → E',
      color: C.blue,
      drawH: 400,
      body: [
        { note: 'All metrics 1, except C–B = 10. Red dashed: the failed link S–E.', color: C.ink },
        {
          note: 'Green: the TI-LFA repair S→A→B→C→E (13), the same path as SR-MPLS (A5).',
          color: C.green.s,
        },
        { note: 'Right: what S sends on SRv6, top first.' },
      ],
    },
    {
      w: W - 600 - G,
      title: 'How it works: same segments, other encoding',
      color: C.blue,
      body: [
        'RFC 9855 §7.2: "the TI-LFA path computation algorithm is the same". Only the encoding changes: each segment becomes an IPv6 address (a SID) from a router’s locator.',
        {
          mono: [
            'locator   router’s locator, else fc00:0:<SID index in hex>::/48   B:   fc00:0:4::/48',
            'End       node segment      = locator + function 1              B:   fc00:0:4::1',
            'End.X     adjacency segment = locator + 0x40 + the link’s place  B→A: fc00:0:4::40',
            '          among the router’s links (Adj-SID order: by neighbor, B→C: fc00:0:4::41',
            '          then link id)',
          ].join('\n'),
          size: 14,
        },
        { head: 'The repair list drops the destination’s own segment' },
        'With H.Encaps, S puts the original packet inside a new IPv6 header. D stays the inner packet’s address, so PrefixSID(D) isn’t needed in the list.',
        {
          mono: [
            'segments    [PrefixSID(B), AdjSID(B→C), PrefixSID(E)]',
            'SR-MPLS     16004  24005  16002                 3 labels',
            'SRv6        [fc00:0:4::1, fc00:0:4::41]         2 SIDs, E stays the inner destination',
          ].join('\n'),
          size: 15,
        },
        { head: 'Max SID depth counts SIDs pushed (RFC 9352 §4)' },
        {
          mono: 'Example 3, msd: 2     SR-MPLS: TI-LFA 14/20, too deep 6\n                      SRv6:    TI-LFA 20/20, too deep 0',
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
    s.label(B.cx, B.cy + 52, 'End.X B→C ::41', { size: 15, color: C.green.s, parent: p.id })

    const col = (x, title, rows, foot, color) => {
      const w = 170
      s.label(x + w / 2, oy + 12, title, { size: 16, color: C.ink, parent: p.id })
      rows.forEach(([lab, what, c], i) => {
        const y = oy + 36 + i * 58
        const id = s.rect(x, y, w, 50, { stroke: c.s, fill: c.f, parent: p.id, sharp: true })
        s.label(x + w / 2, y + 15, lab, {
          size: lab.length > 8 ? 14 : 17,
          family: 'mono',
          color: c.s,
          parent: id,
        })
        s.label(x + w / 2, y + 38, what, { size: 13, color: C.muted, parent: id })
      })
      foot.forEach((t, i) =>
        s.label(x + w / 2, oy + 222 + i * 22, t, { size: 15, color, parent: p.id }),
      )
    }
    col(
      ox + 390,
      'What S sends',
      [
        ['fc00:0:4::1', 'End of B', C.green],
        ['fc00:0:4::41', 'End.X B→C', C.green],
        ['dst E', 'inner packet', C.purple],
      ],
      ['2 SIDs', 'MSD 2: fits'],
      C.green.s,
    )
  }

  const w3 = (W - 2 * G) / 3
  const r2 = s.row(0, r1.bottom + G, G, [
    {
      w: w3,
      title: 'SR-MPLS label stack',
      color: C.orange,
      body: [
        { mono: '16004   Prefix-SID B\n24005   Adj-SID B→C\n16002   Prefix-SID E', size: 16 },
        '3 labels imposed: 1 swapped (E’s label) + 2 pushed. Too deep for MSD 2 (A15).',
      ],
    },
    {
      w: w3,
      title: 'SRv6 SID list',
      color: C.green,
      body: [
        { mono: 'fc00:0:4::1    End of B\nfc00:0:4::41   End.X B→C\ninner dst      E', size: 16 },
        'S pushes 2 SIDs: fits MSD 2. B’s links in Adj-SID order are to A (0x40), then to C (0x41).',
      ],
    },
    {
      w: w3,
      title: 'Edge cases',
      color: C.gray,
      body: [
        '•  Empty list: the outgoing interface is enough (the LFA case). Example 1, S → D: "no SIDs needed".\n•  Flex-Algo (A24): each algorithm has its own locator (RFC 9350 §14).\n•  An End.X SID needs no node SID before it (RFC 9855 §7.2): that could save a SID; not modelled.\n•  The packet walk (A7) and the simulation’s labels stay SR-MPLS.',
      ],
    },
  ])

  const t = s.panel(0, r2.bottom + G, W, {
    title: 'Takeaway',
    color: C.yellow,
    body: [
      'On SRv6, TI-LFA computes exactly the same repair; only the encoding changes. Segments become IPv6 SIDs from each router’s locator, and the destination stays the inner packet’s address. In Example 3 the 3-label MPLS stack becomes 2 SIDs, which fits an MSD of 2.',
    ],
  })
  s.text(
    0,
    t.y + t.h + 14,
    'Sources: docs/02-algorithms.md §24  ·  docs/learn/11-advanced-topics.md (SRv6)  ·  examples/03-ring5-highmetric.yaml, 01-square.yaml  ·  checked with the engine',
    { size: 16, color: C.muted, maxW: W },
  )
  return s
}

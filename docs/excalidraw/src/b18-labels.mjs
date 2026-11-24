// B18 · Labels: Prefix-SID = SRGB + SID index, Adj-SIDs auto-numbered per router from
// 24000 (docs/02-algorithms.md §4.3, RFC 8402 §3.2 and §3.4, D9, D18, D29), drawn on
// Example 3 (examples/03-ring5-highmetric.yaml). Every label is from labelTable().
import { Scene, C } from '../lib/scene.mjs'

export default function draw() {
  const s = new Scene('b18')
  const W = 1640
  const G = 20

  s.text(0, 0, 'B18 · Labels: Prefix-SIDs from the SRGB, Adj-SIDs from 24000', {
    size: 40,
    color: C.blue.s,
  })
  s.text(
    0,
    58,
    '§4.3 of docs/02-algorithms.md  ·  RFC 8402 §3.2 (Prefix-SID), §3.4 (Adj-SID)  ·  RFC 8660 (SR over MPLS)  ·  code: src/engine/labels.ts',
    { size: 18, color: C.muted, maxW: W },
  )

  const r1 = s.row(0, 110, G, [
    {
      w: 600,
      title: 'Example 3: every label in the network',
      color: C.blue,
      drawH: 340,
      body: [
        {
          note: 'Mono numbers next to each router: its Prefix-SID label. Under the B–C link: B’s Adj-SID for B→C (24005) and C’s for C→B (24006), both set in the file.',
        },
        {
          mono: [
            'Router  Index  Prefix   Adj-SIDs (auto unless "file")',
            '------  -----  -------  ----------------------------',
            'S       1      16001    →A 24000   →E 24001',
            'E       2      16002    →C 24000   →S 24001',
            'A       3      16003    →B 24000   →S 24001',
            'B       4      16004    →A 24000   →C 24005 file',
            'C       5      16005    →B 24006 file   →E 24000',
          ].join('\n'),
          size: 14,
        },
        {
          note: 'S → E repair: PrefixSID(B), AdjSID(B→C), PrefixSID(E) = 16004, 24005, 16002 (B17).',
          color: C.green.s,
        },
      ],
    },
    {
      w: W - 600 - G,
      title: 'The rule: two kinds of label, two ways to get a number',
      color: C.blue,
      body: [
        {
          mono: 'Prefix-SID label  =  SRGB base + SID index        (one SRGB for all, D9)\n                    16000     + 4  =  16004      (router B)\n\nAdj-SID label     =  value from the file  (adj_sid_ab / adj_sid_ba)\n                     else auto: each router counts from 24000,\n                     neighbors in ID order, then link-ID order,\n                     skipping labels it already uses',
          size: 16,
        },
        '•  A Prefix-SID means "go to router B on the shortest path". Every router has the same SRGB, so 16004 means B everywhere (RFC 8402 §3.2).\n•  An Adj-SID means "send it out of this one link". It is local: only the router that owns the link reads it (RFC 8402 §3.4).\n•  Auto Adj-SIDs start at 24000, just above the SRGB range 16000–23999.',
        { head: 'Auto-numbering on Example 4 (no Adj-SIDs in the file)' },
        {
          mono: [
            'Router  Neighbors in ID order    Adj-SIDs',
            '------  -----------------------  ------------------------------',
            'PE1     P1, P2                   24000, 24001',
            'P2      P1, P4, PE1              24000, 24001, 24002',
            'P4      P1, P2, P3, PE2          24000, 24001, 24002, 24003',
          ].join('\n'),
          size: 15,
        },
        {
          note: 'ID order is character order: "P4" comes before "PE1" because 4 sorts before E. Used in repairs: PE1 → P1 is AdjSID(P2→P1), PrefixSID(P1) = 24000, 16001; PE2 → P3 is 24002, 16003.',
        },
        { head: 'Set in the file (examples/03-ring5-highmetric.yaml)' },
        {
          mono: '- { a: C, b: B, metric: 10, adj_sid_ab: 24006, adj_sid_ba: 24005 }\n\nadj_sid_ab is for a→b = C→B  →  24006 (C’s label)\nadj_sid_ba is for b→a = B→C  →  24005 (B’s label)',
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
    const S = s.router('S', ox + 130, oy + 70, { ...o, bold: true })
    const E = s.router('E', ox + 430, oy + 70, o)
    const Cn = s.router('C', ox + 500, oy + 240, o)
    const B = s.router('B', ox + 270, oy + 270, o)
    const A = s.router('A', ox + 50, oy + 240, o)
    s.link(S, E, 1, { ...o, side: -1 })
    s.link(E, Cn, 1, { ...o, side: -1 })
    s.link(S, A, 1, { ...o, side: -1 })
    s.link(A, B, 1, { ...o, side: 1 })
    s.link(B, Cn, 10, { ...o, side: -1, color: C.green.s, width: 3 })
    const pl = (r, dx, dy, t) =>
      s.label(r.cx + dx, r.cy + dy, t, { size: 16, family: 'mono', color: C.blue.s, parent: p.id })
    pl(S, 0, -50, '16001')
    pl(E, 0, -50, '16002')
    pl(A, 0, 50, '16003')
    pl(B, 0, 50, '16004')
    pl(Cn, 0, 50, '16005')
    // Adj-SIDs of the B–C link, written under the link next to the router that owns each one.
    s.label(ox + 340, oy + 290, '24005', {
      size: 15,
      family: 'mono',
      color: C.green.s,
      parent: p.id,
    })
    s.label(ox + 430, oy + 278, '24006', {
      size: 15,
      family: 'mono',
      color: C.green.s,
      parent: p.id,
    })
    s.label(ox + 280, oy + 160, 'SRGB base 16000', { size: 15, color: C.muted, parent: p.id })
  }

  const w4 = (W - 3 * G) / 4
  const r2 = s.row(0, r1.bottom + G, G, [
    {
      w: w4,
      title: 'Adj-SIDs are local',
      color: C.purple,
      body: [
        'In Example 4, P2→P1 is 24000 and P1→P2 is 24000 too. That is fine: each router only reads its own Adj-SIDs, so the same number means a different link on each router.',
      ],
    },
    {
      w: w4,
      title: 'Bundles: one per link (A10)',
      color: C.teal,
      body: [
        'Example 7, router S: S–A 24000, S–E 24001, S–E#2 24002. Each link of a bundle is its own adjacency, so an Adj-SID segment names its link (D29).',
      ],
    },
    {
      w: w4,
      title: 'Skipping used labels',
      color: C.orange,
      body: [
        'Engine run on a copy of Example 3 with B→C set to 24000 in the file: B’s auto label for B→A moves from 24000 to 24001, so B never has two links on one label (D18).',
      ],
    },
    {
      w: w4,
      title: 'Edge cases',
      color: C.gray,
      body: [
        '•  One SRGB on every router: per-router SRGBs are not modelled (D9).\n•  Stacks are shown before penultimate-hop popping (A7).\n•  SRv6 uses SIDs, not labels (A25).',
      ],
    },
  ])

  const t = s.panel(0, r2.bottom + G, W, {
    title: 'Takeaway',
    color: C.yellow,
    body: [
      'A Prefix-SID label is the same on every router: 16000 + the router’s SID index, so B is 16004 everywhere. An Adj-SID is a router’s own name for one of its links: taken from the file, or numbered from 24000 in neighbor-ID order. That is why Example 3’s repair reads 16004, 24005, 16002.',
    ],
  })
  s.text(
    0,
    t.y + t.h + 14,
    'Sources: docs/02-algorithms.md §4.3, §6 (Example 3), §9  ·  docs/learn/06-segment-routing.md  ·  DECISIONS.md D9, D18, D29  ·  examples/03-ring5-highmetric.yaml, 04-isp-core.yaml, 07-parallel.yaml',
    { size: 16, color: C.muted, maxW: W },
  )
  return s
}

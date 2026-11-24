// B15 · Greedy segment walk (docs/02-algorithms.md §4.2, RFC 9855 §5), drawn on
// Example 4 (examples/04-isp-core.yaml): PE1 → P1, link PE1–P1 fails. From P2 no
// Prefix-SID works, so the walk forces the link with Adj-SID(P2→P1).
import { Scene, C } from '../lib/scene.mjs'

export default function draw() {
  const s = new Scene('b15')
  const W = 1640
  const G = 20

  s.text(0, 0, 'B15 · Greedy segment walk: jump as far as a Prefix-SID safely goes', {
    size: 40,
    color: C.blue.s,
  })
  s.text(
    0,
    58,
    '§4.2 of docs/02-algorithms.md  ·  RFC 9855 §5, §6  ·  RFC 8402 (Prefix-SID, Adj-SID)  ·  code: src/engine/tilfa.ts (segment walk)',
    { size: 18, color: C.muted, maxW: W },
  )

  const r1 = s.row(0, 110, G, [
    {
      w: 600,
      title: 'Example 4: PE1 → P1, link PE1–P1 fails',
      color: C.blue,
      drawH: 400,
      body: [
        {
          note: 'Red dashed: the failed link PE1–P1. PE2 (off P3 and P4) is not drawn.',
          color: C.red.s,
        },
        {
          note: 'Green: the post-convergence path PE1 → P2 → P1 (10 + 30 = 40, B14).',
          color: C.green.s,
        },
        {
          note: 'Orange: P2’s own (old) path to P1 is P2 → PE1 → P1 (20). It crosses the failed link, so PrefixSID(P1) from P2 would loop back. The walk forces the link P2 → P1 instead.',
          color: C.orange.s,
        },
      ],
    },
    {
      w: W - 600 - G,
      title: 'The rule: from where you are, take the furthest safe Prefix-SID',
      color: C.blue,
      body: [
        {
          mono: [
            'current = S',
            'while current ≠ D:',
            '  Y = furthest router on the path after current with',
            '      (a) dist(current,Y) = path cost current → Y',
            '      (b) every old shortest path current → Y avoids S–E  (B1)',
            '  found?  PrefixSID(Y),               current = Y',
            '  none?   AdjSID(current → next hop), current = next hop',
          ].join('\n'),
          size: 15,
        },
        '•  Only S has switched to the repair. Every other router still uses its old table, and a Prefix-SID follows that table. So a segment is safe only if all old paths to its end avoid the failed link.\n•  Furthest first: fewer segments, fewer labels. An Adj-SID moves one hop, so the walk always ends.',
        { head: 'Example 4, step by step (from the engine)' },
        {
          mono: [
            'From  Try Y  (a) dist = path?    (b) dist < dist(X,S) + c(S,E) + dist(E,Y)   Segment',
            '----  -----  ------------------  ------------------------------------------  ----------------',
            'PE1   P1     10 vs 40   ✗        10 < 0 + 10 + 0  = 10   ✗',
            'PE1   P2     10 = 10    ✓        10 < 0 + 10 + 20 = 30   ✓                   PrefixSID(P2)',
            'P2    P1     20 vs 30   ✗        20 < 10 + 10 + 0 = 20   ✗                   AdjSID(P2→P1)',
          ].join('\n'),
          size: 14,
        },
        {
          mono: 'walk      [PrefixSID(P2), AdjSID(P2→P1)]\nclean-up  drop PrefixSID(P2): it only reaches the first hop  (B16)\nend       add PrefixSID(P1), the destination’s own label       (B17)\nresult    [AdjSID(P2→P1), PrefixSID(P1)] = 24000, 16001, out via P2',
          size: 14,
          color: C.green.s,
        },
        { head: 'Example 3, S → C (ring, B–C = 10): a jump, then a forced link' },
        {
          mono: [
            'S    C   2 vs 12  ✗   2 < 0 + 1 + 1 = 2   ✗',
            'S    B   2 = 2    ✓   2 < 0 + 1 + 3 = 4   ✓   PrefixSID(B)',
            'B    C   4 vs 10  ✗   4 < 2 + 1 + 1 = 4   ✗   AdjSID(B→C)   (B’s old path B → A → S → E → C)',
            '→  [PrefixSID(B), AdjSID(B→C), PrefixSID(C)] = 16004, 24005, 16005',
          ].join('\n'),
          size: 14,
        },
      ],
    },
  ])

  {
    const p = r1.panels[0]
    const ox = p.drawX
    const oy = p.drawY
    const o = { parent: p.id, r: 30 }
    const PE1 = s.router('PE1', ox + 50, oy + 195, { ...o, bold: true })
    const P1 = s.router('P1', ox + 220, oy + 60, { ...o, color: C.purple })
    const P2 = s.router('P2', ox + 220, oy + 330, { ...o, color: C.green })
    const P3 = s.router('P3', ox + 430, oy + 60, o)
    const P4 = s.router('P4', ox + 430, oy + 330, o)
    s.link(PE1, P1, 10, { parent: p.id, side: -1, color: C.red.s, width: 3, dashed: true })
    s.link(PE1, P2, 10, { parent: p.id, side: 1, color: C.green.s, width: 4, arrow: true })
    s.link(P2, P1, 30, { parent: p.id, side: 1, color: C.green.s, width: 4, arrow: true })
    s.link(P1, P3, 10, { parent: p.id, side: -1 })
    s.link(P2, P4, 10, { parent: p.id, side: 1 })
    s.link(P3, P4, 30, { parent: p.id, side: -1 })
    s.link(P1, P4, '20 / 40', { parent: p.id, side: -1, at: 0.4, msize: 17 })
    const tag = (r, dx, dy, t, col, fam = 'sans') =>
      s.label(r.cx + dx, r.cy + dy, t, { size: 15, color: col, parent: p.id, family: fam })
    tag(PE1, 0, -50, 'S', C.muted)
    tag(P1, 0, -48, 'destination', C.purple.s)
    tag(P2, 0, 48, 'PrefixSID(P2): reach P2 first', C.green.s)
    s.label(ox + 295, oy + 268, 'AdjSID(P2→P1)', {
      size: 15,
      family: 'mono',
      color: C.green.s,
      parent: p.id,
    })
    s.label(ox + 60, oy + 15, 'P2’s old path:', { size: 14, color: C.orange.s, parent: p.id })
    s.label(ox + 60, oy + 35, 'P2 → PE1 → P1', { size: 14, color: C.orange.s, parent: p.id })
  }

  const w3 = (W - 2 * G) / 3
  const r2 = s.row(0, r1.bottom + G, G, [
    {
      w: w3,
      title: 'Why check (b), and why (a)',
      color: C.green,
      body: [
        '(b) is what keeps the repair loop-free: the routers along a segment haven’t switched, so the segment must work on their old tables. It is B1 with X = current (node mode: B19).',
        {
          note: '(a) always holds when (b) does. It is kept because it makes the Explain steps easier to follow.',
        },
      ],
    },
    {
      w: w3,
      title: 'How many labels',
      color: C.orange,
      body: [
        {
          mono: '0  first hop is an LFA (Ex. 1)\n1  a PQ node on the path (Ex. 2),\n   or one Adj-SID (Ex. 4)\n2  P and Q adjacent: Prefix + Adj\n   (Ex. 3)\n3+ rare, long detours',
          size: 14,
        },
        { note: 'Extra labels = segments − 1 (B17). MSD limits the total (A15).' },
      ],
    },
    {
      w: w3,
      title: 'Guarantees',
      color: C.gray,
      body: [
        '•  Ends: every step moves at least one hop.\n•  Loop-free and costs exactly the post-convergence cost: each Prefix segment follows old paths that avoid S–E and cost the same. A property test checks it on random networks.\n•  Adj-SID labels: B18.',
      ],
    },
  ])

  const t = s.panel(0, r2.bottom + G, W, {
    title: 'Takeaway',
    color: C.yellow,
    body: [
      'Walk along the post-convergence path and, from where you are, jump to the furthest router whose old shortest paths all avoid the failed link (a Prefix-SID). If not even the next router qualifies, force that one link with an Adj-SID. In Example 4 that gives PrefixSID(P2), then AdjSID(P2→P1).',
    ],
  })
  s.text(
    0,
    t.y + t.h + 14,
    'Sources: docs/02-algorithms.md §4.2, §6 (Example 3)  ·  docs/learn/07-ti-lfa.md (Step 2)  ·  examples/04-isp-core.yaml, 03-ring5-highmetric.yaml  ·  checked with computeForSource()',
    { size: 16, color: C.muted, maxW: W },
  )
  return s
}

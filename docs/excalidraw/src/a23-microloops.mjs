// A23 · Microloops (docs/02-algorithms.md §22), drawn on Example 2
// (examples/02-ring5.yaml) with link S–E failed, traffic to E.
import { Scene, C } from '../lib/scene.mjs'

export default function draw() {
  const s = new Scene('a23')
  const W = 1640
  const G = 20

  s.text(0, 0, 'A23 · Microloops: while the routers update one by one', {
    size: 40,
    color: C.blue.s,
  })
  s.text(
    0,
    58,
    '§22 of docs/02-algorithms.md  ·  RFC 5715 §1, RFC 8333 (local convergence delay)  ·  code: src/engine/microloop.ts',
    { size: 18, color: C.muted, maxW: W },
  )

  const r1 = s.row(0, 110, G, [
    {
      w: 600,
      title: 'Example 2, S–E fails, traffic to E',
      color: C.blue,
      drawH: 430,
      body: [
        { note: 'All metrics 1. Red dashed: the failed link S–E.', color: C.red.s },
        {
          note: 'Blue: old next hops (normal tables). Green: new next hops (SPF without S–E).',
          color: C.ink,
        },
        { note: 'Orange: the loop A → S → A, if S updates before A.', color: C.orange.s },
        { note: 'B and C keep their next hops (B → C, C → E); only S and A change.' },
      ],
    },
    {
      w: W - 600 - G,
      title: 'How it works: mix old and new next hops, look for a cycle',
      color: C.blue,
      body: [
        'After FRR, every router runs SPF and updates its table on its own time. Old next hops = the normal tables; new = the SPF without what is down (both with the lowest-id tie-break).',
        '•  Each router R ≠ D is on its old next hop (waiting) or its new one (updated).\n•  A PLR (its old next hop is over the failure) has only its new one: until it updates, its FRR repair carries the traffic past the others’ tables.\n•  Old ones alone never loop, nor new ones alone (both are SPF). So every loop needs some routers updated and some waiting.\n•  Found breadth-first from each router whose next hop changes, so loops are short. A loop found twice is listed once, starting at its lowest id.',
        { head: 'Example 2, to E' },
        {
          mono: [
            'Router  Old next hop        New next hop',
            '------  ------------------  --------------------',
            'S       E (over S–E: PLR)   A   S-A-B-C-E = 4',
            'A       S   A-S-E = 2 < 3   B   A-B-C-E = 3',
            'B       C   B-C-E = 2       C',
            'C       E                   E',
          ].join('\n'),
          size: 15,
        },
        {
          mono: 'S updated (→ A), A waiting (→ S):  A → S → A\nS is a PLR among the updated: plrEarly = yes',
          color: C.orange.s,
        },
        {
          note: 'UI, failure panel: "To E: A → S → A, if S updates before A". Example 2 has 6 changed next hops in all.',
        },
      ],
    },
  ])

  {
    const p = r1.panels[0]
    const ox = p.drawX
    const oy = p.drawY
    const o = { parent: p.id }
    const S = s.router('S', ox + 70, oy + 170, { ...o, bold: true })
    const E = s.router('E', ox + 270, oy + 70, { ...o, color: C.purple })
    const Cn = s.router('C', ox + 480, oy + 170, o)
    const B = s.router('B', ox + 390, oy + 380, o)
    const A = s.router('A', ox + 150, oy + 380, o)
    s.link(S, E, 1, { ...o, side: 1, color: C.red.s, width: 3, dashed: true })
    s.link(Cn, E, null, { ...o, color: C.blue.s, width: 4, arrow: true })
    s.link(B, Cn, null, { ...o, color: C.blue.s, width: 4, arrow: true })
    s.link(A, B, null, { ...o, color: C.green.s, width: 4, arrow: true })
    s.link(S, A, null, { ...o, color: C.orange.s, width: 5, arrow: 'both' })
    const tag = (x, y, t, color) => s.label(x, y, t, { size: 15, color, parent: p.id })
    tag(E.cx, E.cy - 52, 'destination', C.purple.s)
    tag(Cn.cx - 10, Cn.cy - 52, 'C → E, unchanged', C.blue.s)
    tag(B.cx + 104, B.cy + 30, 'B → C, unchanged', C.blue.s)
    tag(ox + 270, oy + 405, 'A new → B', C.green.s)
    tag(ox + 40, oy + 255, 'S new → A', C.orange.s)
    tag(ox + 40, oy + 278, 'A old → S', C.orange.s)
    tag(S.cx + 4, S.cy - 52, 'PLR', C.muted)
  }

  const w3 = (W - 2 * G) / 3
  const r2 = s.row(0, r1.bottom + G, G, [
    {
      w: w3,
      title: 'Local convergence delay',
      color: C.green,
      body: [
        'RFC 8333: after a link goes down, the PLR stays on its FRR repair for a while, so the others update first. That avoids every loop that needs a PLR to update early (plrEarly).',
        {
          mono: 'Ex. 2, S–E   to E: A → S → A   PLR S  avoided\n             to S: C → E → C   PLR E  avoided\nEx. 1, S–E   to S: D → E → D   PLR E  avoided',
          size: 14,
        },
      ],
    },
    {
      w: w3,
      title: 'A loop away from the PLR',
      color: C.red,
      body: [
        'S–E 1, E–D 1, S–A 1, A–D 5. E–D fails, so E is the PLR. To D:',
        {
          mono: 'A → S → A  S updated, A waiting\n           (A old: A-S-E-D 3 < 5)\n           no PLR in it: not avoided\nE → S → E  E updated early: avoided',
          size: 14,
        },
        { note: 'The §22 table lists only the first loop; the engine finds both.' },
      ],
    },
    {
      w: w3,
      title: 'What it doesn’t do',
      color: C.gray,
      body: [
        'It lists the loops some update order can make; it doesn’t time the updates or pick an order. Loops away from a PLR need ordered FIB updates (RFC 6976), which aren’t modelled.',
        {
          note: 'A property test: every loop is a closed cycle of neighbors that never passes D and has a router that updated.',
        },
      ],
    },
  ])

  const t = s.panel(0, r2.bottom + G, W, {
    title: 'Takeaway',
    color: C.yellow,
    body: [
      'A microloop is two or more routers sending traffic back and forth because some have updated their tables and some haven’t. In Example 2, if S updates before A, traffic to E goes A → S → A. Keeping the PLR on its repair (local delay) avoids it; a loop that doesn’t involve the PLR needs another fix.',
    ],
  })
  s.text(
    0,
    t.y + t.h + 14,
    'Sources: docs/02-algorithms.md §22  ·  docs/learn/03-when-a-link-fails.md, 11-advanced-topics.md  ·  examples/02-ring5.yaml, 01-square.yaml  ·  checked with microloops()',
    { size: 16, color: C.muted, maxW: W },
  )
  return s
}

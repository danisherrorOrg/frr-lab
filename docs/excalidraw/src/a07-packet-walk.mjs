// A7 · Packet walk (docs/02-algorithms.md §4.5, RFC 8660), drawn on Example 3
// (examples/03-ring5-highmetric.yaml), S → E with link S–E failed, PHP on.
import { Scene, C } from '../lib/scene.mjs'

export default function draw() {
  const s = new Scene('a07')
  const W = 1640
  const G = 20

  s.text(0, 0, 'A7 · Packet walk: the label stack hop by hop', { size: 40, color: C.blue.s })
  s.text(
    0,
    58,
    '§4.5 of docs/02-algorithms.md  ·  RFC 8660, RFC 9855 §5  ·  follow one packet along the TI-LFA repair  ·  code: src/engine/packet-walk.ts',
    { size: 18, color: C.muted, maxW: W },
  )

  // ── Row 1: the repair drawn in a line, with the stack on each link ────
  const top = s.panel(0, 110, W, {
    title: 'Example 3: S → E after S–E fails. Repair [16004, 24005, 16002] out to A, PHP on',
    color: C.blue,
    drawH: 290,
    body: [
      {
        note: 'Under each link: the label stack on the wire, top first. Blue = Prefix-SID, orange = Adj-SID, purple = the destination’s own label (16002 = E).',
      },
      {
        note: 'Under each router: what it does with the top label. Green arrows: the repair path (cost 1 + 1 + 10 + 1 = 13). Red dashed: the failed link S–E.',
      },
    ],
  })
  {
    const ox = top.drawX
    const oy = top.drawY
    const cy = oy + 130
    const xs = [120, 450, 780, 1110, 1440].map((x) => ox + x)
    const ids = ['S', 'A', 'B', 'C', 'E']
    const R = ids.map((id, i) =>
      s.router(id, xs[i], cy, {
        parent: top.id,
        bold: id === 'S',
        color: id === 'E' ? C.purple : C.blue,
      }),
    )
    // The failed direct link S–E, drawn as an arc over the chain.
    const arcY = oy + 42
    s.line(
      [
        [xs[0], cy - 36],
        [xs[0], arcY],
        [xs[4], arcY],
        [xs[4], cy - 36],
      ],
      {
        stroke: C.red.s,
        strokeWidth: 3,
        dashed: true,
        parent: top.id,
        ends: [R[0].eid, R[4].eid],
      },
    )
    s.label(ox + 780, arcY - 20, 'failed link S–E (metric 1)', {
      size: 17,
      color: C.red.s,
      parent: top.id,
    })
    const metrics = [1, 1, 10, 1]
    for (let i = 0; i < 4; i++)
      s.link(R[i], R[i + 1], metrics[i], {
        parent: top.id,
        side: -1,
        color: C.green.s,
        width: 4,
        arrow: true,
        mcolor: metrics[i] === 10 ? C.orange.s : C.ink,
      })

    // Label stacks on the wire.
    const P = { label: '', color: C.blue }
    const stacks = [
      [
        { ...P, label: '16004' },
        { label: '24005', color: C.orange },
        { label: '16002', color: C.purple },
      ],
      [
        { label: '24005', color: C.orange },
        { label: '16002', color: C.purple },
      ],
      [{ label: '16002', color: C.purple }],
      [],
    ]
    const bw = 104
    const bh = 32
    stacks.forEach((st, i) => {
      const mx = (xs[i] + xs[i + 1]) / 2
      const y0 = cy + 44
      if (st.length === 0) {
        s.label(mx, y0 + bh / 2, 'plain IP', { size: 17, color: C.muted, parent: top.id })
        return
      }
      st.forEach((b, k) => {
        const y = y0 + k * (bh + 5)
        const id = s.rect(mx - bw / 2, y, bw, bh, {
          stroke: b.color.s,
          fill: b.color.f,
          parent: top.id,
          sharp: true,
        })
        s.label(mx, y + bh / 2, b.label, {
          size: 18,
          family: 'mono',
          color: b.color.s,
          parent: id,
        })
      })
    })

    // What each router does.
    const acts = [
      'gets 16002\npush 16004, 24005\nout to A',
      '16004 = B: to B\n1 + 0 = 1 ✓\nPHP: pop 16004',
      'own Adj-SID 24005:\npop, send on\nB → C',
      '16002 = E: to E\n1 + 0 = 1 ✓\nPHP: pop 16002',
      'no labels left\ndeliver',
    ]
    acts.forEach((a, i) =>
      s.text(xs[i] - 78, cy + 48, a, { size: 16, color: C.ink, parent: top.id, w: 156 }),
    )
  }

  // ── Row 2: the table and the rules ────────────────────────────────────
  const r2 = s.row(0, top.y + top.h + G, G, [
    {
      w: 880,
      title: 'Hop by hop (what packetWalk() records)',
      color: C.teal,
      body: [
        {
          mono: [
            'Router  Arrives with        Does                                      Leaves with',
            '------  ------------------  ----------------------------------------  -----------------',
            'S       16002               push 16004, 24005; out of the repair      16004 24005 16002',
            '                            link to A (S doesn’t read the top label)',
            'A       16004 24005 16002   16004 is B’s: forward to B,               24005 16002',
            '                            c(A,B) + dist(B,B) = 1 + 0 = dist(A,B) ✓',
            '                            next router is B, so PHP pops 16004',
            'B       24005 16002         its own Adj-SID: pop, send on B→C (10)    16002',
            'C       16002               16002 is E’s: forward to E, 1 + 0 = 1 ✓   no labels',
            '                            next router is E, so PHP pops 16002',
            'E       no labels           deliver                                   –',
          ].join('\n'),
          size: 15,
        },
        { note: 'Total 1 + 1 + 10 + 1 = 13: exactly the post-convergence cost of A5.' },
      ],
    },
    {
      w: W - 880 - G,
      title: 'The rules each router follows',
      color: C.blue,
      body: [
        { head: 'At S (the repairing router)' },
        'The packet already carries D’s label. S pushes the rest of the segment list on top and sends it out of the repair link (RFC 9855 §5).',
        { head: 'Every other router R reads the top label' },
        '•  its own Prefix-SID: pop it, read the next one\n•  its own Adj-SID R→X: pop it, send on that link, whatever its table says (RFC 8402 §3.4)\n•  router Y’s Prefix-SID: forward on its normal table, checked by\n   c(R,next) + dist(next,Y) = dist(R,Y)',
        { head: 'PHP (on by default)' },
        'If the top label is the next router’s own Prefix-SID, pop it before sending (RFC 8660 §2). So D gets a plain IP packet.',
      ],
    },
  ])

  // ── Row 3: variants and notes ─────────────────────────────────────────
  const w3 = (W - 2 * G) / 3
  const r3 = s.row(0, r2.bottom + G, G, [
    {
      w: w3,
      title: 'With PHP off',
      color: C.orange,
      body: [
        'Each segment’s end router pops its own label:',
        '•  A sends all three labels to B.\n•  B pops 16004 (its own), then its Adj-SID 24005.\n•  C forwards 16002 to E.\n•  E pops 16002 and delivers.',
        { note: 'Same path, same cost 13.' },
      ],
    },
    {
      w: w3,
      title: 'Primary path walk (Example 2, S → C)',
      color: C.green,
      body: [
        'Nothing has failed, so every router, S too, forwards on D’s Prefix-SID.',
        {
          mono: 'S: 16005 → E   1 + 1 = 2 = dist(S,C) ✓\nE: next is C → PHP pop 16005\nC: plain packet, delivered    total 2',
          size: 15,
        },
        { note: 'The detail panel lets you pick "Primary path" or "TI-LFA backup".' },
      ],
    },
    {
      w: w3,
      title: 'What the walk is and isn’t',
      color: C.gray,
      body: [
        'A teaching view: it changes no result. It ends at D with no labels left.',
        'With ECMP a real router may pick another equal-cost next hop; the walk shows the one on the post-convergence path.',
        { note: 'Labels: Prefix-SID = 16000 + index, Adj-SIDs from 24000 (B18).' },
      ],
    },
  ])

  // ── Takeaway ──────────────────────────────────────────────────────────
  const t = s.panel(0, r3.bottom + G, W, {
    title: 'Takeaway',
    color: C.yellow,
    body: [
      'Only S does anything special: it pushes the labels. Every other router just reads the top label and uses its normal table (or its own Adj-SID). The labels do the steering, and the metrics walked add up to the post-convergence cost.',
    ],
  })
  s.text(
    0,
    t.y + t.h + 14,
    'Sources: docs/02-algorithms.md §4.5  ·  docs/learn/06-segment-routing.md, 07-ti-lfa.md  ·  examples/03-ring5-highmetric.yaml, 02-ring5.yaml',
    { size: 16, color: C.muted },
  )
  return s
}

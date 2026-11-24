// A21 · LAN links / pseudonodes (docs/02-algorithms.md §20), drawn on the LAN part
// of Example 10 (examples/10-lan-levels.yaml): R2 → R4 over LAN1.
import { Scene, C } from '../lib/scene.mjs'

export default function draw() {
  const s = new Scene('a21')
  const W = 1640
  const G = 20

  s.text(0, 0, 'A21 · LAN links: one interface, several neighbors', { size: 40, color: C.blue.s })
  s.text(
    0,
    58,
    '§20 of docs/02-algorithms.md  ·  ISO 10589 §7.2.3 (pseudonode), RFC 5286 §3.6, RFC 8667 §2.2.2  ·  code: src/engine/lan.ts',
    { size: 18, color: C.muted, maxW: W },
  )

  const r1 = s.row(0, 110, G, [
    {
      w: 600,
      title: 'Example 10: LAN1 = {R2, R3, R4}, R2 → R4',
      color: C.blue,
      drawH: 400,
      body: [
        {
          note: 'Square: the pseudonode of LAN1. Each member reaches it at 10, and it reaches each member at 0.',
        },
        { note: 'Blue: R2’s normal path to R4, over the LAN (10).', color: C.blue.s },
        { note: 'Red dashed: R2’s interface to the LAN. It fails as a whole.', color: C.red.s },
        { note: 'Green: LFA and TI-LFA, R2 →(15)→ R3 →(LAN, 10)→ R4 = 25.', color: C.green.s },
      ],
    },
    {
      w: W - 600 - G,
      title: 'How it works: point-to-point maths, with a fate group',
      color: C.blue,
      body: [
        { head: 'Model' },
        'Each pair of members gets a link LAN1:A-B. A → pseudonode → B costs m_A + 0, so:',
        {
          mono: 'c(A,B) = m_A      c(B,A) = m_B\nLAN1:R2-R3, LAN1:R2-R4, LAN1:R3-R4, each 10 both ways',
        },
        'Distances, first hops and ECMP are the pseudonode’s exactly, and no fake router enters any space, path or label stack. Adj-SIDs are per neighbor on the LAN (LAN-Adj-SIDs).',
        { head: 'What fails: S’s whole interface to the LAN' },
        'Protecting LAN1:R2-R4 means R2’s interface fails, so its other LAN links fail too: the fate group is {LAN1:R2-R3}.',
        '•  LFA: a candidate over the same LAN is skipped (reason same-lan, RFC 5286 §3.6). A candidate’s own path may cross the LAN between other members.\n•  ECMP: another next hop on the same LAN is no protector.\n•  Remote LFA: P(S) also needs S’s path to avoid its other LAN links, which are never a tunnel exit. Q-space is unchanged.\n•  TI-LFA: the post-convergence SPF removes the whole interface, and every segment must avoid it, as for an SRLG (A19).',
        { head: 'R2 → R4: the candidates' },
        {
          mono: [
            'R3 over LAN1:R2-R3   skipped: same LAN as the protected link (as plain links it would win: 20)',
            'R1 over R1–R2        dist(R1,R4)=20 < dist(R1,R2)+dist(R2,R4) = 10+10 = 20 ✗  (tie)',
            'R3 over R2–R3        dist(R3,R4)=10 < dist(R3,R2)+dist(R2,R4) = 10+10 = 20 ✓  cost 15+10 = 25',
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
    const o = { parent: p.id }
    const R1 = s.router('R1', ox + 40, oy + 200, o)
    const R2 = s.router('R2', ox + 190, oy + 50, { ...o, bold: true })
    const R3 = s.router('R3', ox + 190, oy + 350, { ...o, color: C.green })
    const R4 = s.router('R4', ox + 460, oy + 200, { ...o, color: C.purple })
    const R5 = s.router('R5', ox + 460, oy + 350, o)
    const h = 15
    const lx = ox + 330
    const ly = oy + 200
    const lid = s.rect(lx - h, ly - h, 2 * h, 2 * h, {
      stroke: C.ink,
      fill: C.gray.f,
      parent: p.id,
      sharp: true,
    })
    const LAN = { id: 'LAN1', eid: lid, cx: lx, cy: ly, r: h + 2 }
    s.label(lx, ly + 34, 'LAN1', { size: 16, color: C.ink, parent: p.id })
    s.link(R1, R2, 10, { ...o, side: -1 })
    s.link(R1, R3, 10, { ...o, side: 1 })
    s.link(R2, R3, 15, { ...o, side: 1, color: C.green.s, width: 4, arrow: true })
    s.link(R3, R4, 30, { ...o, side: 1 })
    s.link(R4, R5, 10, { ...o, side: -1 })
    s.link(R2, LAN, 10, { ...o, side: -1, color: C.red.s, width: 3, dashed: true })
    s.link(R3, LAN, 10, { ...o, side: -1, color: C.green.s, width: 4, arrow: true })
    s.link(LAN, R4, 10, { ...o, side: -1, color: C.blue.s, width: 4, arrow: true })
    s.label(R2.cx + 80, R2.cy, 'source', { size: 16, color: C.muted, parent: p.id })
    s.label(R4.cx, R4.cy - 52, 'destination', { size: 16, color: C.purple.s, parent: p.id })
  }

  const w3 = (W - 2 * G) / 3
  const r2 = s.row(0, r1.bottom + G, G, [
    {
      w: w3,
      title: 'TI-LFA for R2 → R4',
      color: C.green,
      body: [
        'Post-convergence path with LAN1:R2-R4 and LAN1:R2-R3 removed: R2 → R3 → R4 (25).',
        {
          mono: 'From R2, R3: 10 over the LAN ≠ path 15 ✗\n  → Adj-SID(R2→R3 over R2-R3)\nFrom R3, R4: 10 < 10+10+0 ✓ → Prefix R4\nAdj-SID dropped: R3 is the first hop\n[PrefixSID(R4)] = 16004, out on R2–R3',
          size: 14,
        },
      ],
    },
    {
      w: w3,
      title: 'In the simulation',
      color: C.red,
      body: [
        'The fail-link tool on a spoke fails the member’s whole interface (all its LAN links). Failing one LAN link by id fails only that adjacency.',
        {
          mono: 'Fail R2’s interface:\nLFA and TI-LFA deliver on\nR2-R3-R4 (25) in one repair',
          size: 15,
        },
      ],
    },
    {
      w: w3,
      title: 'What the plan covers',
      color: C.gray,
      body: [
        'Every router plans for its own interface failing. If another member’s interface fails (only its adjacencies go), that is a different failure: the plan doesn’t cover it, and the simulation shows what happens.',
        { note: 'In node mode (A6) the failure is router E, so S’s interface stays up.' },
      ],
    },
  ])

  const t = s.panel(0, r2.bottom + G, W, {
    title: 'Takeaway',
    color: C.yellow,
    body: [
      'A LAN is one interface with several neighbors behind it. LFA Lab models it as point-to-point links through a pseudonode, but when S protects one LAN neighbor, S’s whole interface counts as failed. So R3 across the same LAN is no backup for R2; R3 over the separate R2–R3 link is.',
    ],
  })
  s.text(
    0,
    t.y + t.h + 14,
    'Sources: docs/02-algorithms.md §20  ·  docs/learn/11-advanced-topics.md  ·  examples/10-lan-levels.yaml  ·  checked with computeForSource()',
    { size: 16, color: C.muted, maxW: W },
  )
  return s
}

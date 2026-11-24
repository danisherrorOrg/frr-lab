// B12 · Node-protecting PQ (docs/02-algorithms.md §3.1, RFC 8102 §2), drawn on the
// ring of §8.1's worked check (ring S–E–C–B–A–S all 1, plus D on E (1) and C (4)),
// with protection: node. No PQ node passes, so Remote LFA falls back to link protection.
// Example 8 (examples/08-node-protection.yaml) and Example 4 are the cases that pass.
import { Scene, C } from '../lib/scene.mjs'

export default function draw() {
  const s = new Scene('b12')
  const W = 1640
  const G = 20

  s.text(0, 0, 'B12 · Node-protecting PQ: the whole repair avoids router E', {
    size: 40,
    color: C.blue.s,
  })
  s.text(
    0,
    58,
    '§3.1 of docs/02-algorithms.md  ·  RFC 8102 §2.2.2, §2.2.6.2, §2.3.2, §2.3.4  ·  RFC 7490 §5.4  ·  DECISIONS.md D51  ·  code: src/engine/rlfa.ts (nodeRlfa)',
    { size: 18, color: C.muted, maxW: W },
  )

  const r1 = s.row(0, 110, G, [
    {
      w: 600,
      title: 'The §8.1 ring with D behind E, S → D, protection: node',
      color: C.blue,
      drawH: 400,
      body: [
        {
          note: 'Ring S–E–C–B–A–S, every link 1, plus E–D 1 and C–D 4. No LFA for D. Link PQ = {B, C}, best B.',
        },
        { note: 'Red dashed: router E, the one to protect against.', color: C.red.s },
        { note: 'Green: the tunnel S → A → B avoids E (check 1 ✓).', color: C.green.s },
        {
          note: 'Red arrows: B’s own path to D is B → C → E → D (3), through E. C’s path C → E → D is too (check 2 ✗).',
          color: C.red.s,
        },
        {
          note: 'No node-protecting PQ node: Remote LFA falls back to link PQ B (protects = link).',
        },
      ],
    },
    {
      w: W - 600 - G,
      title: 'The rule: three checks for each Y in Q-space',
      color: C.blue,
      body: [
        {
          mono: [
            '1  the tunnel to Y avoids E (node P-space):',
            '     S’s own path:  dist(S,Y) < dist(S,E) + dist(E,Y)',
            '     or via N ≠ E:  dist(N,Y) < dist(N,E) + dist(E,Y)  and  dist(N,Y) < dist(N,S) + dist(S,Y)',
            '2  Y’s own path to D avoids E:  dist(Y,D) < dist(Y,E) + dist(E,D)',
            '3  Y doesn’t have the overload bit',
            'best = lowest cost from S (cheapest way in of check 1), then lowest router id',
          ].join('\n'),
          size: 15,
        },
        '•  Link mode only asks that the repair avoid the link S–E. If router E fails, the PQ node’s path to D may still run through E.\n•  Check 2 depends on D, so node mode is worked out per (D, link) and only when D ≠ E.\n•  Ties count as "may use E", as in B5.',
        { head: 'Worked checks (from the engine)' },
        {
          mono: [
            'Case          Y     1 tunnel avoids E          2 path to D avoids E   Result',
            '------------  ----  -------------------------  ---------------------  ----------',
            '§8.1 ring     B     own: 2 < 1 + 2 = 3   ✓     3 < 2 + 1 = 3   ✗      ✗',
            '  S → D       C     via A: 2 < 2 + 1 = 3 ✓     2 < 1 + 1 = 2   ✗      ✗',
            '              D     own: 2 < 1 + 1 = 2   ✗     –                      ✗',
            '8  S → D      B     via N: 3 < 4 + 1 = 5 ✓     3 < 1 + 2 = 3   ✗      ✗',
            '              C     via N: 6 < 4 + 4 = 8 ✓     3 < 4 + 2 = 6   ✓      ✓ cost 8',
            '              D     own 4 < 4 ✗, N 6 < 6 ✗     –                      ✗',
            '4  PE1 → P3   PE2   via P2: 20 < 20+20 ✓       10 < 20 + 10 = 30  ✓   ✓ cost 30',
          ].join('\n'),
          size: 14,
        },
        {
          mono: [
            'Case         Link PQ (B11)   Node PQ   Used               What happens if E fails (A9)',
            '-----------  --------------  --------  -----------------  -----------------------------------',
            '§8.1 ring    {B, C}, B       {}        B (link fallback)  breaks at C; C’s LFA D saves it, cost 7',
            '8            {B, C}, B       {C}       C via N, cost 8    S → N → B → C → D (11) survives',
            '4 PE1→P3     {PE2}           {PE2}     PE2 via P2         the same node either way',
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
    const S = s.router('S', ox + 110, oy + 70, { ...o, bold: true })
    const E = s.router('E', ox + 350, oy + 70, { ...o, color: C.red, dashed: true })
    const D = s.router('D', ox + 520, oy + 150, { ...o, color: C.purple })
    const Cn = s.router('C', ox + 420, oy + 300, { ...o, color: C.red })
    const B = s.router('B', ox + 230, oy + 330, { ...o, color: C.red })
    const A = s.router('A', ox + 50, oy + 260, o)
    s.link(S, E, 1, { parent: p.id, side: -1, color: C.red.s, dashed: true })
    s.link(E, D, 1, { parent: p.id, side: -1, color: C.red.s, width: 4, arrow: true, dashed: true })
    s.link(Cn, E, 1, {
      parent: p.id,
      side: -1,
      color: C.red.s,
      width: 4,
      arrow: true,
      dashed: true,
    })
    s.link(B, Cn, 1, { parent: p.id, side: 1, color: C.red.s, width: 4, arrow: true })
    s.link(Cn, D, 4, { parent: p.id, side: 1 })
    s.link(S, A, 1, { parent: p.id, side: -1, color: C.green.s, width: 4, arrow: true })
    s.link(A, B, 1, { parent: p.id, side: -1, color: C.green.s, width: 4, arrow: true })
    const tag = (r, dx, dy, t, col) =>
      s.label(r.cx + dx, r.cy + dy, t, { size: 16, color: col, parent: p.id })
    tag(S, 0, -50, 'source', C.muted)
    tag(E, 0, -50, 'router E', C.red.s)
    tag(D, 0, -50, 'destination', C.purple.s)
    tag(B, 0, 50, 'link PQ: B', C.red.s)
    tag(Cn, 20, 50, 'PQ: C', C.red.s)
  }

  const w3 = (W - 2 * G) / 3
  const r2 = s.row(0, r1.bottom + G, G, [
    {
      w: w3,
      title: 'Stricter than the RFC, on purpose',
      color: C.orange,
      body: [
        'RFC 8102 §2.2.6.2 states only the first test via N. We also keep the link rule dist(N,Y) < dist(N,S) + dist(S,Y), so the tunnel never comes back through S (D17).',
        { note: 'Keeping both is stricter, never looser (§3.1, D51).' },
      ],
    },
    {
      w: w3,
      title: 'Fallback and when it runs',
      color: C.green,
      body: [
        '•  Only with protection: node, only without an LFA (B13), only when D ≠ E (dest-is-next-hop).\n•  No node PQ: use the link PQ of B11 (protects = link, fallback = none). RFC 8102 gives no rule here (D51).',
      ],
    },
    {
      w: w3,
      title: 'Not modelled',
      color: C.gray,
      body: [
        'RFC 8102 §2.3.3–2.3.4 prefer a PQ node that covers more ECMP next hops. LFA Lab protects each primary link on its own, so it uses cost then id.',
        { note: 'TI-LFA has its own node mode: remove router E entirely (B19).' },
      ],
    },
  ])

  const t = s.panel(0, r2.bottom + G, W, {
    title: 'Takeaway',
    color: C.yellow,
    body: [
      'To survive router E failing, both halves of the repair must avoid E: the tunnel to the PQ node, and the PQ node’s own path to D. In Example 8 that moves the choice from B to C. On the §8.1 ring no PQ node passes, so Remote LFA keeps the link-protecting B.',
    ],
  })
  s.text(
    0,
    t.y + t.h + 14,
    'Sources: docs/02-algorithms.md §3.1, §8.1 (worked check, ring with D)  ·  docs/learn/05-remote-lfa.md (Node protection)  ·  examples/08-node-protection.yaml, 04-isp-core.yaml with protection: node  ·  checked with computeForSource()',
    { size: 16, color: C.muted, maxW: W },
  )
  return s
}

// A4 · Remote LFA, node protection (docs/02-algorithms.md §3.1, RFC 8102), drawn on
// Example 8 (examples/08-node-protection.yaml).
import { Scene, C } from '../lib/scene.mjs'

export default function draw() {
  const s = new Scene('a04')
  const W = 1640
  const G = 20

  s.text(0, 0, 'A4 · Remote LFA: node protection', { size: 40, color: C.blue.s })
  s.text(
    0,
    58,
    '§3.1 of docs/02-algorithms.md  ·  RFC 8102  ·  pick a PQ node whose whole repair also survives router E failing  ·  code: src/engine/rlfa.ts',
    { size: 18, color: C.muted, maxW: W },
  )

  // ── Row 1: the example and the checks ─────────────────────────────────
  const r1 = s.row(0, 110, G, [
    {
      w: 600,
      title: 'Example 8: protect against router E, S → D',
      color: C.blue,
      drawH: 420,
      body: [
        { note: 'S’s normal path to D is S → E → D (cost 2 + 2 = 4).' },
        {
          note: 'Red dashed: router E fails, with all its links. Link-mode PQ node B reaches D over B → E → D, so it breaks.',
          color: C.red.s,
        },
        {
          note: 'Green arrows: the node-protecting repair, tunnel to C out via N, then C → D. Cost 2 + 3 + 3 + 3 = 11.',
          color: C.green.s,
        },
      ],
    },
    {
      w: W - 600 - G,
      title: 'How it works: Remote LFA, then two extra checks per PQ candidate',
      color: C.blue,
      body: [
        { head: '1. No LFA' },
        { mono: 'N:  dist(N,D) < dist(N,S) + dist(S,D)   →   6 < 2 + 4 = 6   fails (tie)' },
        { head: '2. Link-protecting Remote LFA (A3) picks B, which goes through E' },
        {
          mono: 'P(S) = {N}   extended via N = {N, B, C}   Q(E) = {B, C, D}   PQ = {B, C}\nbest = B via N: c(S,N) + dist(N,B) = 2 + 3 = 5     (C via N: 2 + 6 = 8)',
        },
        { head: '3. Node checks for every Y in Q(E) (B12)' },
        {
          mono: [
            'Y   a) tunnel avoids E  (via N)         b) Y’s path to D avoids E           node PQ?',
            '    dist(N,Y) < dist(N,E) + dist(E,Y)   dist(Y,D) < dist(Y,E) + dist(E,D)',
            '--  ----------------------------------  ----------------------------------  --------',
            'B   3 < 4 + 1 = 5   ✓                   3 < 1 + 2 = 3   ✗ (B → E → D)      no',
            'C   6 < 4 + 4 = 8   ✓                   3 < 4 + 2 = 6   ✓                  yes',
            'D   own 4 < 2+2 ✗,  via N 6 < 4+2 ✗      –                                  no',
          ].join('\n'),
        },
        {
          note: 'c) Y must also not have the overload bit set (RFC 7490 §5.4). Ties count as "may use E".',
        },
        { head: '4. Result' },
        'Node-protecting PQ = {C}. Best = C, out via N, cost c(S,N) + dist(N,C) = 2 + 6 = 8. The repair S → N → B → C → D costs 11. If router E fails, it still gets through, where the tunnel to B breaks at B. The row shows rlfa.protects = node.',
      ],
    },
  ])

  // Topology inside the first panel.
  {
    const p = r1.panels[0]
    const ox = p.drawX
    const oy = p.drawY
    const N = s.router('N', ox + 90, oy + 100, { parent: p.id })
    const B = s.router('B', ox + 300, oy + 100, { parent: p.id })
    const Cn = s.router('C', ox + 490, oy + 100, { parent: p.id, color: C.green })
    const S = s.router('S', ox + 90, oy + 320, { parent: p.id, bold: true })
    const E = s.router('E', ox + 300, oy + 320, { parent: p.id, color: C.red, dashed: true })
    const D = s.router('D', ox + 490, oy + 320, { parent: p.id, color: C.purple })
    const red = { parent: p.id, color: C.red.s, width: 3, dashed: true }
    const grn = { parent: p.id, color: C.green.s, width: 4, arrow: true }
    s.link(S, E, 2, { ...red, side: 1 })
    s.link(E, D, 2, { ...red, side: 1 })
    s.link(E, B, 1, { ...red, side: 1 })
    s.link(S, N, 2, { ...grn, side: -1 })
    s.link(N, B, 3, { ...grn, side: -1 })
    s.link(B, Cn, 3, { ...grn, side: -1 })
    s.link(Cn, D, 3, { ...grn, side: -1 })
    const tag = (r, dy, t, color = C.muted) =>
      s.label(r.cx, r.cy + dy, t, { size: 17, color, parent: p.id })
    tag(N, -60, 'exit', C.green.s)
    tag(B, -60, 'link PQ: B → E → D', C.red.s)
    tag(Cn, -60, 'node PQ', C.green.s)
    tag(S, 60, 'source')
    tag(E, 60, 'router E fails', C.red.s)
    tag(D, 60, 'destination', C.purple.s)
  }

  // ── Row 2: rule details ───────────────────────────────────────────────
  const w3 = (W - 2 * G) / 3
  const r2 = s.row(0, r1.bottom + G, G, [
    {
      w: w3,
      title: 'The node checks in full (B12)',
      color: C.red,
      body: [
        'a) The tunnel to Y avoids E. Either S’s own path:',
        { mono: 'dist(S,Y) < dist(S,E) + dist(E,Y)', size: 15 },
        'or through a neighbor N ≠ E (same exits as A3):',
        {
          mono: 'dist(N,Y) < dist(N,E) + dist(E,Y)\nand dist(N,Y) < dist(N,S) + dist(S,Y)',
          size: 15,
        },
        'b) Y’s own path to D avoids E:',
        { mono: 'dist(Y,D) < dist(Y,E) + dist(E,D)', size: 15 },
        'c) Y is not overloaded.',
        {
          note: 'The second test in a) is the link rule of A3. RFC 8102 §2.2.6.2 only states the first; keeping both is stricter, never looser.',
        },
      ],
    },
    {
      w: w3,
      title: 'Choosing and falling back',
      color: C.green,
      body: [
        { head: 'Best node PQ (RFC 8102 §2.3.4)' },
        'Lowest cost from S (the cheapest way in from step a), then lowest router id.',
        { head: 'Which one is installed' },
        '•  There is an LFA: LFA, Remote LFA doesn’t run (B13).\n•  A node PQ exists: use it, protects = node.\n•  None passes: the link PQ of A3, protects = link, fallback = none.\n•  D = E: node protection can’t apply, fallback = dest-is-next-hop.',
        { note: 'RFC 8102 gives no fallback rule; this one keeps the link protected (D51).' },
      ],
    },
    {
      w: w3,
      title: 'How it differs from link mode',
      color: C.orange,
      body: [
        '•  It depends on D: worked out per (D, link S–E), not once per link. Check b) looks at D.',
        '•  It aims at D through a router that avoids E, not just at E.',
        '•  LFAs are not changed. To prefer or require node-protecting LFAs, use the LFA policy (A16).',
        {
          note: 'Not modelled: RFC 8102’s preference for a PQ node that covers more ECMP next hops. LFA Lab protects each primary link on its own.',
        },
        { note: 'Turn it on with protection: node (Topology settings → Node failure).' },
      ],
    },
  ])

  // ── Takeaway ──────────────────────────────────────────────────────────
  const t = s.panel(0, r2.bottom + G, W, {
    title: 'Takeaway',
    color: C.yellow,
    body: [
      'A link-protecting PQ node can still route through router E. Node protection adds two checks (the tunnel avoids E, and the PQ node’s own path to D avoids E), so the repair survives the whole router failing. Here B fails, C passes.',
    ],
  })
  s.text(
    0,
    t.y + t.h + 14,
    'Sources: docs/02-algorithms.md §3.1  ·  docs/learn/05-remote-lfa.md (Node protection)  ·  examples/08-node-protection.yaml',
    { size: 16, color: C.muted },
  )
  return s
}

// A2 · LFA (docs/02-algorithms.md §2, RFC 5286), drawn on Example 1
// (examples/01-square.yaml), with Example 2 (ring) and Example 6 as contrasts.
import { Scene, C } from '../lib/scene.mjs'

export default function draw() {
  const s = new Scene('a02')
  const W = 1640
  const G = 20

  s.text(0, 0, 'A2 · LFA: Loop-Free Alternate', { size: 40, color: C.blue.s })
  s.text(
    0,
    58,
    '§2 of docs/02-algorithms.md  ·  RFC 5286  ·  if link S–E fails, send to another neighbor N that won’t send it back  ·  code: src/engine/lfa.ts',
    { size: 18, color: C.muted, maxW: W },
  )

  // ── Row 1: the example and the three checks ───────────────────────────
  const r1 = s.row(0, 110, G, [
    {
      w: 600,
      title: 'Example 1: the square, protect S–E for D',
      color: C.blue,
      drawH: 420,
      body: [
        { note: 'Blue arrow: the primary path S → E → D (cost 20).', color: C.blue.s },
        { note: 'Red dashed: the failed link S–E.', color: C.red.s },
        {
          note: 'Green arrows: the LFA backup S → N → D (cost 15 + 10 = 25).',
          color: C.green.s,
        },
        { note: 'Purple: the destination D. Black numbers: link metrics.' },
      ],
    },
    {
      w: W - 600 - G,
      title: 'How it works: three checks for each other neighbor N',
      color: C.blue,
      body: [
        {
          head: 'S knows the whole map, so it can check N’s own shortest path to D. All checks use a strict "<".',
        },
        {
          mono: [
            'Check                   Inequality                           Example 1, N',
            '----------------------  -----------------------------------  ---------------------',
            '1 Loop-free (required)  dist(N,D) < dist(N,S) + dist(S,D)    10 < 15 + 20 = 35  ✓',
            '2 Downstream            dist(N,D) < dist(S,D)                10 < 20            ✓',
            '3 Node-protecting       dist(N,D) < dist(N,E) + dist(E,D)    10 < 20 + 10 = 30  ✓',
          ].join('\n'),
        },
        { head: 'What each check means' },
        '1. The right side is N’s cost to D if it went through S. Strictly cheaper ⇒ N doesn’t go back through S, so no loop (B3).\n2. N is closer to D than S. Also stops loops between two routers that both switch to backups at once (B4).\n3. N’s path to D avoids router E, so the backup survives E failing, not only the link (B5).',
        { head: 'The numbers (all-pairs table from A1)' },
        {
          mono: 'dist(N,D) = 10   dist(N,S) = 15   dist(S,D) = 20   dist(E,D) = 10\ndist(N,E) = 20   (N → D → E = 10 + 10 beats N → S → E = 15 + 10)',
        },
        { head: 'Result' },
        'N is a node-protecting, downstream LFA: the best kind. S installs N as the backup next hop for D. When S–E fails, S just sends to N; N forwards on its normal table. No tunnel, no extra label.',
        { head: 'Steps in lfa.ts' },
        '1. SPF gives the primary next hop E for D (A1).\n2. For every other neighbor N (skip excluded ones, B6), test check 1.\n3. Mark the passing ones downstream / node-protecting.\n4. Pick the best one (B7) and install it as the backup next hop.',
      ],
    },
  ])

  // Topology inside the first panel.
  {
    const p = r1.panels[0]
    const ox = p.drawX
    const oy = p.drawY
    const S = s.router('S', ox + 120, oy + 110, { parent: p.id, bold: true })
    const E = s.router('E', ox + 440, oy + 110, { parent: p.id })
    const N = s.router('N', ox + 120, oy + 310, { parent: p.id })
    const D = s.router('D', ox + 440, oy + 310, { parent: p.id, color: C.purple })
    s.link(S, E, 10, { parent: p.id, side: -1, color: C.red.s, width: 3, dashed: true })
    s.link(E, D, 10, { parent: p.id, side: -1, color: C.blue.s, width: 4, arrow: true })
    s.link(S, N, 15, { parent: p.id, side: 1, color: C.green.s, width: 4, arrow: true })
    s.link(N, D, 10, { parent: p.id, side: 1, color: C.green.s, width: 4, arrow: true })
    const tag = (r, dy, t, color = C.muted) =>
      s.label(r.cx, r.cy + dy, t, { size: 17, color, parent: p.id })
    tag(S, -62, 'source')
    tag(E, -62, 'primary next hop', C.blue.s)
    tag(N, 62, 'candidate LFA', C.green.s)
    tag(D, 62, 'destination', C.purple.s)
  }

  // ── Row 2: where it fails, a weaker LFA, and the tie-break ────────────
  const w3 = (W - 2 * G) / 3
  const r2 = s.row(0, r1.bottom + G, G, [
    {
      w: w3,
      title: 'Where LFA fails: the ring (Example 2)',
      color: C.red,
      drawH: 270,
      body: [
        'Ring, every metric 1. Destination E, protect S–E. S’s only other neighbor is A.',
        { mono: 'dist(A,E) < dist(A,S) + dist(S,E)\n    2     <    1     +    1     = 2  ✗' },
        'A tie is not "less". A’s shortest path to E is A → S → E (red arrow): S sends to A, A sends it straight back. No LFA.',
        {
          note: 'For destination C, A works: 2 < 1 + 2 = 3 ✓. Over the whole ring LFA protects 50% of pairs. Remote LFA fixes the rest (A3).',
        },
      ],
    },
    {
      w: w3,
      title: 'Link-only LFA (Example 6)',
      color: C.orange,
      drawH: 270,
      body: [
        'S → D goes via E (cost 2). The only other neighbor N reaches D through E.',
        {
          mono: 'Loop-free   2 < 1 + 2 = 3  ✓\nDownstream  2 < 2          ✗\nNode-prot.  2 < 1 + 1 = 2  ✗',
        },
        'N is an LFA for link S–E, but its path is N → E → D (green). If router E fails, the backup dies too.',
        { note: 'See B5, and A6 for a node-protecting repair with TI-LFA.' },
      ],
    },
    {
      w: w3,
      title: 'Choosing the best LFA (B7)',
      color: C.green,
      body: [
        'S may have several loop-free neighbors. LFA Lab takes the first difference in this order:',
        '1. node-protecting before link-only\n2. downstream before not downstream\n3. lowest backup cost c(S,N) + dist(N,D)\n4. lowest router id\n5. lowest link id (parallel links only)',
        { note: 'RFC 5286 §3.2 lists the criteria; the order is a policy (DECISIONS.md).' },
        { head: 'LFA policy (A16, RFC 7916)' },
        'Can turn steps 1 and 2 into hard rules, switch them off, or exclude neighbors.',
        { note: 'Example 1 has one candidate, N, so the choice is easy.' },
        { head: 'Without check 1', color: C.red.s },
        'In the ring, S would send E’s traffic to A and A would send it back to S: a loop, so the traffic never arrives. That is why only loop-free neighbors are ever used.',
      ],
    },
  ])

  // Ring drawing (Example 2): S–E–C–B–A–S, all metric 1, destination E.
  {
    const p = r2.panels[0]
    const ox = p.drawX
    const oy = p.drawY
    const o = { parent: p.id, r: 28 }
    const S = s.router('S', ox + 120, oy + 50, { ...o, bold: true })
    const E = s.router('E', ox + 380, oy + 50, { ...o, color: C.purple })
    const Cn = s.router('C', ox + 440, oy + 220, o)
    const B = s.router('B', ox + 250, oy + 230, o)
    const A = s.router('A', ox + 60, oy + 220, o)
    s.link(S, E, 1, { parent: p.id, side: -1, color: C.red.s, width: 3, dashed: true })
    s.link(E, Cn, 1, { parent: p.id, side: -1 })
    s.link(Cn, B, 1, { parent: p.id, side: -1 })
    s.link(B, A, 1, { parent: p.id, side: -1 })
    s.link(A, S, 1, { parent: p.id, side: -1, color: C.red.s, width: 4, arrow: true })
    s.label(ox + 250, oy + 130, 'A → S → E = 2', { size: 17, color: C.red.s, parent: p.id })
  }

  // Example 6 drawing: S–E 1, E–D 1, S–N 1, N–E 1, N–M 10, M–D 10.
  {
    const p = r2.panels[1]
    const ox = p.drawX
    const oy = p.drawY
    const o = { parent: p.id, r: 28 }
    const S = s.router('S', ox + 50, oy + 50, { ...o, bold: true })
    const E = s.router('E', ox + 250, oy + 50, o)
    const D = s.router('D', ox + 450, oy + 50, { ...o, color: C.purple })
    const N = s.router('N', ox + 150, oy + 220, o)
    const M = s.router('M', ox + 380, oy + 220, o)
    s.link(S, E, 1, { parent: p.id, side: -1, color: C.red.s, width: 3, dashed: true })
    s.link(E, D, 1, { parent: p.id, side: -1, color: C.green.s, width: 4, arrow: true })
    s.link(S, N, 1, { parent: p.id, side: 1, color: C.green.s, width: 4, arrow: true })
    s.link(N, E, 1, { parent: p.id, side: 1, color: C.green.s, width: 4, arrow: true })
    s.link(N, M, 10, { parent: p.id, side: 1 })
    s.link(M, D, 10, { parent: p.id, side: 1 })
  }

  // ── Row 3: rule details ───────────────────────────────────────────────
  const r3 = s.row(0, r2.bottom + G, G, [
    {
      w: w3,
      title: 'Neighbors never used (B6)',
      color: C.gray,
      body: [
        'Skip N if the link S→N or N→S has the IS-IS max metric 16,777,215 (RFC 5286 §3.5).',
        'Skip N if it has the overload bit set (A17).',
        {
          note: 'Max metric means "don’t send traffic here", so it must not carry backups either.',
        },
      ],
    },
    {
      w: w3,
      title: 'ECMP comes first (B2, B20)',
      color: C.teal,
      body: [
        'If D has a second primary next hop that avoids S–E, it already carries traffic: nothing to compute.',
        'Each pair is credited to the simplest method that works:\nECMP → LFA → Remote LFA → TI-LFA.',
      ],
    },
    {
      w: w3,
      title: 'Parallel links (A10)',
      color: C.purple,
      body: [
        'A candidate is a (link, neighbor) pair (RFC 5286 §3.6). Another link to E itself can be an LFA.',
        'It is loop-free and downstream, but never node-protecting: it ends at E.',
      ],
    },
  ])

  // ── Takeaway ──────────────────────────────────────────────────────────
  const t = s.panel(0, r3.bottom + G, W, {
    title: 'Takeaway',
    color: C.yellow,
    body: [
      'An LFA is a neighbor whose own shortest path to D doesn’t come back through S: dist(N,D) < dist(N,S) + dist(S,D). It is free (no tunnel, no labels) and works everywhere, but on rings and other sparse maps there is often no such neighbor.',
    ],
  })
  s.text(
    0,
    t.y + t.h + 14,
    'Sources: docs/02-algorithms.md §2, §6  ·  docs/learn/04-lfa.md  ·  examples/01-square.yaml, 02-ring5.yaml, 06-link-protecting.yaml',
    { size: 16, color: C.muted },
  )
  return s
}

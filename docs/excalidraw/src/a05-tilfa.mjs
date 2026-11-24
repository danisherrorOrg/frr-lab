// A5 · TI-LFA, link protection (docs/02-algorithms.md §4.1–4.3, RFC 9855), drawn on
// Example 3 (examples/03-ring5-highmetric.yaml), with Examples 1 and 2 for 0 and 1 extra labels.
import { Scene, C } from '../lib/scene.mjs'

export default function draw() {
  const s = new Scene('a05')
  const W = 1640
  const G = 20

  s.text(0, 0, 'A5 · TI-LFA: link protection', { size: 40, color: C.blue.s })
  s.text(
    0,
    58,
    '§4 of docs/02-algorithms.md  ·  RFC 9855  ·  pick the backup path first, then force the packet along it with labels  ·  code: tilfa.ts, labels.ts',
    { size: 18, color: C.muted, maxW: W },
  )

  // ── Row 1: the example and the three steps ────────────────────────────
  const r1 = s.row(0, 110, G, [
    {
      w: 600,
      title: 'Example 3: ring with B–C = 10, protect S–E for E',
      color: C.blue,
      drawH: 420,
      body: [
        { note: 'No LFA and no PQ node here (A2, A3). TI-LFA still works.' },
        { note: 'Red dashed: the failed link S–E.', color: C.red.s },
        {
          note: 'Green arrows: the post-convergence path S → A → B → C → E (1 + 1 + 10 + 1 = 13).',
          color: C.green.s,
        },
        {
          note: 'Orange 10: B–C is forced with B’s Adj-SID 24005; no shortest path uses it.',
          color: C.orange.s,
        },
      ],
    },
    {
      w: W - 600 - G,
      title: 'How it works: path → segments → labels',
      color: C.blue,
      body: [
        { head: 'Step 1. Post-convergence path (B14)' },
        'Remove link S–E (both ways), run SPF from S: S → A → B → C → E, cost 13. This is where S sends traffic after the network reconverges, so traffic moves only once.',
        { head: 'Step 2. Greedy segment walk (B15)' },
        'Only S has switched. Every other router still uses its old table, and a Prefix-SID follows the old table. So from each point, jump to the furthest router Y on the path where (a) dist(X,Y) equals the path cost and (b) every old path X → Y avoids S–E:  dist(X,Y) < dist(X,S) + c(S,E) + dist(E,Y).',
        {
          mono: [
            'From  Try  (a) dist = path cost?  (b) avoids S–E?        Segment',
            '----  ---  ---------------------  ---------------------  ---------------',
            'S     E    1 ≠ 13  ✗',
            'S     C    2 ≠ 12  ✗',
            'S     B    2 = 2   ✓              2 < 0 + 1 + 3 = 4  ✓   PrefixSID(B)',
            'B     E    3 ≠ 11  ✗',
            'B     C    4 ≠ 10  ✗   B’s old path B→A→S→E→C uses S–E',
            '                       no Prefix-SID works             →  AdjSID(B→C)',
            'C     E    1 = 1   ✓              1 < 2 + 1 + 0 = 3  ✓   PrefixSID(E)',
          ].join('\n'),
        },
        { head: 'Step 3. Labels (B18)' },
        {
          mono: 'PrefixSID(B) = 16000 + 4 = 16004    AdjSID(B→C) = 24005 (from the YAML)    PrefixSID(E) = 16002\nstack, top first:  16004  24005  16002      sent out to A      extra labels = 3 − 1 = 2',
        },
        { note: 'Shown before penultimate-hop popping. A7 walks this stack hop by hop.' },
      ],
    },
  ])

  // Ring inside the first panel.
  {
    const p = r1.panels[0]
    const ox = p.drawX
    const oy = p.drawY
    const S = s.router('S', ox + 150, oy + 80, { parent: p.id, bold: true })
    const E = s.router('E', ox + 450, oy + 80, { parent: p.id, color: C.purple })
    const Cn = s.router('C', ox + 520, oy + 290, { parent: p.id })
    const B = s.router('B', ox + 300, oy + 330, { parent: p.id })
    const A = s.router('A', ox + 80, oy + 290, { parent: p.id })
    s.link(S, E, 1, { parent: p.id, side: -1, color: C.red.s, width: 3, dashed: true })
    const Q = { parent: p.id, side: 1, arrow: true, color: C.green.s, width: 4 }
    s.link(S, A, 1, Q)
    s.link(A, B, 1, Q)
    s.link(B, Cn, 10, { ...Q, mcolor: C.orange.s })
    s.link(Cn, E, 1, Q)
    const tag = (r, dy, t, color = C.muted) =>
      s.label(r.cx, r.cy + dy, t, { size: 17, color, parent: p.id })
    tag(S, -58, 'source')
    tag(E, -58, 'destination', C.purple.s)
    tag(A, 56, 'first hop')
    tag(B, 56, 'end of segment 1', C.blue.s)
    tag(Cn, 56, 'end of seg. 2', C.orange.s)
    s.label(ox + 300, oy + 175, '[PrefixSID(B), AdjSID(B→C),', {
      size: 17,
      color: C.green.s,
      parent: p.id,
    })
    s.label(ox + 300, oy + 205, 'PrefixSID(E)]', { size: 17, color: C.green.s, parent: p.id })
  }

  // ── Row 2: more examples and label counts ─────────────────────────────
  const w3 = (W - 2 * G) / 3
  const r2 = s.row(0, r1.bottom + G, G, [
    {
      w: w3,
      title: 'Example 2: one extra label',
      color: C.green,
      body: [
        'Ring, all metrics 1. Path S → A → B → C → E (cost 4).',
        {
          mono: 'From S: C? old path S→E→C uses S–E\n        B: 2 < 0 + 1 + 2 = 3  ✓\nFrom B: E: 2 < 2 + 1 + 0 = 3  ✓',
          size: 15,
        },
        '[PrefixSID(B), PrefixSID(E)] = 16004, 16002, out via A. The same as Remote LFA’s tunnel to B (A3).',
      ],
    },
    {
      w: w3,
      title: 'Example 1: zero extra labels (B16)',
      color: C.teal,
      body: [
        'Square. Path S → N → D. The walk gives [PrefixSID(N), PrefixSID(D)].',
        'The repair always leaves on the first link anyway, so a first segment that only reaches the first hop N is dropped (RFC 9855 §5.1):',
        { mono: '[PrefixSID(D)]   0 extra labels', size: 16 },
        { note: 'When the first hop is an LFA, TI-LFA just sends to it.' },
      ],
    },
    {
      w: w3,
      title: 'How many labels?',
      color: C.purple,
      body: [
        {
          mono: 'Extra  When\n-----  ------------------------------\n0      the first hop is an LFA\n1      a PQ node is on the path\n2      P and Q are adjacent:\n       Prefix-SID + Adj-SID (Ex. 3)\n3+     rare, long detours',
          size: 15,
        },
        { note: 'Too many for S’s Max SID depth? The repair can’t be installed (A15).' },
      ],
    },
  ])

  // ── Row 3: rule details ───────────────────────────────────────────────
  const r3 = s.row(0, r2.bottom + G, G, [
    {
      w: w3,
      title: 'The list ends with PrefixSID(D) (B17)',
      color: C.gray,
      body: [
        'That is the packet’s own label: it stays under the repair labels (RFC 9855 §7.1). If the walk ends on an Adj-SID into D, PrefixSID(D) is added after it.',
        { note: 'Extra labels = segments − 1.' },
      ],
    },
    {
      w: w3,
      title: 'Ties and labels (B14, B18)',
      color: C.blue,
      body: [
        'Equal post-convergence paths: lowest router ids along the path win.',
        'Prefix-SID = SRGB 16000 + SID index (same SRGB everywhere). Adj-SIDs from the YAML, or numbered from 24000 per router in neighbor-id order.',
      ],
    },
    {
      w: w3,
      title: 'Why it always works',
      color: C.green,
      body: [
        'Each step moves forward (an Adj-SID moves at least one hop), so the walk ends. Each Prefix-SID segment follows old paths that avoid S–E, so the repair is loop-free and costs exactly the post-convergence cost.',
        { note: 'Only fails if D can’t be reached at all without S–E.' },
      ],
    },
  ])

  // ── Takeaway ──────────────────────────────────────────────────────────
  const t = s.panel(0, r3.bottom + G, W, {
    title: 'Takeaway',
    color: C.yellow,
    body: [
      'TI-LFA stops hoping a router’s normal path avoids the failure. It takes the post-convergence path and writes it as a few labels: Prefix-SIDs where old shortest paths are safe, an Adj-SID where they aren’t. So it protects every destination that can still be reached.',
    ],
  })
  s.text(
    0,
    t.y + t.h + 14,
    'Sources: docs/02-algorithms.md §4.1–4.3, §6  ·  docs/learn/07-ti-lfa.md  ·  examples/03-ring5-highmetric.yaml, 02-ring5.yaml, 01-square.yaml',
    { size: 16, color: C.muted },
  )
  return s
}

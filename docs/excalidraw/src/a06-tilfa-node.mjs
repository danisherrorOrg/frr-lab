// A6 · TI-LFA, node protection (docs/02-algorithms.md §4.4, RFC 9855 §2.1), drawn on
// Example 8 (examples/08-node-protection.yaml), with Example 6 in node mode.
import { Scene, C } from '../lib/scene.mjs'

export default function draw() {
  const s = new Scene('a06')
  const W = 1640
  const G = 20

  s.text(0, 0, 'A6 · TI-LFA: node protection', { size: 40, color: C.blue.s })
  s.text(
    0,
    58,
    '§4.4 of docs/02-algorithms.md  ·  RFC 9855 §2.1  ·  plan for router E failing: remove E, not just the link  ·  code: src/engine/tilfa.ts',
    { size: 18, color: C.muted, maxW: W },
  )

  // ── Row 1: the example and the walk ───────────────────────────────────
  const r1 = s.row(0, 110, G, [
    {
      w: 600,
      title: 'Example 8: protect against router E, S → D',
      color: C.blue,
      drawH: 420,
      body: [
        { note: 'S’s normal path to D is S → E → D (cost 4).' },
        { note: 'Red dashed: router E removed, with all its links.', color: C.red.s },
        {
          note: 'Green arrows: the post-convergence path without E, S → N → B → C → D (2 + 3 + 3 + 3 = 11).',
          color: C.green.s,
        },
        { note: 'Labels: [16005, 16006], sent out to N.' },
      ],
    },
    {
      w: W - 600 - G,
      title: 'How it works: the A5 walk with router E removed',
      color: C.blue,
      body: [
        { head: 'Step 1. Post-convergence path without router E (B19)' },
        'Remove node E and all its links, run SPF from S: S → N → B → C → D, cost 11. (Link mode would give S → N → B → E → D, cost 8, which goes through E.)',
        { head: 'Step 2. Greedy walk, with check (b) changed to "avoids router E"' },
        { mono: '(b)  dist(X,Y) < dist(X,E) + dist(E,Y)      (∞ if E has the overload bit)' },
        {
          mono: [
            'From  Try  (a) dist = path cost?  (b) avoids router E?   Segment',
            '----  ---  ---------------------  ---------------------  -------------------------',
            'S     D    4 ≠ 11  ✗',
            'S     C    6 ≠ 8   ✗',
            'S     B    3 ≠ 5   ✗',
            'S     N    2 = 2   ✓              2 < 2 + 4 = 6  ✓       PrefixSID(N), dropped (B16)',
            'N     D    6 ≠ 9   ✗',
            'N     C    6 = 6   ✓              6 < 4 + 4 = 8  ✓       PrefixSID(C)',
            'C     D    3 = 3   ✓              3 < 4 + 2 = 6  ✓       PrefixSID(D)',
          ].join('\n'),
        },
        { head: 'Step 3. Result' },
        {
          mono: '[PrefixSID(C), PrefixSID(D)] = 16005, 16006    out via N    extra labels = 1    protects = node',
        },
        'E is not on the path, so it is never the end of a segment, and an Adj-SID can never name one of E’s links. Check (b) also rules out the link S–E.',
      ],
    },
  ])

  // Topology inside the first panel (same layout as A4).
  {
    const p = r1.panels[0]
    const ox = p.drawX
    const oy = p.drawY
    const N = s.router('N', ox + 90, oy + 100, { parent: p.id })
    const B = s.router('B', ox + 300, oy + 100, { parent: p.id })
    const Cn = s.router('C', ox + 490, oy + 100, { parent: p.id })
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
    tag(N, -60, 'first hop')
    tag(Cn, -60, 'end of segment 1', C.blue.s)
    tag(S, 60, 'source')
    tag(E, 60, 'router E removed', C.red.s)
    tag(D, 60, 'destination', C.purple.s)
  }

  // ── Row 2: compare, fallbacks, another example ────────────────────────
  const w3 = (W - 2 * G) / 3
  s.row(0, r1.bottom + G, G, [
    {
      w: w3,
      title: 'Link mode vs node mode (Example 8)',
      color: C.orange,
      body: [
        {
          mono: 'Link:  S→N→B→E→D   cost 8\n       [16004, 16006]  via E  ✗\nNode:  S→N→B→C→D   cost 11\n       [16005, 16006]  no E   ✓',
          size: 15,
        },
        'If router E fails, the link-mode repair sends the packet into E and it is lost.',
        {
          note: 'Node mode can cost more than S’s final path after a link failure (it also avoids E), so "TI-LFA = post-convergence path" no longer always holds.',
        },
      ],
    },
    {
      w: w3,
      title: 'When node protection can’t apply',
      color: C.red,
      body: [
        { head: 'D = E' },
        'E is the destination itself. Use the link repair, marked fallback = dest-is-next-hop.',
        { mono: 'Example 8, S → E:\nS→N→B→E  [PrefixSID(B), PrefixSID(E)]', size: 15 },
        { head: 'D cut off without E' },
        'E is the only way to D. Use the link repair, fallback = none.',
        { note: 'RFC 9855 gives no rule; this keeps the link protected (D51).' },
      ],
    },
    {
      w: w3,
      title: 'Example 6 in node mode',
      color: C.green,
      body: [
        'S’s LFA N reaches D through E (A2). With E removed the path is S → N → M → D (1 + 10 + 10 = 21).',
        {
          mono: 'From S: M  11 = 11 ✓   11 < 1 + 11 = 12 ✓\nFrom M: D  10 = 10 ✓   10 < 11 + 1 = 12 ✓',
          size: 15,
        },
        '[PrefixSID(M), PrefixSID(D)] = 16004, 16005. With router E down, traffic is delivered on S → N → M → D instead of looping.',
      ],
    },
  ])

  // ── Takeaway ──────────────────────────────────────────────────────────
  const bottom = s.items.reduce((m, i) => Math.max(m, i.box.y + i.box.h), 0)
  const t = s.panel(0, bottom + G, W, {
    title: 'Takeaway',
    color: C.yellow,
    body: [
      'Node protection runs the same TI-LFA walk, but on a map with router E removed and with the check "every old path avoids router E". The repair then survives the whole next-hop router failing. Turn it on with protection: node.',
    ],
  })
  s.text(
    0,
    t.y + t.h + 14,
    'Sources: docs/02-algorithms.md §4.4  ·  docs/learn/07-ti-lfa.md (Node protection)  ·  examples/08-node-protection.yaml, 06-link-protecting.yaml',
    { size: 16, color: C.muted },
  )
  return s
}

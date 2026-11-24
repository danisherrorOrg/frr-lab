// B19 · TI-LFA node mode: remove router E, and check segments with
// dist(X,Y) < dist(X,E) + dist(E,Y) (docs/02-algorithms.md §4.4, RFC 9855 §2.1, D51),
// drawn on Example 8 (examples/08-node-protection.yaml), S → D. Numbers from computeForSource().
import { Scene, C } from '../lib/scene.mjs'

export default function draw() {
  const s = new Scene('b19')
  const W = 1640
  const G = 20

  s.text(0, 0, 'B19 · TI-LFA node mode: plan for router E failing, not just the link', {
    size: 40,
    color: C.blue.s,
  })
  s.text(
    0,
    58,
    '§4.4 of docs/02-algorithms.md  ·  RFC 9855 §2.1 (node protection), Appendix A  ·  DECISIONS.md D51  ·  code: src/engine/tilfa.ts',
    { size: 18, color: C.muted, maxW: W },
  )

  const wd = 520
  const r1 = s.row(0, 110, G, [
    {
      w: wd,
      title: 'Link mode: only S–E fails',
      color: C.blue,
      drawH: 300,
      body: [
        'Remove link S–E. Post-convergence path S → N → B → E → D, cost 2 + 3 + 1 + 2 = 8.',
        { mono: '[PrefixSID(B), PrefixSID(D)]\n= 16004, 16006   out via N', color: C.green.s },
        {
          note: 'The repair still goes through E. If router E dies, this repair dies with it.',
          color: C.red.s,
        },
      ],
    },
    {
      w: wd,
      title: 'Node mode: router E fails',
      color: C.blue,
      drawH: 300,
      body: [
        'Remove router E and all 4 of its links. Path S → N → B → C → D, cost 2 + 3 + 3 + 3 = 11.',
        { mono: '[PrefixSID(C), PrefixSID(D)]\n= 16005, 16006   out via N', color: C.green.s },
        { note: 'E is on no segment, so the repair survives E failing.', color: C.green.s },
      ],
    },
    {
      w: W - 2 * wd - 2 * G,
      title: 'The rule: remove the router, not the link',
      color: C.blue,
      body: [
        {
          mono: 'link mode   remove link S–E\n  (b): dist(X,Y) < dist(X,S) + c(S,E) + dist(E,Y)\n\nnode mode   remove router E (all its links)\n  (b): dist(X,Y) < dist(X,E) + dist(E,Y)\n       (dist through E is ∞ if E is overloaded)',
          size: 15,
        },
        '•  Turned on by protection: node in the file (one setting for the whole network, like Remote LFA in A4).\n•  The rest of the walk is the same: furthest valid Prefix-SID, else an Adj-SID (B15), clean-up (B16), end with PrefixSID(D) (B17).\n•  E is not on the path, so it never ends a segment and no Adj-SID names one of its links. (b) for E also rules out the link S–E.',
      ],
    },
  ])

  // Example 8 positions from the YAML, scaled by 0.8.
  const drawEx8 = (p, mode) => {
    const ox = p.drawX + 40
    const oy = p.drawY + 50
    const o = { parent: p.id }
    const node = mode === 'node'
    const S = s.router('S', ox, oy + 176, { ...o, bold: true })
    const E = s.router('E', ox + 200, oy + 176, {
      ...o,
      color: node ? C.red : C.blue,
      dashed: node,
    })
    const N = s.router('N', ox, oy, o)
    const B = s.router('B', ox + 200, oy, o)
    const Cn = s.router('C', ox + 400, oy, o)
    const D = s.router('D', ox + 400, oy + 176, { ...o, color: C.purple })
    const green = { ...o, color: C.green.s, width: 4, arrow: true }
    const dead = { ...o, color: C.red.s, width: 3, dashed: true }
    s.link(S, E, 2, { ...dead, side: 1 })
    s.link(S, N, 2, { ...green, side: -1 })
    s.link(N, B, 3, { ...green, side: -1 })
    if (node) {
      s.link(E, B, 1, { ...dead, side: 1 })
      s.link(E, D, 2, { ...dead, side: 1 })
      s.link(B, Cn, 3, { ...green, side: -1 })
      s.link(Cn, D, 3, { ...green, side: 1 })
    } else {
      s.link(B, E, 1, { ...green, side: -1 })
      s.link(E, D, 2, { ...green, side: 1 })
      s.link(B, Cn, 3, { ...o, side: -1 })
      s.link(Cn, D, 3, { ...o, side: 1 })
    }
    s.label(S.cx, S.cy + 50, 'source', { size: 16, color: C.muted, parent: p.id })
    s.label(D.cx, D.cy + 50, 'destination', { size: 16, color: C.purple.s, parent: p.id })
    s.label(E.cx, E.cy + 50, node ? 'router down' : 'link S–E down', {
      size: 16,
      color: C.red.s,
      parent: p.id,
    })
  }
  drawEx8(r1.panels[0], 'link')
  drawEx8(r1.panels[1], 'node')

  const wl = W - 560 - G
  const r2 = s.row(0, r1.bottom + G, G, [
    {
      w: wl,
      title: 'The walk in node mode, check by check (S → D)',
      color: C.red,
      body: [
        {
          mono: [
            'From  Try      (a) dist = path cost?        (b) dist(X,Y) < dist(X,E) + dist(E,Y)   Result',
            '----  -------  ---------------------------  -------------------------------------   ---------------',
            'S     D, C, B  ✗  e.g. dist(S,B)=3, path 5                                           –',
            'S     N        ✓  2 = 2                     2 < 2 + 4  ✓                             P(N), dropped',
            'N     D        ✗  dist(N,D)=6, path 9                                                –',
            'N     C        ✓  6 = 6                     6 < 4 + 4  ✓                             P(C)',
            'C     D        ✓  3 = 3                     3 < 4 + 2  ✓                             P(D)',
          ].join('\n'),
          size: 14,
        },
        {
          note: 'P = PrefixSID. dist() is the normal (pre-failure) distance: the other routers still use their old tables. P(N) only reaches the first hop, so the clean-up drops it (B16). Result: [P(C), P(D)] = 16005, 16006.',
        },
      ],
    },
    {
      w: 560,
      title: 'Can’t avoid E? Fall back to link',
      color: C.orange,
      body: [
        '•  D = E. S → E can’t avoid E. The engine installs the link repair [P(B), P(E)] = 16004, 16002, marked fallback: dest-is-next-hop.\n•  E is the only way to D. Example 10 in node mode, R3 → R5: R5 hangs off R4, so the repair is the link one, fallback: none. RFC 9855 has no rule here; falling back still covers the link failure (D51).',
      ],
    },
  ])

  const w3 = (W - 2 * G) / 3
  const r3 = s.row(0, r2.bottom + G, G, [
    {
      w: w3,
      title: 'It can cost more',
      color: C.purple,
      body: [
        'Node mode also avoids E, so the repair can cost more than S’s final path after a link failure: 11 instead of 8 here. In node mode "TI-LFA is always the same as the final path" no longer holds (§8, §10).',
      ],
    },
    {
      w: w3,
      title: 'Coverage (A8)',
      color: C.green,
      body: [
        'Example 8, every router as source: 33 pairs, 19 with D ≠ E. Against E failing, TI-LFA protects all 19 and Remote LFA 16. From S alone: 3 pairs (B, C, D via E), 3 and 3.',
      ],
    },
    {
      w: w3,
      title: 'Related',
      color: C.gray,
      body: [
        '•  Same idea for LFA (B5) and Remote LFA (B12): the backup must avoid router E.\n•  Router failure simulation (A9) shows what really happens when E dies.\n•  With SRLGs the engine falls back one step at a time (A19).',
      ],
    },
  ])

  const t = s.panel(0, r3.bottom + G, W, {
    title: 'Takeaway',
    color: C.yellow,
    body: [
      'Node mode plans for the whole next-hop router failing: remove router E, then run the same walk with the check dist(X,Y) < dist(X,E) + dist(E,Y). In Example 8 the link repair 16004, 16006 goes through E; the node repair 16005, 16006 goes around it, at cost 11 instead of 8.',
    ],
  })
  s.text(
    0,
    t.y + t.h + 14,
    'Sources: docs/02-algorithms.md §4.4, §5, §16  ·  docs/learn/07-ti-lfa.md (Node protection)  ·  DECISIONS.md D51  ·  examples/08-node-protection.yaml, 10-lan-levels.yaml',
    { size: 16, color: C.muted, maxW: W },
  )
  return s
}

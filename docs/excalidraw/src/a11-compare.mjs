// A11 · Compare view (docs/02-algorithms.md §10), drawn on Example 4
// (examples/04-isp-core.yaml), PE1 → P1 with link PE1–P1 protected.
import { Scene, C } from '../lib/scene.mjs'

export default function draw() {
  const s = new Scene('a11')
  const W = 1640
  const G = 20

  s.text(0, 0, 'A11 · Compare view: LFA vs Remote LFA vs TI-LFA', { size: 40, color: C.blue.s })
  s.text(
    0,
    58,
    '§10 of docs/02-algorithms.md  ·  the three methods for one (S, D, link) side by side; nothing new is decided  ·  code: src/engine/compare.ts',
    { size: 18, color: C.muted, maxW: W },
  )

  const r1 = s.row(0, 110, G, [
    {
      w: 600,
      title: 'Example 4: small ISP core, PE1 → P1',
      color: C.blue,
      drawH: 440,
      body: [
        { note: 'PE1’s normal path is the direct link (cost 10). P1→P4 costs 20, P4→P1 costs 40.' },
        { note: 'Red dashed: the failed link PE1–P1.', color: C.red.s },
        {
          note: 'Green: TI-LFA, PE1 → P2 → P1 (40), the final path.',
          color: C.green.s,
        },
        {
          note: 'Orange: Remote LFA, after PE1 → P2: P2 → P4 → PE2 → P3 → P1 (50).',
          color: C.orange.s,
        },
      ],
    },
    {
      w: W - 600 - G,
      title: 'How it works: one card per method, the same five fields',
      color: C.blue,
      body: [
        {
          mono: [
            '            LFA     Remote LFA                       TI-LFA',
            '----------  ------  -------------------------------  ----------------------',
            'found/used  none    used: PQ node PE2, exit via P2   found, not used',
            'path        –       PE1→P2→P4→PE2→P3→P1              PE1→P2→P1',
            'cost        –       10 + 10 + 10 + 10 + 10 = 50      10 + 30 = 40',
            'labels      –       16012 16001  (PE2, then P1)      24000 16001',
            'vs final    –       longer (final is 40)             same',
          ].join('\n'),
        },
        { head: 'What each field means' },
        '•  found / used: does the method have a backup, and is it the one the results table names (the simplest, ECMP → LFA → Remote LFA → TI-LFA)?\n•  path: LFA = S → N, then N’s normal path. Remote LFA = the tunnel to the PQ node, then its normal path. TI-LFA = the post-convergence path.\n•  cost: the metrics walked. LFA = c(S,N) + dist(N,D); Remote LFA = cost to the PQ node + dist(PQ,D).\n•  labels S pushes, top first, before PHP: LFA 0 extra, Remote LFA the PQ node’s Prefix-SID, TI-LFA its segment list.\n•  vs final: against S’s path after reconvergence: same, same-cost or longer. Never cheaper.',
        { head: 'Why Example 4 is the best lesson' },
        'Remote LFA’s only PQ node is PE2, so traffic takes the long way (50), then moves again to the 40 path after reconvergence. TI-LFA uses the 40 path at once. A Prefix-SID for P1 sent to P2 would come back: P2’s old path to P1 is P2 → PE1 → P1 (20 < 30), over the failed link. So TI-LFA forces P2 → P1 with P2’s Adj-SID 24000, then P1’s label 16001.',
      ],
    },
  ])

  {
    const p = r1.panels[0]
    const ox = p.drawX
    const oy = p.drawY
    const o = { parent: p.id }
    const PE1 = s.router('PE1', ox + 50, oy + 220, { ...o, bold: true })
    const P1 = s.router('P1', ox + 190, oy + 90, { ...o, color: C.purple })
    const P2 = s.router('P2', ox + 190, oy + 350, o)
    const P3 = s.router('P3', ox + 400, oy + 90, o)
    const P4 = s.router('P4', ox + 400, oy + 350, o)
    const PE2 = s.router('PE2', ox + 520, oy + 220, { ...o, color: C.orange })
    const red = { parent: p.id, color: C.red.s, width: 3, dashed: true }
    const grn = { parent: p.id, color: C.green.s, width: 4, arrow: true }
    const org = { parent: p.id, color: C.orange.s, width: 3, arrow: true }
    s.link(PE1, P1, 10, { ...red, side: -1 })
    s.link(PE1, P2, 10, { ...grn, side: 1 })
    s.link(P2, P1, 30, { ...grn, side: -1 })
    s.link(P2, P4, 10, { ...org, side: 1 })
    s.link(P4, PE2, 10, { ...org, side: 1 })
    s.link(PE2, P3, 10, { ...org, side: 1 })
    s.link(P3, P1, 10, { ...org, side: 1 })
    s.link(P1, P4, '20 / 40', { parent: p.id, side: 1, at: 0.42 })
    s.link(P3, P4, 30, { parent: p.id, side: -1 })
    const tag = (r, dx, dy, t, color = C.muted) =>
      s.label(r.cx + dx, r.cy + dy, t, { size: 16, color, parent: p.id })
    tag(PE1, 0, -60, 'source')
    tag(P1, 0, -60, 'destination', C.purple.s)
    tag(PE2, 0, 58, 'PQ node', C.orange.s)
    tag(P2, 0, 58, 'Adj-SID 24000 to P1', C.green.s)
  }

  const w3 = (W - 2 * G) / 3
  const r2 = s.row(0, r1.bottom + G, G, [
    {
      w: w3,
      title: 'More worked checks',
      color: C.green,
      body: [
        {
          mono: 'Ex. 1, S→D:  LFA used: N, S-N-D, 25\n             TI-LFA S-N-D, 25, same\nEx. 2, S→E:  no LFA\n             RLFA used: PQ B, 4, same\n             TI-LFA 16004 16002, same\nEx. 3, S→E:  no LFA, no PQ node\n             TI-LFA used: 13,\n             16004 24005 16002, same',
          size: 14,
        },
      ],
    },
    {
      w: w3,
      title: 'An LFA can be longer too',
      color: C.orange,
      body: [
        'S–E 1, E–D 1, S–N 5, N–D 1, S–M 1, M–N 1. For S → D, M and N are both node-protecting LFAs.',
        'N is downstream (1 < 2), M is not (2 < 2 fails), so N wins (B7):',
        { mono: 'LFA     S-N-D     6\nfinal   S-M-N-D   3   → longer', size: 15 },
        { note: 'TI-LFA with link protection is always "same" (RFC 9855 §3).' },
      ],
    },
    {
      w: w3,
      title: 'Remote LFA "not run here"',
      color: C.gray,
      body: [
        'A router runs Remote LFA only when there is no LFA (B13). The compare view still works out the tunnel from the same P- and Q-spaces, marked "not run here", because seeing both is the point.',
        { mono: 'Ex. 1: PQ = N, S-N-D, 25,\n       16003 16004', size: 15 },
        { note: 'With ECMP, none of the three is used.' },
      ],
    },
  ])

  const r3 = s.panel(0, r2.bottom + G, W, {
    title: 'With links or routers down (§10.1): the cards show what the traffic really does',
    color: C.red,
    body: [
      'The view runs the failure simulation (A9) once per repair mode and lines up the flow to D. Each card: delivered / dropped / loops, the path, which routers repair, the cost against normal, the labels, and the repair against the final path.',
      {
        mono: [
          'Failure                          LFA only                   LFA + Remote LFA        TI-LFA',
          '-------------------------------  -------------------------  ----------------------  ----------------------------------------',
          'Ex. 3, S→E, link S–E             dropped at S (no backup)   dropped at S            delivered S-A-B-C-E, 13, 16004 24005 16002',
          'Ex. 6, S→D, router E             delivered S-N-M-D, 21      same as LFA only        loops S→N→S: [Prefix D] via N meets E',
          'Ex. 4, PE1→P3, PE1–P1 + P2–P4    dropped at PE1             delivered, 70 (> 50)    delivered, 100 (> 50): PE1, P2, PE1 repair',
        ].join('\n'),
        size: 15,
      },
    ],
  })

  const t = s.panel(0, r3.y + r3.h + G, W, {
    title: 'Takeaway',
    color: C.yellow,
    body: [
      'The compare view lines up what each method would do for the same failure: path, cost, labels and how it compares with the final path. LFA and Remote LFA can take a detour and move traffic twice; TI-LFA with link protection always uses the final path.',
    ],
  })
  s.text(
    0,
    t.y + t.h + 14,
    'Sources: docs/02-algorithms.md §10–10.1  ·  docs/learn/08-comparison.md  ·  examples/04-isp-core.yaml  ·  checked with compareBackups()',
    { size: 16, color: C.muted },
  )
  return s
}

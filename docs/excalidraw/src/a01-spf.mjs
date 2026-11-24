// A1 · SPF (docs/02-algorithms.md §1), drawn on Example 1 (examples/01-square.yaml).
import { Scene, C } from '../lib/scene.mjs'

export default function draw() {
  const s = new Scene('a01')
  const W = 1640
  const G = 20

  s.text(0, 0, 'A1 · SPF: shortest paths (Dijkstra)', { size: 40, color: C.blue.s })
  s.text(
    0,
    58,
    '§1 of docs/02-algorithms.md  ·  every backup method (LFA, Remote LFA, TI-LFA) is built from these distances  ·  code: src/engine/spf.ts, paths.ts',
    { size: 18, color: C.muted, maxW: W },
  )

  // ── Row 1: the example and the step table ─────────────────────────────
  const r1 = s.row(0, 110, G, [
    {
      w: 600,
      title: 'Example 1: the square',
      color: C.blue,
      drawH: 420,
      body: [
        {
          note: "Blue arrows: S's shortest path to D (cost 20). Its first hop E is S's next hop for D.",
          color: C.blue.s,
        },
        { note: 'Green tags: dist(S, router) once SPF has finished.', color: C.green.s },
        { note: 'Black numbers: link metrics (same both ways here).' },
      ],
    },
    {
      w: W - 600 - G,
      title: 'Dijkstra from S, step by step',
      color: C.blue,
      body: [
        { head: 'Rule: settle the closest router not done yet, then update its neighbors.' },
        {
          mono: [
            'Step  Settle    Update its neighbors                  Known so far',
            '----  --------  ------------------------------------  ------------------',
            ' 1    S  (0)    E = 0+10 = 10     N = 0+15 = 15       S 0',
            ' 2    E  (10)   D = 10+10 = 20                        S 0, E 10',
            ' 3    N  (15)   D via N = 15+10 = 25 > 20, keep 20    S 0, E 10, N 15',
            ' 4    D  (20)   nothing new                           S 0, E 10, N 15, D 20',
          ].join('\n'),
        },
        { head: 'Result' },
        'dist(S,E) = 10    dist(S,N) = 15    dist(S,D) = 20.  Shortest path to D: S → E → D, so the next hop for D is E.',
        { head: 'What SPF keeps for every router Y (§1.1)' },
        '•  dist(R,Y): the cheapest cost from the root R.\n•  ALL shortest-path predecessors, not just one: needed for ECMP.\n•  The first-hop set: which neighbors of R are on some shortest path to Y (these are the next hops).',
        { head: 'The algorithm in short' },
        {
          mono: [
            'dist[R] = 0, every other dist = ∞',
            'while some router is not settled:',
            '    X = the unsettled router with the smallest dist      (ties: lowest id)',
            '    settle X',
            '    for each link X→Y with metric c:',
            '        if dist[X] + c <  dist[Y]: dist[Y] = dist[X] + c, preds[Y] = {X}',
            '        if dist[X] + c == dist[Y]: add X to preds[Y]         (keeps ECMP)',
          ].join('\n'),
        },
      ],
    },
  ])

  // Topology inside the first panel.
  const p = r1.panels[0]
  const ox = p.drawX
  const oy = p.drawY
  const S = s.router('S', ox + 120, oy + 110, { parent: p.id, bold: true })
  const E = s.router('E', ox + 440, oy + 110, { parent: p.id })
  const N = s.router('N', ox + 120, oy + 310, { parent: p.id })
  const D = s.router('D', ox + 440, oy + 310, { parent: p.id, color: C.purple })
  s.link(S, E, 10, { parent: p.id, side: -1, color: C.blue.s, width: 4, arrow: true })
  s.link(E, D, 10, { parent: p.id, side: -1, color: C.blue.s, width: 4, arrow: true })
  s.link(S, N, 15, { parent: p.id, side: 1 })
  s.link(N, D, 10, { parent: p.id, side: 1 })
  const tag = (r, dy, t) =>
    s.label(r.cx, r.cy + dy, t, { size: 18, color: C.green.s, parent: p.id })
  tag(S, -62, 'dist 0 (root)')
  tag(E, -62, 'dist 10')
  tag(N, 62, 'dist 15')
  tag(D, 62, 'dist 20')

  // ── Row 2: what else SPF gives ────────────────────────────────────────
  const w3 = (W - 2 * G) / 3
  const r2 = s.row(0, r1.bottom + G, G, [
    {
      w: w3,
      title: 'All-pairs table (§1.3)',
      color: C.teal,
      body: [
        'Run one SPF per router: dist(X,Y) for every pair. Fine for ≤ 200 routers, cached per topology version.',
        {
          mono: 'from \\ to   S    E    N    D\nS           0   10   15   20\nE          10    0   20   10\nN          15   20    0   10\nD          20   10   10    0',
          size: 17,
        },
        { note: 'Read as dist(row, column). dist(N,E) = 20: N→D→E (10+10) beats N→S→E (15+10).' },
      ],
    },
    {
      w: w3,
      title: 'ECMP: equal-cost paths (§1.4)',
      color: C.green,
      body: [
        'If two paths tie, keep BOTH first hops and spread traffic.',
        {
          mono: 'Set S–E to 15:\nS→E→D = 15+10 = 25\nS→N→D = 15+10 = 25\n⇒ next hops for D: E and N',
          size: 17,
        },
        { head: 'ECMP-protected' },
        "If one next hop's link fails, another primary next hop that doesn't use that link keeps carrying the traffic. Nothing to pre-compute.",
      ],
    },
    {
      w: w3,
      title: 'Reverse SPF (§1.2)',
      color: C.purple,
      body: [
        'Dijkstra on the map with every link turned around gives dist(Y,R) for all Y: distances TOWARDS R.',
        'Metrics may differ per direction, so dist(X,Y) ≠ dist(Y,X) in general.',
        "Used by Remote LFA's Q-space, which needs dist(Y,E) for every Y: a reverse SPF rooted at E.",
        { note: 'Example 1 is symmetric, so forward and reverse give the same numbers.' },
      ],
    },
  ])

  // ── Row 3: details that change paths ──────────────────────────────────
  const r3 = s.row(0, r2.bottom + G, G, [
    {
      w: w3,
      title: 'Does a path use S→E? (§1.5, B1)',
      color: C.red,
      body: [
        { mono: 'dist(X,Y) < dist(X,S) + c(S,E) + dist(E,Y)' },
        'Right side = the cheapest path forced over S→E.',
        'Strictly less: every shortest path avoids the link.  Equal: an ECMP path may use it, so treat it as "uses the link" (the safe choice).',
      ],
    },
    {
      w: w3,
      title: 'Ties: one path to draw',
      color: C.gray,
      body: [
        'When paths tie, the drawings and the failure simulation take the neighbor with the lowest router id at each hop (alphabetical).',
        {
          note: 'It changes no protection result; it only makes every drawing the same each time.',
        },
      ],
    },
    {
      w: w3,
      title: 'Special links and routers',
      color: C.orange,
      body: [
        "Overload bit (§16): the router is reached but never passed through. Dijkstra doesn't relax its links unless it is the root.",
        'Parallel links (§9): distances use the cheapest link of a bundle.',
      ],
    },
  ])

  // ── Takeaway ──────────────────────────────────────────────────────────
  const t = s.panel(0, r3.bottom + G, W, {
    title: 'Takeaway',
    color: C.yellow,
    body: [
      'SPF gives three things every FRR method reuses: dist(X,Y) for all pairs, the next hops (with ECMP), and distances towards a router (reverse SPF). Every LFA, Remote LFA and TI-LFA test is just these numbers compared with a strict "<".',
    ],
  })
  s.text(
    0,
    t.y + t.h + 14,
    'Sources: docs/02-algorithms.md §1  ·  docs/learn/02-shortest-paths.md  ·  examples/01-square.yaml',
    { size: 16, color: C.muted },
  )
  return s
}

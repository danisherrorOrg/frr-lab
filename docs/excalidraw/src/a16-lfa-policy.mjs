// A16 · LFA policy (docs/02-algorithms.md §15), drawn on the policy network of
// docs/learn/10-design-checks.md: S → D, primary next hop E, link S–E protected.
import { Scene, C } from '../lib/scene.mjs'

export default function draw() {
  const s = new Scene('a16')
  const W = 1640
  const G = 20

  s.text(0, 0, 'A16 · LFA policy: which LFA does S pick?', { size: 40, color: C.blue.s })
  s.text(
    0,
    58,
    '§15 of docs/02-algorithms.md  ·  RFC 7916 §6.2 (policy-based alternate selection)  ·  code: src/engine/lfa-policy.ts, lfa.ts',
    { size: 18, color: C.muted, maxW: W },
  )

  const r1 = s.row(0, 110, G, [
    {
      w: 600,
      title: 'The policy network: S → D, two LFAs',
      color: C.blue,
      drawH: 400,
      body: [
        { note: 'Blue: S’s normal path S→E→D, dist(S,D) = 11.', color: C.blue.s },
        { note: 'Red dashed: the protected link S–E.', color: C.red.s },
        { note: 'Green: LFA B, S→B→D (13): node-protecting, not downstream.', color: C.green.s },
        {
          note: 'Orange: LFA A, S→A→E→D (12): downstream, not node-protecting (it goes through E).',
          color: C.orange.s,
        },
      ],
    },
    {
      w: W - 600 - G,
      title: 'How it works: three knobs on top of the B7 order',
      color: C.blue,
      body: [
        {
          mono: [
            'Knob                       YAML                         Values                       RFC 7916',
            '-------------------------  ---------------------------  ---------------------------  --------',
            'Node-protecting (Ineq. 3)  lfa_policy.node_protecting   prefer · require · ignore    §6.2.2',
            'Downstream (Ineq. 2)       lfa_policy.downstream        prefer · require · ignore    §6.2.3',
            'Exclude a neighbor         lfa_exclude: [B] on S        router ids                   §6.2.4.4',
            '',
            'prefer is the default. The two preferences are per network; the exclude list is per router.',
          ].join('\n'),
          size: 14,
        },
        '•  exclude: S’s links to that neighbor are skipped before any check (reason excluded), like a max-metric link (B6).\n•  require: a loop-free neighbor that fails the inequality is shown with its numbers, marked policyRejected, never chosen.\n•  ignore: that step of the order is skipped; the rest keep their order.\n•  prefer: the default order (B7): node-protecting → downstream → lowest cost → router ID → link id.',
        { head: 'The two candidates for S → D' },
        {
          mono: [
            'N  dist(N,D)  Loop-free        Downstream (< 11)  Node-protecting          Cost',
            '-  ---------  ---------------  -----------------  -----------------------  ------------',
            'A  2 (A-E-D)  2 < 10+11  ✓     2 < 11  ✓          2 < 1+1  ✗  (via E)      10 + 2 = 12',
            'B  11 (B-D)   11 < 2+11  ✓     11 < 11 ✗          11 < 12+1  ✓             2 + 11 = 13',
          ].join('\n'),
          size: 15,
        },
        {
          note: 'If require leaves no LFA, the destination has no LFA, so Remote LFA is used (B13). Here: PQ node A, the cheapest (dist(S,A) = 10).',
        },
      ],
    },
  ])

  {
    const p = r1.panels[0]
    const ox = p.drawX
    const oy = p.drawY
    const o = { parent: p.id }
    const A = s.router('A', ox + 50, oy + 80, { ...o, color: C.orange })
    const E = s.router('E', ox + 280, oy + 80, o)
    const D = s.router('D', ox + 510, oy + 80, { ...o, color: C.purple })
    const S = s.router('S', ox + 165, oy + 330, { ...o, bold: true })
    const B = s.router('B', ox + 510, oy + 330, { ...o, color: C.green })
    s.link(S, E, 10, { parent: p.id, side: -1, color: C.red.s, width: 3, dashed: true })
    s.link(E, D, 1, { parent: p.id, side: -1, color: C.blue.s, width: 4, arrow: true })
    s.link(S, A, 10, { parent: p.id, side: 1, color: C.orange.s, width: 3, arrow: true })
    s.link(A, E, 1, { parent: p.id, side: -1, color: C.orange.s, width: 3, arrow: true })
    s.link(S, B, 2, { parent: p.id, side: 1, color: C.green.s, width: 4, arrow: true })
    s.link(B, D, 11, { parent: p.id, side: -1, color: C.green.s, width: 4, arrow: true })
    s.label(S.cx, S.cy + 52, 'source', { size: 16, color: C.muted, parent: p.id })
    s.label(D.cx, D.cy - 52, 'destination', { size: 16, color: C.purple.s, parent: p.id })
    s.label(E.cx, E.cy - 52, 'primary next hop', { size: 16, color: C.blue.s, parent: p.id })
    s.label(B.cx, B.cy + 52, 'default pick', { size: 16, color: C.green.s, parent: p.id })
  }

  const r2 = s.row(0, r1.bottom + G, G, [
    {
      w: 900,
      title: 'Best LFA for S → D under each policy',
      color: C.green,
      body: [
        {
          mono: [
            'Policy                                   Best LFA  Why',
            '---------------------------------------  --------  ----------------------------------------',
            'default (both prefer)                    B         node-protecting comes first',
            'node_protecting: ignore                  A         downstream is next',
            'both ignore                              A         lowest cost: 12 < 13',
            'downstream: require                      A         B ruled out: not downstream',
            'node_protecting: require                 B         A ruled out: not node-protecting',
            'both require                             none      → Remote LFA via PQ node A',
            'S lfa_exclude: [B]                       A         B skipped',
            'S lfa_exclude: [A, B]                    none      → Remote LFA',
            'node_protecting: require, S → E (D = E)  A         node protection can’t apply to E itself',
          ].join('\n'),
          size: 15,
        },
      ],
    },
    {
      w: W - 900 - G,
      title: 'What the policy doesn’t change',
      color: C.gray,
      body: [
        '•  ECMP (B2): another primary next hop is normal forwarding, not an alternate. An excluded neighbor still counts as ECMP.\n•  Remote LFA and TI-LFA: the tunnel exit and the post-convergence path ignore the policy. Remote LFA is only used more often.\n•  SRLG, link colour and bandwidth criteria of RFC 7916 aren’t modelled.',
        { head: 'Effect line', color: C.muted },
        {
          mono: 'Example 6, node_protecting: require:\nChanges S’s LFA for 2 destinations:\nD (N → none), M (E → none).',
          size: 15,
        },
      ],
    },
  ])

  const t = s.panel(0, r2.bottom + G, W, {
    title: 'Takeaway',
    color: C.yellow,
    body: [
      'When S has more than one LFA, which one it picks is a policy. The knobs change the order (prefer / ignore), rule candidates out (require) or skip a neighbor (exclude). The LFA picked is always loop-free; if the policy leaves none, Remote LFA takes over.',
    ],
  })
  s.text(
    0,
    t.y + t.h + 14,
    'Sources: docs/02-algorithms.md §15  ·  docs/learn/10-design-checks.md (LFA policy)  ·  examples/06-link-protecting.yaml  ·  checked with computeForSource(), lfaPolicyEffect()',
    { size: 16, color: C.muted, maxW: W },
  )
  return s
}

// B4 · Downstream, Inequality 2 (docs/02-algorithms.md §2, RFC 5286), drawn on
// Example 6 (examples/06-link-protecting.yaml): router E fails, S and N are each
// other's LFA, and neither is downstream, so traffic can loop between them.
import { Scene, C } from '../lib/scene.mjs'

export default function draw() {
  const s = new Scene('b04')
  const W = 1640
  const G = 20

  s.text(0, 0, 'B4 · Downstream: N is closer to D than S', { size: 40, color: C.blue.s })
  s.text(
    0,
    58,
    '§2 of docs/02-algorithms.md  ·  RFC 5286 §1 (Inequality 2), §3.2  ·  RFC 7916 §6.2.3  ·  code: src/engine/lfa.ts (downstream)',
    { size: 18, color: C.muted, maxW: W },
  )

  const r1 = s.row(0, 110, G, [
    {
      w: 600,
      title: 'Example 6: router E fails, both S and N repair',
      color: C.blue,
      drawH: 380,
      body: [
        {
          note: 'Every link 1, except N–M and M–D (10). S → D and N → D both go via E (cost 2).',
        },
        { note: 'Red dashed: router E fails, with all its links.', color: C.red.s },
        {
          note: 'Red double arrow: with node_protecting: ignore, S’s LFA is N and N’s LFA is S. Each sends D’s traffic to the other.',
          color: C.red.s,
        },
        {
          note: 'Green: the default policy. N picks M (node-protecting), so it reaches D on S → N → M → D (21).',
          color: C.green.s,
        },
      ],
    },
    {
      w: W - 600 - G,
      title: 'The rule: N must be strictly closer to D than S is',
      color: C.blue,
      body: [
        { mono: 'downstream   ⇔   dist(N,D)  <  dist(S,D)', size: 18 },
        '•  Stronger than loop-free (B3): dist(S,D) ≤ dist(N,S) + dist(S,D), so downstream implies loop-free.\n•  Why it matters: if N is downstream of S, then S can’t be downstream of N. Two routers that both use downstream alternates can never hand the traffic back and forth.\n•  Loop-free alone only promises that N won’t send it back while N uses its normal table. If N is repairing too (E down for both), N’s backup may be S.',
        { head: 'Worked checks (from the engine)' },
        {
          mono: [
            'Example      PLR → D   N    dist(N,D)  dist(PLR,D)  Loop-free  Downstream',
            '-----------  --------  ---  ---------  -----------  ---------  -----------',
            '6            S → D     N    2          2            ✓ 2 < 3    ✗ 2 = 2',
            '6            N → D     S    2          2            ✓ 2 < 3    ✗ 2 = 2',
            '6            N → D     M    10         2            ✓ 10 < 12  ✗',
            '1  square    S → D     N    10         20           ✓          ✓ 10 < 20',
            '§15 policy   S → D     A    2          11           ✓          ✓ 2 < 11',
            '§15 policy   S → D     B    11         11           ✓          ✗ 11 = 11',
          ].join('\n'),
          size: 14,
        },
        { head: 'Simulated: fail router E, from S, LFA only (A9)' },
        {
          mono: [
            'Policy                              S’s LFA  N’s LFA  Result for D',
            '----------------------------------  -------  -------  ------------------------',
            'default (prefer, prefer)            N        M        S → N → M → D, cost 21',
            'node_protecting: ignore             N        S        loops S → N → S',
            'downstream: require                 none     none     dropped at S',
          ].join('\n'),
          size: 14,
        },
        {
          note: 'The loop needs both to fail downstream: dist(S,D) = dist(N,D) = 2. A downstream rule would have rejected both. Here it leaves no LFA, so S drops (or uses Remote LFA / TI-LFA if it runs them).',
        },
      ],
    },
  ])

  {
    const p = r1.panels[0]
    const ox = p.drawX
    const oy = p.drawY
    const o = { parent: p.id, r: 30 }
    const S = s.router('S', ox + 60, oy + 60, { ...o, bold: true })
    const E = s.router('E', ox + 280, oy + 60, { ...o, color: C.red, dashed: true })
    const D = s.router('D', ox + 500, oy + 60, { ...o, color: C.purple })
    const N = s.router('N', ox + 170, oy + 260, o)
    const M = s.router('M', ox + 420, oy + 290, { ...o, color: C.green })
    s.link(S, E, 1, { parent: p.id, side: -1, color: C.red.s, dashed: true })
    s.link(E, D, 1, { parent: p.id, side: -1, color: C.red.s, dashed: true })
    s.link(N, E, 1, { parent: p.id, side: -1, color: C.red.s, dashed: true })
    s.link(S, N, 1, { parent: p.id, side: 1, color: C.red.s, width: 4, arrow: 'both' })
    s.link(N, M, 10, { parent: p.id, side: -1, color: C.green.s, width: 4, arrow: true })
    s.link(M, D, 10, { parent: p.id, side: -1, color: C.green.s, width: 4, arrow: true })
    s.label(S.cx, S.cy - 50, 'source', { size: 16, color: C.muted, parent: p.id })
    s.label(E.cx, E.cy - 50, 'failed router', { size: 16, color: C.red.s, parent: p.id })
    s.label(D.cx, D.cy - 50, 'destination', { size: 16, color: C.purple.s, parent: p.id })
    s.label(N.cx, N.cy + 50, 'dist(N,D) = dist(S,D) = 2', {
      size: 15,
      family: 'mono',
      color: C.ink,
      parent: p.id,
    })
  }

  const w3 = (W - 2 * G) / 3
  const r2 = s.row(0, r1.bottom + G, G, [
    {
      w: w3,
      title: 'In the best-LFA order (B7)',
      color: C.green,
      body: [
        'Step 2: downstream before not downstream, after node-protecting (step 1) and before cost (step 3).',
        {
          note: 'Example 4, P4 → PE1 (primary via P2): P1 and P3 are both node-protecting and both cost 50. P1 is downstream (10 < 20), P3 isn’t (20 = 20), so P1 wins.',
        },
      ],
    },
    {
      w: w3,
      title: 'Policy knob (A16, RFC 7916)',
      color: C.orange,
      body: [
        {
          mono: 'lfa_policy:\n  downstream: prefer | require | ignore',
          size: 15,
        },
        '•  prefer (default): step 2 of B7.\n•  require: a non-downstream candidate is shown but never chosen (not-downstream).\n•  ignore: step 2 is skipped.',
      ],
    },
    {
      w: w3,
      title: 'Edge cases',
      color: C.gray,
      body: [
        '•  Another ECMP next hop (B2) is always downstream: it is on a shortest path, so dist(N,D) = dist(S,D) − c(S,N).\n•  A parallel link to E (A10) is downstream when E is closer to D, as it always is on the primary path.\n•  Downstream says nothing about router E: N may still go through it (B5).',
      ],
    },
  ])

  const t = s.panel(0, r2.bottom + G, W, {
    title: 'Takeaway',
    color: C.yellow,
    body: [
      'A downstream neighbor is strictly closer to D, so traffic only ever moves "downhill" towards D. Two routers repairing at the same time can’t bounce it between them. Loop-free alone can: in Example 6, S and N are each other’s LFA and loop when router E fails.',
    ],
  })
  s.text(
    0,
    t.y + t.h + 14,
    'Sources: docs/02-algorithms.md §2, §8.1, §15  ·  docs/learn/04-lfa.md (Inequality 2)  ·  examples/06-link-protecting.yaml, 01-square.yaml, 04-isp-core.yaml  ·  checked with computeLfa(), simulateFailure()',
    { size: 16, color: C.muted, maxW: W },
  )
  return s
}

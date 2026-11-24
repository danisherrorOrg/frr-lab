// B5 · Node-protecting, Inequality 3 (docs/02-algorithms.md §2, RFC 5286 §3.2),
// drawn on the LFA-policy worked example of §15: A is downstream but goes through E,
// B is node-protecting. Router E fails: only B's backup survives.
import { Scene, C } from '../lib/scene.mjs'

export default function draw() {
  const s = new Scene('b05')
  const W = 1640
  const G = 20

  s.text(0, 0, 'B5 · Node-protecting: the backup avoids router E', {
    size: 40,
    color: C.blue.s,
  })
  s.text(
    0,
    58,
    '§2 of docs/02-algorithms.md  ·  RFC 5286 §1 (Inequality 3), §3.2  ·  RFC 7916 §6.2.2  ·  code: src/engine/lfa.ts (nodeProtecting)',
    { size: 18, color: C.muted, maxW: W },
  )

  const r1 = s.row(0, 110, G, [
    {
      w: 600,
      title: 'The §15 example: S → D, router E fails',
      color: C.blue,
      drawH: 380,
      body: [
        {
          note: 'S → D goes via E (cost 11). Two loop-free neighbors: A and B.',
        },
        { note: 'Red dashed: router E fails, with all its links.', color: C.red.s },
        {
          note: 'Red: A’s own path to D is A → E → D. It dies with E. A then repairs too, and its LFA is S: S → A → S loops.',
          color: C.red.s,
        },
        {
          note: 'Green: B’s path to D is B → D. It never touches E: S → B → D (13) survives.',
          color: C.green.s,
        },
      ],
    },
    {
      w: W - 600 - G,
      title: 'The rule: N’s path to D is cheaper than any path through E',
      color: C.blue,
      body: [
        { mono: 'node-protecting   ⇔   dist(N,D)  <  dist(N,E) + dist(E,D)', size: 18 },
        '•  The same shape as loop-free (B3), with router E in place of S. The right side is N’s cheapest path to D through E.\n•  Strictly cheaper ⇒ N’s path doesn’t touch E, so the backup survives the whole router failing, not only the link S–E.\n•  A tie counts as "may use E": the RFC asks for strictly less.',
        { head: 'Worked checks (from the engine)' },
        {
          mono: [
            'Example      S → D   N    dist(N,D)  dist(N,E) + dist(E,D)   Node-prot.  Downstream',
            '-----------  ------  ---  ---------  ----------------------  ----------  ----------',
            '§15 policy   S → D   A    2          1 + 1   = 2             ✗ 2 = 2     ✓',
            '§15 policy   S → D   B    11         12 + 1  = 13            ✓ 11 < 13   ✗',
            '1  square    S → D   N    10         20 + 10 = 30            ✓ 10 < 30   ✓',
            '6            S → D   N    2          1 + 1   = 2             ✗ 2 = 2     ✗',
            '2  ring      S → C   A    2          2 + 1   = 3             ✓ 2 < 3     ✗',
          ].join('\n'),
          size: 14,
        },
        { head: 'Simulated: fail router E, from S, LFA only (A9)' },
        {
          mono: [
            'Example / policy                 S’s LFA  Result for D',
            '-------------------------------  -------  -----------------------------------',
            '§15, default                     B        S → B → D, cost 13: survives',
            '§15, node_protecting: ignore     A        broken at A, then loops S → A → S',
            '1, default                       N        S → N → D, cost 25: survives',
            '6, default                       N        broken at N; N’s own LFA M saves it:',
            '                                          S → N → M → D, cost 21',
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
    const A = s.router('A', ox + 60, oy + 70, { ...o, color: C.red })
    const E = s.router('E', ox + 280, oy + 70, { ...o, color: C.red, dashed: true })
    const D = s.router('D', ox + 500, oy + 70, { ...o, color: C.purple })
    const S = s.router('S', ox + 280, oy + 300, { ...o, bold: true })
    const B = s.router('B', ox + 500, oy + 300, { ...o, color: C.green })
    s.link(A, E, 1, { parent: p.id, side: -1, color: C.red.s, width: 3, dashed: true, arrow: true })
    s.link(E, D, 1, { parent: p.id, side: -1, color: C.red.s, width: 3, dashed: true, arrow: true })
    s.link(S, E, 10, { parent: p.id, side: -1, color: C.red.s, dashed: true })
    s.link(S, A, 10, { parent: p.id, side: -1, color: C.red.s, width: 4, arrow: 'both' })
    s.link(S, B, 2, { parent: p.id, side: 1, color: C.green.s, width: 4, arrow: true })
    s.link(B, D, 11, { parent: p.id, side: -1, color: C.green.s, width: 4, arrow: true })
    s.label(A.cx, A.cy - 50, 'not node-prot.', { size: 16, color: C.red.s, parent: p.id })
    s.label(E.cx, E.cy - 50, 'failed router', { size: 16, color: C.red.s, parent: p.id })
    s.label(D.cx, D.cy - 50, 'destination', { size: 16, color: C.purple.s, parent: p.id })
    s.label(S.cx, S.cy + 50, 'source', { size: 16, color: C.muted, parent: p.id })
    s.label(B.cx, B.cy + 50, 'node-protecting', { size: 16, color: C.green.s, parent: p.id })
  }

  const w3 = (W - 2 * G) / 3
  const r2 = s.row(0, r1.bottom + G, G, [
    {
      w: w3,
      title: 'In the best-LFA order (B7)',
      color: C.green,
      body: [
        'Step 1, before downstream and before cost. In §15, B wins over A although A is downstream and cheaper (12 vs 13).',
        {
          note: 'Example 6, N → D (primary via E): M (cost 20, node-protecting) beats S (cost 3, link-only). That is why N saves the traffic when E fails.',
        },
      ],
    },
    {
      w: w3,
      title: 'Policy knob (A16, RFC 7916)',
      color: C.orange,
      body: [
        { mono: 'lfa_policy:\n  node_protecting: prefer | require | ignore', size: 15 },
        '•  prefer (default): step 1 of B7.\n•  require: link-only LFAs are never chosen (not-node-protecting).\n•  ignore: step 1 is skipped. In §15, A is then picked.',
      ],
    },
    {
      w: w3,
      title: 'Edge cases',
      color: C.gray,
      body: [
        '•  D = E: node protection can’t apply (E is the destination), so require doesn’t rule anything out.\n•  A parallel link to E (A10) is never node-protecting: it ends at E.\n•  Overload bit on E (A17): N can’t pass through E, so the right side is ∞.\n•  Remote LFA and TI-LFA have their own node mode (B12, B19).',
      ],
    },
  ])

  const t = s.panel(0, r2.bottom + G, W, {
    title: 'Takeaway',
    color: C.yellow,
    body: [
      'A link-only LFA protects against the link S–E failing, but its path may run through router E. If the whole router fails, that backup dies too. dist(N,D) < dist(N,E) + dist(E,D) proves N’s path avoids E, so the backup survives either failure. That is why it is step 1 of the choice.',
    ],
  })
  s.text(
    0,
    t.y + t.h + 14,
    'Sources: docs/02-algorithms.md §2, §8.1, §15 (worked example)  ·  docs/learn/04-lfa.md (Inequality 3)  ·  examples/06-link-protecting.yaml, 01-square.yaml, 02-ring5.yaml  ·  checked with computeLfa(), simulateFailure()',
    { size: 16, color: C.muted, maxW: W },
  )
  return s
}

// A3 · Remote LFA, link protection (docs/02-algorithms.md §3, RFC 7490), drawn on
// Example 2 (examples/02-ring5.yaml), with Example 3 as the case where it fails.
import { Scene, C } from '../lib/scene.mjs'

export default function draw() {
  const s = new Scene('a03')
  const W = 1640
  const G = 20

  s.text(0, 0, 'A3 · Remote LFA: link protection', { size: 40, color: C.blue.s })
  s.text(
    0,
    58,
    '§3 of docs/02-algorithms.md  ·  RFC 7490  ·  no safe neighbor? tunnel to a safe router further away  ·  code: src/engine/rlfa.ts',
    { size: 18, color: C.muted, maxW: W },
  )

  // ── Row 1: the example and the three sets ─────────────────────────────
  const r1 = s.row(0, 110, G, [
    {
      w: 600,
      title: 'Example 2: the ring, protect S–E for E',
      color: C.blue,
      drawH: 420,
      body: [
        { note: 'Every metric is 1. S’s normal path to E is the direct link (cost 1).' },
        { note: 'Red dashed: the failed link S–E.', color: C.red.s },
        {
          note: 'Green arrows: the tunnel S → A → B to PQ node B (one label, 16004).',
          color: C.green.s,
        },
        {
          note: 'Purple arrows: B takes the packet out and forwards it normally, B → C → E.',
          color: C.purple.s,
        },
      ],
    },
    {
      w: W - 600 - G,
      title: 'How it works: find routers in both P-space and Q-space',
      color: C.blue,
      body: [
        {
          head: 'First, no LFA: A fails the loop-free check, 2 < 1 + 1 = 2 is false (A2). So look further away.',
        },
        {
          mono: [
            'Set               Test (strict <)                        Example 2',
            '----------------  -------------------------------------  ---------',
            'P-space of S      dist(S,Y) < c(S,E) + dist(E,Y)         {A, B}',
            'Extended (via A)  dist(A,Y) < dist(A,S) + dist(S,Y)      adds C',
            'Q-space of E      dist(Y,E) < dist(Y,S) + c(S,E)         {B, C}',
            'PQ nodes          extended P ∩ Q                         {B, C}',
          ].join('\n'),
        },
        { head: 'The numbers' },
        {
          mono: [
            'Y   P(S): dist(S,Y) < 1 + dist(E,Y)     Q(E): dist(Y,E) < dist(Y,S) + 1',
            'A   1 < 1 + 2 = 3   ✓                    2 < 1 + 1 = 2   ✗ (tie)',
            'B   2 < 1 + 2 = 3   ✓                    2 < 2 + 1 = 3   ✓',
            'C   2 < 1 + 1 = 2   ✗ (tie)              1 < 2 + 1 = 3   ✓',
            '',
            'Extended via A:  dist(A,C) = 2 (A → B → C) < dist(A,S) + dist(S,C) = 1 + 2 = 3  ✓',
          ].join('\n'),
        },
        { head: 'Which PQ node? (B11: lowest cost from S, then lowest id)' },
        {
          mono: 'B  in plain P(S):  dist(S,B)            = 2   ← chosen\nC  only via A:     c(S,A) + dist(A,C)   = 1 + 2 = 3',
        },
        { head: 'Result' },
        'S puts the packet in a tunnel to B. B is reached without S–E (P) and reaches E without S–E (Q), so B just forwards it on its normal table. With Segment Routing the tunnel is B’s Prefix-SID: 16000 + 4 = 16004.',
      ],
    },
  ])

  // The ring inside the first panel.
  {
    const p = r1.panels[0]
    const ox = p.drawX
    const oy = p.drawY
    const S = s.router('S', ox + 150, oy + 80, { parent: p.id, bold: true })
    const E = s.router('E', ox + 450, oy + 80, { parent: p.id, color: C.purple })
    const Cn = s.router('C', ox + 520, oy + 290, { parent: p.id })
    const B = s.router('B', ox + 300, oy + 330, { parent: p.id, color: C.green })
    const A = s.router('A', ox + 80, oy + 290, { parent: p.id })
    const P = { parent: p.id, side: -1 }
    s.link(S, E, 1, { ...P, color: C.red.s, width: 3, dashed: true })
    // Drawn in the travel direction (S→A→B→C→E), so the outer side is +1.
    const Q = { parent: p.id, side: 1, arrow: true }
    s.link(Cn, E, 1, { ...Q, color: C.purple.s, width: 3 })
    s.link(B, Cn, 1, { ...Q, color: C.purple.s, width: 3 })
    s.link(A, B, 1, { ...Q, color: C.green.s, width: 4 })
    s.link(S, A, 1, { ...Q, color: C.green.s, width: 4 })
    const tag = (r, dy, t, color = C.muted) =>
      s.label(r.cx, r.cy + dy, t, { size: 17, color, parent: p.id })
    tag(S, -58, 'source')
    tag(E, -58, 'destination', C.purple.s)
    tag(A, 56, 'P', C.blue.s)
    tag(B, 56, 'PQ, chosen', C.green.s)
    tag(Cn, 56, 'PQ via A', C.blue.s)
    s.label(ox + 300, oy + 175, 'tunnel S → A → B (16004)', {
      size: 17,
      color: C.green.s,
      parent: p.id,
    })
    s.label(ox + 300, oy + 210, 'then B → C → E as normal', {
      size: 17,
      color: C.purple.s,
      parent: p.id,
    })
  }

  // ── Row 2: where it fails, choosing, direction ────────────────────────
  const w3 = (W - 2 * G) / 3
  const r2 = s.row(0, r1.bottom + G, G, [
    {
      w: w3,
      title: 'Where it fails: Example 3 (B–C = 10)',
      color: C.red,
      drawH: 270,
      body: [
        'Same ring, but B–C costs 10, so no shortest path uses it.',
        {
          mono: 'P(S) = {A, B}   ext via A: C?\n  dist(A,C) = 3 < 1 + 2 = 3  ✗\nQ(E): B  3 < 2 + 1 = 3  ✗\n      C  1 < 2 + 1 = 3  ✓\nP ∩ Q = {A,B} ∩ {C} = { }',
          size: 15,
        },
        'No PQ node: Remote LFA fails. TI-LFA crosses the gap with an Adj-SID (A5).',
      ],
    },
    {
      w: w3,
      title: 'Which way the tunnel leaves S',
      color: C.green,
      body: [
        '•  PQ node in plain P(S): the tunnel follows S’s own shortest path. It already avoids S–E.',
        '•  PQ node only in some P(N): the tunnel must go out through N. S’s own path to it may use S–E.',
        { mono: 'Example 2:  B → S’s own path S → A → B\n            C → exit via A', size: 16 },
        'Why C needs the exit: S’s own path to C is S → E → C, over the failed link. A’s path A → B → C avoids it.',
        'Several exits? Lowest c(S,N) + dist(N,PQ), then lowest router id.',
        {
          note: 'A neighbor with max metric 16,777,215 on its link is never an exit (RFC 7490 §5.4).',
        },
      ],
    },
    {
      w: w3,
      title: 'Q-space looks towards E (B10)',
      color: C.purple,
      body: [
        'P-space uses dist(S,Y): from S outwards. Q-space uses dist(Y,E): from each router towards E.',
        'With different metrics each way these differ, so Q-space needs a reverse SPF rooted at E (A1).',
        'Q-space aims for E, not D: once at E, the packet follows E’s path to D. So one PQ node serves every destination behind E (RFC 7490 §5.2.1.3).',
        { note: 'RFC 7490 writes dist(S,E); it equals c(S,E) when S–E is a primary link (D17).' },
      ],
    },
  ])

  // Example 3 ring in the first panel of row 2.
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
    s.link(Cn, B, 10, { parent: p.id, side: -1, mcolor: C.red.s })
    s.link(B, A, 1, { parent: p.id, side: -1 })
    s.link(A, S, 1, { parent: p.id, side: -1 })
    s.label(ox + 200, oy + 135, 'P = {A, B}', { size: 17, color: C.blue.s, parent: p.id })
    s.label(ox + 335, oy + 160, 'Q = {C}', { size: 17, color: C.purple.s, parent: p.id })
  }

  // ── Row 3: rule details ───────────────────────────────────────────────
  const r3 = s.row(0, r2.bottom + G, G, [
    {
      w: w3,
      title: 'Only when there is no LFA (B13)',
      color: C.gray,
      body: [
        'Remote LFA is used only if (D, link S–E) has no LFA. The P, Q and PQ sets are still shown in LFA Lab, for learning.',
        { note: 'Order: ECMP → LFA → Remote LFA → TI-LFA (B20).' },
      ],
    },
    {
      w: w3,
      title: 'What the tunnel is',
      color: C.teal,
      body: [
        'RFC 7490 allows any tunnel. Older networks used an LDP label over a targeted LDP session.',
        'With Segment Routing it is just one more label: the PQ node’s Prefix-SID (16004 for B).',
      ],
    },
    {
      w: w3,
      title: 'Never in any set',
      color: C.orange,
      body: [
        'S can’t pass its own tests, and E is never listed: if E were in some P(N), N would already be an LFA (D17).',
        { note: 'Extended P-space is on by default; untick it and PQ = {B} here.' },
      ],
    },
  ])

  // ── Takeaway ──────────────────────────────────────────────────────────
  const t = s.panel(0, r3.bottom + G, W, {
    title: 'Takeaway',
    color: C.yellow,
    body: [
      'P-space = routers S reaches without the failed link; Q-space = routers that reach E without it. A router in both (a PQ node) is a safe place to tunnel to. Remote LFA fixes most rings, but fails when P-space and Q-space don’t meet.',
    ],
  })
  s.text(
    0,
    t.y + t.h + 14,
    'Sources: docs/02-algorithms.md §3, §6  ·  docs/learn/05-remote-lfa.md  ·  examples/02-ring5.yaml, 03-ring5-highmetric.yaml',
    { size: 16, color: C.muted },
  )
  return s
}

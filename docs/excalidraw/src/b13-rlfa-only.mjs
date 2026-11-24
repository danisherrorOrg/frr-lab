// B13 · Remote LFA only when there is no LFA (docs/02-algorithms.md §3), drawn on
// Example 2 (examples/02-ring5.yaml): link S–E has PQ node B for every destination,
// but only E uses it; C has the LFA A. Numbers from computeForSource(), computeCoverage().
import { Scene, C } from '../lib/scene.mjs'

export default function draw() {
  const s = new Scene('b13')
  const W = 1640
  const G = 20

  s.text(0, 0, 'B13 · Remote LFA only when there is no LFA', { size: 40, color: C.blue.s })
  s.text(
    0,
    58,
    '§3 of docs/02-algorithms.md  ·  RFC 7490 Abstract, §1  ·  code: src/engine/index.ts, rlfa.ts (rlfa.needed)',
    { size: 18, color: C.muted, maxW: W },
  )

  const r1 = s.row(0, 110, G, [
    {
      w: 600,
      title: 'Example 2: link S–E fails, two destinations',
      color: C.blue,
      drawH: 400,
      body: [
        {
          note: 'Red dashed: the failed link S–E. PQ = {B, C}, best B, for both rows.',
          color: C.red.s,
        },
        {
          note: 'Green: D = C has an LFA, A (2 < 1 + 2 = 3). S just sends to A: no tunnel.',
          color: C.green.s,
        },
        {
          note: 'Teal: D = E has no LFA (2 = 1 + 1). Only here does S tunnel to PQ node B (label 16004), which forwards B → C → E.',
          color: C.teal.s,
        },
      ],
    },
    {
      w: W - 600 - G,
      title: 'The rule: try LFA first; tunnel only if no neighbor is safe',
      color: C.blue,
      body: [
        {
          mono: 'best LFA exists for (S, D, S–E)   →  use it;  Remote LFA not needed\nno LFA                            →  tunnel to the best PQ node (B11), if any',
          size: 16,
        },
        '•  An LFA is just another next hop: no tunnel, no extra label, nothing the far end has to understand. A Remote LFA tunnel needs an extra label, and the repair path is often longer.\n•  RFC 7490 extends LFA: it adds backups "when none can be provided by the basic mechanisms" (RFC 5286).\n•  P, Q and PQ are still worked out and shown on every row, for teaching. The detail panel says "Remote LFA not needed".',
        { head: 'Example 2, every row from S (from the engine)' },
        {
          mono: [
            'D   Link   LFA                          PQ (best)    Remote LFA used?',
            '--  -----  ---------------------------  -----------  -----------------------------',
            'C   S–E    A   (2 < 1 + 2 = 3  ✓)       {B, C} (B)   no: LFA A already protects C',
            'E   S–E    none (2 = 1 + 1  ✗)          {B, C} (B)   yes: tunnel to B, 16004',
            'B   S–A    E   (2 < 1 + 2 = 3  ✓)       {B, C} (C)   no: LFA E already protects B',
            'A   S–A    none (2 = 1 + 1  ✗)          {B, C} (C)   yes: tunnel to C, 16005',
          ].join('\n'),
          size: 15,
        },
        { head: 'How often the PQ node is not used (every router as the source)' },
        {
          mono: [
            'Example          Remote LFA needed   Not needed (an LFA exists)',
            '---------------  -----------------   --------------------------',
            '2  ring          10                  10',
            '4  ISP core      8                   27',
            '5  leaf-spine    16                  32',
            '8                9                   24',
          ].join('\n'),
          size: 15,
        },
        {
          note: 'Counted per (source, D, link) row. In every "not needed" row of these examples a PQ node exists anyway: it just isn’t installed.',
        },
      ],
    },
  ])

  {
    const p = r1.panels[0]
    const ox = p.drawX
    const oy = p.drawY
    const o = { parent: p.id }
    const S = s.router('S', ox + 130, oy + 70, { ...o, bold: true })
    const E = s.router('E', ox + 430, oy + 70, { ...o, color: C.purple })
    const Cn = s.router('C', ox + 500, oy + 280, { ...o, color: C.purple })
    const B = s.router('B', ox + 280, oy + 325, { ...o, color: C.teal, bold: true })
    const A = s.router('A', ox + 60, oy + 280, { ...o, color: C.green })
    s.link(S, E, 1, { ...o, side: -1, color: C.red.s, width: 3, dashed: true })
    s.link(Cn, E, 1, { ...o, side: -1, color: C.teal.s, width: 4, arrow: true })
    s.link(B, Cn, 1, { ...o, side: -1, color: C.teal.s, width: 4, arrow: true })
    s.link(A, B, 1, { ...o, side: -1, color: C.green.s, width: 4, arrow: true })
    s.link(S, A, 1, { ...o, side: -1, color: C.green.s, width: 4, arrow: true })
    s.label(S.cx, S.cy - 54, 'source', { size: 16, color: C.muted, parent: p.id })
    s.label(E.cx, E.cy - 54, 'D = E: Remote LFA', { size: 16, color: C.teal.s, parent: p.id })
    s.label(Cn.cx, Cn.cy + 52, 'D = C: LFA', { size: 16, color: C.green.s, parent: p.id })
    s.label(A.cx, A.cy + 52, 'LFA for C', { size: 16, color: C.green.s, parent: p.id })
    s.label(B.cx, B.cy + 52, 'PQ node', { size: 16, color: C.teal.s, parent: p.id })
  }

  const w3 = (W - 2 * G) / 3
  const r2 = s.row(0, r1.bottom + G, G, [
    {
      w: w3,
      title: 'Part of the protection order (B20)',
      color: C.green,
      body: [
        { mono: 'ECMP → LFA → Remote LFA → TI-LFA', size: 16 },
        'Each pair is credited to the simplest method that protects it. In the ring from S: 2 pairs LFA, 2 pairs Remote LFA. Over all sources: 20 pairs, LFA 10, LFA or Remote LFA 20.',
      ],
    },
    {
      w: w3,
      title: 'A link-only LFA still counts',
      color: C.orange,
      body: [
        'In node mode (A6) an LFA that isn’t node-protecting still stops Remote LFA from running. To make Remote LFA take over, the LFA policy must rule it out: node_protecting: require (A16).',
        { note: '§15: with both knobs on require, S → D has no LFA left, so Remote LFA is used.' },
      ],
    },
    {
      w: w3,
      title: 'Edge cases',
      color: C.gray,
      body: [
        '•  ECMP-protected pairs (B2) never need Remote LFA either.\n•  No LFA and no PQ node (Example 3): only TI-LFA protects (A5).\n•  The simulation (A9) follows the same order: LFA if there is one, else the PQ tunnel.',
      ],
    },
  ])

  const t = s.panel(0, r2.bottom + G, W, {
    title: 'Takeaway',
    color: C.yellow,
    body: [
      'Remote LFA is a fallback: S only tunnels to a PQ node when no neighbor is a safe LFA for that destination. On the same failed link, the ring’s C uses LFA A while E uses the tunnel to B. The spaces are always shown, but the tunnel is installed only where it is needed.',
    ],
  })
  s.text(
    0,
    t.y + t.h + 14,
    'Sources: docs/02-algorithms.md §3, §5, §15  ·  docs/learn/05-remote-lfa.md  ·  examples/02-ring5.yaml, 04-isp-core.yaml, 05-leaf-spine.yaml, 08-node-protection.yaml  ·  checked with computeForSource(), computeCoverage()',
    { size: 16, color: C.muted, maxW: W },
  )
  return s
}

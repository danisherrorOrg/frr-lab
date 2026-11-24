// B7 · Best LFA tie-break (docs/02-algorithms.md §2, D7, D16): the five steps,
// each with a real decision from the examples (checked with computeLfa()).
import { Scene, C } from '../lib/scene.mjs'

export default function draw() {
  const s = new Scene('b07')
  const W = 1640
  const G = 20

  s.text(0, 0, 'B7 · Best LFA: which loop-free neighbor wins', { size: 40, color: C.blue.s })
  s.text(
    0,
    58,
    '§2 of docs/02-algorithms.md  ·  RFC 5286 §1, §3.6 (criteria; the order is our policy, DECISIONS.md D7, D16)  ·  code: src/engine/lfa.ts (betterLfa, chooseBestLfa)',
    { size: 18, color: C.muted, maxW: W },
  )

  const steps = [
    {
      t: 'Candidates: loop-free (B3), not skipped (B6),\nnot ruled out by a policy "require" (A16)',
      c: C.gray,
    },
    { t: '1  node-protecting before link-only (B5)', c: C.blue },
    { t: '2  downstream before not downstream (B4)', c: C.blue },
    { t: '3  lowest backup cost  c(S,N) + dist(N,D)', c: C.blue },
    { t: '4  lowest router id', c: C.blue },
    { t: '5  lowest link id (parallel links only, A10)', c: C.blue },
    { t: 'Best LFA: installed as the backup next hop', c: C.green },
  ]
  const BH = 54
  const GAP = 22

  const r1 = s.row(0, 110, G, [
    {
      w: 600,
      title: 'The order: first difference wins',
      color: C.blue,
      drawH: steps.length * BH + (steps.length - 1) * GAP + 6,
      body: [
        {
          note: 'Compare two candidates step by step. The first step where they differ decides; later steps only break ties.',
        },
        {
          note: 'Safety first (survives router E, no microloops), then cost, then a fixed id order so every run gives the same answer (project rule 1).',
        },
      ],
    },
    {
      w: W - 600 - G,
      title: 'Each step decides a real case (from the engine)',
      color: C.blue,
      body: [
        {
          mono: [
            'Step  Example     PLR → D (primary)  Candidates  (NP = node-prot., DS = downstream)   Best',
            '----  ----------  -----------------  ------------------------------------------------  ----',
            '1     §15 policy  S → D   (via E)    A: DS, cost 12      B: NP, cost 13                B',
            '1     6           N → D   (via E)    S: –, cost 3        M: NP, cost 20                M',
            '2     4 ISP core  P4 → PE1 (via P2)  P1: NP DS, cost 50  P3: NP, cost 50               P1',
            '3     §15, both   S → D   (via E)    A: cost 12          B: cost 13                    A',
            '      ignore',
            '3     11          D → S   (via E)    A: NP DS, cost 40   B: NP DS, cost 30             B',
            '4     5 leaf-     SP1 → SP2          L2, L3, L4: NP DS, cost 20 each                   L2',
            '      spine       (fail L1–SP1)',
          ].join('\n'),
          size: 14,
        },
        { head: 'The numbers behind each row' },
        {
          mono: [
            '§15   A: 10 + dist(A,D) 2 = 12, but A → E → D: 2 < 1 + 1 ✗ not NP.  B: 2 + 11 = 13, 11 < 12 + 1 ✓ NP',
            '6     S: 1 + 2 = 3, S → E → D: 2 < 1 + 1 ✗.  M: 10 + 10 = 20, 10 < 11 + 1 ✓',
            '4     P1: c(P4,P1) 40 + 10 = 50, 10 < 20 ✓ DS.  P3: 30 + 20 = 50, 20 < 20 ✗',
            '11    A: 30 + 10 = 40.  B: 15 + 15 = 30   (IGP metric, not the Flex-Algo delay)',
            '5     each: 10 + 10 = 20, all NP and DS: the lowest id L2 wins',
          ].join('\n'),
          size: 14,
        },
        {
          note: 'Step 5 needs two equal links to the same neighbor, equal on every other step. None of the examples reaches it; Example 7’s bundle S–E has metrics 10 and 20, so step 3 decides there.',
        },
        {
          note: 'Leaf-spine, SP1 → SP2 is also ECMP-protected (B2): the table credits ECMP, the simpler method (B20).',
        },
      ],
    },
  ])

  {
    const p = r1.panels[0]
    const ox = p.drawX
    const oy = p.drawY + 2
    const bw = p.drawW
    const ids = []
    steps.forEach((st, i) => {
      const y = oy + i * (BH + GAP)
      const id = s.rect(ox, y, bw, BH, {
        stroke: st.c.s,
        fill: '#ffffff',
        strokeWidth: i === 0 || i === steps.length - 1 ? 2 : 3,
        parent: p.id,
      })
      const size = st.t.includes('\n') ? 15 : 17
      s.label(ox + bw / 2, y + BH / 2, st.t, {
        size,
        family: i >= 1 && i <= 5 ? 'mono' : 'sans',
        color: st.c.s,
        parent: id,
      })
      ids.push({ id, y })
    })
    for (let i = 0; i + 1 < ids.length; i++) {
      const x = ox + bw / 2
      s.line(
        [
          [x, ids[i].y + BH + 2],
          [x, ids[i + 1].y - 2],
        ],
        {
          stroke: C.muted,
          strokeWidth: 2,
          arrow: true,
          parent: p.id,
          ends: [ids[i].id, ids[i + 1].id],
        },
      )
    }
  }

  const w3 = (W - 2 * G) / 3
  const r2 = s.row(0, r1.bottom + G, G, [
    {
      w: w3,
      title: 'Why this order',
      color: C.green,
      body: [
        'RFC 5286 §1: a router SHOULD pick a node-protecting LFA over a link-only one. §3.6 adds downstream. After that the RFC leaves it to "distance, IP addresses, or any router-local tie-breaker", so lowest cost then lowest id is our choice (D7, D16).',
      ],
    },
    {
      w: w3,
      title: 'LFA policy changes steps 1 and 2 (A16)',
      color: C.orange,
      body: [
        {
          mono: [
            '§15 example, S → D        Best',
            '-----------------------   -----------',
            'default                   B',
            'node_protecting: ignore   A  (step 2)',
            'both ignore               A  (step 3)',
            'downstream: require       A',
            'node_protecting: require  B',
            'both require              none → RLFA',
          ].join('\n'),
          size: 14,
        },
      ],
    },
    {
      w: w3,
      title: 'Edge cases',
      color: C.gray,
      body: [
        '•  SRLG mode (A19): "SRLG-disjoint first" goes in front of step 1 (RFC 7916 §6.2.4.1).\n•  Only loop-free candidates are ranked: a cheaper one that fails B3 is never picked.\n•  Router id order is plain text order of the ids ("L2" < "L3").',
      ],
    },
  ])

  const t = s.panel(0, r2.bottom + G, W, {
    title: 'Takeaway',
    color: C.yellow,
    body: [
      'When several neighbors are loop-free, pick the safest first: one that survives router E failing, then one that is closer to D. Only then the cheapest, and finally the lowest id, so the answer is always the same. A cheaper backup can lose to a safer one (§15: B at 13 beats A at 12).',
    ],
  })
  s.text(
    0,
    t.y + t.h + 14,
    'Sources: docs/02-algorithms.md §2, §15 (worked example)  ·  docs/learn/04-lfa.md (Choosing the best LFA)  ·  examples/04-isp-core.yaml, 05-leaf-spine.yaml, 06-link-protecting.yaml, 07-parallel.yaml, 11-flex-algo.yaml  ·  checked with computeLfa()',
    { size: 16, color: C.muted, maxW: W },
  )
  return s
}

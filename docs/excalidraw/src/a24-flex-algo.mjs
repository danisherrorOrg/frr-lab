// A24 · Flex-Algo (docs/02-algorithms.md §23), drawn on Example 11
// (examples/11-flex-algo.yaml): Flex-Algo 128 = lowest delay, exclude red.
import { Scene, C } from '../lib/scene.mjs'

export default function draw() {
  const s = new Scene('a24')
  const W = 1640
  const G = 20

  s.text(0, 0, 'A24 · Flex-Algo: a second SPF with its own rules', { size: 40, color: C.blue.s })
  s.text(
    0,
    58,
    '§23 of docs/02-algorithms.md  ·  RFC 9350 §5–6 (§6.1: repairs stay in the algorithm), RFC 8667 §2.1  ·  code: src/engine/flex-algo.ts',
    { size: 18, color: C.muted, maxW: W },
  )

  const r1 = s.row(0, 110, G, [
    {
      w: 600,
      title: 'Example 11, in Flex-Algo 128',
      color: C.blue,
      drawH: 400,
      body: [
        {
          note: 'Algorithm 128 = lowest delay, exclude red. Link labels: delay in µs, its metric.',
        },
        {
          note: 'Gray dashed: S–E has affinity red, so algorithm 128 leaves it out.',
          color: C.muted,
        },
        {
          note: 'Blue: S → D in 128, S→A→D (20 µs). Red dashed: the protected link S–A.',
          color: C.ink,
        },
        { note: 'Green: the repair, LFA B and TI-LFA S→B→D (100 µs).', color: C.green.s },
      ],
    },
    {
      w: W - 600 - G,
      title: 'How it works: flexTopology(t, algo) is the network the algorithm sees',
      color: C.blue,
      body: [
        {
          mono: 'flex_algo: [{ algo: 128, metric: delay, exclude_any: [red] }]\nlinks: affinity: [red], te_metric, delay (µs)   routers: algos: [128], algo_sids',
          size: 15,
        },
        '•  Routers: those that take part (algos, left out = all). Each gets its own Prefix-SID for the algorithm: algo_sids, else its index + 1000 × the algorithm’s place in the list (128 first: +1000).\n•  Links: between taking-part routers, passing the colour rules (exclude-any, include-any, include-all), and having the metric (no TE metric or delay → left out). Their cost is that metric.\n•  Everything else (SRGB, MSD, LFA policy, protection goal) is the network’s.',
        { head: 'FRR stays inside the algorithm (RFC 9350 §6.1)' },
        'So LFA, Remote LFA, TI-LFA, the simulation and coverage run unchanged on flexTopology.',
        {
          mono: [
            '              Algorithm 0 (IGP metric)              Algorithm 128 (delay, no red)',
            '------------  ------------------------------------  -------------------------------------',
            'S → D         S-E-D, 10 + 10 = 20                   S-A-D, 10 + 10 = 20 µs  (S–E gone)',
            'protected     S–E                                   S–A',
            'LFA B         15 < dist(B,S)+dist(S,D) = 15+20 ✓    50 < dist(B,S)+dist(S,D) = 50+20 ✓',
            '              downstream 15 < 20 ✓                  downstream 50 < 20 ✗',
            '              node-prot. 15 < 25+10 ✓               node-prot. 50 < dist(B,A)+dist(A,D)',
            '                                                               = 60+10 ✓',
            'TI-LFA        S-B-D  [PrefixSID(D)] = 16005         S-B-D  [PrefixSID(D) in 128] = 17005',
          ].join('\n'),
          size: 14,
        },
        { note: 'D’s SID index is 5: 16000 + 5 in algorithm 0, 16000 + 1005 in 128.' },
      ],
    },
  ])

  {
    const p = r1.panels[0]
    const ox = p.drawX
    const oy = p.drawY
    const o = { parent: p.id }
    const S = s.router('S', ox + 50, oy + 200, { ...o, bold: true })
    const E = s.router('E', ox + 280, oy + 50, o)
    const A = s.router('A', ox + 280, oy + 200, o)
    const B = s.router('B', ox + 280, oy + 350, { ...o, color: C.green })
    const D = s.router('D', ox + 510, oy + 200, { ...o, color: C.purple })
    s.link(S, E, '100  red', {
      ...o,
      side: -1,
      color: C.muted,
      dashed: true,
      mcolor: C.muted,
      msize: 17,
    })
    s.link(E, D, 100, { ...o, side: -1, color: C.muted, msize: 17, mcolor: C.muted })
    s.link(S, A, 10, { ...o, side: -1, color: C.red.s, width: 3, dashed: true, msize: 17 })
    s.link(A, D, 10, { ...o, side: -1, color: C.blue.s, width: 4, arrow: true, msize: 17 })
    s.link(S, B, 50, { ...o, side: 1, color: C.green.s, width: 4, arrow: true, msize: 17 })
    s.link(B, D, 50, { ...o, side: 1, color: C.green.s, width: 4, arrow: true, msize: 17 })
    s.label(D.cx, D.cy - 52, 'destination', { size: 16, color: C.purple.s, parent: p.id })
    s.label(B.cx + 120, B.cy, 'LFA, 17005', { size: 16, color: C.green.s, parent: p.id })
    s.label(S.cx + 4, S.cy - 52, 'source', { size: 16, color: C.muted, parent: p.id })
  }

  const w3 = (W - 2 * G) / 3
  const r2 = s.row(0, r1.bottom + G, G, [
    {
      w: w3,
      title: 'Why the repair must stay inside',
      color: C.red,
      body: [
        'Algorithm 128 exists to keep traffic on low-delay links and off red ones. A repair computed in algorithm 0 could use exactly the link the operator wanted to avoid: S–E is red.',
        { note: 'RFC 9350 §6.1: repair paths for a Flex-Algo prefix MUST use the same Flex-Algo.' },
      ],
    },
    {
      w: w3,
      title: 'In the app',
      color: C.green,
      body: [
        'The sidebar’s Algorithm picker makes the algorithm’s network the one on screen. It is read-only, because its metrics aren’t the IGP metrics (moving routers still works).',
        { note: 'In SRv6 (A25) each algorithm has its own locator (RFC 9350 §14).' },
      ],
    },
    {
      w: w3,
      title: 'Edge cases',
      color: C.gray,
      body: [
        '•  SID indices are checked unique over all algorithms: they share the SRGB.\n•  LANs keep only the IGP metric (no TE metric or delay on them here).\n•  A Flex-Algo on the IGP metric with no rules gives algorithm 0’s paths (a property test).',
      ],
    },
  ])

  const t = s.panel(0, r2.bottom + G, W, {
    title: 'Takeaway',
    color: C.yellow,
    body: [
      'A Flex-Algo is another SPF in the same network, with its own metric, its own link rules and its own Prefix-SIDs. Its FRR runs on that same restricted network. In Example 11, algorithm 128 drops the red link S–E, sends S → D via A, and repairs via B with label 17005.',
    ],
  })
  s.text(
    0,
    t.y + t.h + 14,
    'Sources: docs/02-algorithms.md §23  ·  docs/learn/11-advanced-topics.md (Flex-Algo)  ·  examples/11-flex-algo.yaml  ·  checked with flexTopology(), computeForSource()',
    { size: 16, color: C.muted, maxW: W },
  )
  return s
}

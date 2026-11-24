// A19 · SRLG: links that fail together (docs/02-algorithms.md §18), drawn on
// Example 9 (examples/09-srlg.yaml): S → D over S–E, with S–E and A–B in duct-1.
import { Scene, C } from '../lib/scene.mjs'

export default function draw() {
  const s = new Scene('a19')
  const W = 1640
  const G = 20

  s.text(0, 0, 'A19 · SRLG: links that fail together', { size: 40, color: C.blue.s })
  s.text(
    0,
    58,
    '§18 of docs/02-algorithms.md  ·  RFC 4202 §2.3, RFC 9855 §1, RFC 7916 §6.2.4.1  ·  code: src/engine/srlg.ts, lfa.ts, tilfa.ts',
    { size: 18, color: C.muted, maxW: W },
  )

  const r1 = s.row(0, 110, G, [
    {
      w: 600,
      title: 'Example 9: one duct, two links',
      color: C.blue,
      drawH: 400,
      body: [
        {
          note: 'All metrics 1, except S–C and C–D = 3. S–E and A–B run in duct-1: one backhoe cuts both.',
        },
        { note: 'Blue: S’s normal path S→E→D (2). Red dashed: duct-1.', color: C.ink },
        {
          note: 'Orange: link protection, LFA A: S→A→B→D (3), straight into the duct.',
          color: C.orange.s,
        },
        { note: 'Green: SRLG protection, LFA C and TI-LFA: S→C→D (6).', color: C.green.s },
      ],
    },
    {
      w: W - 600 - G,
      title: 'How it works: the protected link brings its shared links along',
      color: C.blue,
      body: [
        'A link lists its groups (srlg: [duct-1]). For S–E, the shared links are the other links with a group in common: here A–B. Both directions fail.',
        {
          mono: 'avoids shared link u→v:  dist(X,Y) < dist(X,u) + c(u,v) + dist(v,Y)\n(a tie counts as "may use it", as in B1)',
        },
        '•  TI-LFA (RFC 9855 §1): the post-convergence SPF also removes A–B; every segment must avoid it too.\n•  LFA (RFC 7916 §6.2.4.1): SRLG-disjoint candidates rank first (S→N is not shared, and N’s path avoids every shared link), then the usual order (B7). A candidate in the SRLG is still an LFA for the link alone.\n•  Remote LFA: the PQ node is picked as usual (RFC 7490 has no SRLG rule), then checked. If the tunnel and the PQ node’s path avoid A–B, it also counts as SRLG protection.',
        { head: 'S → D: the two candidates' },
        {
          mono: [
            'N  Loop-free         Node-protecting        SRLG-disjoint                                  Cost',
            '-  ----------------  ---------------------  ---------------------------------------------  ----',
            'A  2 < 1+2  ✓        2 < 2+1  ✓             A’s path A-B-D uses A–B  ✗                     3',
            'C  3 < 3+2  ✓        3 < 4+1  ✓             3 < dist(C,A)+1+dist(B,D) = 4+1+1 = 6  ✓       6',
            '                                            3 < dist(C,B)+1+dist(A,D) = 4+1+2 = 7  ✓',
          ].join('\n'),
          size: 14,
        },
        {
          mono: 'protection: link   LFA A   TI-LFA S-A-B-D  [Prefix B, Prefix D] = 16004 16006\nprotection: srlg   LFA C   TI-LFA S-C-D    [Prefix D]           = 16006',
          size: 15,
        },
      ],
    },
  ])

  {
    const p = r1.panels[0]
    const ox = p.drawX
    const oy = p.drawY
    const o = { parent: p.id }
    const S = s.router('S', ox + 40, oy + 200, { ...o, bold: true })
    const E = s.router('E', ox + 300, oy + 50, o)
    const A = s.router('A', ox + 190, oy + 200, { ...o, color: C.orange })
    const B = s.router('B', ox + 390, oy + 200, o)
    const Cn = s.router('C', ox + 300, oy + 350, { ...o, color: C.green })
    const D = s.router('D', ox + 530, oy + 200, { ...o, color: C.purple })
    const red = { parent: p.id, color: C.red.s, width: 3, dashed: true, mcolor: C.red.s }
    s.link(S, E, '1  duct-1', { ...red, side: -1 })
    s.link(A, B, '1  duct-1', { ...red, side: -1 })
    s.link(E, D, 1, { parent: p.id, side: -1, color: C.blue.s, width: 4, arrow: true })
    s.link(S, A, 1, { parent: p.id, side: -1, color: C.orange.s, width: 3, arrow: true })
    s.link(B, D, 1, { parent: p.id, side: -1, color: C.orange.s, width: 3, arrow: true })
    s.link(S, Cn, 3, { parent: p.id, side: 1, color: C.green.s, width: 4, arrow: true })
    s.link(Cn, D, 3, { parent: p.id, side: 1, color: C.green.s, width: 4, arrow: true })
    s.label(D.cx - 6, D.cy + 52, 'destination', { size: 16, color: C.purple.s, parent: p.id })
    s.label(S.cx + 4, S.cy - 52, 'source', { size: 16, color: C.muted, parent: p.id })
  }

  const w3 = (W - 2 * G) / 3
  const r2 = s.row(0, r1.bottom + G, G, [
    {
      w: w3,
      title: 'Fail the whole duct',
      color: C.red,
      body: [
        'Failing an SRLG is the multi-failure of A9 with every link of the group down: "Fail SRLG duct-1 (2 links)".',
        {
          mono: 'link: S → A, A hits A–B,\n      A repairs again → loops\nsrlg: S → C → D (6), delivered,\n      repaired by S alone',
          size: 15,
        },
      ],
    },
    {
      w: w3,
      title: 'Fallback, one step at a time',
      color: C.orange,
      body: [
        {
          mono: 'srlg:       SRLG → link\nnode-srlg:  node + SRLG → node\n            → SRLG → link',
          size: 15,
        },
        'The first that reaches D is installed; protects says which, fallback says why.',
        { mono: 'S → E, node-srlg: D = E, so SRLG only\nS-C-D-E (7), dest-is-next-hop', size: 14 },
        { note: 'With C–D also in duct-1, D can’t be reached: link protection, fallback none.' },
      ],
    },
    {
      w: w3,
      title: 'Coverage from S',
      color: C.green,
      body: [
        'Coverage adds srlg: pairs whose link has shared links, and how many backups avoid them all.',
        {
          mono: 'SRLG pairs                 2  (D, E over S–E)\nSRLG-safe LFA or RLFA      1  (D: LFA C)\nSRLG-safe TI-LFA           2',
          size: 15,
        },
        {
          note: 'E’s PQ node B is reached over S-A-B, through the duct. A link with no SRLG: SRLG protection = link protection.',
        },
      ],
    },
  ])

  const t = s.panel(0, r2.bottom + G, W, {
    title: 'Takeaway',
    color: C.yellow,
    body: [
      'Links in the same SRLG fail together, so a backup for one of them must avoid all of them. With protection: srlg, TI-LFA removes the whole group and LFA prefers a neighbor whose path stays out of it. In Example 9 that moves the repair from S-A-B-D, which runs into the duct, to S-C-D.',
    ],
  })
  s.text(
    0,
    t.y + t.h + 14,
    'Sources: docs/02-algorithms.md §18  ·  docs/learn/09-router-and-multiple-failures.md  ·  examples/09-srlg.yaml  ·  checked with the engine (results, coverage, simulation)',
    { size: 16, color: C.muted, maxW: W },
  )
  return s
}

// B6 · Excluded neighbors (docs/02-algorithms.md §2, RFC 5286 §3.5), drawn on
// Example 1 (examples/01-square.yaml) with the link S–N set to the IS-IS maximum
// metric 16,777,215. Numbers checked with computeForSource() on that variant.
import { Scene, C } from '../lib/scene.mjs'

export default function draw() {
  const s = new Scene('b06')
  const W = 1640
  const G = 20

  s.text(0, 0, 'B6 · Excluded neighbors: never an LFA over a max-metric link', {
    size: 40,
    color: C.blue.s,
  })
  s.text(
    0,
    58,
    '§2 of docs/02-algorithms.md  ·  RFC 5286 §3.5 (MUST NOT), RFC 7490 §5.4  ·  DECISIONS.md D16, D17  ·  code: src/engine/lfa.ts (MAX_METRIC, computeLfa → skipped)',
    { size: 18, color: C.muted, maxW: W },
  )

  const r1 = s.row(0, 110, G, [
    {
      w: 600,
      title: 'Example 1, with S–N set to 16,777,215',
      color: C.blue,
      drawH: 400,
      body: [
        {
          note: 'The square, but the operator has set link S–N to the maximum metric (both ways): "don’t send traffic here".',
        },
        { note: 'Red dashed: the failed link S–E.', color: C.red.s },
        {
          note: 'Orange: the max-metric link. N would pass Inequality 1, but it is skipped before any check.',
          color: C.orange.s,
        },
        { note: 'Blue: the primary path S → E → D (20).', color: C.blue.s },
      ],
    },
    {
      w: W - 600 - G,
      title: 'The rule: skip N if the link either way has the max metric',
      color: C.blue,
      body: [
        {
          mono: 'skip N   ⇔   c(S,N) = 16,777,215   or   c(N,S) = 16,777,215',
          size: 18,
        },
        '•  16,777,215 (2²⁴ − 1) is the highest IS-IS wide metric. Operators set it to drain a link, e.g. before maintenance.\n•  RFC 5286 §3.5: S MUST NOT consider such an N as an alternate, even if it passes every inequality.\n•  Checked in both directions: either one means the operator doesn’t want traffic on that link.\n•  The skip happens first, so N is not a candidate at all. Explain says: Via N: skipped, link S–N has the maximum metric 16777215.',
        { head: 'Worked checks (from the engine, S → D, link S–E fails)' },
        {
          mono: [
            'S–N metric           LFA                           Remote LFA                 TI-LFA',
            '-------------------  ----------------------------  -------------------------  -------------------------',
            '15 (Example 1)       N  (10 < 15 + 20 = 35  ✓)     not needed                 [PrefixSID(D)], cost 25',
            'max both ways        none: N skipped               none: no PQ node           [PrefixSID(D)] out via N,',
            '                     (would pass: 10 < 30 + 20)    (N: 30 < 10 + 20 = 30 ✗)   cost 16,777,225',
            'max N→S only         none: N skipped               PQ N, cost 15              [PrefixSID(D)], cost 25',
            '                     (would pass: 10 < 30 + 20)    (N: 15 < 10 + 20 = 30 ✓)',
          ].join('\n'),
          size: 14,
        },
        {
          note: 'Max both ways: dist(S,N) and dist(N,S) become 30 (round via E and D), so N leaves P-space too. TI-LFA still repairs over S–N, because SPF still uses max-metric links. RFC 5305 §3.7 says it shouldn’t: this is logged as an open item in DECISIONS.md D16.',
          color: C.red.s,
        },
        {
          note: 'Max N→S only: S still reaches N for 15, so plain P-space holds N and the Remote LFA tunnel goes out over S→N. RFC 7490 §5.4 only bars N as an extended-P-space exit (D17).',
        },
      ],
    },
  ])

  {
    const p = r1.panels[0]
    const ox = p.drawX
    const oy = p.drawY
    const o = { parent: p.id }
    const S = s.router('S', ox + 120, oy + 90, { ...o, bold: true })
    const E = s.router('E', ox + 440, oy + 90, o)
    const N = s.router('N', ox + 120, oy + 320, { ...o, color: C.orange })
    const D = s.router('D', ox + 440, oy + 320, { ...o, color: C.purple })
    s.link(S, E, 10, { ...o, side: -1, color: C.red.s, width: 3, dashed: true })
    s.link(E, D, 10, { ...o, side: -1, color: C.blue.s, width: 4, arrow: true })
    s.link(S, N, '16,777,215', {
      ...o,
      side: -1,
      color: C.orange.s,
      width: 4,
      dashed: true,
      mcolor: C.orange.s,
      msize: 18,
    })
    s.link(N, D, 10, { ...o, side: 1 })
    s.label(S.cx, S.cy - 54, 'source', { size: 16, color: C.muted, parent: p.id })
    s.label(E.cx, E.cy - 54, 'primary next hop', { size: 16, color: C.blue.s, parent: p.id })
    s.label(N.cx, N.cy + 52, 'skipped: max metric', {
      size: 16,
      color: C.orange.s,
      parent: p.id,
    })
    s.label(D.cx, D.cy + 52, 'destination', { size: 16, color: C.purple.s, parent: p.id })
  }

  const w3 = (W - 2 * G) / 3
  const r2 = s.row(0, r1.bottom + G, G, [
    {
      w: w3,
      title: 'Other neighbors skipped first',
      color: C.orange,
      body: [
        'computeLfa() skips a link out of S before any check for four reasons, each shown in Explain:',
        {
          mono: 'max-metric  this rule (RFC 5286 §3.5)\noverload    N has the overload bit\n            (§3.5, A17)\nexcluded    lfa_exclude: [N] on S\n            (RFC 7916 §6.2.4.4, A16)\nsame-lan    S–N is on the same LAN as\n            S–E (§3.6, A21)',
          size: 14,
        },
      ],
    },
    {
      w: w3,
      title: 'Without it',
      color: C.red,
      body: [
        'The operator drains S–N to work on it, a link fails, and the LFA puts traffic straight onto S–N anyway. The repair lands on the one link that was meant to be empty.',
        {
          note: 'A metric of 16,777,214 is just a very high cost: N is then checked like any other neighbor.',
        },
      ],
    },
    {
      w: w3,
      title: 'What it doesn’t change',
      color: C.gray,
      body: [
        '•  ECMP (B2): an excluded neighbor that is a normal next hop still counts. That is normal forwarding, not an alternate.\n•  Remote LFA: only the extended-P-space exits are skipped (D17).\n•  TI-LFA: the post-convergence path is plain SPF without S–E.',
      ],
    },
  ])

  const t = s.panel(0, r2.bottom + G, W, {
    title: 'Takeaway',
    color: C.yellow,
    body: [
      'A link with the maximum metric 16,777,215, in either direction, means "keep traffic off". So the neighbor behind it is never used as an LFA, even when it passes every inequality. The same skip happens for an overloaded neighbor, one the LFA policy excludes, and one on the same LAN.',
    ],
  })
  s.text(
    0,
    t.y + t.h + 14,
    'Sources: docs/02-algorithms.md §2, §3, §15  ·  docs/learn/04-lfa.md (Some details)  ·  examples/01-square.yaml with S–N = 16777215  ·  tests/engine/lfa.test.ts (max metric)  ·  checked with computeForSource()',
    { size: 16, color: C.muted, maxW: W },
  )
  return s
}

// A10 · Parallel links (docs/02-algorithms.md §9, RFC 5286 §3.4–3.6), drawn on
// Example 7 (examples/07-parallel.yaml).
import { Scene, C } from '../lib/scene.mjs'

// One link of a bundle: a line shifted `off` px sideways from the centre line,
// with its label a further `lab` px out on the same side.
function member(s, a, b, off, label, o) {
  const dx = b.cx - a.cx
  const dy = b.cy - a.cy
  const L = Math.hypot(dx, dy)
  const [ux, uy] = [dx / L, dy / L]
  const [nx, ny] = [-uy, ux]
  const t = Math.sqrt(a.r * a.r - off * off) + 4
  s.line(
    [
      [a.cx + ux * t + nx * off, a.cy + uy * t + ny * off],
      [b.cx - ux * t + nx * off, b.cy - uy * t + ny * off],
    ],
    {
      stroke: o.color ?? C.muted,
      strokeWidth: o.width ?? 2,
      dashed: o.dashed,
      arrow: o.arrow,
      parent: o.parent,
      ends: [a.eid, b.eid],
    },
  )
  const k = off + Math.sign(off) * o.lab
  s.label(a.cx + dx / 2 + nx * k, a.cy + dy / 2 + ny * k, label, {
    size: 17,
    color: o.lcolor ?? C.ink,
    parent: o.parent,
  })
}

export default function draw() {
  const s = new Scene('a10')
  const W = 1640
  const G = 20

  s.text(0, 0, 'A10 · Parallel links (bundles)', { size: 40, color: C.blue.s })
  s.text(
    0,
    58,
    '§9 of docs/02-algorithms.md  ·  RFC 5286 §3.4–3.6  ·  each link of a bundle has its own id, metric, Adj-SID and backup  ·  code: src/engine/graph.ts',
    { size: 18, color: C.muted, maxW: W },
  )

  const r1 = s.row(0, 110, G, [
    {
      w: 600,
      title: 'Example 7: protect S-E for S → E',
      color: C.blue,
      drawH: 430,
      body: [
        { note: 'S–E is a bundle of 10 and 20; E–D a bundle of two 10s.' },
        { note: 'Red dashed: the failed link S-E (metric 10).', color: C.red.s },
        {
          note: 'Green arrow: the other link S-E#2 is the best LFA (cost 20).',
          color: C.green.s,
        },
        {
          note: 'Blue: E-D and E-D#2 are equal, so each is the other’s ECMP backup.',
          color: C.blue.s,
        },
      ],
    },
    {
      w: W - 600 - G,
      title: 'How it works: a candidate is a (link, neighbor) pair',
      color: C.blue,
      body: [
        'SPF uses the cheapest link of a bundle: dist(S,E) = 10. A link is a primary next-hop link only if it costs dist(S,E), so S-E is primary and S-E#2 is not. Each primary link gets its own protection.',
        { head: 'S → E, protect S-E: every other link out of S is a candidate (B3–B7)' },
        {
          mono: [
            'Candidate        Loop-free              Downstream   Node-prot.  Cost',
            '---------------  ---------------------  -----------  ----------  ------------',
            'A over S-A       20 < 15 + 10 = 25  ✓   20 < 10  ✗   –           15 + 20 = 35',
            'E over S-E#2      0 < 10 + 10 = 20  ✓    0 < 10  ✓   never ✗     20 +  0 = 20',
          ].join('\n'),
        },
        'Best LFA: E over S-E#2 (both link-only, and it is downstream). It protects the link, not the router.',
        { head: 'S → D, protect S-E: node protection still wins' },
        {
          mono: 'A over S-A      10 < 15 + 20 ✓   10 < 20 ✓      10 < 20 + 10 ✓   cost 25  ← best\nE over S-E#2    loop-free ✓      downstream ✓   never ✗          cost 30',
        },
        { head: 'TI-LFA keeps the other link' },
        'Only the failed link is removed, so S → E over S-E#2 (20) is the post-convergence path (S-A-D-E costs 35). The walk forces AdjSID(S→E over S-E#2) = 24002, the clean-up drops it (first hop): [PrefixSID(E)], sent out on S-E#2.',
        {
          mono: 'Adj-SIDs of S:  A 24000   S-E 24001   S-E#2 24002\nAdj-SIDs of E:  E-D 24000   E-D#2 24001   S-E 24002   S-E#2 24003',
        },
      ],
    },
  ])

  {
    const p = r1.panels[0]
    const ox = p.drawX
    const oy = p.drawY
    const S = s.router('S', ox + 110, oy + 110, { parent: p.id, bold: true })
    const E = s.router('E', ox + 440, oy + 110, { parent: p.id, color: C.purple })
    const A = s.router('A', ox + 110, oy + 350, { parent: p.id })
    const D = s.router('D', ox + 440, oy + 350, { parent: p.id })
    const P = { parent: p.id, lab: 20 }
    member(s, S, E, -14, 'S-E · 10', {
      ...P,
      color: C.red.s,
      width: 3,
      dashed: true,
      lcolor: C.red.s,
    })
    member(s, S, E, 14, 'S-E#2 · 20', {
      ...P,
      color: C.green.s,
      width: 4,
      arrow: true,
      lcolor: C.green.s,
    })
    member(s, E, D, 14, 'E-D · 10', { ...P, lab: 50, color: C.blue.s, width: 3 })
    member(s, E, D, -14, 'E-D#2 · 10', { ...P, lab: 56, color: C.blue.s, width: 3 })
    s.link(S, A, 15, { parent: p.id, side: 1 })
    s.link(A, D, 10, { parent: p.id, side: 1 })
    const tag = (r, dy, t, color = C.muted) =>
      s.label(r.cx, r.cy + dy, t, { size: 17, color, parent: p.id })
    tag(S, -76, 'source')
    tag(E, -76, 'destination', C.purple.s)
  }

  const w3 = (W - 2 * G) / 3
  const r2 = s.row(0, r1.bottom + G, G, [
    {
      w: w3,
      title: 'Why it is never node-protecting',
      color: C.red,
      body: [
        'For another link L2 to E itself, N = E:',
        {
          mono: 'loop-free   dist(E,D) < dist(E,S)+dist(S,D)\n            always ✓ (E is on S’s path)\ndownstream  dist(E,D) < dist(S,D)       ✓\nnode-prot.  dist(E,D) < 0 + dist(E,D)   ✗',
          size: 14,
        },
        'So it protects the link only (RFC 5286 §3.6). A node-protecting LFA through another router wins (B7).',
      ],
    },
    {
      w: w3,
      title: 'ECMP, Remote LFA, labels',
      color: C.teal,
      body: [
        '•  Two equal links to E are two primary next hops: ECMP-protected (E → D here).\n•  Remote LFA uses the protected link’s own metric. Another link to E is never a tunnel exit (E would be an LFA).\n•  Every link direction has its own Adj-SID, so an Adj-SID names one link.',
        {
          mono: 'Ex. 3 with B–C as a bundle 12 / 10:\n[16004, 24002, 16002]\n= B, AdjSID(B→C over B-C#2), E',
          size: 14,
        },
      ],
    },
    {
      w: w3,
      title: 'Failure checks (A9)',
      color: C.green,
      body: [
        {
          mono: 'fail S-E, LFA only:\n  E  S→E over S-E#2   20\n  D  S→A→D            25\nsource E, fail E-D:   ECMP E-D#2\nfail E-D#2 only:      not affected\nfail both:            dropped at E\n  then converge E→S→A→D',
          size: 14,
        },
        { note: 'One flow per destination: with two equal links it uses the lowest id (E-D).' },
      ],
    },
  ])

  const t = s.panel(0, r2.bottom + G, W, {
    title: 'Takeaway',
    color: C.yellow,
    body: [
      'A bundle is protected link by link. The other link to the same router is a cheap, always loop-free LFA, but it can never protect against that router failing. Not modelled: an Adj-SID for the whole bundle, LAG members under one adjacency, hashing over equal links.',
    ],
  })
  s.text(
    0,
    t.y + t.h + 14,
    'Sources: docs/02-algorithms.md §9  ·  docs/learn/11-advanced-topics.md (Parallel links)  ·  examples/07-parallel.yaml',
    { size: 16, color: C.muted },
  )
  return s
}

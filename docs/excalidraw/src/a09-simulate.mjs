// A9 · Failure simulation (docs/02-algorithms.md §8), drawn on Example 6
// (examples/06-link-protecting.yaml) with router E down, plus Example 2 link failures.
import { Scene, C } from '../lib/scene.mjs'

export default function draw() {
  const s = new Scene('a09')
  const W = 1640
  const G = 20

  s.text(0, 0, 'A9 · Failure simulation', { size: 40, color: C.blue.s })
  s.text(
    0,
    58,
    '§8 of docs/02-algorithms.md  ·  fail links or routers, then follow the traffic hop by hop  ·  code: src/engine/simulate.ts',
    { size: 18, color: C.muted, maxW: W },
  )

  const r1 = s.row(0, 110, G, [
    {
      w: 600,
      title: 'Example 6: router E fails, traffic S → D',
      color: C.blue,
      drawH: 420,
      body: [
        { note: 'S’s normal path is S → E → D (cost 2).' },
        { note: 'Red dashed: router E and all its links are down.', color: C.red.s },
        {
          note: 'Green arrows, LFA only: S repairs to N, N repairs again to M. Delivered on S → N → M → D, cost 1 + 10 + 10 = 21.',
          color: C.green.s,
        },
      ],
    },
    {
      w: W - 600 - G,
      title: 'How it works: six steps for every destination',
      color: C.blue,
      body: [
        '1. Normal path: follow S’s shortest path (lowest id on ties): S → E → D.\n2. Affected? It meets a failed link, so yes. The router just before it is the PLR (point of local repair): S, next hop E.\n3. Repair: the PLR uses the backup it built for that one link. Every other router keeps its normal table. Any router whose own link is down repairs too.\n4. Converge: remove everything that failed, run SPF again: S → N → M → D (21).\n5. Status, first match wins: unreachable, repaired, dropped, looped.\n6. Repair = final? Compare at the PLR: same, same-cost or longer.',
        { head: 'Step 3 for Example 6, in each repair mode' },
        {
          mono: [
            'Mode          What the traffic does                                     Status',
            '------------  --------------------------------------------------------  --------',
            'LFA only      S → N: S’s LFA, link-protecting only (2 < 1 + 1 fails).   repaired',
            '              N’s path is N → E → D: N finds N–E down and uses its own',
            '              LFA M, node-protecting (10 < 11 + 1).  Cost 21, = final.',
            'LFA + RLFA    the same: there is an LFA, so Remote LFA doesn’t run.     repaired',
            'TI-LFA        S pushes [16005], out via N (path S → N → E → D).         looped',
            '              N finds N–E down; its own TI-LFA path is N → S → E → D,',
            '              so the packet goes back to S with the same label.',
          ].join('\n'),
          size: 15,
        },
        {
          note: 'E as a destination is unreachable, as expected: shown on its own line, not as a protection failure. N and M are not affected.',
        },
        { head: 'The lesson' },
        'Each router only plans for its own link (RFC 9855 §1). With a router down, link-protecting TI-LFA can do worse than plain LFA. With protection: node, TI-LFA delivers on S → N → M → D (A6).',
      ],
    },
  ])

  {
    const p = r1.panels[0]
    const ox = p.drawX
    const oy = p.drawY
    const S = s.router('S', ox + 70, oy + 100, { parent: p.id, bold: true })
    const E = s.router('E', ox + 270, oy + 100, { parent: p.id, color: C.red, dashed: true })
    const D = s.router('D', ox + 490, oy + 100, { parent: p.id, color: C.purple })
    const N = s.router('N', ox + 170, oy + 300, { parent: p.id })
    const M = s.router('M', ox + 420, oy + 330, { parent: p.id })
    const red = { parent: p.id, color: C.red.s, width: 3, dashed: true }
    const grn = { parent: p.id, color: C.green.s, width: 4, arrow: true, side: 1 }
    s.link(S, E, 1, { ...red, side: -1 })
    s.link(E, D, 1, { ...red, side: -1 })
    s.link(N, E, 1, { ...red, side: 1 })
    s.link(S, N, 1, grn)
    s.link(N, M, 10, grn)
    s.link(M, D, 10, grn)
    const tag = (r, dy, t, color = C.muted) =>
      s.label(r.cx, r.cy + dy, t, { size: 17, color, parent: p.id })
    tag(S, -58, 'PLR 1: LFA N', C.green.s)
    tag(E, -58, 'router E down', C.red.s)
    tag(D, -58, 'destination', C.purple.s)
    tag(N, 58, 'PLR 2: LFA M', C.green.s)
  }

  const w3 = (W - 2 * G) / 3
  const r2 = s.row(0, r1.bottom + G, G, [
    {
      w: w3,
      title: 'One link: Example 2, fail S–E',
      color: C.green,
      body: [
        'Ring, all metrics 1. C and E are affected; S is the PLR for both.',
        {
          mono: 'TI-LFA:   C  S→A→B→C     3  same\n          E  S→A→B→C→E   4  same\nLFA only: C  LFA A, repaired\n          E  no LFA → dropped',
          size: 15,
        },
        { note: 'With one failed link, at most one router repairs and traffic never loops.' },
      ],
    },
    {
      w: w3,
      title: 'Two links: Example 2, S–E and E–C',
      color: C.red,
      body: [
        'Traffic to E, TI-LFA. S’s repair S → A → B → C → E meets C–E down at C. C’s own backup for E goes back through B and A to S: the same packet as at the start.',
        { mono: 'S→A→B→C→B→A→S…   looped', size: 15 },
        'E has lost both its links, so its status is unreachable. C survives: S → A → B → C avoids E–C.',
      ],
    },
    {
      w: w3,
      title: 'Two links, a third path',
      color: C.teal,
      body: [
        'S–E 10, E–D 10, S–A 10, A–D 15, A–B 10, B–D 10. Fail S–E and A–D, TI-LFA.',
        'S’s backup S → A → D meets A–D down at A. A’s own backup A → B → D avoids both.',
        { mono: 'S→A→B→D   30   repaired, = final', size: 15 },
      ],
    },
  ])

  const r3 = s.row(0, r2.bottom + G, G, [
    {
      w: w3,
      title: 'A router fails: what each flow is',
      color: C.orange,
      body: [
        '•  D = E: unreachable, expected\n•  not affected: the normal path avoids E\n•  survives: the PLR’s planned backup avoids E\n•  broken: the planned backup goes through E; the panel names the router just before E and why\n•  no backup: dropped at the PLR',
      ],
    },
    {
      w: w3,
      title: 'Hop-by-hop rules (several failures)',
      color: C.gray,
      body: [
        'A router holds one primary and one backup, so it repairs at most once per visit. Backups are planned on the full map.',
        'Loop = the traffic comes back to a router carrying the same thing as before. After 255 hops (IP TTL) it is cut.',
      ],
    },
    {
      w: w3,
      title: 'Every router as the source',
      color: C.purple,
      body: [
        'simulateAllSources() runs it once per router. Example 6, router E down, LFA only:',
        {
          mono: 'S: 1 affected, repaired, relayed\nN: D via LFA M, survives\nD: S, N via LFA M, survive\nM: nothing affected',
          size: 15,
        },
      ],
    },
  ])

  const t = s.panel(0, r3.bottom + G, W, {
    title: 'Takeaway',
    color: C.yellow,
    body: [
      'FRR plans for one failure. The simulation shows what really happens when more fails: the PLR uses its backup, any router whose own link is down repairs again, and the traffic ends delivered, dropped or looping. Link-protecting backups can break when a whole router fails.',
    ],
  })
  s.text(
    0,
    t.y + t.h + 14,
    'Sources: docs/02-algorithms.md §8–8.2  ·  docs/learn/09-router-and-multiple-failures.md  ·  examples/06-link-protecting.yaml, 02-ring5.yaml  ·  checked with simulateFailure()',
    { size: 16, color: C.muted, maxW: W },
  )
  return s
}

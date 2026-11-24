// B14 · Post-convergence path (docs/02-algorithms.md §4.1, RFC 9855 §3), drawn on
// Example 5 (examples/05-leaf-spine.yaml): SP1 → L1 with link SP1–L1 removed has
// three equal paths; the lowest router ids pick SP1 → L2 → SP2 → L1.
import { Scene, C } from '../lib/scene.mjs'

export default function draw() {
  const s = new Scene('b14')
  const W = 1640
  const G = 20

  s.text(0, 0, 'B14 · Post-convergence path: where S will send after the failure', {
    size: 40,
    color: C.blue.s,
  })
  s.text(
    0,
    58,
    '§4.1 of docs/02-algorithms.md  ·  RFC 9855 §3 (SPT_new(S, S–E)), §2.1  ·  code: src/engine/tilfa.ts, paths.ts (lowest-id tie-break)',
    { size: 18, color: C.muted, maxW: W },
  )

  const r1 = s.row(0, 110, G, [
    {
      w: 600,
      title: 'Example 5: SP1 → L1, link SP1–L1 removed',
      color: C.blue,
      drawH: 360,
      body: [
        { note: 'Leaf-spine, every link 10.' },
        { note: 'Red dashed: the failed link SP1–L1, removed both ways.', color: C.red.s },
        {
          note: 'Green: the post-convergence path SP1 → L2 → SP2 → L1 (30), picked by the lowest router id.',
          color: C.green.s,
        },
        {
          note: 'Orange: two more paths of the same cost, via L3 and via L4. They lose the tie.',
          color: C.orange.s,
        },
      ],
    },
    {
      w: W - 600 - G,
      title: 'The rule: SPF from S without S–E, ties to the lowest router ids',
      color: C.blue,
      body: [
        {
          mono: 'post-convergence path  =  shortest path S → D  in the graph without S–E (both ways)\ntie  →  compare the paths router by router from S; the lowest id at the first difference wins',
          size: 15,
        },
        '•  It is the cheapest path that avoids the failure, and the one S will use once the network has reconverged. So traffic moves once, not twice (RFC 9855 §3).\n•  TI-LFA then forces the packet along it with segments (B15). The repair costs exactly the post-convergence cost.\n•  The tie-break is ours: the RFC only asks for the post-convergence path. A fixed rule gives the same answer every run (project rule 1), and the drawings, Explain and the simulation (A9) all use it.',
        { head: 'Example 5, the tie (from the engine)' },
        {
          mono: [
            'Path                    Cost   Router by router      Result',
            '----------------------  -----  --------------------  -------------------',
            'SP1 → L2 → SP2 → L1     30     SP1, L2, …            chosen: L2 < L3 < L4',
            'SP1 → L3 → SP2 → L1     30     SP1, L3, …            loses at hop 2',
            'SP1 → L4 → SP2 → L1     30     SP1, L4, …            loses at hop 2',
          ].join('\n'),
          size: 15,
        },
        {
          note: 'Segments for the chosen path: [PrefixSID(SP2), PrefixSID(L1)] = 16002, 16011, out via L2.',
        },
        { head: 'Other examples' },
        {
          mono: [
            'Example         S → D       Removed       Post-convergence path            Cost',
            '--------------  ----------  ------------  -------------------------------  ----',
            '2  ring         S → E       link S–E      S → A → B → C → E                4',
            '3  ring, B–C    S → E       link S–E      S → A → B → C → E                13',
            '4  ISP core     PE1 → P3    link PE1–P1   PE1 → P2 → P4 → PE2 → P3         40',
            '8  link mode    S → D       link S–E      S → N → B → E → D                8',
            '8  node mode    S → D       router E      S → N → B → C → D                11',
            '10 LAN, levels  R4 → R5     link R4–R5    none: R5 can’t be reached        –',
          ].join('\n'),
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
    const SP1 = s.router('SP1', ox + 150, oy + 70, { ...o, r: 34, bold: true })
    const SP2 = s.router('SP2', ox + 420, oy + 70, { ...o, r: 34, color: C.green })
    const L1 = s.router('L1', ox + 50, oy + 290, { ...o, color: C.purple })
    const L2 = s.router('L2', ox + 200, oy + 290, { ...o, color: C.green })
    const L3 = s.router('L3', ox + 360, oy + 290, { ...o, color: C.orange })
    const L4 = s.router('L4', ox + 510, oy + 290, { ...o, color: C.orange })
    s.link(SP1, L1, null, { ...o, color: C.red.s, width: 3, dashed: true })
    s.link(SP1, L2, null, { ...o, color: C.green.s, width: 4, arrow: true })
    s.link(L2, SP2, null, { ...o, color: C.green.s, width: 4, arrow: true })
    s.link(SP2, L1, null, { ...o, color: C.green.s, width: 4, arrow: true })
    for (const L of [L3, L4]) {
      s.link(SP1, L, null, { ...o, color: C.orange.s, dashed: true })
      s.link(L, SP2, null, { ...o, color: C.orange.s, dashed: true })
    }
    s.label(SP1.cx, SP1.cy - 54, 'source', { size: 16, color: C.muted, parent: p.id })
    s.label(SP2.cx, SP2.cy - 54, 'every path via SP2', { size: 16, color: C.green.s, parent: p.id })
    s.label(L1.cx, L1.cy + 52, 'destination', { size: 16, color: C.purple.s, parent: p.id })
    s.label(L2.cx, L2.cy + 52, 'lowest id', { size: 16, color: C.green.s, parent: p.id })
    s.label(L3.cx + 75, L3.cy + 52, 'tied, not chosen', {
      size: 16,
      color: C.orange.s,
      parent: p.id,
    })
  }

  const w3 = (W - 2 * G) / 3
  const r2 = s.row(0, r1.bottom + G, G, [
    {
      w: w3,
      title: 'Node mode: remove the router',
      color: C.green,
      body: [
        'With protection: node (A6, B19) the SPF runs without router E and all its links (RFC 9855 §2.1, SPT_new(S, E)).',
        {
          note: 'Example 8: link mode goes S → N → B → E → D (8), through E. Node mode goes S → N → B → C → D (11).',
        },
      ],
    },
    {
      w: w3,
      title: 'When there is none',
      color: C.red,
      body: [
        'If D can’t be reached without S–E, the link is a bridge for D: the network is split and nothing can protect it.',
        {
          note: 'Example 10: R5 hangs off R4 alone. R4 → R5 and R5 → every other router are "partitioned" in the unprotected list (A8).',
        },
      ],
    },
    {
      w: w3,
      title: 'The best backup there is',
      color: C.gray,
      body: [
        'It is the cheapest: no path without S–E costs less. LFA and Remote LFA may take a longer detour (A9 marks those "longer"). With one link down, a TI-LFA repair is always the same path as S’s final one (link mode).',
      ],
    },
  ])

  const t = s.panel(0, r2.bottom + G, W, {
    title: 'Takeaway',
    color: C.yellow,
    body: [
      'TI-LFA’s backup is the path S will use anyway once the network has reconverged: SPF with the failed link (or router) removed. When paths tie, the lowest router ids win, so in Example 5 SP1 goes via L2, not L3 or L4. If no such path exists, the network is split and D can’t be protected.',
    ],
  })
  s.text(
    0,
    t.y + t.h + 14,
    'Sources: docs/02-algorithms.md §4.1, §4.4, §6, §8  ·  docs/learn/07-ti-lfa.md (Step 1)  ·  examples/05-leaf-spine.yaml, 02-ring5.yaml, 03-ring5-highmetric.yaml, 04-isp-core.yaml, 08-node-protection.yaml, 10-lan-levels.yaml',
    { size: 16, color: C.muted, maxW: W },
  )
  return s
}

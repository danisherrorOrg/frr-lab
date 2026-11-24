// A22 · Multi-level IS-IS (docs/02-algorithms.md §21), drawn on Example 10
// (examples/10-lan-levels.yaml): two areas and a Level-2 backbone.
import { Scene, C } from '../lib/scene.mjs'

export default function draw() {
  const s = new Scene('a22')
  const W = 1640
  const G = 20

  s.text(0, 0, 'A22 · Multi-level IS-IS: one level at a time', { size: 40, color: C.blue.s })
  s.text(
    0,
    58,
    '§21 of docs/02-algorithms.md  ·  ISO 10589 §7.2 (Level-1 areas, Level-2 backbone)  ·  code: src/engine/levels.ts',
    { size: 18, color: C.muted, maxW: W },
  )

  const r1 = s.row(0, 110, G, [
    {
      w: 600,
      title: 'Example 10: two areas, one backbone',
      color: C.blue,
      drawH: 420,
      body: [
        {
          note: 'Teal boxes: the areas. R1 and R5 are Level-1 only (dashed); R2, R3, R4 are Level-1-2.',
          color: C.ink,
        },
        {
          note: 'Teal links: level 1 only. Purple: level 2 only. Black: both levels (left out = both).',
          color: C.ink,
        },
        { note: 'Square: LAN1 (R2, R3, R4), metric 10, both levels.' },
      ],
    },
    {
      w: W - 600 - G,
      title: 'How it works: levelTopology(t, key) cuts out one level',
      color: C.blue,
      body: [
        'Each level has its own adjacencies, its own SPF and its own FRR, so LFA Lab shows one level at a time. In YAML: a router’s level: 1 | 2 | 1-2 (left out = 1-2) and area; a link’s or LAN’s level: 1 | 2 (left out = both).',
        {
          mono: [
            'Level-2 (key 2):        routers not level: 1;  links between them not level: 1;',
            '                        LANs not level: 1, with their L2-capable members',
            'Level-1, area A (1:A):  L1-capable routers of area A;  links between them not level: 2.',
            '                        L1 adjacencies form only inside one area: links to another',
            '                        area are left out. A LAN keeps its members in A.',
            'Any level:              a LAN left with fewer than 2 members is dropped',
          ].join('\n'),
          size: 15,
        },
        { head: 'Example 10, the three views' },
        {
          mono: [
            'View                     Routers      Links                        LAN1',
            '-----------------------  -----------  ---------------------------  ----------------------',
            'Level-2                  R2, R3, R4   R2–R3, R3–R4                 R2, R3, R4',
            'Level-1, area 49.0001    R1, R2, R3   R1–R2, R1–R3, R2–R3          R2, R3',
            'Level-1, area 49.0002    R4, R5       R4–R5                        only R4 → dropped',
          ].join('\n'),
          size: 15,
        },
        'Picking a view makes it the network on screen: results, failures, coverage, heat map, what-if, weakest spots and quiz all work on it unchanged. "Whole network, as one level" puts every adjacency into one SPF.',
        { note: 'Level-2, R2 → R4 over LAN1: the same LFA as in A21, R3 over R2–R3 (cost 25).' },
      ],
    },
  ])

  {
    const p = r1.panels[0]
    const ox = p.drawX
    const oy = p.drawY
    const o = { parent: p.id }
    // Area boxes: background only. They are drawn first and left out of the
    // overlap check, since links and labels sit on top of them by design.
    const area = (x, w) => {
      s.rect(x, oy + 30, w, 390, { stroke: C.teal.s, fill: C.teal.f, dashed: true, parent: p.id })
      s.items.pop()
      return p.id
    }
    const a1 = area(ox, 250)
    s.text(ox + 10, oy + 36, 'area 49.0001', { size: 16, color: C.teal.s, parent: a1 })
    const a2 = area(ox + 380, 184)
    s.text(ox + 390, oy + 36, 'area 49.0002', { size: 16, color: C.teal.s, parent: a2 })

    const R1 = s.router('R1', ox + 50, oy + 225, { parent: a1, dashed: true })
    const R2 = s.router('R2', ox + 190, oy + 110, { parent: a1 })
    const R3 = s.router('R3', ox + 190, oy + 340, { parent: a1 })
    const R4 = s.router('R4', ox + 440, oy + 225, { parent: a2 })
    const R5 = s.router('R5', ox + 440, oy + 360, { parent: a2, dashed: true })
    const h = 14
    const lx = ox + 315
    const ly = oy + 225
    const lid = s.rect(lx - h, ly - h, 2 * h, 2 * h, {
      stroke: C.ink,
      fill: '#ffffff',
      parent: p.id,
      sharp: true,
    })
    const LAN = { eid: lid, cx: lx, cy: ly, r: h + 2 }
    s.label(lx, ly + 32, 'LAN1', { size: 15, color: C.ink, parent: p.id })
    const l1 = { ...o, color: C.teal.s, width: 3, mcolor: C.teal.s }
    const l2 = { ...o, color: C.purple.s, width: 3, mcolor: C.purple.s }
    s.link(R1, R2, 10, { ...l1, side: -1 })
    s.link(R1, R3, 10, { ...l1, side: 1 })
    s.link(R2, R3, 15, { ...o, side: 1 })
    s.link(R3, R4, 30, { ...l2, side: 1 })
    s.link(R4, R5, 10, { ...l1, side: -1 })
    s.link(R2, LAN, null, o)
    s.link(R3, LAN, null, o)
    s.link(LAN, R4, null, o)
    s.label(R1.cx, R1.cy - 50, 'L1', { size: 15, color: C.muted, parent: a1 })
    s.label(R5.cx + 54, R5.cy, 'L1', { size: 15, color: C.muted, parent: a2 })
    s.label(R4.cx, R4.cy - 50, 'L1-2', { size: 15, color: C.muted, parent: a2 })
    s.label(R2.cx - 64, R2.cy - 20, 'L1-2', { size: 15, color: C.muted, parent: a1 })
  }

  const w3 = (W - 2 * G) / 3
  const r2 = s.row(0, r1.bottom + G, G, [
    {
      w: w3,
      title: 'Editing inside a level',
      color: C.green,
      body: [
        'Edits are merged back into the whole network (mergeLevel): routers and links the view showed are replaced or removed, new ones are added, a LAN member’s metric follows.',
        {
          note: 'Export and Share always write the whole network. Switching level clears failures and the undo history.',
        },
      ],
    },
    {
      w: w3,
      title: 'Not modelled',
      color: C.orange,
      body: [
        '•  Routes between levels: an L1 router’s default route to the nearest L1/L2 router (ATT bit), route leaking. Other areas’ destinations don’t appear in a Level-1 view.\n•  LFA for inter-area prefixes (RFC 5286 §6.2).\n•  Per-level metrics on one link: import them as two links, level: 1 and level: 2.',
      ],
    },
    {
      w: w3,
      title: 'Where the picker shows',
      color: C.gray,
      body: [
        'The sidebar’s IS-IS level picker appears only when the network has levels or areas. Example 10 offers:',
        {
          mono: 'Whole network, as one level\nLevel-2                 3 routers\nLevel-1, area 49.0001   3 routers\nLevel-1, area 49.0002   2 routers',
          size: 15,
        },
      ],
    },
  ])

  const t = s.panel(0, r2.bottom + G, W, {
    title: 'Takeaway',
    color: C.yellow,
    body: [
      'IS-IS runs a separate SPF and FRR per level, so LFA Lab cuts out one level (the Level-2 backbone, or one Level-1 area) and runs every tool on it unchanged. A link joins a level only if both ends belong to it, and a LAN is dropped from a level where fewer than two of its members remain.',
    ],
  })
  s.text(
    0,
    t.y + t.h + 14,
    'Sources: docs/02-algorithms.md §21  ·  docs/learn/11-advanced-topics.md (Multi-level IS-IS)  ·  examples/10-lan-levels.yaml  ·  checked with levelViews(), levelTopology()',
    { size: 16, color: C.muted, maxW: W },
  )
  return s
}

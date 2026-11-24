// A20 · Quiz mode (docs/02-algorithms.md §19), drawn on Example 2
// (examples/02-ring5.yaml), makeQuiz(topology, seed 1, 10 questions).
import { Scene, C } from '../lib/scene.mjs'

export default function draw() {
  const s = new Scene('a20')
  const W = 1640
  const G = 20

  s.text(0, 0, 'A20 · Quiz mode: questions with real answers', { size: 40, color: C.blue.s })
  s.text(
    0,
    58,
    '§19 of docs/02-algorithms.md  ·  every question is one results-table row; the answer and the "why" come from the engine  ·  code: src/engine/quiz.ts',
    { size: 18, color: C.muted, maxW: W },
  )

  const r1 = s.row(0, 110, G, [
    {
      w: 600,
      title: 'Example 2, seed 1, question 5',
      color: C.blue,
      drawH: 470,
      body: [
        { note: 'All metrics 1. Red dashed: the link in the question, S–E.', color: C.ink },
        { note: 'Green: S’s normal path to A, which doesn’t use S–E.', color: C.green.s },
        {
          note: 'The explanation is the row’s own explain step, the same text as the detail panel.',
        },
      ],
    },
    {
      w: W - 600 - G,
      title: 'How it works: pick a row, ask about one field of it',
      color: C.blue,
      body: [
        'makeQuiz(topology, seed, count) runs computeForSource(), picks a row (S, D, protected link S–E) and asks one of 8 kinds of question:',
        {
          mono: [
            'Kind          Question                                       Right answer from',
            '------------  ---------------------------------------------  ---------------------------------',
            'loop-free     Is neighbor N loop-free for D?                 the candidate’s Inequality 1 (B3)',
            'best-lfa      Which neighbor does S pick as its LFA?         lfa.best (B7, A16), else "No LFA"',
            'method        Simplest method that protects S → D?           protectedBy (B20)',
            'p-space       Is Y in S’s P-space?                           rlfa.pSpace (B8)',
            'q-space       Is Y in E’s Q-space?                           rlfa.qSpace (B10)',
            'pq-node       Which PQ node does Remote LFA tunnel to?       rlfa.best, else "No PQ node"',
            'extra-labels  How many labels on top of D’s label?           extraLabels, "3 or more" from 3',
            'label-stack   Which stack does TI-LFA send?                  labelStack (B18)',
          ].join('\n'),
          size: 14,
        },
        { head: 'Seeded, so the same seed gives the same quiz' },
        {
          mono: 'Park–Miller (as in D50):  x ← x · 48271 mod 2147483647\npicks the source, the row, the kind and the order of the choices',
        },
        '•  The kinds take turns. A kind that doesn’t fit the row (no LFA candidates, no TI-LFA path…) gives way to the next.\n•  No question is asked twice in one quiz.\n•  Wrong choices are real alternatives: other neighbors, other methods, the reversed stack, a stack with a label missing or doubled.\n•  Uses the network’s own settings (MSD, LFA policy, node or SRLG protection): on Example 8 it asks about node-protecting PQ nodes.',
      ],
    },
  ])

  {
    const p = r1.panels[0]
    const ox = p.drawX
    const oy = p.drawY
    const o = { parent: p.id }
    const S = s.router('S', ox + 70, oy + 100, { ...o, bold: true })
    const E = s.router('E', ox + 230, oy + 36, o)
    const Cn = s.router('C', ox + 390, oy + 100, o)
    const B = s.router('B', ox + 320, oy + 230, o)
    const A = s.router('A', ox + 130, oy + 230, { ...o, color: C.green })
    s.link(S, E, 1, { ...o, side: 1, color: C.red.s, width: 3, dashed: true })
    s.link(E, Cn, 1, { ...o, side: 1 })
    s.link(Cn, B, 1, { ...o, side: 1 })
    s.link(B, A, 1, { ...o, side: -1 })
    s.link(S, A, 1, { ...o, side: -1, color: C.green.s, width: 4, arrow: true })

    // The question card, as the quiz panel shows it.
    const cy = oy + 290
    const card = s.rect(ox, cy, p.drawW, 180, { stroke: C.gray.s, fill: '#ffffff', parent: p.id })
    s.text(
      ox + 14,
      cy + 10,
      'S sends traffic for E to E. The link S–E fails. Can S reach A on its normal path without using S–E (is A in S’s P-space)?',
      { size: 16, maxW: p.drawW - 28, parent: card },
    )
    const yes = s.rect(ox + 14, cy + 74, 120, 36, {
      stroke: C.green.s,
      fill: C.green.f,
      parent: card,
    })
    s.label(ox + 74, cy + 92, 'Yes  ✓', { size: 17, color: C.green.s, parent: yes })
    const no = s.rect(ox + 150, cy + 74, 120, 36, {
      stroke: C.gray.s,
      fill: C.gray.f,
      parent: card,
    })
    s.label(ox + 210, cy + 92, 'No', { size: 17, color: C.muted, parent: no })
    s.text(ox + 14, cy + 124, 'P-space: A: dist(S,A)=1 < c(S,E)+dist(E,A) = 1+2 = 3 ✓', {
      size: 14,
      family: 'mono',
      color: C.ink,
      parent: card,
    })
    s.text(ox + 14, cy + 150, 'RFC 7490 §5.2.1.1', { size: 14, color: C.muted, parent: card })
  }

  const w3 = (W - 2 * G) / 3
  const r2 = s.row(0, r1.bottom + G, G, [
    {
      w: w3 * 2 + G,
      title: 'Example 2, seed 1: the 10 questions',
      color: C.green,
      body: [
        {
          mono: [
            ' #  Kind          Row (S → D, link)   Right answer',
            '--  ------------  ------------------  ---------------------------------',
            ' 1  method        E → C, E–C          Remote LFA',
            ' 2  label-stack   E → S, S–E          16004 16001',
            ' 3  pq-node       B → C, C–B          S',
            ' 4  q-space       B → S, B–A          Yes (S is in A’s Q-space)',
            ' 5  p-space       S → E, S–E          Yes (A is in S’s P-space)',
            ' 6  extra-labels  B → C, C–B          1',
            ' 7  best-lfa      A → C, B–A          S',
            ' 8  loop-free     B → A, B–A          No (C is not loop-free for A)',
            ' 9  method        S → A, A–S          Remote LFA',
            '10  label-stack   A → C, B–A          16002 16005',
          ].join('\n'),
          size: 15,
        },
        {
          note: 'Seed 2 starts with label-stack A → S, then method C → E. Running seed 1 again gives exactly the list above.',
        },
      ],
    },
    {
      w: w3,
      title: 'Why it can’t be wrong',
      color: C.gray,
      body: [
        'The quiz decides nothing. Each answer is a field the results table already shows, and each "why" is that row’s explain steps.',
        'A property test (random networks, random seeds) checks every answer against the engine, that the choices are unique, and that each question has an explanation.',
        { note: 'The score reads "right of asked". The engine stays pure: no Math.random.' },
      ],
    },
  ])

  const t = s.panel(0, r2.bottom + G, W, {
    title: 'Takeaway',
    color: C.yellow,
    body: [
      'Quiz mode turns the network on screen into practice questions: loop-free checks, P- and Q-space, PQ nodes, labels. The right answer and its explanation come straight from the engine, and a seed always gives the same quiz.',
    ],
  })
  s.text(
    0,
    t.y + t.h + 14,
    'Sources: docs/02-algorithms.md §19  ·  docs/learn/12-using-lfa-lab.md  ·  examples/02-ring5.yaml  ·  checked with makeQuiz()',
    { size: 16, color: C.muted, maxW: W },
  )
  return s
}

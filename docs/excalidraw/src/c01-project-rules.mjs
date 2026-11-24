// C1 · The 7 project rules from CLAUDE.md, with why each exists and what enforces it
// in this repo (eslint.config.js, .github/workflows/ci.yml, tests/, DECISIONS.md).
// Counts are from the repo at the time of drawing: 864 tests in 77 files, D1–D61.
import { Scene, C } from '../lib/scene.mjs'

export default function draw() {
  const s = new Scene('c01')
  const W = 1640
  const G = 20

  s.text(0, 0, 'C1 · The 7 project rules: how LFA Lab is built', {
    size: 40,
    color: C.blue.s,
  })
  s.text(
    0,
    58,
    'CLAUDE.md  ·  DECISIONS.md D1, D2  ·  enforced by eslint.config.js, .github/workflows/ci.yml, tests/',
    { size: 18, color: C.muted, maxW: W },
  )

  const steps = [
    { t: 'Plan or build?', d: 'A plan request means docs only (R7)', c: C.gray },
    { t: 'Roadmap step', d: 'docs/04-roadmap.md, in order (R4)', c: C.purple },
    { t: 'Read the RFC', d: 'The RFC wins; log it in DECISIONS.md (R3)', c: C.red },
    { t: 'Write the test', d: 'Unit + property; §6 examples pass (R2)', c: C.green },
    { t: 'Pure engine', d: 'No React, DOM, window or randomness (R1)', c: C.blue },
    { t: 'CI', d: 'lint · typecheck · test · build', c: C.gray },
    { t: 'Static site', d: 'dist/, offline, no backend (R5)', c: C.teal },
  ]
  const BH = 90

  const flow = s.panel(0, 110, W, {
    title: 'One change, start to finish',
    color: C.blue,
    drawH: BH,
    body: [
      {
        note: 'Through every step, R6: no new dependency without a line in DECISIONS.md.',
        color: C.orange.s,
      },
    ],
  })
  {
    const n = steps.length
    const gap = 30
    const bw = (flow.drawW - (n - 1) * gap) / n
    const y = flow.drawY
    let prev = null
    steps.forEach((st, i) => {
      const x = flow.drawX + i * (bw + gap)
      const id = s.rect(x, y, bw, BH, {
        stroke: st.c.s,
        fill: '#ffffff',
        strokeWidth: 2,
        parent: flow.id,
      })
      s.text(x + 12, y + 10, `${i + 1}. ${st.t}`, {
        size: 16,
        color: st.c.s,
        maxW: bw - 24,
        parent: id,
      })
      s.text(x + 12, y + 40, st.d, { size: 14, color: C.ink, maxW: bw - 24, parent: id })
      if (prev)
        s.line(
          [
            [prev.x + bw + 4, y + BH / 2],
            [x - 4, y + BH / 2],
          ],
          { arrow: true, stroke: C.muted, strokeWidth: 2, parent: flow.id, ends: [prev.id, id] },
        )
      prev = { x, id }
    })
  }

  const w4 = (W - 3 * G) / 4
  const card = (title, color, rule, why, how) => ({
    w: w4,
    title,
    color,
    body: [rule, { note: 'Why: ' + why }, { mono: how, size: 14, color: color.s }],
  })

  const r1 = s.row(0, flow.y + flow.h + G, G, [
    card(
      '1 · The engine is pure',
      C.blue,
      'src/engine/ has no React, no DOM, no window, no randomness. Same input → same output.',
      'it runs in a Web Worker for the UI and in Node for the tests, and can become an npm package or CLI later (D2).',
      'ESLint in src/engine/ blocks:\n react, ui/, state/, worker/\n browser globals (window…)\n Math.random, Date.now,\n new Date()',
    ),
    card(
      '2 · Tests first',
      C.green,
      'Every algorithm change needs a test. The worked examples in §6 of 02-algorithms.md must keep passing.',
      'the numbers are what users learn from. A wrong number teaches the wrong thing.',
      '864 tests in 77 files\n11 property-test files\n  (fast-check)\n11 examples, each with an\n  .expected.json fixture',
    ),
    card(
      '3 · The RFC wins',
      C.red,
      'If code, docs and RFC disagree: follow the RFC, fix 02-algorithms.md, add a DECISIONS.md entry.',
      'LFA Lab teaches the standard, not our guess. Example D18 (RFC 9855): the clean-up also drops AdjSID(S→N) (§5.1).',
      'RFC → code + test\n    → docs/02-algorithms.md\n    → DECISIONS.md\n61 decisions so far (D1–D61)',
    ),
    card(
      '4 · Roadmap order',
      C.purple,
      'Work through docs/04-roadmap.md in order, and tick each box when it is done.',
      'each phase builds on the last: TI-LFA needs SPF and the avoid-check (B1) to be right first.',
      'SPF → LFA → Remote LFA\n → TI-LFA → coverage → UI\n → simulation → feedback\n → launch\n52 boxes ticked, 0 open',
    ),
  ])

  const r2 = s.row(0, r1.bottom + G, G, [
    card(
      '5 · No backend',
      C.teal,
      'No backend, analytics or network calls. The app must work offline.',
      'free hosting, no privacy worries, works in a lab with no internet (D1).',
      'static build in dist/\nservice worker: src/offline/\nshare link data in #t=…\n  (never sent to a server)\nno fetch() in src/',
    ),
    card(
      '6 · Keep it simple',
      C.orange,
      'No new dependency without a line in DECISIONS.md.',
      'every package is code to trust, update and ship to the browser.',
      '6 runtime packages:\n react, react-dom, cytoscape,\n zustand, js-yaml, lz-string\neach under "Tooling added"\nthese diagrams: Node only',
    ),
    card(
      '7 · Plan vs build',
      C.gray,
      'A request for a plan or requirements means docs only. No code until asked.',
      'a plan is cheap to review and change. Code written too early is wasted.',
      'plan = docs/01 … 05\n requirements, algorithms,\n architecture, roadmap,\n testing',
    ),
    {
      w: w4,
      title: 'Style',
      color: C.gray,
      body: [
        '•  Strict TypeScript, small pure functions, named exports.\n•  Comments say why and cite the RFC, e.g. // RFC 7490 §5.2.1.\n•  UI text: short, plain English, with real numbers.\n•  No AI attribution in commits or PRs.',
      ],
    },
  ])

  const t = s.panel(0, r2.bottom + G, W, {
    title: 'Takeaway',
    color: C.yellow,
    body: [
      'The rules keep the numbers right and the app simple: a pure engine checked by tests, the RFC as the referee, work done in roadmap order, and a static site with no backend and few dependencies. Most rules are enforced by tools (ESLint, 864 tests, CI on every push), not just by trust.',
    ],
  })
  s.text(
    0,
    t.y + t.h + 14,
    'Sources: CLAUDE.md  ·  DECISIONS.md D1, D2, D3, D14, D18  ·  eslint.config.js  ·  .github/workflows/ci.yml  ·  package.json  ·  docs/04-roadmap.md  ·  tests/',
    { size: 16, color: C.muted, maxW: W },
  )
  return s
}

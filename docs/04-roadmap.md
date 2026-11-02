# 04 – Roadmap

Build order: **engine first, fully tested, then UI**. Tick boxes as you go. Rough time assumes evenings and weekends.

## Phase 0 – Setup (½ day)
- [x] `git init`, MIT licence, `.gitignore`
- [x] Vite + React + TypeScript (strict) project
- [x] Vitest, ESLint, Prettier, Tailwind
- [x] GitHub Actions: lint → typecheck → test → build
- [x] Copy `examples/*.yaml` into the test fixtures

## Phase 1 – Engine core: graph + SPF (2–3 days)
- [x] `types.ts` (from `03-architecture.md` §4)
- [x] `io/yaml.ts`: load + validate (all rules in §5)
- [x] `spf.ts`: forward Dijkstra with all predecessors (ECMP) and first-hop sets
- [x] Reverse SPF
- [x] All-pairs distance table + "all shortest paths avoid link" helper (`02-algorithms.md` §1.5)
- [x] Tests: small graphs, ECMP, asymmetric metrics, disconnected graph

## Phase 2 – LFA (1–2 days)
- [x] Inequalities 1, 2, 3 + best-LFA choice
- [x] ECMP-protected detection
- [x] `explain.ts` steps for LFA
- [x] Tests: Example 1 (LFA ✓), Example 2 (LFA ✗)

## Phase 3 – Remote LFA (2 days)
- [x] Re-read RFC 7490 §5.2–5.4; confirm formulas; log it in DECISIONS.md
- [x] P-space, extended P-space, Q-space, PQ, best PQ
- [x] Explain steps
- [x] Tests: Example 2 (PQ = {B, C}, chosen B), Example 3 (no PQ)

## Phase 4 – TI-LFA, link protection (3 days)
- [x] Post-convergence SPF (link removed), deterministic tie-break
- [x] Greedy segment-list encoding (`02-algorithms.md` §4.2)
- [x] Labels: SRGB, prefix-SID, adj-SID (auto-assign when missing)
- [x] Explain steps
- [x] Tests: Examples 1, 2, 3 exact segment lists + label stacks
- [x] Property test: for random connected graphs, following the segment list hop by hop (simulated with **pre-failure** tables at every non-S router) reaches D **without using the failed link**, and its cost equals the post-convergence cost

## Phase 5 – Coverage (1 day)
- [x] Per-source and all-sources numbers + unprotected list
- [x] CSV export
- [x] Web Worker wrapper + progress callback

🎯 **Milestone A: engine done.** Optional: a tiny CLI (`npx lfa-lab examples/02-ring5.yaml --source S`) to show results in the terminal.

## Phase 6 – UI basics (4–5 days)
- [x] Cytoscape canvas: show topology, metrics on edges
- [x] Add/move/delete routers and links; properties panel
- [x] Undo/redo
- [x] Examples menu, import/export YAML
- [x] Source picker + results table
- [x] Row click → highlight primary/backup paths, P/Q spaces, PQ node
- [x] Detail panel: candidates, spaces, segment list, label stack, explain steps

## Phase 7 – Failure simulation + reports (2–3 days)
- [x] Fail-link mode, animated repair path, then "Converge" view
- [x] Coverage report panel
- [x] Share-by-URL
- [x] Dark mode, keyboard support, phone layout

🎯 **Milestone B: MVP (v0.1).**

## Phase 9 – User feedback, v0.2
- [x] Close button / Escape for the detail panel
- [x] Fail several links; follow traffic hop by hop as each router repairs its own failed link (D23, D24)
- [x] Fail a router (down or rebooting): show which link-protecting repairs break because they go through it
- [x] Parallel links between two routers (replaces D4; D29)
- [x] Canvas usability: obvious dragging, tooltips, right-click menu, click-to-select destination (D30)
- [x] Results for every router as the DUT, with the failure view per DUT (D31)

## Later (v0.2+), in priority order
1. [x] Node protection (RLFA per RFC 8102, TI-LFA with node E removed) *(D51)*
2. [x] Import from FRR `show isis database detail` *(D52)*
3. [x] SRLG *(D53)*
4. [x] Quiz mode for students *(D54)*
5. [x] LAN links / pseudonodes, multi-level IS-IS *(D55, D56)*
6. [x] Microloop view, Flex-Algo, SRv6 *(D57–D59)*

## Learn guide (D60)
- [x] Protocol guide in `docs/learn/` (14 chapters, 4 appendices) with diagrams drawn by the engine
- [x] **📖 Learn** panel in the app with "Try it" links that load each example

## Phase 10 – Launch (1–2 days)

> **Do this last:** launch only after Phase 9 and the other planned work are done.

- [x] Pick a host (Vercel / GitHub Pages), log it in DECISIONS.md, deploy *(Vercel, D61)*
- [ ] README with a live link, demo GIF, screenshots and how to run locally
- [ ] Set version `0.2.0` and tag release `v0.2.0`
- [ ] Blog / LinkedIn post: "TI-LFA explained with pictures" (use Examples 2 and 3)
- [ ] Add `projects/lfa-lab.md` + an `INDEX.md` row in the profile folder; add an LFA Lab resume bullet

**Total MVP estimate:** about 3–4 weeks part-time.

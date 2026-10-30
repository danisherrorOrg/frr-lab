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
- [ ] `spf.ts`: forward Dijkstra with all predecessors (ECMP) and first-hop sets
- [ ] Reverse SPF
- [ ] All-pairs distance table + "all shortest paths avoid link" helper (`02-algorithms.md` §1.5)
- [ ] Tests: small graphs, ECMP, asymmetric metrics, disconnected graph

## Phase 2 – LFA (1–2 days)
- [ ] Inequalities 1, 2, 3 + best-LFA choice
- [ ] ECMP-protected detection
- [ ] `explain.ts` steps for LFA
- [ ] Tests: Example 1 (LFA ✓), Example 2 (LFA ✗)

## Phase 3 – Remote LFA (2 days)
- [ ] Re-read RFC 7490 §5.2–5.4; confirm formulas; log it in DECISIONS.md
- [ ] P-space, extended P-space, Q-space, PQ, best PQ
- [ ] Explain steps
- [ ] Tests: Example 2 (PQ = {B, C}, chosen B), Example 3 (no PQ)

## Phase 4 – TI-LFA, link protection (3 days)
- [ ] Post-convergence SPF (link removed), deterministic tie-break
- [ ] Greedy segment-list encoding (`02-algorithms.md` §4.2)
- [ ] Labels: SRGB, prefix-SID, adj-SID (auto-assign when missing)
- [ ] Explain steps
- [ ] Tests: Examples 1, 2, 3 exact segment lists + label stacks
- [ ] Property test: for random connected graphs, following the segment list hop by hop (simulated with **pre-failure** tables at every non-S router) reaches D **without using the failed link**, and its cost equals the post-convergence cost

## Phase 5 – Coverage (1 day)
- [ ] Per-source and all-sources numbers + unprotected list
- [ ] CSV export
- [ ] Web Worker wrapper + progress callback

🎯 **Milestone A: engine done.** Optional: a tiny CLI (`npx lfa-lab examples/02-ring5.yaml --source S`) to show results in the terminal.

## Phase 6 – UI basics (4–5 days)
- [ ] Cytoscape canvas: show topology, metrics on edges
- [ ] Add/move/delete routers and links; properties panel
- [ ] Undo/redo
- [ ] Examples menu, import/export YAML
- [ ] Source picker + results table
- [ ] Row click → highlight primary/backup paths, P/Q spaces, PQ node
- [ ] Detail panel: candidates, spaces, segment list, label stack, explain steps

## Phase 7 – Failure simulation + reports (2–3 days)
- [ ] Fail-link mode, animated repair path, then "Converge" view
- [ ] Coverage report panel
- [ ] Share-by-URL
- [ ] Dark mode, keyboard support, phone layout

🎯 **Milestone B: MVP (v0.1).**

## Phase 8 – Launch (1–2 days)
- [ ] Deploy (Vercel / GitHub Pages)
- [ ] README with a demo GIF and screenshots
- [ ] Blog / LinkedIn post: "TI-LFA explained with pictures" (use Examples 2 and 3)
- [ ] Add `projects/lfa-lab.md` + an `INDEX.md` row in the profile folder; update the resume bullet

## Later (v0.2+), in priority order
1. Node protection (RLFA per RFC 8102, TI-LFA with node E removed)
2. Import from FRR `show isis database detail`
3. SRLG
4. Quiz mode for students
5. LAN links / pseudonodes, multi-level IS-IS
6. Microloop view, Flex-Algo, SRv6

**Total MVP estimate:** about 3–4 weeks part-time.

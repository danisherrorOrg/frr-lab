# TODO

The step-by-step task list for building LFA Lab v0.1. It follows the phase order in
[`docs/04-roadmap.md`](docs/04-roadmap.md) but breaks each phase into small tasks with a
clear "done when".

**How to use it**
- Work top to bottom. Don't start a phase until the one before it is done.
- For engine work, write the test first, then the code (`CLAUDE.md` rule 2).
- When you tick a task here, also tick the matching box in `docs/04-roadmap.md`.
- If you change a rule or pick a library, add an entry to `DECISIONS.md`.
- Legend: `[ ]` to do · `[x]` done · `(opt)` optional

---

## Phase 0 – Setup (½ day)

- [x] Git repo created
- [x] `.gitignore` (node_modules, dist, coverage, .env…)
- [x] `LICENSE` file (MIT, D10)
- [x] Vite + React 18 + TypeScript project in the repo root (`npm create vite@latest`)
- [x] `tsconfig.json`: `strict: true`, `noUncheckedIndexedAccess: true`
- [x] Install and set up Vitest + fast-check
- [x] Install and set up ESLint + Prettier
- [x] Add an ESLint rule that blocks `react`, DOM globals and `Math.random` inside `src/engine/` (keeps the engine pure, `CLAUDE.md` rule 1)
- [x] Install and set up Tailwind CSS (with `dark:` class mode)
- [x] Add npm scripts: `dev`, `test`, `lint`, `typecheck`, `build`
- [x] Create the empty folders from `docs/03-architecture.md` §3 (`src/engine`, `src/io`, `src/worker`, `src/state`, `src/ui`, `tests/engine`, `tests/fixtures`)
- [x] GitHub Actions workflow: lint → typecheck → test → build, on every push and PR
- [x] Copy `examples/*.yaml` into `tests/fixtures/`
- [x] Write `tests/fixtures/*.expected.json` for the 3 examples (values from `docs/05-testing.md` §2)

**Done when:** `npm run lint && npm run typecheck && npm test && npm run build` all pass locally and in CI.

---

## Phase 1 – Engine core: graph + SPF (2–3 days)

### Types and YAML
- [x] `src/engine/types.ts`: copy the types from `docs/03-architecture.md` §4
- [x] Tests for `io/yaml.ts`: valid file loads; each rule below gives a clear error
- [x] `src/io/yaml.ts`: load + save with js-yaml **safe schema** (no custom tags)
  - [x] unique node ids
  - [x] unique SID indices
  - [x] links point to existing nodes
  - [x] metrics are integers 1–16,777,215
  - [x] no self-loops, no parallel links
  - [x] `metric_ba` defaults to `metric`; `srgb_base` defaults to 16000
  - [x] warning (not error) if the graph is disconnected
- [x] `src/engine/graph.ts`: build the adjacency list from a `Topology`

### SPF
- [x] Tests first: line, triangle, square with ECMP, asymmetric metrics, disconnected graph, 2-node graph
- [x] `spf.ts` forward Dijkstra: distance, **all** predecessors, first-hop set (§1.1)
- [x] Reverse SPF (§1.2)
- [x] All-pairs distance table, cached by topology version (§1.3)
- [x] `avoidsLink(X, Y, S, E)` helper using the strict inequality (§1.5, D6)
- [x] Results are deterministic: sort node ids wherever order could vary
- [x] Property tests: triangle rule, `dist(X,X)=0`, symmetry with symmetric metrics (`05-testing.md` §3 items 1, 7)

**Done when:** all SPF tests pass and distances for Examples 1–3 match the tables in `docs/02-algorithms.md` §6.

---

## Phase 2 – LFA (1–2 days)

- [x] Re-read RFC 5286 §3–4; note anything that differs from `02-algorithms.md` §2 in `DECISIONS.md`
- [x] Tests first: Example 1 (N is node-protecting, downstream LFA); Example 2 (no LFA)
- [x] `lfa.ts`: Inequality 1 (loop-free), 2 (downstream), 3 (node-protecting) for each neighbor N ≠ E
- [x] Candidate cost `c(S,N) + dist(N,D)`
- [x] Best-LFA choice: node-protecting → downstream → lowest cost → lowest router ID (D7)
- [x] ECMP-protected detection (§1.4) + test with an ECMP square
- [x] `explain.ts`: LFA steps with real numbers, e.g. `dist(A,E)=2 < 1+1=2 ✗`, with RFC section
- [x] Property test: every reported LFA reaches D without passing S (`05-testing.md` §3 item 2)

**Done when:** Example 1 and 2 LFA results match `05-testing.md` §2 exactly.

---

## Phase 3 – Remote LFA (2 days)

- [x] Re-read RFC 7490 §5.2–5.4; confirm P-space, extended P-space (§5.2.1) and Q-space (§5.3) rules; log the result in `DECISIONS.md` (closes the check in D5)
- [x] Tests first: Example 2 (P={A,B}, ext P={A,B,C}, Q={B,C}, PQ={B,C}, chosen B); Example 3 (P={A,B}, ext P={A,B}, Q={C}, no PQ)
- [x] `rlfa.ts`: P-space of S
- [x] Extended P-space via each other neighbor N, remembering the exit neighbor (D11)
- [x] Q-space of E using **reverse** distances
- [x] PQ = (extended) P ∩ Q (S and E never in any space, D17)
- [x] Best PQ: lowest cost from S to the PQ node → lowest router ID (RFC 7490 §5.2.2, D17)
- [x] Plain-P-space toggle (option on the compute call)
- [x] Only run RLFA when there's no LFA (but still return the spaces for teaching)
- [x] Explain steps for each P/Q check with numbers
- [x] Asymmetric-metric test (Q-space must differ from a forward-SPF answer)
- [x] Property test: S's path to PQ avoids S–E, PQ's path to E avoids S–E (item 3)

**Done when:** Example 2 and 3 RLFA results match `05-testing.md` §2 exactly.

---

## Phase 4 – TI-LFA, link protection (3 days)

- [x] Check whether the TI-LFA draft is now an RFC; update the README table and `02-algorithms.md` §7 (RFC 9855, D18)
- [ ] Tests first: exact segment lists and label stacks for Examples 1, 2, 3
- [ ] Post-convergence SPF with link S–E removed (both directions)
- [ ] Deterministic tie-break: lowest router IDs along the path (§4.1)
- [ ] Return "unprotected: network partitioned" when D can't be reached
- [ ] Greedy segment-list walk (§4.2, D8)
- [ ] Clean-up rule: drop a first `PrefixSID(N)` or `AdjSID(S→N)` for the first-hop neighbor (D11, D18); end with `PrefixSID(D)`
- [x] `labels.ts`: prefix label = SRGB + index; Adj-SID from file or auto-assigned from 24000
- [ ] Label stack top-first, before PHP; count extra labels
- [ ] Explain steps for each walk step (why this Y, or why an Adj-SID)
- [ ] Property tests (items 4, 5): simulating the segment list with pre-failure tables reaches D, never uses S–E, and costs the same as the post-convergence path; a path is found whenever D is reachable
- [ ] Edge cases: D = E, bridge link, 3-node graph, ties

**Done when:** all 3 examples give `[Prefix D]`, `[Prefix B, Prefix E]` and `[Prefix B, Adj B→C, Prefix E]` with stacks `16000+sid(D)`, `16004 16002`, `16004 24005 16002`.

---

## Phase 5 – Coverage + worker (1 day)

- [ ] `index.ts`: `computeForSource(topology, source, options)` returning `DestinationResult[]`
- [ ] Tests first for coverage numbers on the 3 examples
- [ ] `coverage.ts`: per-source LFA %, (LFA or RLFA) %, TI-LFA % (§5)
- [ ] All-sources mode (sum over every router as S)
- [ ] List of unprotected (source, destination, link) with the reason
- [ ] CSV export (pure function returning a string)
- [ ] Property test: LFA% ≤ RLFA% ≤ TI-LFA% (item 6)
- [ ] `worker/engine.worker.ts`: run the engine off the main thread, with progress messages
- [ ] Speed check: generated 200-node / 600-link topology, all-sources coverage < 2 s

🎯 **Milestone A: engine done.**
- [ ] (opt) Tiny CLI: `npx lfa-lab examples/02-ring5.yaml --source S`

---

## Phase 6 – UI basics (4–5 days)

- [ ] Add example topologies `04-isp-core.yaml` and `05-leaf-spine.yaml` (F2 asks for 4–5) + their expected results
- [ ] `state/store.ts` (Zustand): topology, selected source, selection, failed links, settings
- [ ] Undo / redo history in the store
- [ ] `GraphCanvas.tsx`: Cytoscape wrapper; show routers, links, metrics (both directions if different)
- [ ] `Toolbar.tsx`: tools (select, add router, add link, fail link), examples menu, import, export
- [ ] Add / move / delete routers and links on the canvas
- [ ] `PropertiesPanel.tsx`: edit name, SID index, metrics, Adj-SIDs, with validation messages
- [ ] Import YAML (file picker) with clear errors; export YAML (download)
- [ ] Source picker
- [ ] `ResultsTable.tsx`: Dest · NH · Cost · LFA · RLFA · TI-LFA · ✓/✗
- [ ] Row click → primary path blue solid, backup orange dashed, P/Q spaces shaded, PQ node ★
- [ ] `DetailPanel.tsx`: LFA candidates, P / ext-P / Q / PQ sets, segment list, label stack, explain steps
- [ ] UI smoke test: load an example, pick a source, see the table (Testing Library)

**Done when:** a new user can load an example and read a result in under 30 s.

---

## Phase 7 – Failure simulation + reports (2–3 days)

- [ ] Fail-link mode: click a link to fail it
- [ ] Animate traffic moving onto the repair path for affected destinations
- [ ] "Converge" button: show the final post-convergence path
- [ ] Show whether the repair path equals the post-convergence path
- [ ] `CoverageReport.tsx`: per-source and all-sources numbers, unprotected list, CSV download, progress bar
- [ ] `io/share-url.ts`: topology → lz-string → URL hash, and back; test the round trip
- [ ] Dark mode toggle (☾/☀)
- [ ] Keyboard support for all tools and the table
- [ ] Line styles + icons as well as colours
- [ ] Phone layout: canvas on top, results as cards
- [ ] Check it works offline after first load (static files only, no network calls)
- [ ] Run the manual release checklist in `docs/05-testing.md` §5

🎯 **Milestone B: MVP (v0.1).**

---

## Phase 8 – Launch (1–2 days)

- [ ] Pick Vercel or GitHub Pages; log it in `DECISIONS.md`
- [ ] Deploy the static build
- [ ] Record a demo GIF; take screenshots
- [ ] Update the README: status, live link, GIF, how to run locally
- [ ] Tag release `v0.1.0`
- [ ] Blog / LinkedIn post: "TI-LFA explained with pictures" (use Examples 2 and 3)
- [ ] Add `projects/lfa-lab.md` + an `INDEX.md` row in the profile folder; update the resume bullet

---

## Later (v0.2+), in priority order

1. [ ] Node protection: RLFA per RFC 8102, TI-LFA with node E removed (`02-algorithms.md` §4.4)
2. [ ] Import from FRR `show isis database detail`
3. [ ] SRLG (links that fail together)
4. [ ] Quiz mode for students
5. [ ] LAN links / pseudonodes, multi-level IS-IS
6. [ ] Microloop view, Flex-Algo, SRv6

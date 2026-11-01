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
- [x] Tests first: exact segment lists and label stacks for Examples 1, 2, 3
- [x] Post-convergence SPF with link S–E removed (both directions)
- [x] Deterministic tie-break: lowest router IDs along the path (§4.1)
- [x] Return "unprotected: network partitioned" when D can't be reached
- [x] Greedy segment-list walk (§4.2, D8)
- [x] Clean-up rule: drop a first `PrefixSID(N)` or `AdjSID(S→N)` for the first-hop neighbor (D11, D18); end with `PrefixSID(D)`
- [x] `labels.ts`: prefix label = SRGB + index; Adj-SID from file or auto-assigned from 24000
- [x] Label stack top-first, before PHP; count extra labels
- [x] Explain steps for each walk step (why this Y, or why an Adj-SID)
- [x] Property tests (items 4, 5): simulating the segment list with pre-failure tables reaches D, never uses S–E, and costs the same as the post-convergence path; a path is found whenever D is reachable
- [x] Edge cases: D = E, bridge link, 3-node graph, ties

**Done when:** all 3 examples give `[Prefix D]`, `[Prefix B, Prefix E]` and `[Prefix B, Adj B→C, Prefix E]` with stacks `16000+sid(D)`, `16004 16002`, `16004 24005 16002`.

---

## Phase 5 – Coverage + worker (1 day)

- [x] `index.ts`: `computeForSource(topology, source, options)` returning `DestinationResult[]`
- [x] Tests first for coverage numbers on the 3 examples
- [x] `coverage.ts`: per-source LFA %, (LFA or RLFA) %, TI-LFA % (§5)
- [x] All-sources mode (sum over every router as S)
- [x] List of unprotected (source, destination, link) with the reason
- [x] CSV export (pure function returning a string)
- [x] Property test: LFA% ≤ RLFA% ≤ TI-LFA% (item 6)
- [x] `worker/engine.worker.ts`: run the engine off the main thread, with progress messages
- [x] Speed check: generated 200-node / 600-link topology, all-sources coverage < 2 s

🎯 **Milestone A: engine done.**
- [ ] (opt) Tiny CLI: `npx lfa-lab examples/02-ring5.yaml --source S`

---

## Phase 6 – UI basics (4–5 days)

- [x] Add example topologies `04-isp-core.yaml` and `05-leaf-spine.yaml` (F2 asks for 4–5) + their expected results
- [x] `state/store.ts` (Zustand): topology, selected source, selection, failed links, settings
- [x] Undo / redo history in the store
- [x] `GraphCanvas.tsx`: Cytoscape wrapper; show routers, links, metrics (both directions if different)
- [x] `Toolbar.tsx`: tools (select, add router, add link, fail link), examples menu, import, export
- [x] Add / move / delete routers and links on the canvas
- [x] `PropertiesPanel.tsx`: edit name, SID index, metrics, Adj-SIDs, with validation messages
- [x] Import YAML (file picker) with clear errors; export YAML (download)
- [x] Source picker
- [x] `ResultsTable.tsx`: Dest · NH · Cost · LFA · RLFA · TI-LFA · ✓/✗
- [x] Row click → primary path blue solid, backup orange dashed, P/Q spaces shaded, PQ node ★
- [x] `DetailPanel.tsx`: LFA candidates, P / ext-P / Q / PQ sets, segment list, label stack, explain steps
- [x] UI smoke test: load an example, pick a source, see the table (Testing Library)

**Done when:** a new user can load an example and read a result in under 30 s.

---

## Phase 7 – Failure simulation + reports (2–3 days)

- [x] Fail-link mode: click a link to fail it
- [x] Animate traffic moving onto the repair path for affected destinations
- [x] "Converge" button: show the final post-convergence path
- [x] Show whether the repair path equals the post-convergence path
- [x] `CoverageReport.tsx`: per-source and all-sources numbers, unprotected list, CSV download, progress bar
- [x] `io/share-url.ts`: topology → lz-string → URL hash, and back; test the round trip
- [x] Dark mode toggle (☾/☀)
- [x] Keyboard support for all tools and the table
- [x] Line styles + icons as well as colours
- [x] Phone layout: canvas on top, results as cards
- [x] Check it works offline after first load (static files only, no network calls)
- [x] Run the manual release checklist in `docs/05-testing.md` §5

🎯 **Milestone B: MVP (v0.1).**

---

## Phase 9 – User feedback, v0.2 (from hands-on testing, 2026-10-31)

Feedback from a user who knows LFA / RLFA / TI-LFA. Do these first: they fix friction in
the current UI before the bigger features below.

### 9.1 Close the detail panel (small)
- [x] ✕ button on `DetailPanel.tsx` that calls `selectRow(null)` and clears the path highlight
- [x] `Escape` closes it too (keyboard rule from Phase 7)
- [x] Clicking the same row again toggles it closed; clicking empty canvas also closes it
- [x] UI test: open a row, press ✕, panel and highlight are gone

**Done when:** you can always get back to the plain diagram in one click or one key.

### 9.2 Fail more than one link
Today `failedLink` is a single id. FRR protects against one failure, so the tool must
*show* what goes wrong when a second link fails, not hide it.
- [x] Store: `failedLinks: string[]` (keep share URL / old state readable)
- [x] Fail-link tool toggles each link on/off; a "Restore all" button
- [x] Engine (`simulate.ts`, tests first): with several links down, for each affected destination say
      - repair still works, or
      - **repair broken**: the pre-computed backup path uses another failed link (show which one), or
      - destination unreachable (network partitioned)
- [x] "Converge" uses SPF with all failed links removed
- [x] Explain text with real numbers, e.g. "TI-LFA repair to D goes via B–C, which is also down"
- [x] `DECISIONS.md` entry: how a multi-failure result is shown and why (D23)
- [x] Follow-up: when a backup runs into another failed link, the router there uses its own
      backup (FRR is local), so traffic can still get through on a third path, be dropped, or
      loop. Shown hop by hop, with every router that repaired (D24)

**Done when:** failing two links on Example 2 shows which repairs survive and which break.

### 9.3 Router failure (router down or rebooting)
When router E goes down, every link to it goes down at once and its Prefix-SID stops
working. The neighbors only see "my link to E failed", so they use their **link-protecting**
backups, and some of those still go through E. This is the main reason node protection
exists.
- [x] "Fail router" tool + right-click "Fail router"; failed router greyed out, all its links shown as down
- [x] Engine (`simulate.ts`, tests first): fail a node = remove E and all its links. For each source S and destination D:
      - D = E: unreachable, which is expected (say so plainly, not as a protection failure)
      - repair survives: the backup path never goes through E
      - **repair broken by the node failure**: the backup goes through E (show where), e.g.
        - link-protecting LFA whose path from N to D goes through E (failed node-protecting check, `dist(N,D) < dist(N,E) + dist(E,D)` ✗)
        - RLFA whose PQ node is reached through E, or whose path from PQ to D goes through E
        - TI-LFA link-protection stack that contains `PrefixSID(E)` or an Adj-SID on a link of E
      - not affected: traffic to D never went through E
- [x] Per-source summary: "E down: 6 destinations affected, 4 repairs survive, 2 break"
- [x] "Converge" view: SPF with E removed; compare it with the repair path
- [x] Explain text with real numbers for each broken repair
- [x] Router comes back (restore): show that the old paths return. (opt) Show the overload bit on startup (ISO 10589 / RFC 3787): the rebooted router stays out of transit paths until it is ready. *Done as a note in the "back up" notice; not modelled (D27).*
- [x] Tests on Examples 1–3: fail E and check each repair's survive/break result by hand first. Examples 1–5 have no backup that breaks, so a new `06-link-protecting.yaml` shows the breaking case (D27)
- [x] `DECISIONS.md` entry: what "broken" means for each backup type
- [x] Out of scope (non-goal): reboot timing, BFD / hold timers, graceful restart. We show the *state* before and after, not the timing.

**Done when:** failing a router on Example 1 shows the node-protecting LFA survives, and an example with only link-protecting backups shows them breaking, with the reason. This leads into Later #1 (node protection).

### 9.4 Parallel links between two routers
Needs a rule change: the MVP bans parallel links (D4).
- [x] Re-read RFC 5286 on parallel links and how they act as alternates; log the result in `DECISIONS.md` (replaces D4) *(D29)*
- [x] Types: links already have their own id; drop the "no parallel links" check in `io/yaml.ts` and `state/edit.ts`
- [x] Tests first (engine):
      - SPF/ECMP: two equal links to E give ECMP; failing one is ECMP-protected
      - LFA: the other parallel link to E protects the link (not the node)
      - TI-LFA: each parallel link gets its own Adj-SID; `AdjSID(S→N)` must name the link, not just the neighbor
- [x] Canvas: draw parallel links as curved bundles (Cytoscape `curve-style: bezier`) with separate metric labels
- [x] Add-link tool lets you add a second link between the same pair
- [x] New example `07-parallel.yaml` + expected results

**Done when:** a 2-link bundle shows ECMP / link-protecting LFA correctly and each link can be failed on its own.

### 9.5 Canvas usability
- [x] Make dragging obvious: allow dragging routers in every tool (a drag isn't a click), or show a hint "switch to Select to move routers" *(any tool, D30)*
- [x] Hover tooltip on a router (name, SID, label) and link (metrics both ways, Adj-SIDs)
- [x] Right-click menu: set as source, fail/restore link, fail router, delete
- [x] Double-click a link to edit its metric in place
- [x] Click a router on the canvas as destination → selects that row in the results table
- [x] "Auto layout" and "Fit to screen" buttons; zoom +/− buttons for touch/trackpad users *(own deterministic layout, D30)*

**Done when:** routers move with any tool, and every action on a router or link is one right-click away (D30).

### 9.6 Results for every router as the DUT
Today the results table, detail panel and failure view show one source at a time (e.g.
PE1 in `04-isp-core.yaml`). Users want to see each router's results when *it* is the DUT
(device under test, the router doing the protecting), without picking them one by one.
- [x] Source picker gets an "All routers" choice next to the single-router list
- [x] Engine: reuse `computeForSource` for each router (all-sources path from Phase 5 already exists); run it in the worker with progress
- [x] Results view for "All routers": one section per DUT (collapsible), same columns as today: Dest · NH · Cost · LFA · RLFA · TI-LFA · ✓/✗; filter by DUT and "only unprotected"
- [x] Row click still works: picks that DUT + destination, highlights the path and opens the detail panel
- [x] Failure view: with links (or a router, 9.3) failed, show the effect per DUT, e.g. "PE1: 3 affected, 3 survive · P2: 2 affected, 1 breaks"
- [x] Quick switch: click a router on the canvas (or right-click "Set as DUT", 9.5) to make it the DUT
- [x] CSV export of the all-DUT table (reuse the Phase 5 CSV function)
- [x] Speed: stays under 2 s on the 200-node topology; large tables are virtualised or paged *(0.9 s rows, 1.4 s failure summary; 20 sections per page, D31)*
- [x] UI test: load Example 4, choose "All routers", see a section for every router

**Done when:** on `04-isp-core.yaml` you can see, in one view, the LFA / RLFA / TI-LFA result for every router as the DUT, and click into any of them.

---

## Ideas backlog (suggested, not yet prioritised)

Things that fit the "learn and check FRR" goal and stay offline / no backend.

**Teaching**
- [x] Packet walk: step through a TI-LFA repair hop by hop, showing the label stack at each router (push, pop at the end of each segment, PHP) *(D34, `02-algorithms.md` §4.5)*
  - [x] Label stacks drawn on the diagram during the walk, with a "Show labels on the diagram" switch
  - [x] Walk the **primary path** too, not only the TI-LFA backup: S's normal label (Prefix-SID of D) hop by hop, PHP at the penultimate router; let the user pick primary or backup to show on the diagram *(D35)*
  - [x] Walk the **simulated traffic** when links or a router are down (failure view, `simulate.ts` flows): the labels on each hop of the real repair, including a second router's repair, drops and loops; and the path after convergence in the "Converge" step *(D35, `02-algorithms.md` §8.3)*
- [x] Bug: fail a router, restore it, and the "back up" notice appears at the top; until that notice is closed with ✕, the router can't be failed again. Check in Chrome, find the cause, add a UI test *(Cytoscape only re-reads where its box is when the box changes size; the notice moved it without resizing, so clicks landed one notice-height off. The canvas now re-measures when a notice opens or closes and before each click. Failing the router again also takes it off the notice, or closes the notice if no router in it is still up.)*
- [x] Compare view: LFA, RLFA and TI-LFA paths for one destination side by side *(D36, `02-algorithms.md` §10)*
  - [x] With links or routers down: the three repair modes side by side for the traffic on the diagram (delivered / dropped / loops, and why) *(D37, §10.1)*
- [x] Guided tour on first visit (load Example 2, fail S–E, read the TI-LFA stack) *(D38)*
- [x] Clickable P / Q / PQ sets in the detail panel that highlight those routers on the canvas *(D39)*

**Design checks (for engineers)**
- [x] Per-link view: pick a link, list every (source, destination) it protects and how *(D41, `02-algorithms.md` §11)*
- [x] Coverage heat-map on the canvas: colour links / routers by how well they are protected *(D42, `02-algorithms.md` §12)*
- [x] What-if diff: change a metric and see coverage before vs after ("LFA 60% → 80%") *(D43, `02-algorithms.md` §13)*
- [x] Max SID depth (MSD) setting: flag TI-LFA repairs whose label stack is too deep for the hardware *(D44, `02-algorithms.md` §14)*
- [x] LFA policy knobs (RFC 7916): prefer node-protecting, prefer downstream, exclude a neighbor *(D45, `02-algorithms.md` §15)*
- [x] Overload bit / max-metric router: excluded from transit, see how coverage changes *(D47, `02-algorithms.md` §16)*
- [x] Find the weakest spots: links or routers whose failure leaves the most destinations unprotected *(D48, `02-algorithms.md` §17)*

**Data in / out**
- [x] YAML format guide in the app (fields, rules, common mistakes, a live checker) and clearer import errors: unknown keys with "did you mean", line and column for syntax errors *(D40)*
- [x] Export the diagram as PNG / SVG for slides and docs *(D49: "⤓ PNG" / "⤓ SVG" on the diagram, whole network as it looks now, white background)*
- [x] Random topology generator (ring, grid, leaf-spine, random mesh) with a size slider *(D50: "Generate…" in the top bar; seeded, so the same settings give the same network)*
- [x] Vendor CLI import (see Later #2) *(D52: FRR `show isis database detail`, "Import FRR…" in the top bar)*

---

## Later (v0.2+), in priority order

1. [x] Node protection: RLFA per RFC 8102, TI-LFA with node E removed (`02-algorithms.md` §3.1, §4.4) *(D51: `protection: node` in the topology properties; Example 8)*
2. [x] Import from FRR `show isis database detail` *(D52, `docs/03-architecture.md` §5.1)*
3. [x] SRLG (links that fail together; builds on 9.2 multi-failure) *(D53, `02-algorithms.md` §18; Example 9)*
4. [x] Quiz mode for students *(D54, `02-algorithms.md` §19)*
5. [x] LAN links / pseudonodes, multi-level IS-IS *(D55, D56, `02-algorithms.md` §20–21; Example 10; FRR import reads LANs and both levels)*
6. [x] Microloop view, Flex-Algo, SRv6 *(D57, D58, D59, `02-algorithms.md` §22–24; Example 11)*

---

## Phase 10 – Launch (1–2 days)

> **Do this last:** launch only after Phase 9 and the other planned work are done.

- [ ] Pick Vercel or GitHub Pages; log it in `DECISIONS.md`
- [ ] Deploy the static build
- [ ] Record a demo GIF; take screenshots
- [ ] Update the README: status, live link, GIF, how to run locally
- [ ] Tag release `v0.1.0`
- [ ] Blog / LinkedIn post: "TI-LFA explained with pictures" (use Examples 2 and 3)
- [ ] Add `projects/lfa-lab.md` + an `INDEX.md` row in the profile folder; update the resume bullet

# Decision log

Newest at the bottom. Format: **Decision** · Why · Other options considered · Status.

---

### D1 – Browser-only app, no backend (2026-10-29)
- **Why:** free hosting, works offline, no privacy worries, easy for students.
- **Other options:** Python backend (FastAPI) + React. Rejected because the maths is light enough for the browser.
- **Status:** Accepted.

### D2 – TypeScript engine kept separate from the UI (2026-10-29)
- **Why:** can be unit-tested on its own, run in a Web Worker, and reused later as an npm package or CLI.
- **Status:** Accepted.

### D3 – Cytoscape.js for drawing the graph (2026-10-29)
- **Why:** built for network graphs, handles 200+ nodes, good layouts and edge styling.
- **Other options:** React Flow (better for flowcharts, weaker for network layouts), D3 (too low level).
- **Status:** Accepted, revisit if editing feels clumsy.

### D4 – MVP scope: IS-IS, point-to-point links, single level, link protection (2026-10-29)
- **Why:** covers the core learning value. Node protection, SRLG, LAN links and multi-level come in v0.2+.
- **Status:** Accepted. The MVP rule "no parallel links" is replaced by D29 (Phase 9.4).

### D5 – Use extended P-space for RLFA by default (2026-10-29)
- **Why:** this is what most implementations do, and it finds more PQ nodes. Plain P-space stays available as a toggle for teaching.
- **Status:** Accepted. RFC 7490 §5.2.1 checked in D17: extended P-space is "the preferred approach".

### D6 – Treat ECMP ties as "may use the link" (strict inequalities) (2026-10-29)
- **Why:** safe choice: never claim protection that a tie could break.
- **Status:** Accepted.

### D7 – Best-LFA order: node-protecting → downstream → lowest cost → lowest router ID (2026-10-29)
- **Why:** simple, explainable, close to common vendor defaults. Real routers let operators tune this.
- **Status:** Accepted.

### D8 – TI-LFA segment list built with a greedy "furthest valid prefix-SID, else Adj-SID" walk (2026-10-29)
- **Why:** gives a short segment list, is easy to explain step by step, and is correct because non-S routers still use pre-failure tables. A property test checks it.
- **Status:** Accepted.

### D9 – Same SRGB on every router (2026-10-29)
- **Why:** keeps label maths simple for the MVP. Per-router SRGB can come later.
- **Status:** Accepted.

### D10 – MIT licence (2026-10-29)
- **Status:** Accepted.

### D11 – RLFA tie-break and extended-P exit; TI-LFA first-hop clean-up (2026-10-29)
- **Why:** checking the worked examples with a script showed (a) a PQ node found only through a neighbor's P-space must be reached by sending out through that neighbor, (b) costs can tie, so plain-P-space nodes are preferred before router ID, (c) the greedy TI-LFA walk adds a label for the first-hop neighbor itself, which must be dropped.
- **Status:** Accepted, except (b): replaced by D17 (RFC 7490 §5.2.2 picks the lowest S->P cost, then router ID). Rules in `docs/02-algorithms.md` §3 and §4.2.

### D12 – Pin TypeScript to 6.0.x; lint and format tooling (2026-10-30)
- **Why:** the Vite template installs TypeScript 7, but `typescript-eslint` (needed for ESLint on TS code) only supports TypeScript below 6.1. TypeScript 6.0 has every tsconfig option we use.
- **Tooling added:** `eslint`, `@eslint/js`, `typescript-eslint`, `eslint-plugin-react-hooks`, `eslint-plugin-react-refresh`, `globals`, `prettier`, `eslint-config-prettier`. All are dev-only and are the standard pieces of the ESLint + Prettier setup in `docs/03-architecture.md` §2.
- **Other options considered:** keep TypeScript 7 and use oxlint (the template default). Rejected for now: the docs pick ESLint, and the engine-purity rule (`CLAUDE.md` rule 1) is easy to write as an ESLint `no-restricted-*` rule.
- **Status:** Accepted. Move to TypeScript 7 once `typescript-eslint` supports it.

### D13 – Tailwind CSS 4 with class-based dark mode (2026-10-30)
- **Why:** Tailwind is the styling choice in `docs/03-architecture.md` §2. Version 4 needs no config file: one `@import` in `src/index.css` plus the official `@tailwindcss/vite` plugin. Dark mode uses a `.dark` class on `<html>` (set with `@custom-variant` in CSS) so the ☾/☀ toggle can override the OS setting.
- **Tooling added:** `tailwindcss`, `@tailwindcss/vite` (dev-only).
- **Other options considered:** Tailwind 3 with PostCSS and `tailwind.config.js` (more files, older), dark mode from `prefers-color-scheme` only (no manual toggle).
- **Status:** Accepted.

### D14 – js-yaml 4 for topology files (2026-10-30)
- **Why:** js-yaml is the YAML choice in `docs/03-architecture.md` §2. Files load with `CORE_SCHEMA` (plain YAML types only), so custom tags like `!!js/function` are rejected (§8). Pinned to 4.x because `@types/js-yaml` only covers v4; v5 can come later.
- **Format additions:** an optional `pos: { x, y }` per node so saved files keep the canvas layout. The engine ignores it. A missing `name` loads as "Untitled". Link ids are made from the ends (`S-E`), since the file has none.
- **Tooling added:** `js-yaml` (runtime), `@types/js-yaml` (dev-only).
- **Status:** Accepted.

### D15 – Cache all-pairs distances by topology object, not a version number (2026-10-30)
- **Why:** `docs/02-algorithms.md` §1.3 says "cache by topology version". The store will replace the topology object on every edit (never change it in place), so the object itself is the version. A `WeakMap` keyed by it needs no extra field on `Topology` and frees old tables automatically.
- **Rule this creates:** treat a `Topology` as immutable once passed to the engine. Changing it in place would return stale distances.
- **Other options considered:** a `version` counter on `Topology` (easy to forget to bump), hashing the topology (slower, more code).
- **Status:** Accepted.

### D16 – LFA rules checked against RFC 5286 §3–4 (2026-10-30)
- **Checked:** Inequalities 1–3 (RFC 5286 §1, §3.1, §3.2), alternates per primary next hop (§3.4), the selection rules (§3.6) and using an alternate (§4). The formulas in `docs/02-algorithms.md` §2 match the RFC word for word.
- **D7 still holds:** §1 says a router SHOULD pick a node-protecting LFA over a link-protecting downstream path, and §3.6 rule 1 prefers node-protecting. Downstream as the second key matches step 16 of the §3.6 algorithm. The RFC leaves the rest to "distance, IP addresses, or any router-local tie-breaker", so lowest `c(S,N) + dist(N,D)` then lowest router ID is our choice.
- **Added to the doc:**
  - Other primary next hops (ECMP) are LFA candidates too; only E itself is skipped (§3.4, §3.6 step 2). With point-to-point links and no parallel links, another primary next hop is always downstream, so it always protects the link (that is the "ECMP-protected" flag).
  - A neighbor N is never an LFA if the link S→N or N→S has the IS-IS maximum metric 16,777,215 (§3.5 MUST NOT). The overload bit isn't modelled.
  - Candidate flags hold the plain result of each inequality. `best` only looks at loop-free candidates. With E a primary next hop, Inequality 3 can't hold when Inequality 1 fails, and Inequality 2 implies Inequality 1, so the flags never contradict.
- **Not in the MVP:** the §3.6 rule 4 mode "prefer other primary next hops over non-primary alternates". The UI shows `ecmpProtected` instead.
- **Open (later phase):** RFC 5305 §3.7 says a link with the maximum metric must not be used in normal SPF at all. Our SPF still uses it. Revisit with the coverage/UI work.
- **Status:** Accepted.

### D17 – RLFA rules checked against RFC 7490 §5.2–5.4 (2026-10-30)
- **Checked:** P-space (§5.2.1.1), extended P-space (§5.2.1.2 and the §5.3 pseudocode), Q-space (§5.2.1.3, §5.3), choosing the PQ node (§5.2.2) and maximum-metric links (§5.4). This closes the check left open in D5.
- **P-space matches:** "cost S->P strictly less than S->E->P", i.e. `dist(S,Y) < c(S,E) + dist(E,Y)`.
- **Extended P-space:** the RFC gives two formulas. The prose (§5.2.1.2) says `dist(N,Y) < dist(N,S) + c(S,E) + dist(E,Y)`; the pseudocode (§5.3) uses RFC 5286 Inequality 1, `dist(N,Y) < dist(N,S) + dist(S,Y)`. We use Inequality 1 per neighbor, so the tunnel from N never comes back through S. Once P(S) is added (and the pseudocode's union over neighbors already contains P(S)), both give the **same set**: a node that passes the prose test but not Inequality 1 has `dist(N,Y) = dist(N,S) + dist(S,Y)`, so the prose test reduces to `dist(S,Y) < c(S,E) + dist(E,Y)`, which puts it in P(S).
- **Q-space:** the RFC writes `dist(Y,E) < dist(Y,S) + dist(S,E)`; we write `c(S,E)`. They are equal whenever S–E is a primary next-hop link (if `dist(S,E) < c(S,E)`, no shortest path would use the link). `c(S,E)` is also exactly the "avoids link" check in `02-algorithms.md` §1.5. Distances to E come from a reverse SPF (§5.3 `Compute_and_Store_Reverse_SPF`).
- **Changed – choosing the PQ node:** §5.2.2 RECOMMENDS the lowest cost S->P, then the lowest node id (SHOULD). This replaces D11's "lowest `dist(S,PQ) + dist(PQ,D)`, then plain-P first". The S->P cost is `dist(S,P)` for a plain-P node and `c(S,N) + dist(N,P)` for one reached only through neighbor N (the cheapest such N, then lowest id). The choice no longer depends on D: the RFC uses E's Q-space as a stand-in for every destination behind E (§5.2.1.3). Example 2 still picks B (cost 2 vs 3 for C via A).
- **S and E are left out of every space.** S can never pass the tests. E is never in P(S) (a tie). If E is in some P(N), then N is loop-free for E, and so `dist(N,D) ≤ dist(N,E) + dist(E,D) < dist(N,S) + dist(S,D)`: N is an LFA for every D behind E and RLFA never runs. So leaving E out loses nothing.
- **Max metric (§5.4):** a neighbor whose link to or from S has the maximum metric is not used as an extended-P-space exit, the same rule as LFA (D16). The overload bit isn't modelled.
- **Not in the MVP:** the optional downstream constraint on PQ nodes (§5.3 `Apply_Downstream_Constraint`), and LAN/pseudonode cases.
- **Status:** Accepted. D11's tie-break part is replaced by this entry; its "exit via neighbor" part still holds.

### D18 – TI-LFA checked against RFC 9855; Adj-SID auto-assignment (2026-10-30)
- **Checked:** the TI-LFA draft was published as **RFC 9855** (October 2025). README and `docs/02-algorithms.md` §7 now cite it. Sections read: §2–5 (notation, post-convergence path, repair path), §7.1 (MPLS) and §9 (Adj-SIDs in the repair list).
- **Matches:** the repair follows `SPT_new(S, X)` (§3), and "an implementation is free to use any local optimization to provide smaller segment lists" (§3, §5.4). Our greedy walk (D8) is such an optimization. Its Prefix-SID check (all normal paths avoid S–E) is what makes the list loop-free.
- **Added:**
  - The repair is an outgoing interface plus a repair list (§5). So the clean-up rule (D11) also drops a first `AdjSID(S→N)`, not only `PrefixSID(N)`: S never pushes a label for its own link (§5.1).
  - The segment list always ends with `PrefixSID(D)`: the destination's own label stays under the repair list (§7.1 rule 2). If the walk ends with an Adj-SID into D, `PrefixSID(D)` is added after it. "Extra labels" is the repair list length (= segments − 1).
  - Post-convergence tie-break, made exact: compare equal-cost paths router by router from S; the lowest ID at the first difference wins.
- **Not in the MVP:** §7.1 rule 1 (popping the destination label with PHP; we show the stack before PHP), per-router SRGBs (D9), choosing unprotected Adj-SIDs (§9 MAY), SRv6.
- **Adj-SID auto-assignment:** a link direction with no Adj-SID in the file gets one from its router: each router numbers its own outgoing links from 24000, in neighbor-ID order, skipping labels it already uses (its explicit Adj-SIDs and any prefix-SID label). Adj-SIDs are local to a router (RFC 8402 §3.4), so two routers may use the same number. Numbering per router means editing one part of the network doesn't renumber links elsewhere.
- **Other options considered:** one global counter (renumbers everything after any edit).
- **Status:** Accepted.

### D19 – Coverage counting, CSV export and the worker protocol (2026-10-30)
- **Counting (`02-algorithms.md` §5):** one pair per (D, primary next-hop link), so ECMP destinations count once per next hop. Routers the source can't reach aren't counted. "LFA" = a best LFA exists; "RLFA" = LFA or a PQ node; "TI-LFA" = a repair path exists. ECMP-protected pairs get their own count but are always inside the LFA count (D16).
- **Unprotected list:** every pair LFA alone doesn't protect, tagged with the strongest method that fails (`no-lfa`, `no-rlfa`, `partitioned`) and a one-line reason. Sorted by source, destination, link.
- **Hand-checked numbers** (tests): `01-square` all sources 12 pairs, LFA 8, RLFA 12, TI-LFA 12; `02-ring5` 20 / 10 / 20 / 20; `03-ring5-highmetric` from S: 4 / 0 / 0 / 4.
- **Explain steps are off in coverage runs** (`computeForSource(…, { explain: false })`): RLFA explains every P/Q check, so all-sources on 200 routers would build hundreds of thousands of strings for nothing.
- **Speed:** a fixed 200-router / 600-link topology, all sources: about 1.0 s on a laptop (target < 2 s). No optimisation needed yet; time is spread over Dijkstra and graph building.
- **`index.ts`** holds `computeForSource()` and `computeCoverage()`; `coverage.ts` only sums results, so there's no import cycle.
- **CSV (`src/io/csv.ts`):** two files instead of one mixed table: per-source numbers (with an "All sources" row) and the unprotected list. RFC 4180 quoting, CRLF line ends. Text starting with `= + - @` gets a leading `'` so spreadsheets don't run it as a formula, since router ids come from shared files.
- **Worker:** `protocol.ts` has the messages and a `handleRequest()` that tests call directly in Node; `engine.worker.ts` only wires it to `onmessage`; `client.ts` gives promise-based calls with a progress callback, matched by request id. A running job can't be cancelled except by `terminate()`; fine for < 2 s runs.
- **Other options considered:** a single CSV with a summary block on top (awkward to open in a spreadsheet); testing the worker only in a browser (slow, needs Playwright).
- **No new dependencies.**
- **Status:** Accepted. D16's open item (maximum-metric links in normal SPF) is still open; moved to the UI work.

### D20 – UI libraries: Cytoscape.js, Zustand, Testing Library (2026-10-30)
- **Why:** Cytoscape.js (D3) and Zustand are the picks in `docs/03-architecture.md` §2. Cytoscape ships its own TypeScript types. The UI smoke test (`docs/05-testing.md` §1) uses Testing Library on jsdom, so it runs in Vitest with no browser.
- **Tooling added:** `cytoscape`, `zustand` (runtime); `@testing-library/react`, `@testing-library/dom`, `@testing-library/user-event`, `jsdom` (dev-only).
- **Undo / redo:** written by hand in the store (a past/future stack of topologies, max 100) instead of the `zundo` middleware. It's about 30 lines and only the topology needs history, not the selection or results.
- **Other options considered:** React Flow (rejected in D3), Redux Toolkit (more code for the same job), Playwright for the smoke test (slow, needs a browser; kept for later).
- **Status:** Accepted.

### D21 – UI basics: paths to draw, link ids, what the canvas shows (2026-10-30)
- **Paths come from the engine:** `engine/paths.ts` turns a result into node-by-node primary, LFA, RLFA and TI-LFA paths, so the UI still does no routing maths (`docs/03-architecture.md` §1). Ties use the lowest-id rule of the post-convergence path (`02-algorithms.md` §4.1), so a drawing never flips between equal-cost paths. It runs on the main thread: it only reads the cached all-pairs table.
- **Which backup is drawn:** "Auto" draws the first that exists in coverage order (LFA, then Remote LFA, then TI-LFA); the detail panel can switch to any of them. The RLFA path goes S → exit neighbor → PQ → D (D11).
- **Status column:** names the simplest method that protects the pair (ECMP, LFA, Remote LFA, TI-LFA), the same order as the coverage counts (D19).
- **Ids typed in the UI:** letters, digits, `_` and `.` only. No `-`, since link ids are `a-b` (D14) and "A-B"+"C" would clash with "A"+"B-C". Files may still use other ids. Renaming a router renames its links.
- **Positions:** examples 1–3 now carry `pos`, so the ring draws as a ring. Files without positions get a circle layout on load; dragging saves the position (one undo step per drag).
- **Asymmetric metrics:** one number in the middle when both directions match, else one number near each end = the cost of leaving that end.
- **Fail-link tool:** in this phase it only marks links as failed (red dotted, ✕). The repair animation and "Converge" view are Phase 7.
- **Testing:** jsdom has no `<canvas>`, so the smoke test stubs `GraphCanvas`; the drawing logic lives in `ui/canvas.ts` and is tested with headless Cytoscape. Where `Worker` doesn't exist, the engine client runs the same protocol on the main thread (`createInlineWorker`).
- **Bundle size:** 679 kB (218 kB gzipped), mostly Cytoscape. Vite warns above 500 kB; fine for now, revisit at launch (code-split the canvas).
- **Status:** Accepted.

### D22 – Failure simulation, coverage panel, share link, theme, keyboard and phone layout (2026-10-31)
- **One failed link at a time** (replaced by D23). Clicking a second link moves the failure; clicking the failed link again restores it. FRR protects against one failure (D4), and two at once would need rules the RFCs don't give.
- **Any link can fail, not only links at S.** Traffic follows normal tables up to the router before the failed link (the PLR), which uses its own backup. This shows that FRR is local: a far-away failure is repaired by whoever is next to it. Rules in `docs/02-algorithms.md` §8.
- **"Routers run" modes:** LFA only, LFA + Remote LFA, TI-LFA, like the settings on a real router. Default TI-LFA. An ECMP destination uses its other primary next hop first (RFC 5286 §3.4), so ECMP is shown as its own method.
- **Repair vs final path is compared at the PLR,** not end to end from S: that is the claim RFC 9855 §3 makes for TI-LFA. S's own final path is shown in the Converge view.
- **One flow per destination,** using the lowest-id ECMP tie-break of the drawings (D21). Real routers would hash flows over all ECMP paths.
- **Engine calls:** the simulation runs in the worker (new `simulate` message), like the other engine calls. `simulate.ts` imports `computeForSource` from `index.ts`, so it isn't re-exported from `index.ts` (that would be an import cycle).
- **Drawing:** the repair path is the orange dashed backup line with moving dashes (off when the OS asks for reduced motion). The final path is green with a halo and chevron arrows. Cytoscape can't draw double lines on edges, so the halo and arrow shape carry the meaning as well as the colour.
- **Coverage panel:** runs in the worker only while open, again on every edit, with a progress bar. Lists the first 100 unprotected pairs; the CSV has them all. 200 routers / 600 links, all sources: 0.77 s in Chrome.
- **Share link:** `#t=<lz-string of the YAML text>&s=<source>`. Using the YAML text means a shared link is checked by exactly the same rules as an imported file. The data stays in the fragment, which browsers never send to a server. Opening a link starts with an empty undo history.
- **Dark mode:** the ☾/☀ button sets the `.dark` class (D13). A choice made with the button is saved in `localStorage`; with no saved choice the OS setting is used. Storage errors are ignored.
- **Keyboard:** every canvas tool has a form in the sidebar (pick an item to edit, add a router, add a link from/to, pick the failed link). Shortcuts: V/R/L/F pick a tool, C toggles Converge, arrow keys move through table rows.
- **Phone layout:** canvas first, then tools, then results; results become cards below 640 px.
- **Tooling added:** `lz-string` (runtime, planned in `docs/03-architecture.md` §2). Ships its own types.
- **Bundle:** 710 kB (226 kB gzipped). Code-splitting the canvas is still a launch task (D21).
- **Other options considered:** several failed links at once (no RFC rules for it); comparing repair and final paths end to end from S (would flag TI-LFA as "different" when the PLR isn't S); JSON instead of YAML in the share link (needs its own validation); the Clipboard API alone for sharing (fails without permission, so the link is also put in the address bar).
- **Status:** Accepted.

### D23 – Several failed links: which repairs survive and which break (2026-10-31)
- **Note:** the "Broken" rule below is replaced by D24 (every router repairs its own failed link).
- **Why:** user feedback (Phase 9.2). FRR plans for one failure, so the tool should *show* what goes wrong with a second one instead of forbidding it. This replaces D22's "one failed link at a time".
- **Model:** each router still forwards on its pre-failure table. A flow is repaired by the router before the *first* failed link on its normal path, using the backup it computed for that one link on the full topology (RFC 5286 §1, RFC 9855 §3: alternates are pre-computed per protected link). "Converge" runs SPF with every failed link removed.
- **Broken:** if the backup's path from the PLR crosses another failed link, the repair is broken at the first one, shown in the direction traffic goes (e.g. "at C it runs into C–E"). We don't model a second repair at that router: whether it would re-repair, drop or loop depends on the method and the vendor, and the RFCs don't define it. Treating it as lost traffic is the safe, honest answer.
- **Status per affected flow, first match wins:** `unreachable` (the failed links split S from D, so nothing could help), `dropped` (no backup), `broken`, `repaired`. A broken repair to an unreachable destination still shows where it broke.
- **"Repair = final?"** is only shown for repairs that work. A surviving TI-LFA repair always equals the PLR's final path (property test).
- **UI:** the fail-link tool and the sidebar list toggle each link; the panel has a restore button per link and "Restore all". A broken repair is drawn without moving dashes.
- **Share link and stored state:** failed links were never in the share link or `localStorage`, so there is no old format to read. They stay out of the link: a shared link is a topology, not a scenario.
- **Engine API:** `simulateFailure(topology, source, linkIds[], mode)`; repeats are ignored and an empty list is an error. The result lists `links` instead of one `link`.
- **Other options considered:** chaining repairs at each failed link (no RFC rules, and it would hide the point that FRR covers one failure); choosing the PLR by the order the links were failed (the result would depend on click order).
- **No new dependencies.**
- **Status:** Accepted.

### D24 – Several failed links: every router repairs its own failed link (2026-10-31)
- **Why:** user feedback on 9.2. With D23, when the PLR's backup ran into a second failed link we stopped and said "broken", even when another router could still get the traffic through on a third path. That isn't how routers behave: FRR is local, so the router that finds its own link down uses its own backup, whatever the packet is carrying (RFC 5286 §1, RFC 9855 §3: alternates are pre-computed per protected link and installed in each router's forwarding table). This replaces D23's "Broken" rule.
- **Model:** forward the packet hop by hop. It carries what the backups put on it: plain IP to D, a tunnel to a PQ node (RFC 7490), or a TI-LFA segment list (prefix-SIDs and Adj-SIDs). Each router forwards on its normal table towards the current target; if that link is down it applies its backup for (current target, that link). A failed Adj-SID hop is repaired towards its far end (protected Adj-SID, B-flag, RFC 8667 §2.2.1): with its backup for that neighbor, or, when its normal path to the neighbor doesn't use that link (the Adj-SID forced a costlier link), with that normal path.
- **One repair per router visit:** a forwarding entry has one primary and one backup. If the backup's own first link is down too, the packet is dropped there.
- **Loops:** forwarding depends only on the router and what the packet carries, so meeting the same pair twice means the packet would go round forever; the path is shown up to that point. Passing a router twice with other labels is not a loop (traffic can still get through). We also stop after 255 hops (the IP TTL limit), which catches backups that keep pushing labels; that path is cut where traffic first comes back to a router.
- **ECMP first in every mode,** as D22 says: when one equal-cost member fails, the router keeps using the other. The code used to skip this in TI-LFA mode. (D25: with several members down, it uses one that is still up.)
- **Status per affected flow, first match wins:** `unreachable`, `repaired` (reaches D, by one or several routers), `dropped`, `looped`. `broken` is gone; the repairs list says which routers repaired.
- **Single failure unchanged:** property test: one repair at most, never a loop, and the same backup path as the drawings.
- **Not modelled:** some vendors don't repair traffic that is already on a backup, or limit the label stack depth. The RFCs don't say; we show plain forwarding-table behaviour.
- **Other options considered:** keep D23 (hides working third paths, which confused users); find any surviving path (that is convergence, not FRR, and is already the Converge view).
- **No new dependencies.**
- **Status:** Accepted.

### D25 – Failure simulation review: ECMP with several members down; panel wording (2026-10-31)
- **Why:** a review of `simulate.ts` and the failure panel against RFC 5286, 7490, 9855, 8402 and 8667 (`docs/02-algorithms.md` §8).
- **Changed – ECMP:** when a router's next hop is down and it has other equal-cost next hops, it now uses the lowest-id one *whose link is up*. Before, it took the lowest-id other member even when that link was down too, and dropped the traffic. Example 5, source SP1, fail L1–SP1 and L2–SP1: SP2 was dropped although L3 and L4 still work. A real router removes every failed member from its ECMP set and keeps using the rest (D22: "stops using the failed member"; RFC 5286 §3.4 treats the other primary next hops as the protection). If every member is down, traffic is dropped there (`backup-down`): the members are each other's backups (another primary next hop is always a downstream LFA, D16), so the entry has nothing left.
- **Changed – panel text:**
  - "Repair = final?" is judged at the PLR (D22). When the PLR isn't S, `same` used to say "nothing moves again", which is false whenever S's own final path differs (Example 2, fail E–C: repair S→E→S→A→B→C, S's final path S→A→B→C). The cell now says "same path from E", and the converged text says that S still moves. The `same-cost` and `longer` sentences name the router whose costs they compare.
  - A router that meets a failed link it has already met says "down again", not "down too" (Example 1, fail E–D and S–N, Remote LFA: E repairs E–D twice).
  - A loop closed after one router's repair says "the backup sends it back", not "the backups".
- **Docs fixed:** §8 step 6 said a TI-LFA repair is always `same`. That only holds when one router repairs; when several repair in turn it can be `longer` (Example 4, fail PE1–P1 and P2–P4, PE1→P3: 100 against 50). The panel footer already said this.
- **Checked and unchanged:** only routers whose own next hop is down repair; the backup order per mode (ECMP, then LFA / Remote LFA / TI-LFA) and what each puts on the packet; repairs go towards the packet's current target (D, PQ node, prefix segment, far end of an Adj-SID); one backup per router visit; exact loops (same router, same labels) and the 255-hop cut; the status order; the converged path.
- **Not modelled (unchanged):** the first hop of a plain-P-space Remote LFA tunnel is the router's lowest-id path to the PQ node; if that link is down too, the packet is dropped even when an equal-cost path to the PQ node is up. With one failure this can't happen (P-space means every shortest path avoids the link).
- **No new dependencies.**
- **Status:** Accepted.

### D26 – Failure simulation review 2: panel wording; RFC 9855 §6 citations (2026-10-31)
- **Why:** a second review of `simulate.ts` and the failure panel against RFC 5286, 7490, 9855, 8402 and 8667 (`docs/02-algorithms.md` §8). Every source, every set of one, two and (on the small examples) three failed links, and every mode was run on the five example networks, plus random networks with asymmetric metrics.
- **Engine: no change.** Checked: only a router whose own next hop is down repairs; ECMP first, then LFA / Remote LFA / TI-LFA, and what each puts on the packet; repairs go towards the active target (D, PQ node, prefix segment, far end of a failed Adj-SID); one backup per router visit; exact loops and the 255-hop cut (Example 1, fail E–D and S–N, TI-LFA: S and E push labels at each other forever, shown as S→E→S…); status order; "Repair = final?" at the PLR; the converged path.
- **RFC check:** RFC 9855 §6.1 (keep the active node segment, put the repair list in front), §6.2 (repair a failed Adj-SID towards its far end) and §9 (a protected Adj-SID in a repair list can trigger a second repair) back D24's model directly. §8 and the code comment now cite them; before, only RFC 8667 §2.2.1 was cited. RFC 9855 §6.2.2 also allows repairing an [Adj-SID, node] pair straight towards the next node segment; we keep the far-end rule (§6.2, simplest).
- **Changed – panel text:**
  - The "Repair = final?" cell named the PLR only for `same`. `same-cost` and `longer` now say "from P3" too: their costs are measured from the PLR, while the row's other columns are from S. Example 4, source PE1, fail PE1–P2, P1–P2 and P3–PE2, LFA only: the row showed repair 60 and final 40 next to "≈ same cost" (it is 40 vs 40 from P3). Fail PE1–P1 and P2–P4, TI-LFA, P4: "costlier (70 vs 50)" next to 80 and 60.
  - A backup whose first link is down said "which is down too" even when the traffic had already met that link at another router. Example 4, source P4, fail P1–P3, P2–P4 and P3–PE2, TI-LFA, P2: PE2 finds PE2–P3 down, later P3's backup leaves on P3–PE2. It now says "a failed link the traffic already met".
  - When S itself is the PLR the story said "Traffic to C reaches S". It now says "starts at S".
  - The footer said "Repair = final?" compares "the repairing router's backup"; with several repairs it is the whole path from the first router that repairs. §8 step 6 says the same now.
- **No new dependencies.**
- **Status:** Accepted.

### D27 – Router failure: what "broken" means for each backup type (2026-10-31)
- **Why:** Phase 9.3. When router E goes down, its neighbors only see "my link to E failed" and use their link-protecting backups; some of those still go through E. Showing that is the reason node protection exists (RFC 8102 §2.1, RFC 9855 §1).
- **Model:** a failed router = all its links down (its Prefix-SID can't be reached either). The hop-by-hop walk of D24 is reused unchanged: every router uses its normal table and its link backups. Nobody has a node-protecting backup yet (Later #1).
- **"Broken":** the PLR's backup, followed leg by leg on normal tables as if only the link PLR–E had failed (the plan the PLR made), passes a failed router. We name the router just before it and the reason:
  - LFA / ECMP: the neighbor's path to D goes through E; when E is the PLR's own next hop we show RFC 5286 §3.2 Inequality 3 with its numbers.
  - Remote LFA: the tunnel to the PQ node or the PQ node's path to D goes through E (RFC 8102 §2.1).
  - TI-LFA: the first segment whose path reaches E: `PrefixSID(E)`, an Adj-SID on a link of E, or a Prefix-SID whose normal path crosses E. RFC 9855 §6.1 keeps an active node segment unchanged, and nothing special is done for the failed neighbor's own segment in link protection, so a packet aimed at `PrefixSID(E)` keeps being repaired towards E until it is dropped or loops.
  "Broken" says the plan fails; what happens to the traffic (another router repairs it, a drop, a loop) is the walk's status. Keeping both apart matches D24: FRR is local, so a broken backup can still be rescued by the next router.
- **"Survives":** the plan never passes a failed router. "No backup" is neither.
- **D = E:** status `unreachable` with `destDown`, kept out of the table and said plainly ("expected, not a protection failure"). No walk.
- **Ties:** the check uses the path drawn and walked (lowest-id tie-break, D21). Inequality 3 counts a tie as "may use E", so an LFA can fail it and still survive on the drawn flow. One flow per destination (D22).
- **Source down:** the engine refuses it; the panel says S sends no traffic.
- **Restore:** the router's links come back; a notice says traffic goes back to the normal paths. The IS-IS overload bit on startup (ISO 10589, RFC 3787) is described there but not modelled: we show the state before and after, not the timing (non-goal, with reboot timers, BFD and graceful restart).
- **Engine API:** `simulateFailure(topology, source, failed, mode)` takes a list of link ids (as before) or `{ links, nodes }`. The result has `nodes`; flows get `destDown` and `through`. Links and routers can fail together.
- **UI:** "Fail router" tool (key D) and a right-click menu on routers; the failed router is grey with a dashed red border and ✕, and all its links are drawn as failed. The failure panel adds a "Backup vs down router" column, a router summary line and the reason with real numbers. "Restore all" brings links and routers back.
- **New example:** `06-link-protecting.yaml`. None of Examples 1–5 has a backup that breaks when a router fails (checked for every source, router and mode): their chosen backups are all node-protecting. The new example's only alternate is link-protecting. 9.4's planned example becomes `07-parallel.yaml`.
- **Not in the share link:** failed routers, like failed links (D23), are a scenario, not part of the topology.
- **Other options considered:** classify by Inequality 3 alone (only covers LFA, and disagrees with the drawn path on ties); stop the walk at E and call it "dropped" (hides that FRR at the next router often still gets through, contradicting D24).
- **No new dependencies.**
- **Status:** Accepted.

### D28 – Failure simulation review 3: router-failure check and text (2026-10-31)
- **Why:** a third review of `simulate.ts` and the failure panel against RFC 5286, 7490, 9855, 8402 and 8667 (`docs/02-algorithms.md` §8). Every source, mode and every set of one router + one link, or two routers, was run on Examples 1–6.
- **Changed – ECMP check for a down router:** the "Backup vs down router" check (D27) followed the lowest-id *other* ECMP member, even when its link was down, while the walk uses the lowest-id member that is up (D25). Example 5, source SP1, fail routers L1 and L2, LFA only: traffic to SP2 is repaired on SP1→L3→SP2, but the row said "✗ breaks: via L2 at SP1" and the summary counted it as broken. The check now uses the PLR's real link state, so it checks the member the traffic really takes (property test: a flow one router delivers alone never "breaks").
- **Changed – panel text when the failed router is not the protected neighbor:** the Remote LFA and TI-LFA reasons always ended "only protects / avoids the link PLR–X; node protection would plan around the router", with X the failed router met. When X isn't the PLR's next hop E, there may be no link PLR–X, and node protection of E would not help: X is a second failure. Example 5, source SP1, TI-LFA, fail L2–SP1 and router L1: it said "only avoids the link SP1–L1". It now says "L1 is a second failure: SP1's backup was planned for the link SP1–L2 alone, and FRR plans for one failure at a time." The node-protection notes (RFC 5286 §3.2, RFC 8102 §2.1, RFC 9855 §1) stay for X = E.
- **Changed – backup neighbor itself down:** "LFA P2 reaches P4 through P2 (P1→P2)" (Example 4, source P1, fail P1–P4 and router P2) now says "LFA P2 is itself down"; the same for an ECMP member and a PQ node.
- **Checked and unchanged:** only a router whose own next hop is down repairs; ECMP first, then LFA / Remote LFA / TI-LFA and what each puts on the packet; repairs towards the active target (D, PQ node, prefix segment, far end of a failed Adj-SID; RFC 9855 §6.1, §6.2, §9); one backup per router visit; exact loops and the 255-hop cut; status order; "Repair = final?" at the PLR; the converged path; the link-failure panel sentences.
- **No new dependencies.**
- **Status:** Accepted.

### D29 – Parallel links between two routers (2026-10-31)
- **Why:** Phase 9.4. Real networks often join two routers with a bundle of links. This replaces D4's "no parallel links" rule.
- **RFC check (RFC 5286 §3.4–3.6, read 2026-10-31):** an alternate next hop is an **(outgoing link, neighbor)** pair: "A candidate next-hop is indicated by (outgoing link, neighbor)" (§3.6). Alternates are found per primary next hop (§3.4, §3.8), so each link of a bundle is protected on its own. For another link L2 to the same neighbor E:
  - Inequality 1 always holds (`dist(E,D) < dist(E,S) + dist(S,D)`, E is on the primary path), and it is downstream.
  - §3.6 step 7: "If H_h.link is not P_i.link, set cand_link-protect": it protects the **link**.
  - §3.6 step 8 (Inequality 3) is `dist(E,D) < dist(E,E) + dist(E,D)`, never true: it never protects the **node**.
  - §3.4's figure 4 (L2 to E1 and E2) shows the same idea: a next hop over the same link can't give link protection, one over another link can.
  - §3.5: the reverse cost is the same link's reverse metric when the link is known (it always is here).
- **Model:**
  - A link keeps its own id. The YAML loader and the editor number a second link between the same ends: `S-E`, `S-E#2`, `S-E#3` (`#` is never in ids typed in the UI, D21). Links stay in file order, so saving and loading keeps the ids.
  - SPF distances don't change (the cheapest link counts). A link X→N is a **primary next-hop link** for D when N is a first hop and the link costs `dist(X,N)`; the costlier link of a bundle isn't one. `Protection` is one per primary next-hop link, with `protectedLink.id`.
  - Every check that says "avoids link S–E" uses the metric of that one link (`02-algorithms.md` §1.5). A tie still means "may use it" (D6): with two equal links, the other link's paths tie, so they count as "may use it", the safe answer.
  - **LFA:** a candidate per link out of S except the protected one, with its `link`. Best-LFA order (D7) adds "then lowest link id". `lfa.bestLink` names the link.
  - **ECMP:** members are links. Another equal link to E is an ECMP member, so an equal bundle is ECMP-protected.
  - **Remote LFA:** spaces use the protected link's metric. Extended P-space uses each neighbor's cheapest usable link; another link to E is never an exit (E would be an LFA, D17).
  - **TI-LFA:** the post-convergence SPF removes only that link, so the other link of a bundle stays. Each Adj-SID segment carries `link`, and every link direction has its own Adj-SID (RFC 8402 §3.4, RFC 8667 §2.2.1): auto-numbering goes in neighbor-id, then link-id order (D18). `adjLabel()` needs the link id when there is a bundle. `tilfa.outLink` is the outgoing interface (RFC 9855 §5): with a bundle it matters which link.
  - **Which link carries traffic:** normal forwarding, Remote LFA exits and TI-LFA hops use the cheapest link, then the lowest link id (the same idea as the lowest-id tie-break, D21). LFA uses `bestLink`, ECMP the member link, an Adj-SID its own link. So there is still one flow per destination (D22): failing the link a flow doesn't use leaves it unaffected.
  - **Simulation:** the walk follows links (`Flow.repairLinks`), and a failed link is a link id, not a router pair. A router finding its link down uses the backup for that link. Costs after convergence come from the reduced SPF. "Repair = final?" is `same` only when the routers *and* the cost match.
- **Not modelled:** an Adj-SID for a whole bundle (the "parallel adjacency" / adjacency-set SID of RFC 8402 §3.4.1, RFC 8667 §2.2.2), LAG member links (one IS-IS adjacency over many members), and hashing flows over equal links.
- **UI:** Cytoscape already draws parallel edges as curves (`curve-style: bezier`), each with its own metric label. The add-link tool adds a second link. Text names a link by id only when its routers have several (`S–E (S-E#2)`, `E (S-E#2)`, `Adj B→C (B-C#2)`), so the old examples read as before. The canvas draws the exact link of each hop (`hopLinks()` in `engine/paths.ts`, `Flow.repairLinks`). Results rows are keyed by link id.
- **Speed:** TI-LFA's post-convergence graph is now filtered from the full graph instead of rebuilt and sorted, and primary links are cached per table. 200 routers / 600 links, all sources: about 0.9 s in Node (was 1.0 s).
- **New example:** `07-parallel.yaml`: an unequal bundle S–E (10, 20), where the other link is a link-protecting LFA, and an equal bundle E–D (10, 10), which is ECMP.
- **Other options considered:** one link per neighbor with the cheapest metric (hides the bundle, the point of the feature); identifying a next hop by neighbor and adding the link only to the Adj-SID (the simulation and drawings would pick the wrong link); explicit link ids in YAML (not needed: numbering from the ends is stable).
- **No new dependencies.**
- **Status:** Accepted.

### D30 – Canvas usability: drag with any tool, tooltips, menus, in-place metric, auto layout (2026-10-31)
- **Why:** Phase 9.5. Users didn't find out that routers can be dragged, and common actions needed a tool change first.
- **Dragging:** routers can be dragged with every tool. Cytoscape only fires a tap when the pointer doesn't move, so a drag never fails a link or adds a router. The old "drag only with Select" rule is gone; the sidebar says "Drag a router to move it, with any tool".
- **Click a router (Select tool):** it is selected for editing *and* its results row opens as the destination (the first next-hop link when there are several). With a failure shown, its simulated traffic is drawn too. The source itself has no row. The page does not scroll to the row: scrolling away from the diagram right after a click on it was confusing (checked in Chrome).
- **Tooltips:** hovering over a router shows its id, name, Prefix-SID index and label; over a link, its metric each way, both Adj-SIDs (set in the file, or "auto", D18) and whether it is down. The link is named by id when it is in a bundle (D29).
- **Right-click menu** (long press on touch): router: set as source (DUT), fail / restore, delete; link: fail / restore, edit metric, delete. A link of a failed router can't be failed on its own (it is down already). ↑ / ↓ move through the items; Escape closes.
- **Double-click a link:** edit its metric where it is: one box when both directions are equal (sets both), one per direction otherwise. Enter saves as one undo step; a bad value shows the reason and keeps the old one. Not with the fail-link tool, where the two clicks already failed and restored the link.
- **Auto layout:** our own deterministic Fruchterman–Reingold layout (`src/state/layout.ts`), not a Cytoscape layout, so it is pure, testable without a browser and gives the same picture every time (no `Math.random`; shuffles use a fixed seed). Up to 60 routers it tries several starting orders and keeps the one with the fewest crossing links, then turns the picture so its longest side is horizontal. Examples 1, 2, 4, 6 and 7 come out with no crossing links; Example 5 (two spines, four leaves) keeps two. One undo step.
- **Zoom +/−, Fit:** buttons on the canvas for touch and trackpad users.
- **Other options considered:** Cytoscape's `cose` layout (random start, so a different picture every time, and hard to test); a "switch to Select to move routers" hint (still needs a tool change).
- **No new dependencies.**
- **Status:** Accepted.

### D31 – Results for every router as the DUT (2026-10-31)
- **Why:** Phase 9.6. Users want each router's results when *it* is the device under test (DUT), without picking routers one by one.
- **Engine:** `computeAllSources()` reuses `computeForSource()` for each router (no explain steps) and returns compact rows (`ResultRow`, `src/engine/rows.ts`): only what the table shows. A 200-router network has about 40,000 rows; keeping LFA candidates and P/Q spaces for all of them would use far more memory. `protectedBy` moved from the UI into the engine so the table, CSV and coverage order agree (§5). `simulateAllSources()` runs `simulateFailure()` for each router and keeps only the counts (`FailureSummary`, `docs/02-algorithms.md` §8.2). Both run in the worker with progress.
- **Speed (Node, 200 routers / 600 links):** rows for every router about 0.9 s; failure summary for every router about 1.4 s with TI-LFA (both tested under 2 s).
- **UI:** the source picker has "All routers (n), each as the DUT". The view has one section per DUT that can be opened or closed (all open up to 8 routers; above that only the drawn DUT), the same columns as the single table, a DUT filter, a "Show" filter (all rows / not protected by ECMP or LFA / unprotected), 20 sections per page and 100 rows per section until "Show all" (the "large tables are paged" rule), and a CSV of every row (`resultsCsv`, same CSV helpers as the Phase 5 report).
- **The drawn DUT:** `source` is still one router: the one drawn, detailed and simulated in the failure panel. A row click sets the DUT and the row in one step; clicking a router on the diagram (or right-click "Set as source (DUT)") switches the DUT. With one source, a click on a router opens its row instead (D30).
- **Failure view:** with links or routers down, "Effect on every router as the DUT" lists one line per router, e.g. "S: 1 affected, 1 repaired (1 by more than one router); 0 survive, 1 breaks". Clicking a line makes it the DUT; the single-source failure panel below follows it. The single panel's own summary lines now use the same counts (`summarizeFlows`).
- **Not in the share link:** the view choice, like the failed links (D23).
- **No new dependencies.**
- **Status:** Accepted.

### D32 – Failure simulation review 4: a backup through a down router, off the normal path (2026-10-31)
- **Why:** a fourth review of the failure simulation (`simulate.ts`, the failure panel, the per-DUT view, the canvas) against RFC 5286, 7490, 8102, 9855, 8402 and 8667 (`docs/02-algorithms.md` §8–§9).
- **What was run:** a scratch script called `simulateFailure` and `simulateAllSources` for every source and mode on Examples 1–7, with every set of one and two failed links (three on examples with up to 8 links), every single router, router + link, and two routers (1,836 runs). It also ran 6,900 random networks (up to 12 routers, asymmetric metrics, and bundles with equal and unequal links, including both links of a bundle down). For every flow it checked: traffic only crosses links that are up; each hop's link joins its two routers; the repair cost equals the metrics of the links walked; only a router whose own link is down repairs, and with a method its mode allows; a loop ends at a router already on the path; the walk follows S's normal path up to the PLR; `same` means equal cost; the converged path uses only links that are up; a TI-LFA "no backup" drop only happens when D is cut off; a router that delivers alone never "breaks"; the outcomes add up to `affected` and survive + breaks + no backup to `viaRouter`; and each per-DUT summary equals that router's own simulation.
- **Changed – the router check counts a backup that breaks off the normal path:** a flow can cross only a failed *link* while the PLR's backup goes through a failed *router*. The table marked it "✗ breaks", but `summarizeFlows` counted the router check only over flows whose normal path passes a failed router, so the summary disagreed with the table. Example 1, source E, router S and link E–D down, LFA only: E's LFA for N is S (`15 < 10+20`), which is down. The row said "✗ breaks: via S at E" under "S down: 0 destinations affected, 0 repairs survive, 0 break". Now `viaRouter` counts flows whose normal path *or* planned backup meets a failed router (`meetsDownRouter`), so it says "S down: 1 destination affected, 0 repairs survive, 1 breaks". The backup *is* broken by the router failure (the text calls S "a second failure", D28), so it belongs in that count.
- **Changed – panel and per-DUT text:** the "Backup vs down router" cell now shows "–" for a flow that never meets a failed router. It used to say "✓ survives" without counting it: Example 6, source S, router D and link S–N down, N's backup S→E→N. When not every affected flow meets a down router, the per-DUT line says how many do: "S: 2 affected, 2 repaired (1 by more than one router); 1 meets a down router: 0 survive, 1 breaks". With a single router down every affected flow passes it, so those lines are unchanged.
- **Checked and unchanged:** only a router whose own outgoing link is down repairs, also for traffic already on a backup; ECMP first in every mode (the lowest-id member that is up, dropped if none is), then LFA / Remote LFA / TI-LFA, and what each puts on the packet; repairs go towards the active target (D, PQ node, prefix segment, far end of a failed Adj-SID; RFC 9855 §6.1, §6.2, §9), including a costlier Adj-SID link and another link of a bundle; one backup per router visit; exact loops (same router, same labels) and the 255-hop cut; status order; "Repair = final?" at the PLR, with `same` needing the same cost; the converged path and its links; the router model (all links down, neighbors use link-protecting backups) and the survive / breaks reasons per backup type; the per-link protections and links for bundles (`firstLinks`, `cheapestEdge`, `bestLink`, `outLink`, Adj-SID `link`); the links drawn for the normal, repair and converged paths; the menu and tooltip text. No router repaired twice on its own in a delivered flow, so "repaired by more than one router" (`relayed`, which counts repair steps) is true wherever it appears.
- **Still not modelled (unchanged):** the first hop of a plain-P-space Remote LFA tunnel is the lowest-id path to the PQ node, so it is dropped if that link is down even when an equal-cost path is up (D25: a repair holds one outgoing interface, and with one failure it can't happen); node-protecting backups (Later #1); adjacency-set SIDs, LAG members and hashing over equal links (D29). Clicking a router whose traffic isn't affected draws the first affected flow, named by its own destination (D30).
- **No new dependencies.**
- **Status:** Accepted.

### D33 – Failure simulation review 5: name the link of a bundle in the router-failure reason (2026-10-31)
- **Why:** a fifth review of the failure simulation (`simulate.ts`, the failure panel, the per-DUT view, the canvas) against RFC 5286, 7490, 8102, 9855, 8402 and 8667 (`docs/02-algorithms.md` §8–§9).
- **What was run:** a scratch script called `simulateFailure` and `simulateAllSources` for every source and mode on Examples 1–7, with every set of one and two failed links (three on examples with up to 8 links), every single router, router + link, and two routers (8,475 runs), and again with plain P-space for Remote LFA (2,825 runs). It also ran 300 random networks of up to 9 routers (asymmetric metrics; bundles with equal and unequal links; both links of a bundle down), 376,000 runs in all. For every flow it checked: traffic only crosses links that are up; each hop's link joins its two routers; the repair cost equals the metrics of the links walked; only a router whose own link is down repairs, with a method its mode allows; "repaired by more than one router" never counts one router twice; drops are on links that are down; a loop ends at a router already on the path; `same` / `same-cost` / `longer` match the costs; a repaired flow always has a "Repair = final?" answer; the converged path uses only links that are up; with one failed link at most one router repairs, nothing loops and a TI-LFA repair is `same`; with one failed router a backup that "survives" is delivered by that one backup, and one that a single backup delivers never "breaks"; another link to the same neighbor is never a node-protecting LFA; the outcomes add up to `affected` and survive + breaks + no backup to `viaRouter`; each per-DUT summary equals that router's own simulation.
- **Changed – panel text:** the "Backup vs down router" reason (`throughText`) wrote the PLR's protected link as "S–E" even when S and E are joined by a bundle, against D29's rule that text names a link of a bundle by its id. Example 7, source S, fail link `S-E` and router A, any mode: "A is a second failure: S's backup was planned for the link S–E alone" (S and E have two links, `S-E` and `S-E#2`, and each has its own backup). It now says "the link S–E (S-E)". The same applies to "only protects / only avoids the link S–E" (RFC 5286 §3.2, RFC 8102 §2.1, RFC 9855 §1 notes) and to an Adj-SID in the segment list: "Adj-SID(B→C) of link B-C#2" (RFC 8402 §3.4: one Adj-SID per link). Without a bundle the text is unchanged. Unit, app and property tests (random bundled networks: every "the link PLR–E" carries the link id).
- **Checked and unchanged:** only a router whose own outgoing link is down repairs, also for traffic already on a backup; ECMP first in every mode (the lowest-id member that is up, dropped if none is), then LFA / Remote LFA / TI-LFA, and what each puts on the packet; repairs go towards the active target (D, PQ node, prefix segment, far end of a failed Adj-SID; RFC 9855 §6.1, §6.2, §9), including a costlier Adj-SID link (the normal path is the backup, which is the post-convergence path for that link alone) and another link of a bundle; one backup per router visit; exact loops (same router, same labels) and the 255-hop cut; status order; "Repair = final?" at the PLR, with `same` needing the same cost; the converged path and its links; the router model and the survive / breaks reasons per backup type; "broken" kept apart from the walk's status; per-link protections and links for bundles (`firstLinks`, `cheapestEdge`, `bestLink`, `outLink`, Adj-SID `link`); the links drawn for the normal, repair and converged paths; the per-DUT counts and wording (`viaRouter` includes a flow that only crosses a failed link when its planned backup meets a down router, D32); the menu and tooltip text.
- **Still not modelled (unchanged):** the first hop of a plain-P-space Remote LFA tunnel is the lowest-id path to the PQ node (D25); node-protecting backups (Later #1); adjacency-set SIDs, LAG members and hashing over equal links (D29).
- **No new dependencies.**
- **Status:** Accepted.

### D34 – Packet walk for a TI-LFA repair (2026-10-31)
- **Why:** TODO backlog "Packet walk". Students see the label stack as one list, but not what each router does with it. Stepping router by router shows push at S, forwarding on the top label, the Adj-SID pop, and PHP.
- **Engine:** `packetWalk()` in `src/engine/packet-walk.ts` (pure, `docs/02-algorithms.md` §4.5). It reuses `computeTilfa()`; nothing new is computed. Every router except S uses its normal table; the walk throws if a router can't do what its top label says, so the property test (random networks, asymmetric metrics and bundles, PHP on and off) also checks every segment list. It found one case worth a fixed test: when clean-up drops S's first segment, the top label S sends can be the first hop's Adj-SID, which S must not read.
- **Modelling choices:** the packet reaches S already carrying D's label (the RFC 9855 §7.1 "destination's own label"); PHP is on by default, as in SR-MPLS (the P-flag is off unless set, RFC 8667 §2.1), with a switch to turn it off; with ECMP the walk shows the next hop on the post-convergence path, one of the equal ones.
- **UI:** a "Packet walk (TI-LFA)" part in the detail panel: Start / Back / Next / Stop (← → keys too), a PHP checkbox, the current router's labels and actions in plain English with the numbers, and a table of every router. Starting the walk draws the TI-LFA path; the canvas marks the current router and the link it sends on in violet (also in the legend). The step resets when another row is picked. Not in the share link. With "Show labels on the diagram" (on by default, can be turned off at any time) every link of the repair shows, under its metric, the label stack it carries, top first; the current hop's box is bold with a violet border. Seeing the stack shrink from S to D is the lesson, so it belongs on the links themselves.
- **Other options considered:** keep the stack-before-PHP view only (§4.3) — it hides exactly the step students ask about; animate the packet on the canvas — more code for little gain over a highlighted step.
- **No new dependencies.**
- **Status:** Accepted.

### D35 – Packet walk of the primary path and of the simulated traffic (2026-10-31)
- **Why:** TODO backlog follow-ups to D34. Students asked to compare the repair with the normal path, and to see the labels of the real repair when several things are down, including a second router's repair, drops and loops.
- **Primary path:** `primaryWalk()` walks S→E, then E's shortest path to D (the blue path), forwarding on D's Prefix-SID with PHP before D (`docs/02-algorithms.md` §4.5). The detail panel has a "Primary path / TI-LFA backup" choice; switching while walking starts again at S. A row with no TI-LFA path walks only the primary.
- **Simulated traffic:** `simulateFailure()` now records the label stack on every hop (`Flow.repairLabels`) and where each repair happened (`RepairStep.atIndex`). Each step the packet carries has its label: Prefix-SID for every "forward to" step, Adj-SID for a TI-LFA Adj-SID; a backup's own out-interface has none. Remote LFA's tunnel label is the PQ node's Prefix-SID: LFA Lab is SR-MPLS, so no targeted LDP. `flowWalk()` turns a flow into the same hop view, adding PHP on the hop actually sent and the repair, drop and loop steps (§8.3). Nothing the simulation decides changed: only labels are recorded, and the walk throws if a router couldn't send them, so the property test checks them.
- **UI:** a collapsed "Packet walk to D" part in the failure panel, for the drawn flow. In the "Converge" step it walks S's final path instead (`convergedWalk()`): plain forwarding on D's label with every router's table rebuilt without what is down; the step starts again when switching between the two. It shares the PHP and "Show labels on the diagram" switches with the row walk. While anything is down, the detail panel points there instead of offering the row walk, since the diagram shows the simulated traffic. A link walked twice in a loop shows its latest stack up to the current step.
- **Other options considered:** derive labels in the UI from the flow's path — it can't tell a Remote LFA tunnel or a TI-LFA repair list from normal forwarding; a second label simulator — two models that could disagree.
- **No new dependencies.**
- **Status:** Accepted.

### D36 – Compare view: LFA, Remote LFA and TI-LFA side by side (2026-10-31)
- **Why:** TODO backlog "Compare view". The detail panel shows each method in its own block and draws one backup at a time, so students couldn't see at a glance how the three differ for the same failure: which works, how long each path is, how many labels it needs, and whether traffic moves again after reconvergence.
- **Engine:** `compareBackups()` in `src/engine/compare.ts` (pure, `docs/02-algorithms.md` §10). It reuses `computeLfa`, `computeRlfa` and `computeTilfa`; the LFA and Remote LFA path rules moved into `lfaPath()` / `rlfaPath()` in `paths.ts`, so the diagram and the compare view can't disagree. Fixed tests on Examples 1, 2, 3, 4 and 7 plus a hand-made "LFA is longer" case; a property test on random networks (with and without bundles) checks every path against the results.
- **Remote LFA is shown even when an LFA exists:** the router wouldn't run it (RFC 7490 §1), and `Protection.rlfa` has no chosen PQ node then (D17). The compare view works out the tunnel from the same spaces and labels it "not run here". The main diagram still only draws a Remote LFA that is used, so its "Draw" button is off in that case.
- **"vs final"** uses the same three words as the failure panel's "Repair = final?" (`same` / `same-cost` / `longer`, §8 step 6), judged at S against the post-convergence path.
- **Labels:** what S puts on the packet, before PHP (§4.3): LFA none extra; Remote LFA the PQ node's Prefix-SID (SR-MPLS, D35); TI-LFA its segment list.
- **UI:** a full-width "Compare backups" section under the results when a row is open (three cards need more room than the half-width detail panel), linked from the detail panel. Each card: status (used / also works / no backup), a small SVG copy of the diagram with only that path (failed link red ✕, S blue, D orange, LFA neighbor or PQ node ringed, ★ on the PQ node, bundle links spread apart), how, path, cost against the normal cost, labels, vs final, and "Draw on the diagram". On phones the cards stack. While something is down the main diagram shows the simulated traffic, so the Draw buttons are off and a note says so. Checked in Chrome: light, dark and phone width, no console errors.
- **Other options considered:** draw all three on the main canvas at once (paths overlap on small networks and the colours would need a new key); a three-column table without diagrams (loses the "see it" part, which is the point for students).
- **No new dependencies.**
- **Status:** Accepted.

### D37 – Compare view while links or routers are down (2026-10-31)
- **Why:** user feedback on D36: the compare view showed only the planned backups. Comparing the three methods under a real failure (which one delivers, drops or loops, and why) is the more useful lesson.
- **What:** while anything is down, the "Compare repairs" section replaces "Compare backups". It runs `simulateFailure()` in all three repair modes (in the engine worker, `useAllModes`) and shows the flow to the destination drawn on the diagram, side by side (`docs/02-algorithms.md` §10.1). Each card has a small diagram with everything that is down (links red ✕, routers dashed and greyed) and the path the traffic really takes, the repairing routers, cost, labels, the down-router reason (the failure panel's `throughText`) and the repair against the final path. "Show on the diagram" switches the failure panel's mode; the card of the current mode is outlined.
- **No new engine code:** the cards read the simulator's `Flow`. Fixed engine tests pin the worked cases (Examples 3, 4 and 6); UI tests check the cards and the mode switch. Checked in Chrome (Example 6, router E down), no console errors.
- **The small diagram** moved to `src/ui/MiniMap.tsx` so both views share it.
- **Other options considered:** keep the planned backups under a failure with a note (D36) — it answers "what was planned", not "what happens"; compute only the current mode — then there is nothing to compare.
- **Cost:** three simulations instead of one while something is down; each is a few ms on the examples, and they run in the worker.
- **No new dependencies.**
- **Status:** Accepted.

### D38 – Guided tour on first visit (2026-10-31)
- **Why:** TODO backlog "Guided tour". New visitors land on a busy screen and don't know where to start; the shortest useful lesson is Example 2 with S–E failed and the TI-LFA stack read out.
- **What:** a small card in the bottom-right corner (full width on phones), not modal, so the app stays usable. Steps: welcome (Start tour / No thanks) → Example 2 with row S → E open and why A is not an LFA → S–E failed, traffic on the TI-LFA path → the label stack, each label explained (Prefix-SID = SRGB + index, and the part of the path it covers) → "Your turn" tips. A "? Tour" button in the toolbar opens it again.
- **Numbers come from the engine** (`tourFacts()` in `src/ui/tour-steps.ts` calls `computeForSource`), so the tour can't disagree with the results table. Each step sets the whole state it needs (loads Example 2 if the network differs, fails or restores S–E), so Back / Next work even after the user clicks around.
- **First visit:** offered once, remembered in `localStorage` (`lfa-lab-tour-seen`); not offered when the page opens from a share link. Blocked storage means it is not offered, rather than offered on every visit.
- **Other options considered:** a tour library (new dependency for five steps); spotlighting page elements (fragile across the phone and desktop layouts).
- **No new dependencies.**
- **Status:** Accepted.

### D39 – Clickable P / Q / PQ sets in the detail panel (2026-10-31)
- **Why:** TODO backlog. The diagram shades extended P and Q together, so on a busy network it is hard to tell which routers are in which set, or which are PQ nodes.
- **What:** each Remote LFA set in the detail panel (P-space, extended P, Q-space, PQ) is a toggle button. Pressing one draws only that set: P sets blue, Q-space green, PQ nodes both. Its routers get an indigo ring and every other router fades, except S and D, which give the context (RFC 7490 never lists them in a set). Paths and the ★ on the chosen PQ node stay. Pressing it again goes back to P and Q together.
- **Scope:** the pick belongs to one row (like the packet-walk step), so another row starts with nothing picked. Empty sets are not clickable. While anything is down the diagram shows the simulated traffic, so the buttons are off and a note says so. If an edit empties the picked set, the normal shading comes back.
- **Code:** `spaceMarks()` / `spaceSet()` in `src/ui/format.ts` (read the engine's `Protection.rlfa`, no new routing maths); `spot` on the canvas `Highlight` adds the `spot` / `faded` classes. Tests: format (Examples 1 to 3), headless canvas, and App (toggle, row change, empty set, failure). Checked in Chrome on Example 2, no console errors.
- **Other options considered:** hover to highlight (no touch or keyboard support); several sets at once (the shading already does that).
- **No new dependencies.**
- **Status:** Accepted.

### D40 – YAML format guide and clearer import errors (2026-10-31)
- **Why:** user request. People writing a topology file by hand had no reference in the app, and some mistakes were silent: an unknown key such as `metrc` or `adj_sid` was dropped without a word, so the network could differ from the file.
- **Validation (`src/io/yaml.ts`):** unknown keys at the top level, in a router or in a link are errors, with a "did you mean" hint from a short alias list (`from` → `a`, `routers` → `nodes`) or spelling distance; YAML syntax errors give the line and column, and a tab gets a "use spaces" hint; an empty file says so; router ids follow the editor's rule (letters, digits, `_`, `.`), which also keeps link ids like `S-E` unambiguous (D14, D21); a duplicate id names the router that has it first; a link to a router that exists but has another error no longer also says the router "does not exist". An empty `nodes: []` stays valid, since a network with every router deleted can be exported.
- **One source for the format:** `src/io/yaml-format.ts` holds the key lists, rules text and the starter file. The loader's known-key check and the guide's tables both read it.
- **UI:** a "YAML format" toolbar button opens a dialog: a starter file, block-style example, tables for top-level / router / link keys, rules, common mistakes, and a checker that runs `parseTopology` as you type, lists every problem, and loads the file when it is clean. A failed import says how many problems to fix and links to the guide. Escape or ✕ closes it.
- **Other options considered:** unknown keys as warnings (the file would load with the typo still ignored, which is the problem being fixed); a separate Markdown page (needs leaving the app and could drift from the loader).
- **No new dependencies.**
- **Status:** Accepted.

### D41 – Per-link view (2026-10-31)
- **Why:** TODO backlog "Design checks". Engineers asked "if this link fails, whose traffic is hit and is it covered?". The results table answers per router, so you had to open both ends of the link and work out the transit traffic yourself.
- **Engine:** `linkView()` in `src/engine/link-view.ts` (pure, `docs/02-algorithms.md` §11). For each direction X→Y it keeps X's own results rows whose protected link is this one (FRR is local repair: X repairs everyone's traffic with its own backup) and lists every router whose traffic to that destination crosses X→Y on some shortest path (§1.5, ties count, the safe choice of D6). Nothing is recomputed differently, so the rows equal X's table. Fixed tests on Examples 2, 3, 4, 7 and a two-router bridge; a property test on random networks (with bundles).
- **Traffic from = shortest paths, not one flow:** with ECMP upstream, a router may send only part of its traffic over the link; it is listed because some of it is hit. The simulation (§8) still follows one flow per destination.
- **UI:** a "Per-link view" section under the results (button next to the coverage report), also opened from the link's right-click menu and its properties ("What uses this link?"). A link picker; while it is open, clicking a link on the diagram switches to it, and deleting the link clears it. One table per direction: destination, cost, traffic from (first 8, then "+ n more", full list in the tooltip), protected by, and how (the LFA, PQ node or TI-LFA segments and labels, `howText()` in `src/ui/format.ts`). A row opens in the results with its router as the DUT. CSV export (`linkCsv()`, same row columns as the "All routers" CSV). While anything is down, a note says it shows the plan for this link failing alone. Runs in the engine worker. Checked in Chrome on Example 4, no console errors.
- **Other options considered:** draw the flows on the canvas (busy with 10+ flows, and the canvas already shows the open row); list only the two end routers' rows (misses the transit traffic the TODO asks for).
- **No new dependencies.**
- **Status:** Accepted.

### D42 – Coverage heat map on the canvas (2026-10-31)
- **Why:** TODO backlog "Design checks". The coverage report gives one number per router and a long unprotected list; on a big network you can't see *where* the weak spots are. Colouring the diagram shows it at a glance.
- **Engine:** `coverageMap()` in `src/engine/heat-map.ts` (pure, `docs/02-algorithms.md` §12): each router's results once, counted per router (its own coverage row, as the PLR) and per protected link (both directions). The §5 counts, nothing new. `countPair()` in `coverage.ts` is now shared by the report and the map. Runs in the worker with progress; 200 routers / 600 links under 2 s (speed test).
- **What a router's colour means:** link protection at that router (the repairs it makes), not "what if this router fails": node protection isn't computed yet (Later #1). The key and the tooltip say so.
- **UI:** "Coverage heat map" in the sidebar: Off (default) / LFA / LFA + Remote LFA / TI-LFA, the simulation's repair modes. Routers get a light tint (dark labels stay readable), links a coloured line; each shows its percentage ("✓ 100%", "50%", "–"), so colour is never the only signal. A link that carries nothing is thin and dashed. Hovering gives the counts in all three modes. The key above the legend shows progress while it computes. The picked row's paths, P/Q shading and failed links draw on top. While anything is down it still shows the plan, and says so.
- **Colours:** the fixed status scale from the dataviz guidance (good `#0ca30c`, warning `#fab219`, serious `#ec835a`, critical `#d03b3b`), buckets 100% / 75–99% / 50–74% / under 50%, on the exact fraction so 99.96% never shows as ✓.
- **Other options considered:** a continuous colour ramp (hard to read on small nodes, and a ramp can't say "fully protected" clearly); router colour = "what if it fails" (needs node protection); colouring only links (the TODO asks for routers too, and the coverage report is per router).
- **No new dependencies.**
- **Status:** Accepted.

### D43 – What-if diff: coverage before vs after a metric change (2026-10-31)
- **Why:** TODO backlog "Design checks". Tuning a metric to fix one repair can quietly break others. Before, you had to note the coverage report's numbers, edit, rerun and compare by hand.
- **Engine:** `whatIf()` in `src/engine/what-if.ts` (pure, `docs/02-algorithms.md` §13): §5 coverage of both versions, in total and per router, and every (source, destination) whose primary links or protection strength change, as `better`, `worse` or `rerouted`. ECMP ↔ LFA is not a change. Runs in the worker with progress; 200 routers / 600 links under 4 s (twice the coverage work, speed test).
- **Per destination, not per pair:** a new metric often moves a destination to another primary link, so the old and new pairs don't match one to one. Grouping by destination and comparing the weakest pair keeps the list readable ("via E: TI-LFA → via E: Remote LFA").
- **UI:** "What-if: change a metric" under the results, also from a link's properties and right-click menu ("What if the metric changes?"). Pick a link (or click one on the diagram), type the new metric, press Compare. Like the metric editor, one box sets both directions; "Each direction" gives one box per direction, and a link whose metrics already differ starts that way. (The first version always showed two boxes, so typing in the first one changed the link one way only, which nobody expects for a symmetric link.) It shows a before / after / change table per repair mode (▲ / ▼ and the numbers, not colour alone), the routers whose coverage changes, and the changed destinations, worse first (first 100). Nothing is edited until "Apply this metric", one undo step. The metric is checked like an edit, so Apply can't fail. The try is applied to the current topology, so edits elsewhere are counted. While anything is down, a note says it shows the plan on the full network.
- **Compare button, not live:** each try is two all-sources runs; recomputing on every keystroke would queue slow runs on a big network.
- **Other options considered:** diff against the last undo step (only after an edit, and an edit is what this avoids); any change, not just a metric (the engine takes two topologies, so it can grow later; the TODO asks for metrics).
- **No new dependencies.**
- **Status:** Accepted.

### D44 – Max SID depth (MSD): flag TI-LFA repairs that are too deep (2026-10-31)
- **Why:** TODO backlog "Design checks". Hardware can only push so many labels (RFC 9855 §3 names MSD as the limit for long repair lists). A design that relies on a 4-label TI-LFA repair on a router that can push 3 looks protected in LFA Lab but isn't on the real network.
- **Where the setting lives:** in the topology, not in the app settings. Top-level `msd` (every router) and an optional per-router `msd` that overrides it, as in RFC 8491 (Node MSD per router). It is part of the network like the SRGB, so it goes into the YAML file, the share link, undo and the what-if diff with no extra wiring. Edited in the properties panel (Topology: "Max SID depth (MSD)", empty = no limit; Router: empty = the network's value). Range 2 to 255: one octet (RFC 8491 §2), and below 2 not even a Remote LFA tunnel fits.
- **What counts:** the whole label stack S sends, D's label included. RFC 8491 §1.1: labels imposed = labels swapped + labels pushed; S swaps D's label and pushes the repair list. Only the PLR's MSD is checked: it is the router that imposes the stack. Per-link MSD and other MSD types (e.g. ERLD) are not modelled.
- **Engine:** `msdOf()` / `isTooDeep()` in `src/engine/msd.ts` (`docs/02-algorithms.md` §14). `computeForSource()` marks `tilfa.tooDeep` and keeps the repair, so the UI can show what didn't fit. `countPair()`, `protectedBy()` and the compare view treat it as no TI-LFA backup; coverage counts it in the new `tooDeep` count. The simulation's TI-LFA mode drops the traffic with reason `too-deep`. A new explain step gives the numbers. No limit changes nothing: every fixture and worked example is the same.
- **Not installed, not a fallback:** a too-deep repair doesn't make S use an LFA in TI-LFA mode (the mode means "every router runs TI-LFA"); the coverage report's LFA and Remote LFA columns still show what those methods would give. The walk doesn't search for a shorter list on another path: LFA Lab repairs along the post-convergence path (§4.1 of 02).
- **UI:** results table: "⚠ too deep: 3 labels > MSD 2 of S" under the labels and "✗ none". Detail panel: a "Max SID depth" line (✓ or ⚠ with the numbers). Compare view, per-link view, failure panel, compare-failure and packet walk drop text say why. Coverage report: a warning line with the count, a "Too deep" column per source and a `✗ TI-LFA too deep` reason in the unprotected list (only shown when something is too deep). CSV: a `tilfa_too_deep` column. The YAML guide lists the new keys (it reads `yaml-format.ts`).
- **Other options considered:** an app setting next to "extended P-space" (not saved with the network, so a shared link would show other results; every engine call would need a new option); drop the repair from the results (you couldn't see what was too deep); count only the pushed labels (RFC 8491 §1.1 counts the swap too, and for IP traffic all labels are pushed).
- **No new dependencies.**
- **Status:** Accepted.

### D45 – LFA policy knobs: node-protecting, downstream, exclude a neighbor (2026-11-01)
- **Why:** TODO backlog "Design checks". D7 fixed one best-LFA order; real routers let the operator tune it, and RFC 7916 §6.2 asks for exactly that: each criterion with "a level of preference" (node protection §6.2.2, downstream §6.2.3), and a way to "exclude a specific alternate" (§6.2.4.4). Checked against RFC 7916 on 2026-11-01.
- **Knobs:** `node_protecting` and `downstream`, each `prefer` (the D7 default), `require` (hard filter: fail it and the candidate is never used) or `ignore` (left out of the order). Plus a per-router `lfa_exclude` list of neighbors. The order of the two preferences stays node-protecting first; making it configurable was left out to keep it simple.
- **Where they live:** in the topology, like `msd` (D44): the preferences for the whole network under `lfa_policy`, the exclude list on each router. So they go into the YAML file, the share link, undo and the what-if diff with no extra wiring. Only values other than `prefer` are stored. Edited in the properties panel: two selects under "LFA policy (RFC 7916)" for the topology, a "Never use as LFA" field on a router.
- **Engine:** `lfaPolicyOf()` in `src/engine/lfa-policy.ts`; `computeLfa()` takes the resolved policy (default = D7, so older callers and every fixture are unchanged). Excluded neighbors are `skipped` with reason `excluded`; ruled-out candidates keep their numbers and get `policyRejected`. `Protection.lfa.excluded` lists the excluded neighbors for the UI. Explain steps cite RFC 7916.
- **Effect line:** a knob often changes nothing (on the ring example every LFA is node-protecting already), which looked broken. The properties panel now says what the policy changes for the router: "No effect for S…" or "Changes S's LFA for 2 destinations: D (N → none), M (E → none)" (`lfaPolicyEffect()`, results with and without the policy from the worker).
- **D = E:** `require` node protection doesn't apply when the destination is the next hop itself, where Inequality 3 can never hold (`02-algorithms.md` §4.4). Otherwise one knob would remove the LFA of every directly attached destination; RFC 7916 §6.2.2 says to fall back to link protection.
- **Scope:** LFA only. ECMP protection is normal forwarding, not an alternate, so an excluded neighbor still protects as an ECMP next hop. Remote LFA exits and TI-LFA paths ignore the policy; Remote LFA is simply used when the policy leaves no LFA. SRLG, colour and bandwidth criteria (RFC 7916 §6.2.4.1–3) and per-router preferences are not modelled.
- **Other options considered:** app settings next to "extended P-space" (not saved with the network, so a shared link would show other results); dropping ruled-out candidates from the list (you couldn't see why the LFA you expected wasn't chosen); an error for excluding a non-neighbor (a warning is enough; links come and go while editing).
- **No new dependencies.**
- **Status:** Accepted.

### D46 – Speed tests get 3× the time in CI (2026-11-01)
- **Why:** the first GitHub Actions run failed two speed tests: all-sources coverage took 2.35 s and the every-router failure summary 2.39 s, against a 2 s limit. The same tests take 0.87 s and 1.50 s on a laptop. Shared CI runners are about 2.7× slower, and all test files run there in parallel on a few CPUs.
- **Change:** `tests/engine/coverage.speed.test.ts` multiplies each limit by 3 when the `CI` environment variable is set (GitHub Actions sets it). Locally the limits are unchanged, so the requirement (< 2 s in a laptop browser, `docs/01-requirements.md`) is still measured on a laptop.
- **Follow-up (2026-11-01):** the what-if test (12 s CI budget) then failed on vitest's default 5 s test timeout at 5.35 s. Every speed test now gets a `budget(10 s)` timeout, so the time check runs and reports the real number.
- **Other options considered:** skip the speed tests in CI (loses the guard against a big slowdown); run them in a separate CI step on their own (CI timings would still vary from run to run).
- **No new dependencies.**
- **Status:** Accepted.

### D47 – Overload bit on a router (2026-11-01)
- **Why:** TODO backlog "Design checks": a router with the IS-IS overload bit (or costed out for maintenance) is excluded from transit; engineers want to see how coverage changes. Checked against RFC 5286 §3.5 and RFC 7490 §5.4 on 2026-11-01.
- **Model:** `overload: true` on a router (YAML, properties panel, right-click menu). SPF never passes through it, but it stays a destination and the root of its own SPF. It is never an LFA (RFC 5286 §3.5, no exception for its own address), a Remote LFA tunnel exit or PQ node (RFC 7490 §5.4). TI-LFA follows from the SPF. Only `true` is stored.
- **Inequalities:** a "path through M" with M overloaded in the middle costs ∞ (`viaCost`, `linkPathCost`), so Inequalities 1 and 3, P-, extended P- and Q-space and the §1.5 "avoids link" test stay correct (`docs/02-algorithms.md` §16). Without overloaded routers every number is the same as before; the check objects gained the right-hand-side totals (`viaS`, `viaLink`, …) for the explain steps.
- **Coverage change:** the what-if diff (D43) can try flipping one router's overload bit ("What-if: overload a router"); nothing changes until Apply, one undo step.
- **Max-metric router:** RFC 6987-style "max metric on every link" is not a separate setting: the overload bit is the IS-IS way to stop transit, and a metric of 16,777,215 on a link is already handled (RFC 5286 §3.5). A router with a high metric on all links can be drawn with the metric editor.
- **Other options considered:** an app setting (not saved with the network); removing the router's links (it would stop being a destination too, which is the router failure view).
- **No new dependencies.**
- **Status:** Accepted.

### D48 – Weakest spots: links and routers whose failure leaves the most traffic unprotected (2026-11-01)
- **Why:** TODO backlog "Design checks": find the single points of weakness before a design goes live.
- **Measure:** fail each link and each router alone; for every router as the source, count the flows that cross it and how they end in the chosen repair mode (§8). Unprotected = dropped + looping + cut off. Ranked by that, then by traffic affected. Flows to and from a failed router are left out (D27). `docs/02-algorithms.md` §17.
- **Same numbers as the failure view:** a test checks each count against `simulateAllSources` for that failure. "Fail it" takes down just that link or router in that mode, so the failure panel shows the same flows hop by hop.
- **Speed:** calling the simulation for every failure took 13 s on 200 routers / 600 links. Links now use the single-failure rule (one repair at most, no loops, §8); routers follow only the flows through them with the same walk, and use a reachability search instead of a full SPF per failure. About 2 s (test limit 4 s); each router's backups are cached per topology (`backupsAt`), which also speeds up the failure view.
- **UI:** "Weakest spots" panel under the what-if diff: repair mode (starts at the failure view's), show links / routers / both, top 10 with "Show all", a status line naming the weakest, and per row dropped / loops / cut off / repaired, a name that selects it on the diagram, and "Fail it". Runs in the worker with progress.
- **Other options considered:** reuse the heat map's per-link counts (they count each router's own plan, not the traffic of every router, and say nothing about router failures); pairs of failures (n² failures, and FRR plans for one).
- **No new dependencies.**
- **Status:** Accepted.

### D49 – Export the diagram as PNG or SVG (2026-11-01)
- **Why:** TODO backlog "Data in / out": people want the picture for slides and docs, with the paths and failures they are looking at.
- **What is exported:** the whole network (not only the part in view), as it looks now: highlighted paths, failed links and routers, P/Q sets, heat map, packet-walk labels. White background in both themes, since slides and docs are usually light. File named after the topology (`small-isp-core.png`).
- **PNG:** Cytoscape's own `cy.png()` at 2× scale, so it stays sharp on a projector.
- **SVG:** written by `diagramSvg()` in `src/ui/export-image.ts` from each element's computed Cytoscape style (colours, widths, dashes, halos, arrows, octagons for overload, gradient for P+Q, double border for the destination, label boxes). Parallel links are drawn as curves on both sides. Each router and link has a `<title>` with its id. Tested headless (`tests/ui/export-image.test.ts`), including that the file is valid XML.
- **Other options considered:** the `cytoscape-svg` extension (a new dependency for one button; it also renders from the canvas renderer, which jsdom can't test); PNG only (blurry when scaled in a document).
- **No new dependencies.**
- **Status:** Accepted.

### D50 – Random topology generator (2026-11-01)
- **Why:** TODO backlog "Data in / out": try LFA / RLFA / TI-LFA on networks bigger than the examples without drawing them by hand.
- **Shapes:** ring (each router to the next), grid (as square as possible, links right and down), leaf-spine (2 spines up to 8 routers, then 4; every leaf to every spine) and random mesh (a random tree so it is always connected, then random extra links up to about 3 per router; no parallel links). Size slider: 3 to 100 routers (grid and leaf-spine from 4). 100 keeps the biggest (leaf-spine, 384 links) inside the 200-router / 600-link speed target.
- **Seeded, not random:** `generateTopology()` in `src/state/generate.ts` is pure; a seed drives a Park–Miller generator (as in the auto layout), so the same settings always give the same network and tests can pin it. The dialog shows the seed for a mesh or varied metrics, with "Another one" (seed + 1).
- **Metrics:** 10 everywhere, or "Varied metrics" 5 to 50 in steps of 5 (same both ways), so not every path is an ECMP tie.
- **Positions:** ring, grid and leaf-spine are placed by shape; a mesh uses the auto layout (D30).
- **UI:** "Generate…" in the top bar opens a dialog (shape, size slider, varied metrics, seed, a one-line preview: "Grid 3×4: 12 routers, 17 links"). Generate replaces the network on screen as one undo step; R1 (or L1) becomes the source. It is then an ordinary topology: edit, export YAML, share.
- **Other options considered:** `Math.random` in the UI (can't reproduce a network someone reports); more shapes such as full mesh or hub-and-spoke (easy to add later).
- **No new dependencies.**
- **Status:** Accepted.

### D51 – Node protection: Remote LFA per RFC 8102, TI-LFA with router E removed (2026-11-01)
- **Why:** Later #1. Link-protecting backups break when the next-hop router fails (§8.1, Example 6 loops with TI-LFA). Real routers can be told to protect against the router instead.
- **Where the setting lives:** in the topology, `protection: link | node` (only `node` is stored), like MSD (D44) and the LFA policy (D45), so the YAML file, share link, undo and the what-if diff pick it up with no extra wiring. Edited in the topology properties ("Backups protect against: Link failure / Node failure").
- **TI-LFA (RFC 9855 §2.1, Appendix A):** the post-convergence SPF removes router E and all its links; the greedy walk's avoid-check becomes `dist(X,Y) < dist(X,E) + dist(E,Y)` (`docs/02-algorithms.md` §4.4). `computeTilfa(…, scope)` takes `'link' | 'node'`; `tilfaFor()` picks it from the goal.
- **Remote LFA (RFC 8102, checked 2026-11-01):** per destination, node-protecting extended P-space (S's own, or through a neighbor N with `dist(N,Y) < dist(N,E) + dist(E,Y)`) ∩ the link's Q-space, then the PQ node's path to D avoids E. Best = lowest cost from S, then lowest id (§2.3.4). The tunnel through N must also never come back through S (the D17 rule); RFC 8102 states only the node test, so this is stricter, never looser. `nodeRlfa()` in `rlfa.ts`.
- **Fallback:** when D is E itself, or nothing avoids E (no node path, no node-protecting PQ node), the link-protecting backup is installed and marked `protects: link` with `fallback`. RFC 8102 and RFC 9855 give no rule here; real routers fall back, and dropping the backup would leave the link unprotected too.
- **What stays the same:** LFA selection (RFC 5286 Inequality 3 is already the node check; use `lfa_policy: { node_protecting: require }` to insist on it), ECMP, Remote LFA only when there is no LFA. Link mode results are byte-for-byte unchanged (a test compares them) and cost nothing extra: the node work only runs in node mode.
- **Everything downstream follows:** `Protection.rlfa.best`/`exitVia` and `Protection.tilfa` hold the installed backup, so the results table, simulation, compare view, packet walk, coverage, heat map, what-if and weak spots use node-protecting backups with no changes of their own. Coverage adds a `node` count (pairs with D ≠ E; how many LFA-or-RLFA and TI-LFA backups avoid E). The table tags each Remote LFA and TI-LFA cell "(node-prot.)" or "(link only)", the detail panel shows the node P- and PQ sets and why a backup is link only, and the explain steps give every node check with its numbers.
- **Not modelled:** RFC 8102 §2.3.3–2.3.4 preference for PQ nodes covering several ECMP next hops, and the "at most 16 PQ nodes" limit; per-router protection settings; SRLG (Later #3).
- **New example:** `08-node-protection.yaml`, where the link-protecting PQ node B's path goes through E and the node-protecting PQ node is C.
- **No new dependencies.**
- **Status:** Accepted.

### D52 – Import from FRR `show isis database detail` (2026-11-01)
- **Why:** Later #2 and the "Vendor CLI import" backlog item. Engineers want to check FRR coverage on their real network without retyping it.
- **What:** `importFrr()` in `src/io/frr.ts` (pure) reads the LSPs of one level: hostname, overload bit, extended (and narrow) IS reachability with metrics, Adj-SIDs, the algorithm-0 Prefix-SID of the router's host route, SRGB and node MSD (`docs/03-architecture.md` §5.1). A link needs both directions (the IS-IS two-way check); parallel adjacencies become a bundle. The result is checked with the YAML rules. UI: "Import FRR…" in the toolbar, a dialog with paste / open file, level picker, a live "Found: n routers, m links" line, every warning, then Load (auto layout, one undo step).
- **Tolerant, not strict:** FRR's output is for people and changes between releases (hostnames or system ids, `Adjacency-SID` or `Adj-SID`, `Prefix-SID Index` or `Label`). The parser looks for those few lines and ignores the rest, and says what it skipped instead of failing. Tested on an FRR 8+ hostname-style dump (Example 2's ring, which gives the same backups as the hand-written file) and an older system-id dump with two levels, fragments, a LAN, a one-way adjacency, MT, IPv6 and backup Adj-SIDs.
- **Not imported:** multi-topology, Flex-Algo SIDs (Later #6), per-router SRGBs (LFA Lab has one, D9), positions. Other vendors (Cisco `show isis database verbose`, Junos) are not parsed; their formats differ and there are no samples to test against.
- **Other options considered:** parse `show isis database detail json` (FRR's JSON output differs a lot between releases and is often missing SR sub-TLVs); import `show isis topology` (has no Adj-SIDs or Prefix-SIDs).
- **No new dependencies.**
- **Status:** Accepted.

### D53 – SRLG: links that fail together (2026-11-01)
- **Why:** Later #3. Two links in one fibre duct fail together; a backup over the other link is no backup. Builds on the multi-failure simulation (D24).
- **Model:** each link has an optional list of group names (`srlg: [duct-1]`, letters, digits, `_`, `.`, `-`). Two links share a risk when they have a name in common. Edited on the link ("SRLGs"), shown in the link tooltip.
- **Failing a group:** "Fail SRLG duct-1 (n links)" on the link form and the right-click menu takes exactly those links down (the D24 multi-failure); nothing new in the simulation.
- **Protection:** two more goals next to D51's: `srlg` and `node-srlg`. TI-LFA removes the shared links too and checks every segment against them (RFC 9855 §1); it falls back one step at a time (node + SRLG → node → SRLG → link) and says which it got. LFAs get `srlgDisjoint` and those rank first (RFC 7916 §6.2.4.1). Remote LFA keeps its PQ choice (RFC 7490 has no SRLG rule) and is marked SRLG-safe or not. `docs/02-algorithms.md` §18.
- **One `protects` field for all goals:** `Protects` is `link | node | srlg | node-srlg`, and `fallback` is set whenever a backup protects less than the goal, so the table tag ("node-prot.", "SRLG-safe", "node+SRLG", amber "…, fallback") and the coverage lines need no special cases.
- **Prefer, not require, for LFA:** an LFA sharing the SRLG still protects the link alone, which is better than nothing; a `require` knob can be added to the LFA policy later.
- **Not modelled:** SRLG-aware PQ selection, SRLGs on routers (line cards: use node protection), weights per group, SRLG-diverse ECMP.
- **New example:** `09-srlg.yaml`.
- **No new dependencies.**
- **Status:** Accepted.

### D54 – Quiz mode for students (2026-11-01)
- **Why:** Later #4. Students learn FRR by working the inequalities themselves; the app already has every answer and the reasoning.
- **What:** "🎓 Quiz" under the results: ten multiple-choice questions on the network on screen (loop-free?, best LFA, simplest method, P-space, Q-space, PQ node, extra labels, label stack). After each answer it marks right and wrong, lists the explain steps with the numbers and the RFC, and opens that row so the diagram draws it. Score, "Next question", "New quiz" (next seed). `docs/02-algorithms.md` §19.
- **Built from the engine:** `makeQuiz()` in `src/engine/quiz.ts` (pure, seeded) reads `computeForSource()`; it never works anything out on its own, so a quiz can't disagree with the results table. A property test checks every answer against the engine on random networks.
- **Not stored:** the score lives in the panel only; no accounts, no backend (CLAUDE.md rule 5).
- **Other options considered:** fixed question banks per example (only work on the examples, can drift from the engine); free-text answers (hard to mark fairly, e.g. label stacks with spaces or commas).
- **No new dependencies.**
- **Status:** Accepted.

### D55 – LAN links as IS-IS pseudonodes (2026-11-01)
- **Why:** Later #5. Real networks have Ethernet segments with three or more routers; IS-IS models each as a pseudonode, and FRR has its own rule for them (RFC 5286 §3.6).
- **Model:** `lans: [{ id, metric, members }]` in the topology. The engine sees a link per pair of members, A→B costing A's metric to the LAN (pseudonode → B costs 0), tagged with `lan`. Every distance and next hop equals the pseudonode model, and nothing in the engine has to learn about a "router that isn't one" (P/Q spaces, label stacks, the simulation, the quiz…). The canvas draws the pseudonode and spokes instead of the pairs. `docs/02-algorithms.md` §20.
- **Protection:** the failure of a LAN link is S's interface to the LAN, so S's other links on it fail too: LFAs across the same LAN are skipped, ECMP members on it don't protect, P(S) and TI-LFA avoid them (the SRLG machinery of D53), tunnel exits skip them. Node mode plans for E instead.
- **Editing:** a LAN link's metric is its members' LAN metrics (changing one changes it for every neighbor on the LAN); renaming or deleting a router updates its LANs; deleting a LAN link deletes the LAN. LANs are created in YAML or by the FRR import (no drawing tool yet). Adj-SIDs set on a LAN link survive edits but aren't written to YAML (auto-assigned on load).
- **Other options considered:** a real pseudonode in the graph (every space, path, packet walk and count would need "skip the pseudonode" rules); the RFC 5286 §3.6 stricter test "loop-free with respect to the pseudonode" for every alternate (rules out alternates whose path crosses the LAN between other members, which only S's interface failing doesn't break).
- **No new dependencies.**
- **Status:** Accepted.

### D56 – Multi-level IS-IS as one level at a time (2026-11-01)
- **Why:** Later #5. Large IS-IS networks use Level-1 areas and a Level-2 backbone; each level runs its own SPF, so FRR has to be looked at per level.
- **Model:** a router's `level` (1, 2, or left out = 1-2 like FRR) and `area`, a link's and a LAN's `level` (circuit type). `levelTopology()` builds one level (ISO 10589 §7.2.1 adjacency rules: L1 only inside one area), and the sidebar's "IS-IS level" picker makes it the network on screen, so every view works on it with no changes. Edits made in a level are merged back (`mergeLevel()`); Export and Share write the whole network. `docs/02-algorithms.md` §21.
- **Not modelled:** traffic between levels (ATT-bit default route, route leaking, RFC 5286 §6.2 inter-area LFA) and per-level metrics on one link; a switch of level clears failures and the undo history (an undo across two different networks would be confusing).
- **FRR import:** "Both levels" now imports Level-1 and Level-2 together with levels and areas (D52).
- **Other options considered:** one SPF that mixes the levels (an L1 router's path to another area goes to the nearest attached router first, so `dist` stops being a shortest path in one graph and the RFC inequalities no longer apply as written).
- **No new dependencies.**
- **Status:** Accepted.

### D57 – Microloop view (2026-11-01)
- **Why:** Later #6. FRR protects the first moment after a failure; the loops that follow while routers update one by one are a common surprise (RFC 5715), and TI-LFA deployments pair it with local convergence delay (RFC 8333).
- **What:** `microloops()` in `src/engine/microloop.ts`: per destination, the cycles that mix old and new next hops (lowest-id tie-break, as the simulation draws). A PLR only has its new next hop (its repair carries the traffic until it updates), and a loop with an updated PLR is marked as avoided by local convergence delay. "Microloops while the network converges" in the failure panel, opened on demand. `docs/02-algorithms.md` §22.
- **Not modelled:** timings (which order really happens), ECMP members other than the lowest-id one, ordered FIB updates (RFC 6976), SR-based microloop avoidance beyond RFC 8333.
- **No new dependencies.**
- **Status:** Accepted.

### D58 – Flex-Algo (2026-11-01)
- **Why:** Later #6. Operators carve low-delay or "avoid this colour" planes out of one IGP (RFC 9350), and FRR must stay inside each plane (§6.1).
- **Model:** `flex_algo` definitions (metric IGP / TE / delay; exclude-any, include-any, include-all), link `affinity`, `te_metric`, `delay`, router `algos` and `algo_sids` (default index + 1000 per algorithm, checked unique over all algorithms). `flexTopology()` builds the algorithm's network; every engine view runs on it unchanged. The sidebar's "Algorithm" picker shows one, read-only. `docs/02-algorithms.md` §23.
- **Read-only:** a Flex-Algo view costs links by TE metric or delay, so an edit there can't be written back to the IGP metric. Edits are refused with a short note; moving routers is allowed.
- **Not modelled:** the FAD election and flags (RFC 9350 §5.3), ASLA (application-specific link attributes), per-direction TE metric and delay, Flex-Algo prefix metrics, inter-area Flex-Algo.
- **No new dependencies.**
- **Status:** Accepted.

### D59 – SRv6 (2026-11-01)
- **Why:** Later #6. Many new deployments use SRv6; TI-LFA is the same computation (RFC 9855 §7.2) with SIDs instead of labels.
- **Model:** `dataplane: srv6` on the topology, a `locator` per router (default `fc00:0:<sid hex>::/48`). End SID = locator + 1, End.X SID = locator + 0x40 + the link's place in Adj-SID order. The repair list leaves out D (the inner destination); the MSD check counts SIDs. Shown in the results table, detail panel and explain steps. `docs/02-algorithms.md` §24.
- **Not modelled:** uSID / compressed SIDs, H.Insert vs H.Encaps differences, End.X without a preceding End SID (RFC 9855 §7.2), an SRv6 packet walk (the walk and simulation labels stay SR-MPLS, and the panel says so).
- **No new dependencies.**
- **Status:** Accepted.

### D60 – Learn guide: protocol docs in the repo and in the app (2026-11-01)
- **Why:** goal 1 is *teach*. The app shows the numbers, but a newcomer also needs the protocol explained from zero (IS-IS, SPF, convergence, LFA, Remote LFA, Segment Routing, TI-LFA) with exercises to practise on in the app.
- **What:** `docs/learn/`: 14 chapters and 4 appendices in Markdown, each with a diagram, a worked example with real numbers, "Try it in LFA Lab" links and self-check questions with hidden answers. **📖 Learn** in the top bar opens the same files in a panel beside the diagram (narrow or wide), so the diagram stays usable while reading.
- **One copy:** the Markdown is bundled as text (`import.meta.glob(…, ?raw)`, like the examples) and read by a small Markdown reader (`src/learn/markdown.ts`) that turns it into React elements, never raw HTML. It knows only what the guide uses: headings, paragraphs, lists, tables, code, quotes, `<details>`, images, links.
- **Diagrams from the engine:** `src/learn/diagram.ts` draws an example as SVG with the engine's own paths, P / Q spaces, PQ node and segment labels (`computeForSource`, `protectionPaths`). The app draws them on the fly (works offline); `npm run learn:diagrams` writes the same SVGs to `docs/learn/img/` for GitHub, and a test fails when a file no longer matches the engine.
- **Links work in both places:** chapter links are plain `NN-name.md` (GitHub) and turn the page in the app; "Try it" links point at `../../examples/<file>.yaml` (GitHub opens the file) with `#source=…&dest=…&via=…&fail=…&down=…&mode=…`, which the app uses to load the example, open the row and fail things. A test checks every link, anchor, row, link id and picture.
- **Other options considered:** a Markdown library such as `marked` (a new dependency, and its HTML output needs `dangerouslySetInnerHTML` plus rewriting links afterwards); screenshots of the app as diagrams (go stale when the engine or styling changes); Mermaid diagrams (needs a large library in the app, and can't show the engine's results).
- **No new dependencies.**
- **Status:** Accepted.

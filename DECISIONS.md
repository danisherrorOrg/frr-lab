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
- **UI:** a collapsed "Packet walk to D" part in the failure panel, for the drawn flow, in the repair step only (the converged view has no FRR to walk). It shares the PHP and "Show labels on the diagram" switches with the row walk. While anything is down, the detail panel points there instead of offering the row walk, since the diagram shows the simulated traffic. A link walked twice in a loop shows its latest stack up to the current step.
- **Other options considered:** derive labels in the UI from the flow's path — it can't tell a Remote LFA tunnel or a TI-LFA repair list from normal forwarding; a second label simulator — two models that could disagree.
- **No new dependencies.**
- **Status:** Accepted.

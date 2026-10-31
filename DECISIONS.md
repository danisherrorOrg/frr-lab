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
- **Status:** Accepted.

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
- **Model:** forward the packet hop by hop. It carries what the backups put on it: plain IP to D, a tunnel to a PQ node (RFC 7490), or a TI-LFA segment list (prefix-SIDs and Adj-SIDs). Each router forwards on its normal table towards the current target; if that link is down it applies its backup for (current target, that link). A failed Adj-SID hop is repaired towards its far end (protected Adj-SID, B-flag, RFC 8667 §2.2.1).
- **One repair per router visit:** a forwarding entry has one primary and one backup. If the backup's own first link is down too, the packet is dropped there.
- **Loops:** forwarding depends only on the router and what the packet carries, so meeting the same pair twice means the packet would go round forever. We also stop after 255 hops (the IP TTL limit), which catches backups that keep pushing labels. A loop is shown up to the first router the traffic comes back to.
- **Status per affected flow, first match wins:** `unreachable`, `repaired` (reaches D, by one or several routers), `dropped`, `looped`. `broken` is gone; the repairs list says which routers repaired.
- **Single failure unchanged:** property test: one repair at most, never a loop, and the same backup path as the drawings.
- **Not modelled:** some vendors don't repair traffic that is already on a backup, or limit the label stack depth. The RFCs don't say; we show plain forwarding-table behaviour.
- **Other options considered:** keep D23 (hides working third paths, which confused users); find any surviving path (that is convergence, not FRR, and is already the Converge view).
- **No new dependencies.**
- **Status:** Accepted.

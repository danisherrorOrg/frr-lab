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
- **Status:** Accepted. Check RFC 7490 §5.2.1 wording in Phase 3.

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
- **Status:** Accepted. Rules in `docs/02-algorithms.md` §3 and §4.2.

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

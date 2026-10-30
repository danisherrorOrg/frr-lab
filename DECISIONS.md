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

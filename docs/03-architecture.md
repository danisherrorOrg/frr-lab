# 03 – Architecture

## 1. Big picture
A static single-page app. Two halves that never mix:

```
┌──────────────────────── Browser ────────────────────────┐
│                                                         │
│  UI (React)  ──actions──▶  Store (Zustand)              │
│     ▲                         │ topology                │
│     │ results                 ▼                         │
│     └──────────────  Engine (pure TS, in a Web Worker)  │
│                       spf · lfa · rlfa · tilfa · cover  │
└─────────────────────────────────────────────────────────┘
```
- **Engine:** pure functions, no React, no DOM. Input = topology, output = plain JSON results. 100% unit-tested. Could later be published as its own npm package or CLI.
- **UI:** draws the graph, edits the topology, shows results. Does no routing maths itself.
- **Web Worker:** runs the engine off the main thread so big "all sources" runs don't freeze the page.

## 2. Tech stack
| Need | Choice | Why |
|---|---|---|
| Language | TypeScript (strict) | Types catch mistakes in graph code |
| Build | Vite | Fast, simple static build |
| UI | React 18 | Familiar (you've used it in many projects) |
| Graph drawing | **Cytoscape.js** | Made for network graphs: layouts, styling edges per direction, good with 200+ nodes |
| State | Zustand (+ an undo/redo history) | Small, simple |
| YAML | js-yaml | Topology files |
| URL sharing | lz-string | Compress the topology into the link |
| Styling | Tailwind CSS | Quick, easy dark mode |
| Tests | Vitest (+ fast-check for property tests) | Same toolchain as Vite |
| Lint/format | ESLint + Prettier | |
| CI | GitHub Actions: lint, typecheck, test, build | |
| Hosting | Vercel or GitHub Pages (static) | Free |

## 3. Folder layout (planned)
```
LFA LAB/
├── README.md  DECISIONS.md  CLAUDE.md
├── docs/                    planning docs (this folder)
├── examples/                sample topologies (YAML)
├── src/
│   ├── engine/              PURE: no React, no DOM
│   │   ├── types.ts         Topology, Node, Link, results types
│   │   ├── graph.ts         build adjacency, validate topology
│   │   ├── spf.ts           forward/reverse Dijkstra with ECMP, all-pairs
│   │   ├── lfa.ts           RFC 5286
│   │   ├── rlfa.ts          RFC 7490 (P, extended P, Q, PQ)
│   │   ├── tilfa.ts         post-convergence path + segment list
│   │   ├── labels.ts        SRGB / prefix-SID / adj-SID → label values
│   │   ├── coverage.ts      per-source and all-sources reports
│   │   ├── explain.ts       turns checks into readable steps with numbers
│   │   ├── paths.ts         node-by-node paths to draw (primary, LFA, RLFA, TI-LFA)
│   │   ├── compare.ts       LFA / RLFA / TI-LFA side by side for one row (§10 of 02)
│   │   ├── rows.ts          compact results-table rows (every router as the DUT, D31)
│   │   ├── link-view.ts     per-link view: what one link carries and how it is protected (§11 of 02)
│   │   ├── heat-map.ts      coverage per router and per link, for the canvas heat map (§12 of 02)
│   │   ├── what-if.ts       coverage before vs after one change, e.g. a new metric (§13 of 02)
│   │   ├── simulate.ts      failure simulation, per source and for every router
│   │   └── index.ts         computeForSource(), computeCoverage()
│   ├── io/
│   │   ├── yaml.ts          load/save + schema validation
│   │   ├── csv.ts           coverage report → CSV text
│   │   └── share-url.ts
│   ├── worker/
│   │   ├── engine.worker.ts thin worker: passes messages to protocol.ts
│   │   ├── protocol.ts      request/response messages + handler (testable in Node)
│   │   └── client.ts        promise-based calls into the worker
│   ├── state/
│   │   ├── store.ts         topology, selection, failed links, undo/redo history
│   │   ├── edit.ts          pure topology edits (add/move/delete/update + checks)
│   │   ├── examples.ts      built-in examples, bundled from examples/*.yaml
│   │   └── layout.ts        "Auto layout": deterministic force layout (D30)
│   ├── ui/
│   │   ├── GraphCanvas.tsx  Cytoscape wrapper (clicks → store actions)
│   │   ├── canvas.ts        Cytoscape styles, sync and highlight (tested headless)
│   │   ├── Sidebar.tsx      tools, source picker, settings
│   │   ├── Toolbar.tsx      add node/link, fail mode, examples, import/export
│   │   ├── CanvasMenu.tsx   right-click menu on a router or link (D30)
│   │   ├── MetricEditor.tsx double-click a link to edit its metric (D30)
│   │   ├── ResultsTable.tsx one source's table (RowsTable, shared with AllResults)
│   │   ├── AllResults.tsx   every router as the DUT, one section each (D31)
│   │   ├── FailurePanel.tsx failure simulation for the drawn source
│   │   ├── FailureByDut.tsx the same failure from every router (D31)
│   │   ├── DetailPanel.tsx  P/Q spaces, segment list, explain steps
│   │   ├── CompareView.tsx  the three backups side by side, each with a small diagram
│   │   ├── CompareFailure.tsx  the three repair modes side by side while something is down
│   │   ├── MiniMap.tsx      small SVG copy of the diagram with one path
│   │   ├── LinkView.tsx     per-link view: pick a link, its traffic and repairs both ways
│   │   ├── WhatIf.tsx       what-if diff: try a metric on a link, coverage before → after
│   │   ├── CoverageReport.tsx
│   │   └── PropertiesPanel.tsx  edit selected node/link
│   ├── App.tsx  main.tsx
└── tests/
    ├── engine/*.test.ts     one file per engine module
    └── fixtures/            = examples/*.yaml + expected results (JSON)
```

## 4. Data model (engine types)
```ts
type NodeId = string;

interface RouterNode {
  id: NodeId;            // short unique id, e.g. "S", "R1"
  name?: string;         // display name
  sidIndex: number;      // prefix-SID index; label = srgbBase + sidIndex
  pos?: { x: number; y: number };  // UI only, ignored by the engine
}

interface Link {
  id: string;
  a: NodeId; b: NodeId;
  metricAB: number;      // cost a→b (positive integer)
  metricBA: number;      // cost b→a (defaults to metricAB)
  adjSidAB?: number;     // Adj-SID label a→b (optional; auto if missing)
  adjSidBA?: number;
}

interface Topology {
  name: string;
  srgbBase: number;      // default 16000
  nodes: RouterNode[];
  links: Link[];         // point-to-point; parallel links allowed, each with its own id (D29)
}

type Segment =
  | { kind: "prefix"; node: NodeId; label: number }
  | { kind: "adj"; from: NodeId; to: NodeId; link: string; label: number };  // link: D29

interface LfaCandidate {          // an (outgoing link, neighbor) pair, RFC 5286 §3.6
  neighbor: NodeId;
  link: string;
  loopFree: boolean; downstream: boolean; nodeProtecting: boolean;
  cost: number;          // c(S,N) + dist(N,D)
}

interface Protection {          // for one (S, D, protected link S–E)
  protectedLink: { from: NodeId; to: NodeId; id: string };  // id: which link of a bundle
  ecmpProtected: boolean;
  lfa:   { candidates: LfaCandidate[]; best?: NodeId; bestLink?: string };
  rlfa:  { pSpace: NodeId[]; extPSpace: NodeId[]; qSpace: NodeId[]; pq: NodeId[];
           exitVia: Record<NodeId, NodeId>;  // PQ node → neighbor to send through (D11)
           extended: boolean; needed: boolean; best?: NodeId };  // needed = false when an LFA exists
  tilfa: { path?: NodeId[]; outLink?: string;  // outLink: outgoing interface, RFC 9855 §5
           segments?: Segment[]; labelStack?: number[]; extraLabels?: number };
  explain: ExplainStep[];
}

interface DestinationResult {
  dest: NodeId; cost: number; nextHops: NodeId[];
  protections: Protection[];    // one per primary next-hop link
}

interface ExplainStep { rule: string; text: string; ok: boolean; rfc?: string }
```

## 5. Topology YAML format
```yaml
name: Five-node ring
srgb_base: 16000          # optional, default 16000
nodes:
  - { id: S, sid: 1 }
  - { id: E, sid: 2 }
  - { id: C, sid: 3, name: "Core-3", pos: { x: 120, y: 40 } }  # name, pos optional
links:
  - { a: S, b: E, metric: 1 }                 # same metric both ways
  - { a: E, b: C, metric: 10, metric_ba: 20 } # different reverse metric
  - { a: B, b: C, metric: 10, adj_sid_ab: 24005 }
```
**Validation rules** (show clear errors in the UI):
- Node ids are unique; SID indices are unique; links point to existing nodes.
- Metrics are integers from 1 to 16,777,215 (the IS-IS wide-metric range).
- No self-loops. Two routers may have several links (parallel links, D29): the second `S`–`E` link gets id `S-E#2`, the third `S-E#3`.
- Warn (don't block) if the graph is disconnected.
- Router ids use letters, digits, `_` and `.` only (the same rule as the editor; `-` joins the ends in link ids).
- Keys the format doesn't list are errors with a "did you mean" hint (e.g. `metrc` → `metric`, `from` → `a`), so a typo can't silently change the network.
- A YAML syntax error gives its line and column; an empty file says so.
- The key lists live in `src/io/yaml-format.ts`. The loader and the in-app **YAML format** guide (toolbar button, and a link in the import error box) both read them, so the guide always matches what loads. The guide has a checker: paste a file, see every problem as you type, then load it (D40).

## 6. UI layout
```
┌──────────────────────────────────────────────────────────────┐
│ LFA Lab   [Examples ▾] [Import] [Export] [Share]   ☾/☀       │
├───────────────┬──────────────────────────────────────────────┤
│ Tools         │                                              │
│ ○ Select      │             Graph canvas                     │
│ ○ Add router  │   blue = primary · orange dashed = backup    │
│ ○ Add link    │   shaded = P-space / Q-space · ★ = PQ node   │
│ ○ Fail link   │                                              │
│ Source: [S ▾] │   [+][−][Fit][Auto layout]   hover = tooltip │
│  (or "All     │   right-click = menu · dbl-click link = metric│
│   routers")   │                                              │
│ Mode: [Link]  │                                              │
├───────────────┴──────────────────────────────────────────────┤
│ Results for S:  Dest | NH | Cost | LFA | RLFA | TI-LFA | ✓/✗  │
│ ▸ click a row → Detail panel: spaces, segment list, explain  │
│ [Coverage report]                                            │
└──────────────────────────────────────────────────────────────┘
```
- Phone width: canvas on top, results as cards below.
- Line styles + icons as well as colors (accessibility).

## 7. Performance plan
- All-pairs SPF: n × Dijkstra with a binary heap → about O(n · m log n). Fine for 200 nodes.
- Cache all-pairs distances per topology version; recompute only after an edit.
- TI-LFA needs one extra SPF per (S, protected link). Cache by link.
- Coverage for all sources runs in the worker with a progress bar.

## 8. Security / privacy
- No backend, no analytics in the MVP. Topologies never leave the browser (the share link holds the data in the URL itself).
- Parse YAML with a safe schema (no custom tags).

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
| Hosting | Vercel (static), service worker for offline (D61) | Free |

## 3. Folder layout (planned)
```
LFA LAB/
├── README.md  DECISIONS.md  CLAUDE.md
├── docs/                    planning docs (this folder)
│   └── learn/               the Learn guide for users (D60); img/ = SVGs from `npm run learn:diagrams`
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
│   │   ├── msd.ts           max SID depth: each router's limit, and "is this stack too deep?" (§14 of 02)
│   │   ├── lfa-policy.ts    LFA policy: each router's preferences and excluded neighbors (§15 of 02)
│   │   ├── protection.ts    link or node protection for Remote LFA and TI-LFA (§3.1, §4.4 of 02)
│   │   ├── flex-algo.ts     Flex-Algo topology: participation, constraints, metric, SIDs (§23 of 02)
│   │   ├── lan.ts           broadcast LANs: member-to-member links, a router's LAN interface (§20 of 02)
│   │   ├── levels.ts        multi-level IS-IS: level views, merging edits back (§21 of 02)
│   │   ├── microloop.ts     loops some update order can make while the network converges (§22 of 02)
│   │   ├── quiz.ts          quiz questions from the results, seeded (§19 of 02)
│   │   ├── srlg.ts
│   │   ├── srv6.ts          SRv6 locators, End / End.X SIDs, repair SID list (§24 of 02)          shared risk link groups: groups, shared links, SRLG-safe checks (§18 of 02)
│   │   ├── weak-spots.ts    weakest spots: every link and router failed alone, ranked (§17 of 02)
│   │   ├── simulate.ts      failure simulation, per source and for every router
│   │   └── index.ts         computeForSource(), computeCoverage()
│   ├── io/
│   │   ├── yaml.ts          load/save + schema validation
│   │   ├── csv.ts           coverage report → CSV text
│   │   ├── frr.ts           FRR "show isis database detail" text → topology (§5.1)
│   │   └── share-url.ts
│   ├── learn/               the Learn guide in the app (D60)
│   │   ├── markdown.ts      small Markdown reader → a block tree (no HTML strings)
│   │   ├── chapters.ts      docs/learn/*.md bundled as text, in order
│   │   ├── links.ts         chapter links and "Try it" links (#source=…&dest=…&fail=…)
│   │   ├── diagram.ts       an example + highlights → SVG, from the engine's results
│   │   └── diagrams.ts      the guide's diagrams (one spec per docs/learn/img/ file)
│   ├── worker/
│   │   ├── engine.worker.ts thin worker: passes messages to protocol.ts
│   │   ├── protocol.ts      request/response messages + handler (testable in Node)
│   │   └── client.ts        promise-based calls into the worker
│   ├── state/
│   │   ├── store.ts         topology, selection, failed links, undo/redo history
│   │   ├── edit.ts          pure topology edits (add/move/delete/update + checks)
│   │   ├── examples.ts      built-in examples, bundled from examples/*.yaml
│   │   ├── layout.ts        "Auto layout": deterministic force layout (D30)
│   │   └── generate.ts      Random topology generator: ring, grid, leaf-spine, mesh (seeded, D50)
│   ├── ui/
│   │   ├── GraphCanvas.tsx  Cytoscape wrapper (clicks → store actions)
│   │   ├── canvas.ts        Cytoscape styles, sync and highlight (tested headless)
│   │   ├── export-image.ts  Diagram as PNG (Cytoscape) or SVG (written from computed styles)
│   │   ├── Sidebar.tsx      tools, source picker, settings
│   │   ├── Toolbar.tsx      add node/link, fail mode, examples, import/export
│   │   ├── FrrImportDialog.tsx  paste / open FRR output, preview, load (D52)
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
│   │   ├── WhatIf.tsx       what-if diff: try a metric on a link or a router's overload bit, coverage before → after
│   │   ├── WeakSpots.tsx    weakest spots: links and routers ranked by the traffic their failure leaves unprotected
│   │   ├── Quiz.tsx         quiz mode: ten questions on this network, with the reasoning
│   │   ├── LearnGuide.tsx   📖 Learn: the guide's chapters in a panel beside the diagram (D60)
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
  msd?: number;          // max SID depth of this router; overrides Topology.msd (D44)
  lfaExclude?: NodeId[]; // neighbors never used as an LFA (RFC 7916 §6.2.4.4, D45)
  overload?: boolean;    // IS-IS overload bit: never transit, never a backup (D47)
  level?: '1' | '2';     // IS-IS level; none = L1/L2 (D56)
  area?: string;         // IS-IS area, e.g. "49.0001" (D56)
  algos?: number[];      // Flex-Algos it takes part in; none = all (D58)
  algoSids?: Record<number, number>;  // Prefix-SID index per Flex-Algo; none = auto (D58)
  locator?: string;      // SRv6 locator; none = fc00:0:<sid hex>::/48 (D59)
  pos?: { x: number; y: number };  // UI only, ignored by the engine
}

interface Link {
  id: string;
  a: NodeId; b: NodeId;
  metricAB: number;      // cost a→b (positive integer)
  metricBA: number;      // cost b→a (defaults to metricAB)
  adjSidAB?: number;     // Adj-SID label a→b (optional; auto if missing)
  adjSidBA?: number;
  srlg?: string[];       // shared risk link groups: links with a name in common fail together (D53)
  lan?: string;          // set on the member-to-member links made from a LAN (D55)
  level?: '1' | '2';     // circuit type; none = both levels (D56)
  affinity?: string[];   // link colours for Flex-Algo constraints (D58)
  teMetric?: number; delay?: number;  // other metrics a Flex-Algo can use (D58)
}

interface Lan {          // a broadcast LAN = an IS-IS pseudonode (D55)
  id: string;
  members: { node: NodeId; metric: number }[];  // metric = member → LAN; LAN → member is 0
  level?: '1' | '2';
}

interface Topology {
  name: string;
  srgbBase: number;      // default 16000
  msd?: number;          // max SID depth of every router (RFC 8491 §5); none = no limit (D44)
  lfaPolicy?: { nodeProtecting?: 'prefer' | 'require' | 'ignore';
                downstream?: 'prefer' | 'require' | 'ignore' };  // RFC 7916 §6.2; none = prefer both (D45)
  protection?: 'link' | 'node' | 'srlg' | 'node-srlg';  // what backups protect against; none = link (D51, D53)
  nodes: RouterNode[];
  links: Link[];         // point-to-point; parallel links allowed, each with its own id (D29)
  lans?: Lan[];          // their member-to-member links are in `links` with `lan` set (D55)
  flexAlgos?: { algo: number; metric?: 'igp' | 'te' | 'delay';
                excludeAny?: string[]; includeAny?: string[]; includeAll?: string[] }[];  // D58
  dataplane?: 'srv6';    // none = SR-MPLS (D59)
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
           extended: boolean; needed: boolean; best?: NodeId;  // needed = false when an LFA exists
           node?: { pSpace: NodeId[]; pq: NodeId[]; best?: NodeId };   // RFC 8102, node mode, D ≠ E (D51)
           protects?: 'link' | 'node'; fallback?: 'dest-is-next-hop' | 'none' };
  tilfa: { path?: NodeId[]; outLink?: string;  // outLink: outgoing interface, RFC 9855 §5
           segments?: Segment[]; labelStack?: number[]; extraLabels?: number;
           msd?: number; tooDeep?: boolean;   // tooDeep: stack > S's MSD, not installed (D44)
           protects?: 'link' | 'node'; fallback?: 'dest-is-next-hop' | 'none' };  // node mode (D51)
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
msd: 3                    # optional max SID depth of every router, 2 to 255 (D44)
lfa_policy: { node_protecting: prefer, downstream: require }  # optional, prefer / require / ignore (D45)
protection: node          # optional, link (default), node, srlg or node-srlg (D51, D53)
dataplane: srv6           # optional, mpls (default) or srv6 (D59)
flex_algo: [{ algo: 128, metric: delay, exclude_any: [red] }]  # optional Flex-Algos (D58)
nodes:
  - { id: S, sid: 1 }
  - { id: E, sid: 2, msd: 2, lfa_exclude: [C] }               # msd optional, overrides the top one; lfa_exclude optional
  - { id: A, sid: 4, overload: true }                          # optional overload bit: no transit through A (D47)
  - { id: B, sid: 5, level: 2, area: "49.0001" }               # optional IS-IS level (1, 2, 1-2) and area (D56)
  - { id: C, sid: 3, name: "Core-3", pos: { x: 120, y: 40 } }  # name, pos optional
links:
  - { a: S, b: E, metric: 1 }                 # same metric both ways
  - { a: E, b: C, metric: 10, metric_ba: 20 } # different reverse metric
  - { a: B, b: C, metric: 10, adj_sid_ab: 24005, srlg: [duct-7] }  # srlg optional (D53)
  - { a: S, b: B, metric: 20, level: 2 }      # level optional: circuit type (D56)
lans:                                         # optional broadcast LANs (D55)
  - { id: LAN1, metric: 10, members: [S, A, { node: C, metric: 20 }] }
```
**Validation rules** (show clear errors in the UI):
- Node ids are unique; SID indices are unique; links point to existing nodes.
- Metrics are integers from 1 to 16,777,215 (the IS-IS wide-metric range).
- `lfa_policy` values are `prefer`, `require` or `ignore`. `lfa_exclude` lists existing routers other than the router itself; one that isn't a neighbor gives a warning (it does nothing) (D45).
- `msd` (top level or per router) is a whole number from 2 to 255: BMI-MSD is one octet (RFC 8491 §2), and below 2 not even a Remote LFA tunnel fits (D44).
- No self-loops. Two routers may have several links (parallel links, D29): the second `S`–`E` link gets id `S-E#2`, the third `S-E#3`.
- Warn (don't block) if the graph is disconnected.
- Router ids use letters, digits, `_` and `.` only (the same rule as the editor; `-` joins the ends in link ids).
- Keys the format doesn't list are errors with a "did you mean" hint (e.g. `metrc` → `metric`, `from` → `a`), so a typo can't silently change the network.
- A YAML syntax error gives its line and column; an empty file says so.
- The key lists live in `src/io/yaml-format.ts`. The loader and the in-app **YAML format** guide (toolbar button, and a link in the import error box) both read them, so the guide always matches what loads. The guide has a checker: paste a file, see every problem as you type, then load it (D40).

### 5.1 Import from FRR (Later #2, D52)
`importFrr(text, { level })` in `src/io/frr.ts` turns the output of FRR's `vtysh -c "show isis database detail"` into a topology. It is pure (text in, topology out), and nothing leaves the browser. The toolbar's **Import FRR…** opens a dialog: paste the text or open a file, see what was found and every warning, pick the level, then load (auto layout, one undo step).

| From the output | Becomes |
|---|---|
| `IS-IS Level-N link-state database` | one database per level; Level-2 by default, else the first |
| LSP ID `rt1.00-00` / `0000.0000.0001.00-00`, fragments `-01` … | one router; fragments merged |
| `Hostname:` (RFC 5301) | router id, made safe (`pe-1` → `pe_1`, `name: pe-1`); else the system id |
| `ATT/P/OL` = `…/1` in fragment 0 | `overload: true` |
| `Extended Reachability: rt2.00 (Metric: 10)`, also narrow `IS Reachability` | one direction of a link and its metric |
| `Adjacency-SID: 15001 … F:0 B:0` under it | that direction's Adj-SID: the IPv4 primary (F:0, B:0) wins over backup or IPv6 ones |
| `Prefix-SID Index: 1, Algorithm: 0` (or `Label:`) under a /32 or /128 | `sid` (label − SRGB for a label) |
| `SRGB Base: 16000` | `srgb_base` (the most common one; warns if routers differ, D9) |
| `Node Maximum SID Depth: 16` | the router's `msd` (2 to 255) |

- **Links need both ends:** a→b is paired with b→a in the order the LSPs list them, so two adjacencies each way give a bundle (D29). An entry only one side lists fails the IS-IS two-way check and is skipped with a warning.
- **LANs (D55):** a pseudonode LSP (`rt2.01-00`) lists the routers on the LAN; each router lists the pseudonode with its metric. A router that both list is a member; the LAN's id is the DIS's id and the pseudonode number (`p_2.01`).
- **Both levels (D56):** "Both levels" in the dialog (`level: 'all'`) imports Level-1 and Level-2 as one network: a router in one level's database only gets `level: 1` or `level: 2`, its `Area Address` becomes `area`; an adjacency or LAN the same in both levels is one, otherwise each gets its `level`.
- **Skipped, with a warning:** multi-topology (MT) entries, links to routers with no LSP in this level, Flex-Algo SIDs (algorithm ≠ 0). A router with no Prefix-SID gets the lowest free index.
- The result goes through the YAML rules (`parseTopology(serializeTopology(t))`), so it can't hold a value a file couldn't.

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
- Phone width: canvas on top, results as cards below. The top bar is one row that scrolls sideways.
- Screens at least 768 px wide **and** 600 px tall (iPads, laptops; not a phone on its side): the app fills the window. The tools panel and the results panel scroll on their own, can be hidden ("Hide tools" / "Hide results" in the top bar) and resized by dragging the bar beside them (arrow keys too; double-click resets). The results panel starts at about a third of the window height. The layout is saved in this browser only (`src/ui/panels.ts`), never in the topology or share link.
- Line styles + icons as well as colors (accessibility).

## 7. Performance plan
- All-pairs SPF: n × Dijkstra with a binary heap → about O(n · m log n). Fine for 200 nodes.
- Cache all-pairs distances per topology version; recompute only after an edit.
- TI-LFA needs one extra SPF per (S, protected link). Cache by link.
- Coverage for all sources runs in the worker with a progress bar.

## 8. Security / privacy
- No backend, no analytics in the MVP. Topologies never leave the browser (the share link holds the data in the URL itself).
- Parse YAML with a safe schema (no custom tags).

# Algorithms and rules: index

A one-page list of every algorithm and rule in LFA Lab. The full maths lives in [`02-algorithms.md`](02-algorithms.md) (section numbers below point there); the reasons behind each choice are in [`../DECISIONS.md`](../DECISIONS.md) (D1–D61).

**Totals:** 25 algorithms (the 24 sections of `02-algorithms.md`, with Remote LFA and TI-LFA split into link and node protection) · 20 algorithm rules · 7 project rules.

---

## Prompt for the AI agent: Excalidraw diagram series

> **Read this before you work on the diagrams.**
>
> **Goal.** Each algorithm (part A) and each rule (part B) gets **one Excalidraw diagram**. Part C (the project rules) gets one diagram for all seven. After reading a diagram, someone new to FRR should understand what the algorithm or rule does, why it exists and how it works on a real example with real numbers.
>
> **One at a time.** Do **only the next unticked item** in the tracker below. Build it, check it, tick it, then stop and show it to the user. Don't start the next one until the user says so. When the user says "next", take the first unticked item.
>
> **Before drawing, read the source.** Read the item's section in `02-algorithms.md`, the matching chapter in `learn/` and the example YAML in `examples/`. Every number on the diagram must come from those files or from running the engine. Never invent numbers. Rule 3 of `CLAUDE.md` applies: the RFC wins. If the docs look wrong, say so; don't quietly "fix" them on the diagram.
>
> **How to build.**
> 1. Write the diagram as code: `docs/excalidraw/src/<id>-<slug>.mjs` (e.g. `a02-lfa.mjs`, `b03-loop-free.mjs`). It exports a default function that returns a `Scene` from `docs/excalidraw/lib/scene.mjs`. Copy the structure of `a01-spf.mjs`.
> 2. Build with `npm run excalidraw -- <id>`. This writes `docs/excalidraw/<name>.excalidraw` (open it in excalidraw.com or the VS Code Excalidraw extension) and `<name>.svg` (a preview that GitHub shows).
> 3. The build **fails on any overlap**: text on text, text sticking out of a panel, or a line crossing a label or router. Fix the layout until it prints `✓ … no overlaps`.
> 4. Render a PNG of the SVG (with `sharp` from the Excalidraw plugin, in the scratchpad) and **look at it**. Fix anything cramped, empty or hard to read.
> 5. Run `npx prettier --write docs/excalidraw`, tick the box below and link the file.
>
> **What every diagram contains (same layout as A1).**
> - **Title line:** `<ID> · <name>`, plus a subtitle with the section (§), the RFC and the code file.
> - **The example:** a small topology from `examples/` with routers, link metrics, the primary path in blue, the failed link in red (dashed), the backup or repair path in green, and a legend that explains the colours.
> - **How it works:** the steps or formula, then the **worked numbers** for the example (e.g. `dist(N,D)=10 < dist(N,S)+dist(S,D) = 15+20 ✓`).
> - **Side panels:** the rule details, tie-breaks, edge cases and what goes wrong without it. Point to related items by ID (e.g. "see B1").
> - **Takeaway:** one or two plain-English sentences.
> - **Sources line:** the doc sections, learn chapter and example file.
>
> **Style.** Short, plain English (the UI-text rule from `CLAUDE.md`). Formulas in mono. Colours mean the same thing on every diagram: blue = normal or primary, red = failure or rule check, green = backup or OK, purple = destination or reverse direction, yellow = takeaway, gray = notes. Keep it to about 1640 px wide, and keep panel heights aligned in each row (`scene.row`).
>
> **Don'ts.** No new npm dependencies (`lib/` uses only Node built-ins). Don't change engine code or tests for a diagram. Don't commit unless the user asks.

### Tracker

Files live in [`excalidraw/`](excalidraw/). Tick an item when its diagram builds with no overlaps and the user has seen it.

**A. Algorithms**
- [x] A1 · SPF → [`a01-spf`](excalidraw/a01-spf.svg)
- [x] A2 · LFA → [`a02-lfa`](excalidraw/a02-lfa.svg)
- [x] A3 · Remote LFA, link protection → [`a03-rlfa`](excalidraw/a03-rlfa.svg)
- [x] A4 · Remote LFA, node protection → [`a04-rlfa-node`](excalidraw/a04-rlfa-node.svg)
- [x] A5 · TI-LFA, link protection → [`a05-tilfa`](excalidraw/a05-tilfa.svg)
- [x] A6 · TI-LFA, node protection → [`a06-tilfa-node`](excalidraw/a06-tilfa-node.svg)
- [x] A7 · Packet walk → [`a07-packet-walk`](excalidraw/a07-packet-walk.svg)
- [x] A8 · Coverage numbers → [`a08-coverage`](excalidraw/a08-coverage.svg)
- [x] A9 · Failure simulation → [`a09-simulate`](excalidraw/a09-simulate.svg)
- [x] A10 · Parallel links → [`a10-parallel`](excalidraw/a10-parallel.svg)
- [x] A11 · Compare view → [`a11-compare`](excalidraw/a11-compare.svg)
- [x] A12 · Per-link view → [`a12-link-view`](excalidraw/a12-link-view.svg)
- [x] A13 · Coverage heat map → [`a13-heat-map`](excalidraw/a13-heat-map.svg)
- [x] A14 · What-if diff → [`a14-what-if`](excalidraw/a14-what-if.svg)
- [x] A15 · Max SID depth → [`a15-msd`](excalidraw/a15-msd.svg)
- [x] A16 · LFA policy → [`a16-lfa-policy`](excalidraw/a16-lfa-policy.svg)
- [x] A17 · Overload bit → [`a17-overload`](excalidraw/a17-overload.svg)
- [x] A18 · Weakest spots → [`a18-weak-spots`](excalidraw/a18-weak-spots.svg)
- [x] A19 · SRLG → [`a19-srlg`](excalidraw/a19-srlg.svg)
- [x] A20 · Quiz mode → [`a20-quiz`](excalidraw/a20-quiz.svg)
- [x] A21 · LAN links / pseudonodes → [`a21-lan`](excalidraw/a21-lan.svg)
- [x] A22 · Multi-level IS-IS → [`a22-levels`](excalidraw/a22-levels.svg)
- [x] A23 · Microloops → [`a23-microloops`](excalidraw/a23-microloops.svg)
- [x] A24 · Flex-Algo → [`a24-flex-algo`](excalidraw/a24-flex-algo.svg)
- [x] A25 · SRv6 → [`a25-srv6`](excalidraw/a25-srv6.svg)

**B. Rules** (numbered as in part B below)
- [x] B1 · Path avoids link S→E → [`b01-avoids-link`](excalidraw/b01-avoids-link.svg)
- [x] B2 · ECMP-protected → [`b02-ecmp`](excalidraw/b02-ecmp.svg)
- [x] B3 · Loop-free → [`b03-loop-free`](excalidraw/b03-loop-free.svg)
- [x] B4 · Downstream → [`b04-downstream`](excalidraw/b04-downstream.svg)
- [x] B5 · Node-protecting → [`b05-node-protecting`](excalidraw/b05-node-protecting.svg)
- [x] B6 · Excluded neighbors → [`b06-excluded`](excalidraw/b06-excluded.svg)
- [x] B7 · Best LFA tie-break → [`b07-best-lfa`](excalidraw/b07-best-lfa.svg)
- [x] B8 · P-space → [`b08-p-space`](excalidraw/b08-p-space.svg)
- [x] B9 · Extended P-space → [`b09-ext-p-space`](excalidraw/b09-ext-p-space.svg)
- [x] B10 · Q-space → [`b10-q-space`](excalidraw/b10-q-space.svg)
- [x] B11 · PQ node and best PQ → [`b11-pq-node`](excalidraw/b11-pq-node.svg)
- [x] B12 · Node-protecting PQ → [`b12-node-pq`](excalidraw/b12-node-pq.svg)
- [x] B13 · Remote LFA only when there is no LFA → [`b13-rlfa-only`](excalidraw/b13-rlfa-only.svg)
- [x] B14 · Post-convergence path → [`b14-post-convergence`](excalidraw/b14-post-convergence.svg)
- [x] B15 · Greedy segment walk → [`b15-greedy-walk`](excalidraw/b15-greedy-walk.svg)
- [x] B16 · Clean-up of the first segment → [`b16-cleanup`](excalidraw/b16-cleanup.svg)
- [x] B17 · List ends with PrefixSID(D) → [`b17-ends-with-d`](excalidraw/b17-ends-with-d.svg)
- [x] B18 · Labels (SRGB and Adj-SIDs) → [`b18-labels`](excalidraw/b18-labels.svg)
- [x] B19 · TI-LFA node mode → [`b19-tilfa-node`](excalidraw/b19-tilfa-node.svg)
- [x] B20 · Protection order → [`b20-protection-order`](excalidraw/b20-protection-order.svg)

**C. Project rules**
- [x] C1 · The 7 project rules (one diagram) → [`c01-project-rules`](excalidraw/c01-project-rules.svg)

---

## A. Algorithms (25)

The ID (A1–A25) is the row order below.

### Core path computation and protection

| § | Algorithm | Standard | File |
|---|---|---|---|
| 1 | SPF: forward and reverse Dijkstra, all-pairs distances, ECMP first hops | – | `spf.ts`, `paths.ts` |
| 2 | LFA (Loop-Free Alternate) | RFC 5286 | `lfa.ts` |
| 3 | Remote LFA, link protection (P / Q / PQ spaces) | RFC 7490 | `rlfa.ts` |
| 3.1 | Remote LFA, node protection | RFC 8102 | `rlfa.ts` |
| 4 | TI-LFA, link protection (post-convergence path → greedy segment list → label stack) | RFC 9855 | `tilfa.ts`, `labels.ts` |
| 4.4 | TI-LFA, node protection | RFC 9855 §2.1 | `tilfa.ts` |
| 4.5 | Packet walk (label stack hop by hop, with PHP) | RFC 8660 | `packet-walk.ts` |
| 5 | Coverage numbers (LFA / RLFA / TI-LFA %, every router as source) | – | `coverage.ts`, `rows.ts` |

### Failures and analysis

| § | Algorithm | Standard | File |
|---|---|---|---|
| 8 | Failure simulation: links, routers, multiple failures, hop by hop | – | `simulate.ts` |
| 9 | Parallel links (bundles) | RFC 5286 §3.4–3.6 | `graph.ts` |
| 10 | Compare view (LFA vs RLFA vs TI-LFA side by side) | – | `compare.ts` |
| 11 | Per-link view ("if this link fails, who repairs?") | – | `link-view.ts` |
| 12 | Coverage heat map | – | `heat-map.ts` |
| 13 | What-if diff (before / after a metric change) | – | `what-if.ts` |
| 14 | Max SID depth (MSD check) | RFC 8491 | `msd.ts` |
| 15 | LFA policy | RFC 7916 | `lfa-policy.ts` |
| 16 | Overload bit | ISO 10589 | `spf.ts` |
| 17 | Weakest spots (fail each link and router on its own) | – | `weak-spots.ts` |
| 18 | SRLG: links that fail together | RFC 4202 | `srlg.ts` |
| 19 | Quiz mode | – | `quiz.ts` |
| 20 | LAN links / pseudonodes | ISO 10589 | `lan.ts` |
| 21 | Multi-level IS-IS (L1 / L2) | ISO 10589 | `levels.ts` |
| 22 | Microloops | RFC 5715 | `microloop.ts` |
| 23 | Flex-Algo | RFC 9350 | `flex-algo.ts` |
| 24 | SRv6 encoding of TI-LFA | RFC 8986 | `srv6.ts` |

All files are in `src/engine/`. `explain.ts` turns every result into step-by-step explanations with real numbers.

---

## B. Algorithm rules (20)

### Path check (§1)
1. **Path avoids link S→E:** `dist(X,Y) < dist(X,S) + c(S,E) + dist(E,Y)`. A tie (`=`) counts as "uses the link", the safe choice.
2. **ECMP-protected:** another primary next hop doesn't use the failed link.

### LFA (§2, RFC 5286)
3. **Loop-free (required):** `dist(N,D) < dist(N,S) + dist(S,D)`
4. **Downstream:** `dist(N,D) < dist(S,D)`
5. **Node-protecting:** `dist(N,D) < dist(N,E) + dist(E,D)`
6. **Excluded neighbors:** skip N if the link S→N or N→S has the max metric 16,777,215.
7. **Best LFA:** node-protecting → downstream → lowest `c(S,N) + dist(N,D)` → lowest router ID → lowest link ID.

### Remote LFA (§3, RFC 7490 / RFC 8102)
8. **P-space:** `dist(S,Y) < c(S,E) + dist(E,Y)`
9. **Extended P-space:** `dist(N,Y) < dist(N,S) + dist(S,Y)`
10. **Q-space:** `dist(Y,E) < dist(Y,S) + c(S,E)`
11. **PQ node** = (extended) P ∩ Q. **Best PQ:** lowest cost from S → lowest router ID.
12. **Node-protecting PQ:** in the node P-space, Y's own path to D avoids E (`dist(Y,D) < dist(Y,E) + dist(E,D)`), and Y is not overloaded.
13. Remote LFA is used **only when there is no LFA**.

### TI-LFA (§4, RFC 9855)
14. **Post-convergence path:** SPF with S–E removed. Ties go to the lowest router IDs along the path.
15. **Greedy segment walk:** jump to the furthest node reachable with a Prefix-SID; if none, use an Adj-SID for one hop.
16. **Clean-up:** drop a first segment that only reaches the first hop N (unless N is D).
17. **The list always ends with `PrefixSID(D)`.** Extra labels = segments − 1.
18. **Labels:** Prefix-SID = SRGB 16000 + SID index. Adj-SIDs start at 24000 on each router, numbered in neighbor-ID order.
19. **Node mode:** remove router E entirely. The avoid-check becomes `dist(X,Y) < dist(X,E) + dist(E,Y)`.

### Protection order (§5)
20. Each pair is credited to the simplest method that protects it: **ECMP → LFA → Remote LFA → TI-LFA**.

---

## C. Project rules (7, from `CLAUDE.md`)
1. `src/engine/` is **pure**: no React, no DOM, no `window`, no randomness. Same input → same output.
2. **Tests first** for engine changes. The worked examples in `02-algorithms.md` §6 must keep passing.
3. **The RFC is the source of truth.** If code, docs and RFC disagree, follow the RFC, fix `02-algorithms.md`, and log it in `DECISIONS.md`.
4. **Follow the roadmap order** in `04-roadmap.md` and tick boxes when done.
5. **No backend, analytics or network calls.** The app must work offline.
6. **Keep it simple.** No new dependency without a line in `DECISIONS.md`.
7. **Planning vs building:** a request for a plan means docs only, no code.

**Style:** strict TypeScript, small pure functions, named exports; comments explain *why* and cite RFC sections; UI text is short, plain English with real numbers; no AI attribution in commits or PRs.

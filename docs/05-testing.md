# 05 – Testing plan

The engine is the product. If its answers are wrong, the tool teaches wrong things. So:
**every engine function gets tests before (or with) its code.**

## 1. Levels
| Level | Tool | What |
|---|---|---|
| Unit | Vitest | Each engine module (spf, lfa, rlfa, tilfa, labels, coverage, yaml) |
| Fixed examples | Vitest + `tests/fixtures/*.expected.json` | The worked examples must match exactly |
| Property | fast-check | Random graphs: rules that must always hold |
| UI smoke | Vitest + Testing Library (later Playwright) | Load an example, pick a source, see the results table |
| Manual | Checklist below | Before each release |

## 2. Fixed expected results (from `02-algorithms.md` §6)
| Fixture | Source / Dest / Link | LFA | RLFA PQ | TI-LFA segments | Label stack |
|---|---|---|---|---|---|
| `01-square` | S / D / S–E | N (node-protecting, downstream) | – (not needed) | `[Prefix D]` | `16000+sid(D)` |
| `02-ring5` | S / E / S–E | none | {B, C}, chosen B | `[Prefix B, Prefix E]` | `16004, 16002`* |
| `03-ring5-highmetric` | S / E / S–E | none | none | `[Prefix B, Adj B→C, Prefix E]` | `16004, 24005, 16002` |
| `04-isp-core` | PE1 / P1 / PE1–P1 | none | {PE2} (extended, exit via P2), chosen PE2 | `[Adj P2→P1, Prefix P1]` | `24000, 16001` |
| `05-leaf-spine` | L1 / SP1 / L1–SP1 | none | {L2, L3, L4} (extended, exit via SP2), chosen L2 | `[Prefix L2, Prefix SP1]` | `16012, 16001` |
| `06-link-protecting` | S / D / S–E | N (link-protecting only, not downstream) | – (not needed) | `[Prefix D]` (path S-N-E-D) | `16005` |
| `07-parallel` | S / E / link `S-E` | E over `S-E#2` (link-protecting, downstream) | – (not needed) | `[Prefix E]`, out on `S-E#2` | `16002` |

Parallel links (Phase 9.4), worked out by hand in `02-algorithms.md` §9: `07-parallel` from S to D the node-protecting LFA A beats the parallel link; from E to D the equal bundle is ECMP; failing one link of a bundle leaves the other up. Property tests also run on random networks with bundles (`tests/engine/parallel.property.test.ts`).

Every router as the DUT (Phase 9.6), worked out by hand in `02-algorithms.md` §8.2: `06-link-protecting` fail E, LFA only → S `1 affected, 1 repaired (relayed); 0 survive, 1 breaks`, N and D survive, M not affected. Each router's rows and failure counts must equal that router's own single-source result (`tests/engine/rows.test.ts`, `tests/engine/simulate-all.test.ts`).

Router failure (Phase 9.3), worked out by hand in `02-algorithms.md` §8.1: `01-square` fail E → D's LFA N survives; `03-ring5-highmetric` fail E → C dropped without TI-LFA, TI-LFA survives; `06-link-protecting` fail E → LFA N breaks at N (N then repairs via M), TI-LFA breaks and loops.

\* With SID indices from the YAML files (S=1, E=2, A=3, B=4, C=5).

Also check P and Q sets:
- `02-ring5`: P = {A, B}, extended P = {A, B, C}, Q = {B, C}, PQ = {B, C} (plain-P only: {B})
- `01-square`: TI-LFA greedy walk gives `[Prefix N, Prefix D]`; after the clean-up rule (`02-algorithms.md` §4.2) → `[Prefix D]`

These numbers were checked with a throwaway Python script on 2026-10-29 (not part of the repo).
- `03-ring5-highmetric`: P = {A, B}, extended P = {A, B}, Q = {C}
- `04-isp-core` (PE1, link PE1–P1): P = {P2, P4}, extended P = {P2, P4, PE2}, Q = {P3, PE2}. P4 via P2 has LFA P1 (only because P1→P4 costs 20 but P4→P1 costs 40); PE2 is ECMP-protected.
- `05-leaf-spine` (L1, link L1–SP1): P = {SP2}, extended P = {SP2, L2, L3, L4}, Q = {L2, L3, L4}. Every leaf is ECMP-protected.

## 3. Property tests (random connected graphs, 4–30 nodes, metrics 1–20)
1. **SPF:** `dist(X,Y) ≤ c(X,Z) + dist(Z,Y)` for every edge X→Z (triangle rule); `dist(X,X) = 0`.
2. **LFA soundness:** for every reported LFA N, simulate forwarding from N with normal tables: it reaches D without passing through S.
3. **RLFA soundness:** for every PQ node: S's normal path to PQ avoids link S–E, and PQ's normal path to E avoids link S–E.
4. **TI-LFA soundness:** simulate the segment list hop by hop (non-S routers use pre-failure tables): it reaches D, never uses link S–E, and the total cost equals the post-convergence cost.
5. **TI-LFA completeness:** if D can still be reached after removing link S–E, TI-LFA returns a path.
6. **Coverage order:** LFA% ≤ (LFA or RLFA)% ≤ TI-LFA% = 100% on connected graphs where the link isn't a bridge.
7. **Symmetry:** with symmetric metrics, `dist(X,Y) = dist(Y,X)`.

## 4. Edge cases to cover
- Destination is the neighbor itself (D = E), as in Examples 2 and 3.
- ECMP to D: one primary next hop protects the other.
- Bridge link (removing it disconnects D): every method says "unprotected", with a clear reason.
- Asymmetric metrics (the Q-space must use reverse SPF).
- Two-node and three-node graphs.
- Ties in post-convergence path: the result must be deterministic (same input → same output).
- Invalid YAML: duplicate ids, duplicate SIDs, unknown node in a link, metric 0 or negative.

## 5. Manual release checklist
- [x] Every built-in example loads and gives the expected results
- [x] Fail-link animation follows the TI-LFA path
- [x] Share link round-trips (open it in a private window)
- [x] 200-node generated topology: all-sources coverage < 2 s, UI stays responsive
- [x] Dark mode, phone width, keyboard only
- [x] Explain text numbers match the table numbers

Phase 9.5 / 9.6 check, 2026-10-31, in Chrome against `npm run dev`: router click opens its row; tooltips on routers and links; right-click menus; double-click metric edit (then undo); auto layout on Example 4 (no crossing links); drag with the fail-link tool; zoom and fit; "All routers" on Example 4 with a router failed and the per-DUT lines. No console errors.

Last run: 2026-10-31 (Phase 7), in Chrome against `npm run dev` and `npm run preview`. 200-router all-sources coverage took 0.77 s in the worker. The browser window couldn't be resized, so phone width was checked in a 390 px frame. The share link was checked by reloading the page from the link, not in a private window. "Offline" was checked as "every request goes to the page's own host"; there is no service worker, so a cold load still needs the files.

Launch check, 2026-11-02, in Chrome against https://lfa-lab.vercel.app: no console errors; the service worker installs and saves all six files; a share link (`#t=…&s=B`) loads with "Results for B" after a fresh load. Offline was checked against `npm run preview`: load once, stop the server, reload; the app draws and computes as normal. (That run found that `vite preview` sends `Vary: Origin`, which made every cache lookup miss; the worker now ignores `Vary`.)

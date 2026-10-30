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

\* With SID indices from the YAML files (S=1, E=2, A=3, B=4, C=5).

Also check P and Q sets:
- `02-ring5`: P = {A, B}, extended P = {A, B, C}, Q = {B, C}, PQ = {B, C} (plain-P only: {B})
- `01-square`: TI-LFA greedy walk gives `[Prefix N, Prefix D]`; after the clean-up rule (`02-algorithms.md` §4.2) → `[Prefix D]`

These numbers were checked with a throwaway Python script on 2026-10-29 (not part of the repo).
- `03-ring5-highmetric`: P = {A, B}, extended P = {A, B}, Q = {C}

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
- [ ] Every built-in example loads and gives the expected results
- [ ] Fail-link animation follows the TI-LFA path
- [ ] Share link round-trips (open it in a private window)
- [ ] 200-node generated topology: all-sources coverage < 2 s, UI stays responsive
- [ ] Dark mode, phone width, keyboard only
- [ ] Explain text numbers match the table numbers

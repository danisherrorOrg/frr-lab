# 02 – Algorithms

The engine is pure TypeScript with no UI code. This file is the source of truth for the maths. **Before coding each part, re-read the matching RFC section** (links at the bottom). If the RFC and this file disagree, the RFC wins: fix this file and log it in `DECISIONS.md`.

Notation: see `01-requirements.md` §3. `c(X,Y)` = metric of the link X→Y. All metrics are positive integers and may differ per direction, so `dist(X,Y)` may not equal `dist(Y,X)`.

---

## 1. Shortest paths (SPF)

### 1.1 Forward SPF from a root R
Dijkstra over directed edges. Store for every node Y:
- `dist(R,Y)`
- **all** shortest-path predecessors (needed for ECMP)
- first-hop set: which neighbors of R are on *some* shortest path to Y

### 1.2 Reverse SPF to a root R
Dijkstra on the graph with every edge reversed. Gives `dist(Y,R)` for all Y. Needed for Q-space when metrics aren't symmetric.

### 1.3 What we pre-compute
For a source S and a protected link S–E we need distances from S, from each neighbor N of S, and to E or D. Simplest approach: **all-pairs distances** (one forward SPF per node). That's fine for ≤ 200 nodes. Cache by topology version.

### 1.4 ECMP rule
Y has ECMP from S if there are 2+ first hops. A destination is "ECMP-protected" against the failure of one primary next hop if another primary next hop **doesn't use the failed link**.

### 1.5 Path uses a link?
"All shortest paths from X to Y avoid link S→E" is checked with the strict inequality:
```
dist(X,Y) < dist(X,S) + c(S,E) + dist(E,Y)
```
If it's `=`, some ECMP path uses the link, so treat it as **not** avoiding it (safe choice).
With parallel links (§9), `c(S,E)` is the metric of the one link meant, not of the bundle.

---

## 2. LFA (RFC 5286)
For S, destination D, primary next hop E, and every other neighbor N of S (other primary next hops count too: RFC 5286 §3.4):

| Name | Inequality | Meaning |
|---|---|---|
| **Loop-free** (Inequality 1) | `dist(N,D) < dist(N,S) + dist(S,D)` | N won't send the traffic back to S. **Required.** |
| **Downstream** (Inequality 2) | `dist(N,D) < dist(S,D)` | N is closer to D than S. Stronger: also prevents microloops between alternates. |
| **Node-protecting** (Inequality 3) | `dist(N,D) < dist(N,E) + dist(E,D)` | N's path to D avoids router E, so it survives E failing. |

**Link-protecting:** all links are point-to-point, so a loop-free N never uses link S–E for its first hop. The check in §1.5 confirms N's path to D doesn't come back over S–E (Inequality 1 already implies this). A candidate is an (outgoing link, neighbor) pair (RFC 5286 §3.6): with parallel links, another link to E itself is a candidate (§9).

**Excluded neighbors:** skip N if the link S→N or N→S has the IS-IS maximum metric 16,777,215 (RFC 5286 §3.5).

**ECMP-protected:** another primary next hop for D that avoids link S–E (§1.4). With point-to-point links it is always downstream, so it is also an LFA candidate.

**Choosing the best LFA** (documented in `DECISIONS.md`, can be changed):
1. node-protecting before link-only
2. then downstream before not-downstream
3. then lowest `c(S,N) + dist(N,D)`
4. then lowest router ID
5. then lowest link id (only matters for parallel links, §9)

The LFA policy (§15, RFC 7916) can turn steps 1 and 2 into hard rules or switch them off, and can exclude neighbors.

---

## 3. Remote LFA (RFC 7490): link protection
Used when there's no LFA for (S, D, link S–E).

**P-space of S** (routers S reaches without using link S–E):
```
Y ∈ P(S)  ⇔  dist(S,Y) < c(S,E) + dist(E,Y)
```

**Extended P-space** = P(S) ∪ the P-spaces of S's other neighbors N (S can send traffic straight to N, and N then forwards normally):
```
Y ∈ P(N)  ⇔  dist(N,Y) < dist(N,S) + dist(S,Y)
```
The MVP uses **extended P-space** by default, with a toggle to show plain P-space.

**Q-space of E** (routers that reach E without using link S–E):
```
Y ∈ Q(E)  ⇔  dist(Y,E) < dist(Y,S) + c(S,E)
```

**PQ nodes** = (extended) P-space ∩ Q-space. S and E are never listed in any space (S can't pass the tests; if E were in some P(N), N would already be an LFA, see D17).
S tunnels traffic to the PQ node, and the PQ node forwards it normally to E and then to D. **Which way the tunnel leaves S matters:**
- PQ node in plain P(S): the tunnel follows S's normal shortest path (it already avoids S–E).
- PQ node only in some neighbor's P(N): the tunnel must be **sent out through neighbor N** (S's own normal path to it may use S–E). Store that exit neighbor with the result. If several neighbors work, use the one with the lowest `c(S,N) + dist(N,PQ)`, then the lowest router ID.

**Skipped neighbors:** a neighbor whose link to or from S has the maximum metric 16,777,215 is never an exit (RFC 7490 §5.4).

**Choosing the PQ node** (RFC 7490 §5.2.2):
1. lowest cost from S to the PQ node: `dist(S,PQ)` for plain-P nodes, `c(S,N) + dist(N,PQ)` for nodes reached through neighbor N
2. then lowest router ID

The choice doesn't depend on D: E's Q-space stands in for every destination behind E (RFC 7490 §5.2.1.3).

**When RLFA is used:** only when there's no LFA for (S, D, link S–E). The spaces are still computed and shown for teaching.

Checked against RFC 7490 §5.2–5.4 on 2026-10-30 (D17). The RFC's Q-space formula writes `dist(S,E)` where we write `c(S,E)`; they are equal whenever S–E is a primary link.

### 3.1 Node protection (RFC 8102, Later #1, D51)
With `protection: node`, Remote LFA looks for a PQ node whose whole repair also survives **router E** failing. Checked against RFC 8102 §2 on 2026-11-01. Unlike link protection this depends on D, so it is worked out per (D, link S–E) and only when D ≠ E.

For each router Y in E's Q-space of §3 (RFC 8102 §2.2.3 uses the link's Q-space):
1. **Node-protecting P-space** (§2.2.2): the tunnel to Y avoids E. Either S's own normal path, `dist(S,Y) < dist(S,E) + dist(E,Y)`, or through a neighbor N ≠ E (the same tunnel exits as §3: no max metric, no overload bit):
   ```
   dist(N,Y) < dist(N,E) + dist(E,Y)        and   dist(N,Y) < dist(N,S) + dist(S,Y)
   ```
   The second test is the link rule of §3: the tunnel never comes back through S (D17). RFC 8102 §2.2.6.2 only states the first; keeping both is stricter, never looser. The cheapest way in is kept: `dist(S,Y)`, or `c(S,N) + dist(N,Y)`, lowest neighbor id on ties.
2. **Y's own path to D avoids E** (§2.3.2):
   ```
   dist(Y,D) < dist(Y,E) + dist(E,D)
   ```
   A tie counts as "may use E", like Inequality 3.
3. Y is not overloaded (RFC 7490 §5.4).

The node-protecting PQ nodes are the ones that pass all three. **Best:** lowest cost from S (the cheapest way in of step 1), then lowest router id (RFC 8102 §2.3.4). The rule that prefers a PQ node covering more ECMP next hops (§2.3.3–2.3.4) is not modelled: LFA Lab protects each primary link on its own.

**Which one is used:** as in §3, Remote LFA only runs when there is no LFA. Then the node-protecting PQ node if there is one (`rlfa.protects = node`), else the link-protecting one of §3 (`protects = link`, `fallback = none`; `dest-is-next-hop` when D = E). RFC 8102 gives no fallback rule (D51). LFAs are not changed: to prefer or require node-protecting LFAs use the LFA policy (§15).

Example 8 (§4.4 has the topology), S → D over S–E:
- No LFA: N, `dist(N,D)=6 < dist(N,S)+dist(S,D) = 2+4` ✗.
- Q-space (link): {B, C, D}. Link PQ = {B, C}, best **B** via N (cost 5), but B's path to D is B-E-D.
- Node P-space: B via N (`3 < dist(N,E)+dist(E,B) = 4+1`), C via N (`6 < 4+4`); D: own `4 < 2+2` ✗, via N `6 < 4+2` ✗.
- Path to D: B `dist(B,D)=3 < dist(B,E)+dist(E,D) = 1+2` ✗; C `3 < 4+2` ✓.
- **Node-protecting PQ = {C}, best C via N (cost 8).** The repair S-N-B-C-D costs 11. With router E failed, it gets through, where the link-protecting tunnel to B breaks at B.

---

## 4. TI-LFA (Segment Routing): link protection

### 4.1 Post-convergence path
Remove link S–E (both directions) and run SPF from S. The shortest path to D is the **post-convergence path** (RFC 9855 §3: `SPT_new(S, S–E)`). If there's a tie, pick one deterministically: **lowest router IDs along the path**, i.e. compare the paths router by router from S, and the first difference decides.
If D can't be reached, the destination can't be protected (the network is partitioned).

### 4.2 Turning the path into a segment list (greedy method)
Only S has switched to the repair. **Every other router still uses its normal (pre-failure) routing table.** A prefix-SID for router Y sent from X follows X's *normal* shortest path to Y. So:

```
current = S
segments = []
while current != D:
    find the FURTHEST node Y on the post-convergence path after `current` such that:
        (a) dist(current, Y) == cost of the post-convergence path from current to Y, and
        (b) ALL normal shortest paths current→Y avoid link S–E  (check from §1.5)
    if such a Y exists:
        segments.push(PrefixSID(Y)); current = Y
    else:
        next = the node after `current` on the path
        segments.push(AdjSID(current → next)); current = next
```
- **The repair is an outgoing interface plus a repair list** (RFC 9855 §5). The outgoing interface is always the path's first hop N.
- **Clean-up rule:** if the first segment only reaches N, as `PrefixSID(N)` or `AdjSID(S→N)`, **drop it**: sending out of that interface already gets there (RFC 9855 §5.1). Exception: when N is D itself, keep `PrefixSID(D)`: it is the destination's own label (next rule).
- **The list always ends with `PrefixSID(D)`:** that's the packet's own label, which stays under the repair list (RFC 9855 §7.1). If the walk ends with an `AdjSID(X→D)`, add `PrefixSID(D)` after it.
- So if the first hop N is already a valid LFA for D, the greedy walk gives `[PrefixSID(N), PrefixSID(D)]` → after clean-up `[PrefixSID(D)]` (zero extra labels).
- Extra labels = segments − 1 (the repair list without the destination's own label).
- Typical results: 0 extra labels (LFA case), 1 (a PQ node exists), 2 (P and Q are adjacent: prefix-SID(P) + adj-SID(P→Q)), more in rare cases.
- (a) always holds when (b) does: normal paths that avoid S–E still exist after the failure, so they cost the same as the post-convergence path. (a) is kept because it makes the explain steps easier to follow.
- The walk always makes progress (an Adj-SID moves one hop), so it ends. Each prefix segment follows normal shortest paths that all avoid S–E and cost the same as the post-convergence path, so the repair is loop-free and costs exactly the post-convergence cost (a property test checks this).

### 4.3 Label stack
- Prefix-SID label = SRGB base (default 16000) + router's SID index. The MVP assumes **every router uses the same SRGB**.
- Adj-SID label = value from the topology file, or auto-assigned: Adj-SIDs are local to each router (RFC 8402 §3.4), so each router numbers its own links from 24000 in neighbor-ID order (then link-id order for parallel links), skipping labels it already uses (D18). Each link of a bundle has its own Adj-SID, so an Adj-SID segment names its link (§9).
- Show the stack top-first, before any penultimate-hop popping (state this in the UI). So RFC 9855 §7.1 rule 1 (pop the destination label when PHP is on and the list ends at the penultimate hop) is not shown.

### 4.4 Node protection (Later #1, D51)
With `protection: node` (network setting, §3.1 for Remote LFA), TI-LFA plans for router E failing: remove **node E** (all its links) for the post-convergence SPF (RFC 9855 §2.1, `SPT_new(S, E)`; Appendix A: "the expected post-convergence path … considering that the node has failed"). The greedy walk of §4.2 is unchanged except check (b), which becomes "all normal shortest paths current→Y avoid node E":
```
dist(X,Y) < dist(X,E) + dist(E,Y)        (∞ when E has the overload bit, §16)
```
E is not on the post-convergence path, so it is never an end of a segment, and (b) also rules out the link S–E. An Adj-SID can't name a link of E for the same reason.
- **D = E:** node protection can't apply (E is the destination), so the repair is the link-protecting one, marked `fallback: dest-is-next-hop`.
- **D cut off without E** (E is a cut vertex for D): link-protecting repair, `fallback: none`. RFC 9855 gives no rule here; falling back keeps traffic protected against the link failure (D51).
- `Protection.tilfa.protects` says which one is installed (`node` or `link`). It is set only in node mode, so link-mode results are unchanged.
- The repair can cost more than S's final path after a *link* failure (it also avoids E), so in node mode "TI-LFA is always `same`" (§8 step 6, §10) no longer holds.

Example 8 (`examples/08-node-protection.yaml`): S–E 2, S–N 2, E–B 1, E–D 2, N–B 3, B–C 3, C–D 3; S → D over S–E.
- Link protection: S-N-B-E-D (8), `[PrefixSID(B), PrefixSID(D)]` = `16004, 16006`: goes through E.
- Node protection: E removed, S-N-B-C-D (11). From S: B fails (a) (`dist(S,B)=3`, path 5); N passes (`2 < dist(S,E)+dist(E,N) = 2+4`) and is dropped (first hop). From N: D fails (a) (`6`, path 9); C passes (`6 < 4+4`). From C: D (`3 < 4+2`). **`[PrefixSID(C), PrefixSID(D)]` = `16005, 16006`**, out via N.
- S → E: D = E, link protection: S-N-B-E, `[PrefixSID(B), PrefixSID(E)]`.

Example 6 with `protection: node`: S → D: E removed, S-N-M-D (21). From S: M (`11 = 11`, `11 < 1+11`); from M: D (`10 < 11+1`). `[PrefixSID(M), PrefixSID(D)]` = `16004, 16005`. With router E failed, the traffic is delivered on S-N-M-D instead of looping (§8.1, §10.1).

### 4.5 Packet walk (TODO backlog, D34, D35)
`packetWalk()` (`src/engine/packet-walk.ts`) follows one packet along the repair from §4.2, router by router, and records the label stack each router receives and sends (top first). It is a teaching view; it changes no result.
- **At S (the PLR):** the packet arrives with D's own label (the walk assumes it is already on the SR path to D). S pushes the rest of the segment list on top (RFC 9855 §5) and sends out of the repair interface `outLink` to the path's first hop N. S does not read the top label: after clean-up it can even be N's Adj-SID.
- **Every other router R** reads the top label and uses its *normal* table:
  - its own Prefix-SID → the segment ends here: pop it and read the next label;
  - its own Adj-SID R→X → pop it and send out that link, whatever its table says (RFC 8402 §3.4);
  - another router Y's Prefix-SID → forward to the next router on the path. The walk checks it is a normal next hop: `c(R,next) + dist(next,Y) = dist(R,Y)`. With ECMP the real router may pick another equal-cost next hop; the walk shows the one on the post-convergence path.
- **PHP (on by default):** when the top label after R's actions is a Prefix-SID of the very next router, R pops it before sending (penultimate-hop popping, RFC 8660 §2). With PHP the segment's end router never sees its own label, and D gets a plain IP packet. With PHP off, each segment end pops its own label (D too).
- The walk ends at D with no labels left. The metrics walked add up to the post-convergence cost.
- On the diagram (optional), each link of the repair shows the stack it carries, top first, under its metric.

Example 3 (§6), PHP on:

| Router | Arrives with | Does | Leaves with |
|---|---|---|---|
| S | 16002 | push 16004, 24005; out to A | 16004 24005 16002 |
| A | 16004 24005 16002 | forward to B (`1 + 0 = 1 = dist(A,B)`); PHP pop 16004 | 24005 16002 |
| B | 24005 16002 | pop Adj-SID 24005, send on B→C (metric 10) | 16002 |
| C | 16002 | forward to E; PHP pop 16002 | no labels |
| E | no labels | deliver | – |

With PHP off, A sends all three labels, B pops 16004 (its own) then 24005, and E pops 16002. Total cost 1+1+10+1 = 13.

**Primary path (D35):** `primaryWalk()` walks the row's normal path for comparison: S→E, then E's shortest path to D (the path drawn in blue, over the row's link of a bundle). Nothing has failed, so every router, S too, forwards on D's Prefix-SID with the same check `c(R,next) + dist(next,D) = dist(R,D)`, and with PHP the router before D pops it. Example 2, S→C through E: S sends 16005 to E (`1 + 1 = 2 = dist(S,C)`); E pops 16005 (PHP) and sends a plain packet to C. Total 2. The detail panel lets the user pick "Primary path" or "TI-LFA backup"; the diagram marks the one walked.

---

## 5. Coverage numbers
For a source S: for every destination D ≠ S and every primary next-hop link S–E for D, record which methods protect it.
```
LFA coverage    = protected-by-LFA pairs / all pairs
RLFA coverage   = protected-by-(LFA or RLFA) pairs / all pairs
TI-LFA coverage = protected-by-TI-LFA pairs / all pairs   (should be 100% unless the network is partitioned)
```
"All sources" mode repeats this for every router as S and adds the numbers together.

Counting details (D19):
- A pair is (D, primary next-hop link S–E). D with two ECMP next hops gives two pairs. Routers S can't reach give none.
- "Protected by LFA" means a best LFA exists. ECMP-protected pairs are also counted on their own; they are always LFA-protected too (§2).
- Node mode (§3.1, §4.4, D51) adds `node`: the pairs with D ≠ E, and of those the ones whose LFA-or-Remote-LFA backup avoids E (a node-protecting LFA, else a node-protecting PQ node) and whose installed TI-LFA repair does. Example 8 from S: 3 pairs (B, C, D via E), 3 and 3.
- The unprotected list holds every pair LFA doesn't protect, with the reason from the strongest method that fails: `no-lfa` (RLFA or TI-LFA protects it), `no-rlfa` (only TI-LFA), `partitioned` (nothing: the link is a bridge for D).

**Every router as the DUT (Phase 9.6, D31).** `computeAllSources()` runs the same `computeForSource()` for every router and keeps one compact row per pair (`ResultRow` in `src/engine/rows.ts`): cost, next hop and link, the chosen LFA, PQ node and exit, TI-LFA segments and labels, and `protectedBy`, the simplest method that protects the pair in the order above (ECMP, LFA, Remote LFA, TI-LFA). Nothing is recomputed differently, so each router's rows equal its own single-source table (tested on Example 4).

---

## 6. Worked examples (these become fixed tests)

### Example 1: Square, LFA works (`examples/01-square.yaml`)
```
S —10— E
|      |
15     10
|      |
N —10— D
```
- `dist(S,D) = 20` via E (via N would be 25). Primary next hop = E.
- `dist(N,D)=10`, `dist(N,S)=15`, `dist(N,E)=20` (N-D-E), `dist(E,D)=10`.
- Loop-free: `10 < 15 + 20 = 35` ✓
- Downstream: `10 < 20` ✓
- Node-protecting: `10 < 20 + 10 = 30` ✓
- **Result:** N is a node-protecting, downstream LFA. TI-LFA path S-N-D. The greedy walk gives `[PrefixSID(N), PrefixSID(D)]`; the clean-up rule drops `PrefixSID(N)` → `[PrefixSID(D)]` (0 extra labels).

### Example 2: 5-node ring, no LFA, RLFA works (`examples/02-ring5.yaml`)
Ring `S – E – C – B – A – S`, all metrics 1. Destination **D = E**, protect link S–E.

| Y | dist(S,Y) | dist(E,Y) | dist(Y,E) | dist(Y,S) |
|---|---|---|---|---|
| A | 1 | 2 | 2 | 1 |
| B | 2 | 2 | 2 | 2 |
| C | 2 | 1 | 1 | 2 |

- LFA via A: `dist(A,E)=2 < dist(A,S)+dist(S,E)=1+1=2` ✗ → **no LFA**.
- P(S): A `1<1+2` ✓, B `2<1+2` ✓, C `2<1+1` ✗ → {A, B}.
- Extended P-space via A: C `dist(A,C)=2 (A-B-C) < dist(A,S)+dist(S,C)=1+2=3` ✓ → extended P = {A, B, C}.
- Q(E): A `2<1+1` ✗, B `2<2+1` ✓, C `1<2+1` ✓ → {B, C}.
- **PQ = {B, C}.** Cost from S: B = `dist(S,B) = 2`; C (extended, exit via A) = `c(S,A)+dist(A,C) = 1+2 = 3`. Lowest → **chosen PQ = B**. RLFA: tunnel to B, then B→C→E. (With plain P-space only, PQ = {B}.)
- TI-LFA: post-convergence path S-A-B-C-E. From S: furthest valid Y = B (S→B normal path S-A-B, cost 2, avoids S–E; S→C would use S–E). From B: B→E normal path B-C-E (cost 2, avoids S–E) ✓.
- **Segment list `[PrefixSID(B), PrefixSID(E)]`** → 1 extra label. Out via A.

### Example 3: Ring with a high-metric link, needs an Adj-SID (`examples/03-ring5-highmetric.yaml`)
Same ring, but **B–C metric = 10** (all others 1). D = E, protect link S–E.
- Distances: from S: E1, A1, B2, C2. From A: S1, B1, E2, C3. From E: S1, C1, A2, B3.
- No LFA (A: `2 < 1+1` ✗).
- P(S) = {A, B}. Extended via A: C `dist(A,C)=3 (A-S-E-C; A-B-C costs 11) < 1+2` ✗ → still {A, B}.
- Q(E): A `2<2` ✗, B `dist(B,E)=3 < dist(B,S)+1=3` ✗, C `1<3` ✓ → {C}.
- **No PQ node → RLFA fails.**
- TI-LFA: post-convergence path S-A-B-C-E (cost 13).
  - From S: furthest valid = B → `PrefixSID(B)`.
  - From B: next is C, but B's normal path to C is B-A-S-E-C (cost 4 < 10) and uses S–E ✗ → `AdjSID(B→C)`.
  - From C: C→E direct ✓ → `PrefixSID(E)`.
- **Segment list `[PrefixSID(B), AdjSID(B→C), PrefixSID(E)]`** → 2 extra labels. This is the classic "P and Q adjacent" case.

With SRGB 16000 and SID indices S=1, E=2, A=3, B=4, C=5, Adj-SID B→C = 24005, the label stack (top first) is: `16004, 24005, 16002`.

---

## 7. References
- RFC 5286 – Basic Specification for IP Fast Reroute: Loop-Free Alternates. https://www.rfc-editor.org/rfc/rfc5286
- RFC 7490 – Remote LFA Fast Reroute. https://www.rfc-editor.org/rfc/rfc7490
- RFC 8102 – Remote-LFA Node Protection and Manageability (for v0.2).
- RFC 8402 – Segment Routing Architecture (Prefix-SID, Adj-SID, SRGB).
- RFC 8660 – Segment Routing with the MPLS Data Plane (label push, pop and PHP).
- RFC 8667 – IS-IS Extensions for Segment Routing.
- RFC 9855 – Topology Independent Fast Reroute Using Segment Routing (TI-LFA), October 2025 (was `draft-ietf-rtgwg-segment-routing-ti-lfa`). https://www.rfc-editor.org/rfc/rfc9855
- RFC 6571 – LFA applicability (good background on coverage in real topologies).

---

## 8. Failure simulation (F5)
Code: `src/engine/simulate.ts`. One or more links can fail. FRR backups are built for a single failure, so with several links down the simulation follows the traffic hop by hop to show whether it still gets through (D23, D24).

For every destination D that S reaches before the failure:
1. **Normal path:** follow S's normal shortest path hop by hop. Ties use the lowest router id at each hop, the same rule as the drawings (§4.1), so one flow is shown per destination.
2. **Affected?** Yes if that path crosses a failed link in either direction. The router just before the *first* failed link on the path is the **point of local repair (PLR)**, and the router after it is its next hop E. The PLR can be S or any router further along.
3. **Repair:** the PLR switches to its pre-computed backup for (D, link PLR–E); every other router keeps its normal table. What the backup is depends on which FRR methods the routers run:
   - *Any mode:* if D is ECMP, the other primary next hop (`ecmp`): the router just stops using the failed member (D22). With several members down it uses the lowest-id member that is still up; if none is, traffic is dropped there, since the members are each other's backups (D25).
   - *LFA only:* else the best LFA. The path is PLR → N, then N's normal path to D (RFC 5286 §4).
   - *LFA + Remote LFA:* as above, else the PQ node path PLR → (exit neighbor) → PQ → D (RFC 7490, D11).
   - *TI-LFA:* else the PLR's post-convergence path (RFC 9855 §3).
   - None of these: traffic is **dropped** until the network reconverges.
   The repair path shown is S's normal path up to the PLR, then the PLR's backup.
   - *Several links down (D24):* traffic is followed hop by hop. Every router forwards on its normal table, and **any** router whose own outgoing link is down switches to the backup it built for that one link (on the full topology), even when the traffic is already on another router's backup. So when the PLR's backup runs into a second failed link, the router there repairs again, towards wherever the traffic was heading at that point (D, a Remote LFA's PQ node, or the next TI-LFA segment; a failed Adj-SID hop is repaired towards its far end; if the router's normal path to that neighbor doesn't use the failed link, that normal path is the backup). This is RFC 9855 §6: for a node segment the active segment stays and the repair list goes in front of it (§6.1); a failed Adj-SID is replaced by a repair list to its far end (§6.2); and a protected Adj-SID in a repair list can trigger a second repair (§9). It ends one of three ways:
     - it reaches D (possibly on a third path),
     - **dropped**: a router has no backup for its failed link, or its backup's own first link is down too (a router holds one primary and one backup, so it repairs at most once per visit),
     - **loop**: the traffic comes back to a router carrying the same thing as before (same destination, same tunnel or segments), so it would go round forever. The path shown ends there. Passing a router twice with different labels is not a loop by itself. If 255 hops (the IP TTL limit) are used up first, because labels keep piling up, the path is cut where traffic first comes back to a router.
4. **Converge:** remove all failed links and run SPF again from S (same tie-break). That is S's final path. If D can't be reached, it is unreachable (the network is split).
5. **Status** of an affected flow, first match wins: `unreachable` (no final path), `repaired` (traffic reaches D), `dropped`, `looped`.
6. **Repair = final?** (only for traffic that reaches D) Compare the path from the PLR on (its backup, plus any later routers' repairs) with the PLR's own post-convergence path: `same` (same routers), `same-cost` (other path, equal cost) or `longer` (costlier). A TI-LFA repair made by one router alone is always `same` (a property test checks it); LFA and RLFA may not be. When several routers repair in turn, TI-LFA may not be either (Example 4, fail PE1–P1 and P2–P4, PE1→P3: PE1, then P2, then PE1 again repair; 100 from PE1 against a final 50). The comparison is made at the PLR because that is where FRR acts: when the PLR is not S, S itself may later pick a quite different path, so the panel says so even when the PLR's part is `same` (Example 2, fail E–C: C is repaired on S→E→S→A→B→C; E's part is E's final path, but S's final path is S→A→B→C).

Worked check (Example 2, fail S–E, TI-LFA): C and E are affected; E is repaired on S→A→B→C→E (cost 4), which is also the final path. With "LFA only", E has no LFA and is dropped, while C uses LFA A.

Worked check, two links (Example 2, fail S–E and E–C, TI-LFA): C's repair S→A→B→C avoids E–C, so it survives (`repaired`, same as the final path, cost 3). E's repair S→A→B→C→E runs into C–E at C; C's own TI-LFA backup for E goes back through B and A to S, where it is the same packet as at the start, so traffic loops (shown as S→A→B→C→B→A→S…). E has lost both links, so its status is `unreachable`.

Worked check, ECMP with two members down (Example 5, source SP1, fail L1–SP1 and L2–SP1, any mode): SP1 reaches SP2 through all four leaves; it skips L1 and L2 and sends the traffic via L3 (`ecmp`, cost 20, same as the final path).

Worked check, a third path (S–E 10, E–D 10, S–A 10, A–D 15, A–B 10, B–D 10; fail S–E and A–D, TI-LFA): S's backup S→A→D runs into A–D at A; A's own backup A→B→D avoids both failures, so traffic reaches D on S→A→B→D (cost 30), which is also the final path.

### 8.1 Router failure (Phase 9.3, D27)
A failed router E takes all its links down at once and its Prefix-SID stops working. The simulation treats it as "every link of E is down", so the hop-by-hop walk above is unchanged. E's neighbors only see their own link fail, so they use the backup they built for that link. By default that is **link-protecting**: nobody plans for E itself. With `protection: node` (§3.1, §4.4) Remote LFA and TI-LFA backups avoid E where they can, so they survive.

For every destination D:
- **D = E:** unreachable. That is expected, so it is shown on its own line, not as a protection failure. No repair is followed.
- **Not affected:** S's normal path never goes through E (or any other failed link).
- **Survives:** the PLR's backup, followed on normal tables as if only the link PLR–E had failed, never goes through E. With E the only failure, the traffic then gets through on that one backup. For ECMP the member checked is the one the PLR really uses: the lowest-id member whose link is up (D25, D28).
- **Broken by the router failure:** that planned backup goes through E. The panel names the router just before E and why:
  - *LFA / ECMP:* neighbor N's path to D goes through E. When E is the PLR's own next hop the failed node-protecting check is shown, `dist(N,D) < dist(N,E) + dist(E,D)` ✗ (RFC 5286 §3.2).
  - *Remote LFA:* the tunnel to the PQ node, or the PQ node's path to D, goes through E (RFC 8102 §2.1).
  - *TI-LFA:* the segment whose path goes through E: `PrefixSID(E)` itself, an Adj-SID on a link of E, or a Prefix-SID whose normal path crosses E (RFC 9855 §1: link protection only avoids the link).
  These reasons (and the RFC 5286 / 8102 / 9855 node-protection notes) apply when the failed router met is E, the PLR's protected neighbor. When it is another failed router (several things down), it is a **second failure** the backup was never planned for, and the panel says that instead; if the backup's own neighbor or PQ node is that router, it says it "is itself down" (D28).
  With parallel links (§9) the reason names the one link the backup was planned for, "the link S–E (S-E)", and the link of an Adj-SID, "Adj-SID(B→C) of link B-C#2": each link has its own backup and Adj-SID (D33).
  What then happens to the traffic comes from the walk: the router before E finds its own link to E down and uses its own backup (D24), so traffic may still get through, be dropped, or loop.
- **No backup:** dropped at the PLR, as for a link.
- **Converge:** SPF with all of E's links removed.
- **Summary:** "E down: 3 destinations affected, 2 repairs survive, 1 breaks". It counts the destinations that meet a failed router: on the normal path, or on the PLR's planned backup (§8.2, D32).
- The source router itself can't be failed in the simulation: it sends no traffic.
- Ties: "goes through E" means the path drawn and walked (lowest-id tie-break, §4.1). The LFA inequality counts a tie as "may use E", so an LFA can fail Inequality 3 and still survive on the one flow shown.

Worked check (Example 1, fail E): D's LFA N is node-protecting (`10 < 20 + 10`), so the repair S→N→D survives in every mode (cost 25, also the final path). E is unreachable, as expected; N is not affected.

Worked check (Example 3, fail E, from S): C has no LFA (`dist(A,C)=3`, not `< 1+2`) and no PQ node, so with "LFA only" or "LFA + Remote LFA" C is dropped. TI-LFA's path S→A→B→C (cost 12) avoids E and survives.

Worked check (Example 6, `06-link-protecting.yaml`, fail E): S's only alternate N reaches D through E: `dist(N,D)=2` is not `< dist(N,E)+dist(E,D) = 1+1`. LFA only: broken at N; N finds N–E down and uses its own node-protecting LFA M, so traffic reaches D on S→N→M→D (cost 21, also the final path). TI-LFA: S's link-protection path S→N→E→D (`[PrefixSID(D)]` out via N) breaks at N; N's own TI-LFA path N→S→E→D sends it back to S with the same label, so it **loops**.

Worked check (ring S–E–C–B–A–S all 1, plus D on E (1) and C (4), fail E): Remote LFA tunnels to PQ node B, whose path to D is B→C→E→D: broken at C. C uses its LFA D, so traffic gets through on S→A→B→C→D (cost 7).

With a single failed link at most one router repairs and traffic never loops, and a TI-LFA repair that survives is always the PLR's final path: it is a shortest path without the first link, and it is still there with the others removed (property tests check both).

---

### 8.2 Every router as the DUT (Phase 9.6, D31)
`simulateAllSources()` runs `simulateFailure()` once per router with the same failed links and routers and mode, and counts each one's flows (`summarizeFlows()`). A failed router as source is listed as down (it sends nothing). The counts are over the affected flows, leaving out failed routers as destinations (`destDown`, counted on their own):
- `repaired` / `dropped` / `looped` / `unreachable`: the status of §8 step 5; they add up to `affected`. `relayed`: repaired, but by more than one router.
- `viaRouter`: affected flows that meet a failed router: their normal path passes one, or the PLR's planned backup does (D32). Of those, `survive` (the PLR's backup avoids every failed router), `breaks` (it passes one, §8.1) and `noBackup`. They add up to `viaRouter`. A flow that only crosses a failed link can still have a backup through a failed router, so it breaks and is counted; one whose backup avoids every failed router has nothing to do with them and is left out (the panel's "Backup vs down router" cell shows "–" for it).
- The per-DUT line adds "n meet(s) a down router:" before the survive / break part when `viaRouter` is not every affected flow, so the numbers are read against the right total.

These are the same numbers as the single-source failure panel for that router (a test checks every example, mode and single link or router failure).

Worked check (Example 1, source E, router S and link E–D down, LFA only): D (E→D) has no LFA (S: `dist(S,D)=20` is not `< 10+10`) and never meets S. N (E→D→N) is repaired by E with LFA S (`15 < 10+20`), but S is down: it breaks. Both are unreachable (E has no link left). Per-DUT line: `2 affected, 0 repaired, 2 unreachable; 1 meets a down router: 0 survive, 1 breaks`, and the panel says "S down: 1 destination affected, 0 repairs survive, 1 breaks".

Worked check (Example 6, fail router E, LFA only): from S, only D is affected; LFA N is link-protecting, breaks at N, and N repairs again via M (`1 affected, 1 repaired, 1 relayed; 0 survive, 1 breaks`). From N, D is affected and LFA M is node-protecting (dist(M,D)=10 < dist(M,E)+dist(E,D)=11+1), so it survives. From D, S and N are affected and LFA M survives for both (11 < 11+1). From M, nothing is affected: M-D, M-N and M-N-S (11 < 12) avoid E.

### 8.3 Packet walk of the simulated traffic (D35)
`flowWalk()` (`src/engine/packet-walk.ts`) shows the labels on each hop of a simulated flow, the one drawn in the failure view. The labels come from the simulation itself: each thing the packet carries (§8 step 3) has its MPLS label, and `simulateFailure()` records the stack each router sends (`Flow.repairLabels`, top first, before PHP) and where each repair happened (`RepairStep.atIndex`).
- The packet reaches S with D's Prefix-SID, as in §4.5.
- A Prefix-SID is a "forward to this router" step: D, a PQ node, a TI-LFA prefix segment, or the far end of a failed Adj-SID. A TI-LFA Adj-SID is an Adj-SID. The interface a backup leaves on (an LFA neighbor, the other ECMP member, a Remote LFA exit neighbor, TI-LFA's repair interface) has no label.
- So what each repair does to the stack: *ECMP* and *LFA* keep the labels and send to another neighbor; *Remote LFA* pushes the PQ node's Prefix-SID (an SR tunnel, not a targeted-LDP label); *TI-LFA* pushes its segment list in front of the active segment (RFC 9855 §6.1), or replaces a failed Adj-SID with a repair list ending in its far end's Prefix-SID (§6.2).
- PHP is applied on the hop actually sent: when the top label is the next router's own Prefix-SID, the sender pops it. With PHP off, that router pops its own label.
- The walk ends at D (delivered), where the packet is dropped (no backup, or the backup's own first link is down too), or where a loop closes. An *exact* loop is a router seeing the same labels again; otherwise (TTL cut, §8 step 3) the labels change each time round.
- When the PLR has no backup, the walk is S's normal path up to the PLR, then the drop. A failed router as D has no walk.
- `flowWalk()` throws if a router could not send what the simulation says (a forward that is not a normal next hop, an Adj-SID that isn't the router's own), so the property test also checks the simulation's labels.
- On the diagram, a link walked twice (a loop) shows the stack of its latest visit up to the current step.
- **After convergence:** `convergedWalk()` walks S's final path (§8 step 4) in the "Converge" step. Every router has run SPF again without the links that are down (failed links and every link of a failed router), so no backup is used: each router forwards on D's Prefix-SID, checked against the *new* distances, `c(R,next) + dist'(next,D) = dist'(R,D)`, with PHP before D. No walk when D can't be reached any more.

Worked check (Example 2, fail S–E and E–C, TI-LFA, to E): S gets 16002 (E) and pushes 16004 (B) → A pops 16004 (PHP) → B forwards 16002 → C finds C–E down and pushes 16003 (A) → B pops 16003 (PHP) → A forwards 16002 → S: the same packet as at the start, a loop.

Worked check, after convergence (Example 2, fail S–E, to E): S→A→B→C→E with 16002 only. S forwards to A because `1 + 3 = 4 = dist'(S,E)`; C pops 16002 (PHP). Total 4.

Worked check (Example 3, fail S–E and C–B, TI-LFA, to E): S sends 16004 24005 16002; A pops 16004; B's Adj-SID 24005 (B→C) is down, so B replaces it with 16005 (C) and sends back to A. A has seen this packet before with other labels: it goes round until TTL runs out.

## 9. Parallel links (Phase 9.4, D29)
Two routers may be joined by several links (a bundle). Each link has its own id (`S-E`, `S-E#2`, …), metrics and Adj-SIDs. Checked against RFC 5286 §3.4–3.6 on 2026-10-31.

- **SPF:** distances don't change; the cheapest link of a bundle counts. A link X→N is a **primary next-hop link** for D when N is a first hop and the link costs `dist(X,N)`. Two equal links give two primary links (ECMP); the costlier link of an unequal bundle is not primary.
- **One protection per primary link.** Every check about "link S–E" uses that link's own metric (§1.5).
- **LFA:** a candidate is an (outgoing link, neighbor) pair (RFC 5286 §3.6), so each link out of S except the protected one is a candidate. Another link L2 to E itself:
  - loop-free: `dist(E,D) < dist(E,S) + dist(S,D)`, always ✓ (E is on S's shortest path to D);
  - downstream: `dist(E,D) < dist(S,D)` ✓;
  - node-protecting: `dist(E,D) < dist(E,E) + dist(E,D)` ✗ always.
  So it protects the **link, not the node** (§3.6 steps 7–8). A node-protecting LFA through another router still wins (§2 order).
- **ECMP:** another equal link to E is another primary next hop, so an equal bundle is ECMP-protected.
- **Remote LFA:** P- and Q-space use the protected link's metric. A tunnel exit uses the neighbor's cheapest link; another link to E is never an exit (E would be an LFA, D17).
- **TI-LFA:** only the failed link is removed, so another link of the bundle stays in the post-convergence path. Path costs use the cheapest link still up. Every link direction has its own Adj-SID, so `AdjSID(B→C)` must name the link. The repair's outgoing interface (RFC 9855 §5) is S's cheapest remaining link to the first hop; with a bundle that is "the other link".
- **Forwarding (drawings and the simulation):** normal forwarding, Remote LFA exits and TI-LFA hops use the cheapest link, then the lowest link id. An LFA uses its own link, an ECMP member its link, an Adj-SID its link. One flow per destination (D22): if a bundle has two equal links, the flow uses the lowest-id one, and failing the other doesn't affect it.
- **Not modelled:** an Adj-SID for the whole bundle (RFC 8402 §3.4.1 adjacency sets), LAG members under one adjacency, hashing over equal links.

### Example 7 (`examples/07-parallel.yaml`)
S–E: two links, `S-E` (10) and `S-E#2` (20). E–D: two links, `E-D` and `E-D#2` (10 each). S–A 15, A–D 10.
Distances from S: E 10, A 15, D 20. `dist(A,E) = 20` (A-D-E), `dist(E,D) = 10`.

- **S → E, protect `S-E`:**
  - A over `S-A`: `dist(A,E)=20 < dist(A,S)+dist(S,E) = 15+10 = 25` ✓; downstream `20 < 10` ✗; cost 15+20 = 35.
  - E over `S-E#2`: `0 < 10+10` ✓; downstream `0 < 10` ✓; node-protecting ✗; cost 20+0 = 20.
  - **Best LFA: E over `S-E#2`** (link-protecting, downstream).
  - TI-LFA: post-convergence path S→E over `S-E#2` (20; S-A-D-E costs 35). The walk forces `AdjSID(S→E over S-E#2)` (label 24002); the clean-up drops it (first hop) → `[PrefixSID(E)]`, sent out on `S-E#2`.
- **S → D, protect `S-E`:** A: `10 < 15+20` ✓, downstream ✓, node-protecting `10 < 20+10` ✓, cost 25. E over `S-E#2`: ✓, ✓, ✗, cost 30. **Best LFA: A** (node-protecting beats the parallel link). TI-LFA S-A-D → `[PrefixSID(D)]`.
- **S → A, protect `S-A`:** E over `S-E` (cost 10+20 = 30) and E over `S-E#2` (cost 40) are two candidates, both loop-free, not downstream: **best E over `S-E`**. TI-LFA path S-E-D-A (30) → `[PrefixSID(D), PrefixSID(A)]`, 1 extra label.
- **E → D:** two primary links, `E-D` and `E-D#2`; each is ECMP-protected by the other.
- **Adj-SIDs of S:** A 24000, `S-E` 24001, `S-E#2` 24002. **Of E:** `E-D` 24000, `E-D#2` 24001, `S-E` 24002, `S-E#2` 24003.

Worked checks (failure simulation):
- Fail `S-E`, LFA only: E is repaired on S→E over `S-E#2` (cost 20), also the final path. D is repaired via A (S→A→D, 25).
- Source E, fail `E-D`: D is repaired by ECMP on `E-D#2` (cost 10). Fail `E-D#2` instead: D is not affected (its flow uses `E-D`). Fail both: dropped at E (the members are each other's backup, D25); after convergence E→S→A→D.
- Fail router E (from S, LFA only): E unreachable (expected); D's LFA A is node-protecting and survives.
- Ring of Example 3 with B–C as a bundle 12 (`B-C`) and 10 (`B-C#2`), fail S–E, D = E: post-convergence path S-A-B-C-E (13), segments `[PrefixSID(B), AdjSID(B→C over B-C#2), PrefixSID(E)]` = `16004, 24002, 16002`.

---

## 10. Compare view (TODO backlog, D36)
`compareBackups()` (`src/engine/compare.ts`) puts LFA, Remote LFA and TI-LFA for one (S, D, protected link S–E) side by side. It decides nothing new: each method's own rules (§2, §3, §4) pick the backup, and this lines up what each one does.

For each method it gives:
- **found / used:** whether the method has a backup, and whether it is the one the results table names (the simplest that protects, in the §5 order ECMP → LFA → Remote LFA → TI-LFA).
- **path and links:** LFA: S → N, then N's normal path to D. Remote LFA: S's tunnel to the PQ node (through the exit neighbor for extended P-space, D11), then the PQ node's normal path to D. TI-LFA: the post-convergence path (§4.1). The same paths the diagram draws (`src/engine/paths.ts`). Links name the link of a bundle (D29).
- **cost:** the metrics of the links walked. For LFA it equals `c(S,N) + dist(N,D)`; for Remote LFA the PQ node's cost (RFC 7490 §5.2.2) plus `dist(PQ,D)`; for TI-LFA the post-convergence cost.
- **labels S puts on the packet,** top first, before PHP: LFA adds nothing (D's own Prefix-SID only, 0 extra); Remote LFA puts the PQ node's Prefix-SID on top (LFA Lab is SR-MPLS, D35: 1 extra, or 0 when the PQ node is D); TI-LFA its segment list (§4.3).
- **vs final:** the path against S's path after reconvergence (the post-convergence path): `same` (same routers), `same-cost` (other path, equal cost) or `longer`. A backup is never cheaper: it avoids S–E, and the final path is the cheapest path without S–E. TI-LFA is always `same` (RFC 9855 §3).

**Remote LFA when an LFA exists:** a router only runs Remote LFA when there is no LFA (RFC 7490 §1), so `Protection.rlfa` has no chosen PQ node then (§3). The compare view still works out the tunnel from the same P- and Q-spaces, marked "not run here", because seeing both is the point. With ECMP, none of the three is used.

A property test (random networks, asymmetric metrics, bundles) checks that every path starts at S, ends at D, never crosses S–E or comes back through S, and costs what its links add up to; that no backup beats the final path; and that the LFA, PQ node, TI-LFA path and labels and the "used" method agree with the results.

Worked checks:

| Example | LFA | Remote LFA | TI-LFA |
|---|---|---|---|
| 1, S→D, link S–E | **used**: N, S-N-D, 25, `16004`, same | not run: PQ = N, S-N-D, 25, `16003 16004` | S-N-D, 25, `16004`, same |
| 2, S→E, link S–E | none | **used**: PQ = B, S-A-B-C-E, 4, `16004 16002`, same | S-A-B-C-E, 4, `16004 16002`, same |
| 3, S→E, link S–E | none | none (no PQ node) | **used**: S-A-B-C-E, 13, `16004 24005 16002`, same |
| 4, PE1→P1, link PE1–P1 | none | **used**: PQ = PE2 via P2, PE1-P2-P4-PE2-P3-P1, 50, **longer** than 40 | PE1-P2-P1, 40, `24000 16001`, same |

A case where the LFA is longer: S–E 1, E–D 1, S–N 5, N–D 1, S–M 1, M–N 1. M and N are both node-protecting LFAs; N is downstream (`1 < 2`) and M is not (`2 < 2` ✗), so N wins (D7): S-N-D costs 6, but after reconvergence S uses S-M-N-D (3).

### 10.1 With links or routers down (D37)
While anything is down, the compare view stops showing the plan and shows what the traffic really does. It runs the failure simulation (§8) once per repair mode (LFA only, LFA + Remote LFA, TI-LFA) and lines up the flow to the destination on the diagram. Nothing new is computed: each card is that mode's `Flow`.

Each card shows: delivered / dropped at X / loops at X / unreachable; the path taken (… when it loops); which routers repair, in order; the cost against the normal cost; the labels the first repairing router puts on; whether a down router breaks the planned backup (D27, with the same reason text as the failure panel); and the repair against the final path (`match`, judged at the PLR, §8 step 6), or "lost until the network reconverges". The path after convergence is the same in every mode, so it is shown once above the cards.

Worked checks:

| Failure | LFA only | LFA + Remote LFA | TI-LFA |
|---|---|---|---|
| Example 3, S→E, link S–E | dropped at S (no backup) | dropped at S | delivered S-A-B-C-E, 13, `16004 24005 16002`, same |
| Example 6, S→D, router E | delivered S-N-M-D, 21 (S, then N repair; S's LFA N breaks at E) | same as LFA only (an LFA exists) | loops S→N→S: the backup `[Prefix D]` out via N goes back through E |
| Example 4, PE1→P3, links PE1–P1 and P2–P4 | dropped at PE1 | delivered, 70, longer than 50 | delivered, 100 (PE1, P2, then PE1 again repair), longer than 50 |

Example 6 is the lesson: with a router down, link-protecting TI-LFA can do worse than plain LFA, because each router repairs only its own link (RFC 9855 §1). With `protection: node` (§4.4) TI-LFA delivers on S-N-M-D (21).

---

## 11. Per-link view (TODO backlog, D41)
`linkView()` (`src/engine/link-view.ts`) answers "if this link fails, whose traffic needs a repair, and how?". It decides nothing new: it regroups the results table (§5) by link.

For each direction X→Y of the link:
1. **Repairs:** Y is X's primary next hop over this link for D exactly when the link is one of `firstLinks(X, D)` (§1.4, D29). FRR is local repair (RFC 5286 §1, RFC 9855 §2): whoever sent the packet, X repairs it with its own backup for (D, X–Y). So each destination listed is one row of X's results table, and "how" is that row's simplest protecting method in the §5 order (ECMP, LFA, Remote LFA, TI-LFA, or none).
2. **Traffic from:** a router W ≠ D sends traffic to D over X→Y when some shortest path uses it, with the §1.5 test read as "uses it" on a tie:
   ```
   dist(W,X) + c(X→Y) + dist(Y,D) = dist(W,D)
   ```
   `c` is the metric of this one link of a bundle (D29). Such a W always gives a row in step 1 (shortest sub-paths are shortest, so X's own shortest path to D starts on this link), and X itself is always listed. A flow is one (W, D) pair.
3. **Counts:** destinations per method, and flows in total.

A link on no shortest path (the costlier link of a bundle, or Example 4's P1–P2) carries nothing either way: it can only be a backup.

Worked checks:

| Example, link | Direction | Destination: protected by, traffic from |
|---|---|---|
| 2, S–E | S→E | C: LFA A, from S · E: Remote LFA PQ B, from A, S (A-S-E = 2 < A-B-C-E = 3) |
| | E→S | A: LFA C, from E · S: Remote LFA, from C, E |
| 4, PE1–P1 | PE1→P1 | P1: Remote LFA PE2 via P2, from P2, P4, PE1 (P4-P2-PE1-P1 = 30 < P4→P1 = 40) · P3: Remote LFA, from P2, PE1 · PE2: ECMP, from PE1 |
| | P1→PE1 | P2: LFA P2, from P1, P3 · PE1: LFA P2, from P1, P3, PE2 (PE2's two paths tie at 30) |
| 7, S-E#2 | both | nothing: 20 > 10, only a backup |

A property test (random networks, with and without bundles) checks that the rows equal the repairing router's own rows for the link, and that (W, D) is listed exactly when the §1.5 test says some shortest path W→D uses the link.

---

## 12. Coverage heat map (TODO backlog, D42)
`coverageMap()` (`src/engine/heat-map.ts`) gives the §5 coverage numbers grouped two ways, so the canvas can colour each router and link by how well it is protected. It decides nothing new: it runs `computeForSource()` once per router (as "all sources" coverage does) and counts each (D, link S–E) pair twice.

- **Per router R:** the pairs R repairs as the router before a failed link (the PLR), i.e. R's own coverage row (§5). This is link protection, so it answers "if one of R's links fails, how much of R's traffic has a backup", not "what if R fails". In node mode (§4.4) the backups counted are the node-protecting ones where they exist.
- **Per link:** the pairs whose protected link is this one, both directions added up. Each is a row of the router before the link (FRR is local repair, §11), so the link's numbers are the per-link view's rows counted. A link on no shortest path has 0 pairs: it can only be a backup.

Every pair belongs to exactly one router and one link, so both groupings add up to the all-sources total.

**Share in a repair mode** (the simulation's modes): LFA (ECMP counts as LFA, §5), LFA or Remote LFA, or TI-LFA, over all pairs. The canvas buckets the exact fraction: 100% (✓), 75–99%, 50–74%, under 50%, and "–" for 0 pairs. The percentage is written on each router and link, so colour is never the only signal.

Worked checks:

| Example | LFA | LFA + Remote LFA | TI-LFA |
|---|---|---|---|
| 2, every router and every link | 2/4 = 50% | 4/4 | 4/4 |
| 3, link S–E (S repairs E, C; E repairs S, A, B) | 0/5 | 0/5 | 5/5 |
| 3, link C–B (metric 10) | – (0 pairs) | – | – |
| 3, router B | 4/4 | 4/4 | 4/4 |
| 7, link S-E#2 | – (0 pairs, only a backup) | – | – |

A property test (random networks, with and without bundles, both P-space settings) checks that each router's counts equal its coverage row, that the link counts add up to the total, and that a link's counts match the per-link view's rows.

---

## 13. What-if diff (TODO backlog, D43)
`whatIf(before, after)` (`src/engine/what-if.ts`) compares two versions of the network, in the app the same network with one link's metric changed. It decides nothing new: each side is the "all sources" coverage of §5, and each pair's method is the results table's `protectedBy` (§5).

- **Totals and per router:** the §5 counts of both sides, in total and for every router as the source. The UI shows each repair mode's share as "before → after" and the change in percentage points, e.g. "LFA 40% → 50% (+10 points)".
- **Per destination:** for each (source S, destination D), the list of D's pairs on each side: (primary link S–E, simplest method). If the lists differ (other links, or a method of another strength), the destination is listed:
  - strength follows the repair modes: LFA (ECMP counts as LFA) 3, Remote LFA 2, TI-LFA 1, none 0. ECMP ↔ LFA is not a change.
  - `better` / `worse`: the weakest pair's strength went up / down
  - `rerouted`: the primary links changed but the weakest strength did not
  - D with no pairs on one side (it can't be reached) is `rerouted`; a metric change never does this.
- The diff is about the plan on the full network, like the coverage report: links and routers failed in the simulation are not taken out.

Worked checks:

| Example, change | LFA | LFA + Remote LFA | TI-LFA | Destinations |
|---|---|---|---|---|
| 3, C–B 10 → 1 (gives Example 2) | 8/20 = 40% → 10/20 = 50% | 40% → 100% | 100% → 100% | 4 worse, 12 better, 2 rerouted. S→E: TI-LFA → Remote LFA (§6). B→A: LFA → Remote LFA (C is no longer loop-free: 2 = 1 + 1) |
| 2, S–E 1 → 3 | 50% → 50% | 100% → 80% | 100% → 100% | worse: A→C, B→A, B→C, B→E, B→S, C→A |

A property test (random networks, with and without bundles, both P-space settings, a random link given a random metric) checks that each side equals `computeCoverage()` in total and per router, that a router with no listed destination keeps its counts, and that swapping the sides swaps `better` and `worse`.

---

## 14. Max SID depth (TODO backlog, D44)
Hardware can only put so many labels on a packet. A router advertises this as its **Base MPLS Imposition MSD** (BMI-MSD, RFC 8491 §5). RFC 9855 §3 warns that a TI-LFA repair list can be too long for it. LFA Lab checks every TI-LFA repair against the MSD of the router that imposes it, S (the PLR).

- **Where it comes from:** `msdOf(topology, S)` = S's own `msd`, else the network's `msd`, else no limit. RFC 8491 also has a per-link MSD; LFA Lab models only the node value.
- **What counts:** labels imposed = labels swapped + labels pushed (RFC 8491 §1.1). S swaps D's own label and pushes the repair list, so the whole label stack of §4.3 counts: `depth = labelStack.length = extraLabels + 1`. For IP traffic S pushes all of them: the same number.
- **Too deep:** `depth > msd`. The repair is still worked out and shown (path, segments, labels) and marked `tooDeep`, but S can't install it:
  - it doesn't count as TI-LFA in coverage (§5); it is counted apart as `tooDeep`, so `tilfa + tooDeep` is the TI-LFA count with no limit
  - the results table's "protected by" skips it (`protectedBy` is `null` unless an ECMP, LFA or Remote LFA protects the pair), and so do the heat map (§12) and what-if diff (§13)
  - in the simulation's TI-LFA mode the router has no backup for that link: traffic is dropped with reason `too-deep` (§8)
  - an extra explain step gives the numbers: `3 labels (1 swapped + 2 pushed) > MSD 2 of S ✗`
- **Range:** 2 to 255. BMI-MSD is one octet (RFC 8491 §2). With 1, S couldn't even push a Remote LFA tunnel (PQ label + D's label), so LFA Lab doesn't model it; LFA and Remote LFA always fit.
- No limit (the default) changes nothing: every earlier result and worked example stays the same.
- The greedy walk of §4.2 does not try a shorter list when the first one is too deep. It already takes the furthest Prefix-SID it can at each step; a list with other segments or along another path is out of scope, and LFA Lab always repairs along the post-convergence path (§4.1).

Worked checks (Example 3, `msd: 2`):

| Pair | Label stack | Result |
|---|---|---|
| S → E over S–E | 16004, 24005, 16002 (3) | too deep, `protectedBy` = none |
| S → C over S–E | 16004, 24005, 16005 (3) | too deep |
| Whole network | | TI-LFA 14/20, too deep 6 (S: 4, A: 1, E: 1); LFA and Remote LFA unchanged (8/20) |
| `msd: 3` | | nothing is too deep: TI-LFA 20/20 |
| `msd: 3`, S `msd: 2` | | TI-LFA 16/20, too deep 4 (all S's) |
| Simulation, S–E down, TI-LFA mode | | traffic to C and E dropped at S, reason `too-deep` |

A property test (random networks, MSD 2 to 4) checks that `tilfa + tooDeep` equals the TI-LFA count with no limit, that the other counts don't change, and that a repair is `tooDeep` exactly when its stack is longer than the MSD.

---

## 15. LFA policy (TODO backlog, D45)
RFC 7916 §6.2 asks for "policy-based alternate selection": the operator decides which criteria count and how much. LFA Lab models the three knobs most often used:

| Knob | Where | Values | RFC 7916 |
|---|---|---|---|
| Node-protecting (Inequality 3) | `lfa_policy.node_protecting`, whole network | `prefer` (default), `require`, `ignore` | §6.2.2: node protection preferred, fall back to link protection |
| Downstream (Inequality 2) | `lfa_policy.downstream`, whole network | `prefer` (default), `require`, `ignore` | §6.2.3: preference for downstream "SHOULD be configurable" |
| Exclude a neighbor | `lfa_exclude: [B]` on router S | router ids | §6.2.4.4: "exclude a specific alternate" |

**How they change §2:**
- **Exclude:** every link from S to an excluded neighbor is skipped before any check, like a max-metric link (reason `excluded`). It is listed apart, not as a candidate.
- **`require`:** a loop-free candidate that fails the inequality is kept and shown with its numbers but marked `policyRejected` (`not-node-protecting` or `not-downstream`) and never chosen. If no candidate is left, there is no LFA, so Remote LFA is used (§3) as for any destination without an LFA.
- **`ignore`:** that step of the best-LFA order is skipped. The others keep their order: node-protecting → downstream → lowest cost → router ID → link id.
- **`prefer`:** the default order of §2. With both knobs on `prefer` and nothing excluded, every result is the same as before.
- **D = E:** node protection can't apply when the destination is the next-hop router itself (§4.4), so `require` doesn't rule anything out for it: RFC 7916 §6.2.2 falls back to link protection.

**What it doesn't change:**
- ECMP protection (§1.4): another primary next hop is normal forwarding, not an alternate, so an excluded neighbor still counts as an ECMP protector.
- Remote LFA and TI-LFA: RFC 7916 is about picking among LFAs. The RLFA tunnel exit and the TI-LFA post-convergence path ignore the policy. RLFA is only *used more often* when the policy leaves no LFA.
- The preference knobs are per network; only the exclude list is per router. RFC 7916 also lists SRLG, link colour and bandwidth criteria; they are not modelled.

**Explain steps:** a non-default policy adds a first step `S's LFA policy: node-protecting preferred, downstream required, never use A` (RFC 7916 §6.2); an excluded neighbor gives `Via A: skipped, S's policy never uses A as an alternate`; a ruled-out candidate gives `Via B: loop-free, but not downstream, and the policy requires downstream ✗` after its three inequality steps; with nothing left, `No LFA: the loop-free neighbors of S for D are ruled out by the LFA policy`.

**Effect line:** most networks give few choices, so a knob often changes nothing for a router. `lfaPolicyEffect()` compares one source's results without the policy (`withoutLfaPolicy()`) and with it, and lists each (D, protected link) whose chosen LFA changes. The properties panel shows it under the knobs for the source router, and under a router's exclude list for that router: `No effect for S: it picks the same LFAs as with the default policy.` or `Changes S's LFA for 2 destinations: D (N → none), M (E → none).` (Example 6, `node_protecting: require`).

### Worked example
```
A ─1─ E ─1─ D
 \    |     |
 10   10    11
   \  |     |
     S ──2── B
```
Links: S–E 10, E–D 1, S–A 10, A–E 1, S–B 2, B–D 11. S → D: `dist(S,D) = 11` via E (via A 12, via B 13).

| N | dist(N,D) | Loop-free | Downstream `< 11` | Node-protecting | Cost |
|---|---|---|---|---|---|
| A | 2 (A-E-D) | `2 < 10+11` ✓ | ✓ | `2 < dist(A,E)+dist(E,D) = 1+1` ✗ | 12 |
| B | 11 (B-D) | `11 < 2+11` ✓ | ✗ | `11 < 12+1` ✓ | 13 |

| Policy | Best LFA |
|---|---|
| default | **B** (node-protecting first) |
| `node_protecting: ignore` | **A** (downstream next) |
| both `ignore` | **A** (lowest cost 12) |
| `downstream: require` | **A** (B ruled out: not downstream) |
| `node_protecting: require` | **B** (A ruled out) |
| both `require` | none → Remote LFA |
| S `lfa_exclude: [B]` | **A** (B skipped) |
| S `lfa_exclude: [A, B]` | none → Remote LFA |
| `node_protecting: require`, S → E (D = E) | **A**: node protection doesn't apply to E itself |

Property tests (random networks and policies) check that the chosen LFA is always loop-free, passes every `require` and is never excluded; that `prefer` / `ignore` never change the LFA count and `require` only lowers it; and that the TI-LFA count never changes.

---

## 16. Overload bit (TODO backlog, D47)
An IS-IS router with the **overload bit** set (ISO 10589) tells the others not to send transit traffic through it, e.g. while it boots or during maintenance. It is still a destination, and it still forwards its own traffic. In YAML: `overload: true` on the router. Checked against RFC 5286 §3.5 and RFC 7490 §5.4 on 2026-11-01.

**SPF (§1):** an overloaded router is reached but never passed through: Dijkstra doesn't relax its links unless it is the root. Reverse SPF (§1.2) uses the same rule. So `dist(X,Y)` is the cheapest path with no overloaded router *inside* it; the ends may be overloaded. RFC 7490 §5.4: "normal link state routing takes into account the IS-IS overload bit".

**The inequalities.** With an overloaded router, `dist(X,M) + dist(M,Y)` is no longer the cost of a real path through M, because no router builds a path through M. So every right-hand side "path through M" counts as **∞** when M is overloaded and in the middle (`viaCost`, `linkPathCost` in `spf.ts`):

| Check | Right-hand side | ∞ when |
|---|---|---|
| §1.5 avoids link S→E | `dist(X,S) + c(S,E) + dist(E,Y)` | S overloaded and X ≠ S, or E overloaded and Y ≠ E |
| LFA loop-free (Inequality 1) | `dist(N,S) + dist(S,D)` | S overloaded: N never sends it back through S |
| LFA node-protecting (Inequality 3) | `dist(N,E) + dist(E,D)` | E overloaded and D ≠ E |
| P-space | `c(S,E) + dist(E,Y)` | E overloaded |
| Extended P-space | `dist(N,S) + dist(S,Y)` | S overloaded |
| Q-space | `dist(Y,S) + c(S,E)` | S overloaded |

The explain steps say so: `dist(N,D)=10 < dist(N,S)+dist(S,D) = ∞ (S has the overload bit: no transit through it) ✓`.

**Never a backup:**
- **LFA:** "if N_i has the overload bit set, then S MUST NOT consider using N_i as an alternate" (RFC 5286 §3.5). Its links are skipped with reason `overload`, even for N's own address (the RFC makes no exception).
- **Remote LFA:** never a tunnel exit (a repair "whose first hop has the overload bit set") and never a PQ node ("the PLR MUST NOT use a repair tunnel endpoint with the IS-IS overload bit set", RFC 7490 §5.4). An overloaded router can still be listed in P- and Q-space (S reaches it, it reaches E); it is left out of PQ and listed in `overloadedPq` for the explain step.
- **TI-LFA:** the post-convergence SPF follows the SPF rule, so an overloaded router is never inside the repair path; every prefix segment follows normal paths, which avoid it too. If the only path left goes through it, D is cut off: no TI-LFA.
- **ECMP:** unchanged. An overloaded router is only a primary next hop for its own address.

**Failure simulation (§8):** nothing new. Normal paths, backups and the converged SPF all follow the rules above.

**What-if (§13):** the what-if diff can also flip one router's overload bit and compare coverage before and after, every router as the source.

### Worked checks
- **Example 2, B overloaded:** `dist(A,C) = 3` (A-S-E-C; A-B-C would pass through B). B is still reached (`dist(S,B) = 2`) and B's own `dist(B,C) = 1`.
- **Example 1, N overloaded, S → D over S–E:** N is skipped as an LFA and as a tunnel exit. `P(S) = {N}` (`15 < 10+20`), `Q(E) = {D, N}`, but N is overloaded, so no PQ node. TI-LFA: the only path left, S-N-D, passes through N: D is cut off. With S–E down, the simulation shows D and E unreachable.
- **Kite N–S 1, S–E 1, E–D 1, N–D 10, S overloaded, S → D:** without the bit `dist(N,D) = 3` (N-S-E-D) and N is not loop-free (`3 < 1+2` ✗). With it, `dist(N,D) = 10 < ∞` ✓: N is an LFA (node-protecting, not downstream). TI-LFA: S-N-D, `[PrefixSID(D)]`.
- **Example 2, C overloaded, S → E:** extended P = {A, B, C}; Q(E) = {C} (B: `dist(B,E) = 3` via A-S-E, not `< 2+1`). C is overloaded: no PQ node.
- **Example 4, P1 overloaded (what-if):** pairs 35 → 31; LFA 27 → 13, LFA + Remote LFA 35 → 15, TI-LFA 35 → 21. 16 destinations worse, 2 rerouted.

Property tests (random networks, about one router in four overloaded, with and without bundles) check that `dist(X,Y) = min over X's links X→N with N = Y or N not overloaded of c(X,N) + dist(N,Y)`; that no drawn path, TI-LFA path or repaired flow (one failed link) has an overloaded router inside it; that no LFA, PQ node or exit is overloaded; that a chosen LFA's path never comes back through S; and that the packet walk of every TI-LFA repair works on normal tables.

---

## 17. Weakest spots (TODO backlog, D48)
`weakSpots(topology, mode)` (`src/engine/weak-spots.ts`) fails **each link and each router on its own** and counts, for every router as the source, the traffic that the routers' backups don't get through in that repair mode. It decides nothing new: the counts are the failure simulation's (§8, §8.2).

- **A flow** is (source W, destination D), D reachable from W. `flows` = all of them.
- For each link or router X: **affected** = flows whose normal path (the one the simulation draws, lowest-id ties) crosses X. Then, as in §8 step 5: `repaired`, `dropped`, `looped`, `unreachable` (cut off: no path is left at all). For a router, flows to the router itself (`destDown`) and from it are left out: no backup can save them (D27).
- **unprotected** = dropped + looped + unreachable. The list is sorted by unprotected, then affected (more first), then links before routers, then id.
- These are link failures *and* router failures, so they measure something the heat map (§12) does not: the heat map counts the pairs each router plans for its own links; this counts the traffic of every router that crosses the failure, and what really happens to it.

**How it is counted (speed).** One failure at a time, every router as the source, is `simulateAllSources` per link and router; on 200 routers / 600 links that took 13 s. Instead:
- Backups are planned once per router (`backupsAt`, cached per topology; they don't depend on what fails).
- **Links:** with one link down at most one router repairs and traffic never loops (§8). So a flow over link X→Y is `repaired` when X has a backup for (D, that link) in the mode (`hasBackup`: ECMP, then TI-LFA in TI-LFA mode unless too deep, else the LFA, else the PQ node in LFA + Remote LFA mode), `unreachable` when X's TI-LFA finds no path (X is cut off from D, and so is W, unless W has the overload bit, §16: then it is checked with an SPF), else `dropped`.
- **Routers:** only the flows whose path passes the router are followed, with the simulation's own hop-by-hop walk (`routerFailureCounts`). "Cut off" is a reachability search from the router before the failed one (W reaches D exactly when it does, since W reached it without the failure), not a full SPF of the reduced network.

A test checks every example, every mode, and random networks (with bundles and overloaded routers): each link's and router's counts equal `simulateAllSources` for that one failure, added up over the sources. 200 routers / 600 links takes about 2 s on a laptop (the speed test allows 4 s).

### Worked checks
| Network, mode | Weakest first |
|---|---|
| Example 3, LFA only | link A–S 12 of 12 dropped, link S–E 12 of 12, router S 8 of 8, link B–A 4 of 8, link E–C 4 of 8. C–B carries nothing. |
| Example 3, TI-LFA | nothing unprotected; ties: A–S 12, S–E 12, B–A 8, E–C 8, router S 8 affected |
| Example 6, TI-LFA | **router E**: 2 of 4 flows loop (the §8.1 lesson: link-protecting TI-LFA with a router down) |
| Example 6, LFA only | link E–D 5 of 8 dropped; router E: 0 of 4 (N's node-protecting LFA M takes over) |
| Example 1, N overloaded, TI-LFA | link E–D first: it cuts N off from E and S |

---

## 18. SRLG: links that fail together (Later #3, D53)
A **shared risk link group** (RFC 4202 §2.3) names a risk several links share: one fibre duct, one optical system, one line card. A link lists its groups (`srlg: [duct-1]`); two links share a risk when they have a name in common. Checked against RFC 9855 §1 and RFC 7916 §6.2.4.1 on 2026-11-01.

**Failing an SRLG** is the multi-failure of §8 with every link of the group down: the link form and the right-click menu have "Fail SRLG duct-1 (n links)". Nothing new in the simulation.

**SRLG protection** (`protection: srlg`, or `node-srlg` with node protection, §4.4). For the protected link S–E, the *shared links* are the other links with a group in common with S–E (both directions fail):
- **TI-LFA** (RFC 9855 §1: "a configured set of links sharing fate with the primary link has failed"): the post-convergence SPF also removes the shared links, and check (b) of §4.2 adds, for every shared link direction u→v, `dist(X,Y) < dist(X,u) + c(u,v) + dist(v,Y)` (a tie counts as "may use it", §1.5). A failed check names the link: `may use A-B of the same SRLG ✗`.
- **Fallback, one step at a time:** `node-srlg` tries node + SRLG, then node, then SRLG, then link; `srlg` tries SRLG, then link. The first that reaches D is installed; `protects` says which, and `fallback` why (`dest-is-next-hop` when only the node part was impossible because D = E, else `none`).
- **LFA** (RFC 7916 §6.2.4.1, the SRLG criterion): each candidate gets `srlgDisjoint`: its link S→N is not a shared link, and N's path to D avoids every shared link direction (same test). SRLG-disjoint candidates rank first, then the order of §2 / §15. A candidate that shares the SRLG is still an LFA (it protects the link alone).
- **Remote LFA:** the PQ node is chosen as in §3 / §3.1; then LFA Lab checks whether the tunnel (S's own path, or the exit link S→N and N's path to the PQ node) and the PQ node's path to D avoid every shared link. If so `protects` gains `srlg` (`srlg` or `node-srlg`), else it keeps `link` / `node` with `fallback: none`. RFC 7490 doesn't define SRLG-aware PQ selection, so the choice itself doesn't change.
- A link with no SRLG (or whose groups hold only itself) has no shared links: SRLG protection is the same as link (or node) protection, and `Protection.srlg` is not set.
- **Coverage** adds `srlg`: pairs whose link has shared links, and of those the ones whose LFA-or-Remote-LFA and TI-LFA backups avoid them all.

### Example 9 (`examples/09-srlg.yaml`)
S–E 1, E–D 1, S–A 1, A–B 1, B–D 1, S–C 3, C–D 3. S–E and A–B are in `duct-1`. S → D over S–E (cost 2):

| | A | C |
|---|---|---|
| Loop-free | `dist(A,D)=2 < 1+2` ✓ | `3 < 3+2` ✓ |
| Node-protecting | `2 < dist(A,E)+dist(E,D) = 2+1` ✓ | `3 < 4+1` ✓ |
| SRLG-disjoint | A's path A-B-D uses A–B ✗ | `3 < dist(C,A)+1+dist(B,D) = 4+1+1`, `3 < dist(C,B)+1+dist(A,D) = 4+1+2` ✓ |
| Cost | 3 | 6 |

- Link protection: LFA **A**; TI-LFA S-A-B-D, `[PrefixSID(B), PrefixSID(D)]` = `16004, 16006`. Fail the duct: S's LFA runs into A–B at A, which repairs again.
- SRLG protection: LFA **C**; TI-LFA with S–E and A–B removed: S-C-D (6), `[PrefixSID(D)]` = `16006`. Fail the duct: delivered on S-C-D by S alone.
- S → E with `node-srlg`: D = E, so SRLG only: S-C-D-E (7), `fallback: dest-is-next-hop`.
- With C–D also in `duct-1`, D can't be reached without the SRLG: link protection, `fallback: none`.
- Coverage from S: 2 SRLG pairs (D and E over S–E); 1 with an SRLG-safe LFA or Remote LFA (D's LFA C; E's PQ node B is reached over S-A-B), 2 with SRLG-safe TI-LFA.

A property test (random networks, random groups) checks that a TI-LFA repair marked `srlg` never uses a shared link and walks on normal tables, and that an SRLG-disjoint LFA's link and path avoid them.

---

## 19. Quiz mode (Later #4, D54)
`makeQuiz(topology, seed, count)` (`src/engine/quiz.ts`) asks about the network on screen. It decides nothing new: every question is one results-table row (S, D, protected link S–E) from `computeForSource()`, and its explanation is that row's explain steps, so the numbers are the ones the detail panel shows.

| Kind | Question | Right answer from |
|---|---|---|
| `loop-free` | Is neighbor N loop-free for D? | the candidate's Inequality 1 (§2) |
| `best-lfa` | Which neighbor does S pick as its LFA? | `lfa.best` (§2, §15), else "No LFA" |
| `method` | Simplest method that protects S → D? | `protectedBy` (§5): ECMP, LFA, Remote LFA, TI-LFA or nothing |
| `p-space` / `q-space` | Is Y in S's P-space / E's Q-space? | `rlfa.pSpace` / `rlfa.qSpace` (§3) |
| `pq-node` | Which PQ node does Remote LFA tunnel to? | `rlfa.best` when Remote LFA is needed, else "No PQ node" |
| `extra-labels` | How many labels does TI-LFA push on D's label? | `extraLabels`, "3 or more" from 3 (§4.2) |
| `label-stack` | Which stack does TI-LFA send? | `labelStack`, against the reversed stack and stacks with a label missing or doubled |

- **Seeded:** Park–Miller (as in D50) picks the source, the row, the kind and the order of the choices, so a seed always gives the same quiz and tests can pin it. The kinds take turns; a kind that doesn't fit the row (no LFA candidates, no TI-LFA path…) gives way to the next. No question is asked twice in one quiz.
- Uses the network's own settings (MSD, LFA policy, node or SRLG protection), so a quiz on Example 8 asks about node-protecting PQ nodes.
- Worked check: Example 2, P-space of S for link S–E, router B: `dist(S,B)=2 < c(S,E)+dist(E,B) = 1+2 = 3` ✓, answer "Yes".

A property test (random networks, random seeds) checks every answer against the engine, that choices are unique and that each question has an explanation.

---

## 20. LAN links / pseudonodes (Later #5, D55)
A broadcast LAN (an Ethernet segment with several routers) is, in IS-IS, a **pseudonode**: every member reaches it at its own metric, and it reaches every member at 0 (ISO 10589 §7.2.3). In YAML: `lans: [{ id: LAN1, metric: 10, members: [A, B, { node: C, metric: 20 }] }]`. Checked against RFC 5286 §3.6 on 2026-11-01.

**Model.** The engine keeps point-to-point maths: each pair of members gets a link `LAN1:A-B` with `c(A,B) = m_A` and `c(B,A) = m_B` (A → pseudonode → B costs `m_A + 0`). Distances, first hops and ECMP are exactly the pseudonode's, and no fake router enters any space, path or label stack. Adj-SIDs are per neighbor on the LAN (one per link, as RFC 8667 §2.2.2 LAN-Adj-SIDs). The canvas draws the pseudonode (a small square, not selectable) with one spoke per member; a path over `LAN1:A-B` lights A's spoke and B's spoke.

**What fails.** Protecting S's link to E on a LAN means S's *interface* to the LAN fails, so all of S's links on that LAN go down together (RFC 5286 §3.6: an alternate "across the same LAN" doesn't protect). The fate group of `LAN1:S-E` is S's other links on LAN1:
- **LFA:** a candidate over another link of the same LAN is skipped (reason `same-lan`). A candidate's own path may cross the LAN between other members: only S's interface is down. Inequality 1 already keeps N's path off S.
- **ECMP:** another primary next hop on the same LAN is not a protector.
- **Remote LFA:** P(S) also needs S's path to Y to avoid S's other LAN links (`dist(S,Y) < m_S + dist(R_j,Y)` for each member R_j); those links are never a tunnel exit. Q-space is unchanged (a path through S's interface goes through S).
- **TI-LFA:** the post-convergence SPF removes S's whole LAN interface, and check (b) of §4.2 adds S's other LAN links (both ways), as for an SRLG (§18). In node mode (§4.4) the failure is router E, so S's interface stays up.
- **Simulation:** the fail-link tool on a spoke fails the member's whole interface (all its LAN links); failing one LAN link by id fails only that adjacency.
- Every router plans for its own interface failing. Another member's interface failing (only its adjacencies go) is a different failure the plan doesn't cover; the simulation shows what then happens.

### Example 10 (`examples/10-lan-levels.yaml`), LAN part
LAN1 = {R2, R3, R4}, metric 10 each. R1–R2 10, R1–R3 10, R2–R3 15, R3–R4 30, R4–R5 10. R2 → R4 over `LAN1:R2-R4` (cost 10):
- R3 over `LAN1:R2-R3`: skipped, same LAN. (As three plain links it would win: cost 10 + 10 = 20.)
- R1 over R1–R2: `dist(R1,R4) = 20 < dist(R1,R2) + dist(R2,R4) = 10 + 10` ✗ (tie).
- R3 over R2–R3: `10 < 10 + 10` ✓, cost 25. **LFA = R3 over R2–R3.**
- TI-LFA with R2's interface down: R2 →(R2–R3, 15)→ R3 →(LAN, 10)→ R4 = 25. From R2, R3 fails (a) (`dist(R2,R3) = 10` over the LAN, path 15): `AdjSID(R2→R3 over R2-R3)`, dropped as the first hop. From R3, R4 passes. **`[PrefixSID(R4)]` = `16004`** out on R2–R3.
- Fail R2's interface (both its LAN links): LFA and TI-LFA deliver on R2-R3-R4 (25) in one repair.

---

## 21. Multi-level IS-IS (Later #5, D56)
IS-IS splits a network into Level-1 areas and a Level-2 backbone (ISO 10589 §7.2). Each level has its own adjacencies, its own SPF and its own FRR, so LFA Lab shows **one level at a time**. In YAML: a router's `level: 1 | 2 | 1-2` (left out = 1-2, FRR's default `is-type`) and `area: "49.0001"`; a link's `level: 1 | 2` (circuit type; left out = both); a LAN's `level` likewise.

`levelTopology(t, key)` (`src/engine/levels.ts`):
- **Level-2** (`2`): the L2-capable routers (not `level: 1`), the links between them that aren't `level: 1`, and the LANs that aren't `level: 1` with their L2-capable members.
- **Level-1 of area A** (`1:A`): the L1-capable routers of area A, the links between them that aren't `level: 2`. L1 adjacencies only form inside one area, so a link to another area is left out; a LAN keeps its members in A.
- A LAN left with fewer than two members in the level is dropped.

The sidebar's **IS-IS level** picker shows the levels (only when the network has levels or areas). Picking one makes that level the network on screen: every view (results, failure, coverage, heat map, what-if, weak spots, quiz) works on it unchanged. "Whole network, as one level" is the file as drawn, every adjacency in one SPF.

**Edits in a level** are merged back (`mergeLevel`): routers and links the view showed are replaced by their edited versions or removed; new ones are added; a LAN member's metric follows. Network settings come from the view, the name stays the network's. Export and Share always write the whole network. Switching level clears failures and starts the undo history afresh.

**Not modelled:** routes between levels (an L1 router's default route to the nearest attached L1/L2 router, ATT bit; route leaking), so destinations in other areas don't appear in a Level-1 view; LFA for inter-area prefixes (RFC 5286 §6.2); per-level metrics on one link (import them as two links with `level: 1` and `level: 2`).

Worked check (Example 10): Level-2 = {R2, R3, R4} with R2–R3, R3–R4 and LAN1 (R2, R3, R4); R2 → R4 gives the same LFA as above. Level-1 area 49.0001 = {R1, R2, R3} with R1–R2, R1–R3, R2–R3 and LAN1 (R2, R3). Level-1 area 49.0002 = {R4, R5} with R4–R5; LAN1 has only R4 there, so it is dropped.

---

## 22. Microloops (Later #6, D57)
FRR covers the moment right after a failure; then every router runs SPF and updates its table on its own time. While some routers use the new table and others the old one, traffic can go round between them for a moment: a **microloop** (RFC 5715 §1). `microloops(topology, failures)` (`src/engine/microloop.ts`) lists, per destination D, the loops some update order can make. It decides nothing new: old next hops are the normal tables, new ones the SPF without what is down (§8 step 4), both with the lowest-id tie-break of the drawings.

- **Each router R ≠ D** forwards on its old next hop or its new one. A router whose old next hop is over a failed link (or a failed router) is a **PLR**: until it updates, its FRR repair carries the traffic past the others' tables (TI-LFA's segments, RFC 9855 §1), so it has only its new next hop.
- **A loop** is a cycle that follows old and new next hops. Old ones alone never loop (SPF), nor new ones alone, so every loop needs some routers `updated` (on their new next hop) and some `waiting`. Found breadth-first from each router whose next hop changes, so loops are short; the same loop from another start is listed once, starting at its lowest id.
- **`plrEarly`:** a PLR is among the `updated`: it left its repair before the others had updated. Local convergence delay (RFC 8333, for a link going down) keeps the PLR on its repair until then, so such a loop doesn't form. Loops away from any PLR are not helped by it (RFC 8333 §3; ordered FIB updates, RFC 6976, would be).
- **UI:** "Microloops while the network converges" in the failure panel: the count of changed next hops, each loop (`To E: A → S → A, if S updates before A`), and whether local delay avoids it.

Worked checks:

| Network, failure | Loops |
|---|---|
| Example 2, S–E | to E: A → S → A (S updated, A waiting: A still goes A-S-E, 2 < 3); to S: C → E → C. Both through a PLR: avoided by local delay. |
| Example 1, S–E | to S: D → E → D (D still goes D-E-S, 20 < 25; E's new next hop is D). PLR E: avoided. |
| S–E 1, E–D 1, S–A 1, A–D 5; E–D fails | to D: A → S → A (S's new next hop A; A still goes A-S-E-D, 3 < 5). No PLR in it (E is the PLR): local delay doesn't help. |

A property test (random networks, one failed link) checks that every loop is a closed cycle of neighbors that never passes D and has a router that updated.

---

## 23. Flex-Algo (Later #6, D58)
A **Flexible Algorithm** (RFC 9350) is another SPF in the same network: its own metric and its own link constraints. Checked against RFC 9350 §5–§6 on 2026-11-01. YAML: `flex_algo: [{ algo: 128, metric: delay, exclude_any: [red] }]`; on links `affinity: [red]`, `te_metric`, `delay` (µs, both ways); on routers `algos: [128]` (participation, left out = all) and `algo_sids: { 128: 101 }`.

`flexTopology(t, algo)` (`src/engine/flex-algo.ts`) is the network the algorithm computes on:
- **Routers:** those that take part. Each gets its Prefix-SID for the algorithm (RFC 8667 §2.1: one per algorithm): `algo_sids`, else its index + 1000 × the algorithm's place in the list (128 first: +1000). Indices are checked unique over all algorithms, since they share the SRGB.
- **Links:** between taking-part routers, that pass the colour rules (exclude-any §6.2, include-any §6.4, include-all §6.5), and that have the metric (§5.1: a link without a TE metric or delay is left out of an algorithm on it). Their cost is that metric.
- **LANs** stay for the IGP metric only (no TE metric or delay on them here).
- Everything else (SRGB, MSD, LFA policy, protection goal) is the network's.

**FRR inside the algorithm:** RFC 9350 §6.1 says repair paths for a Flex-Algo prefix MUST use the same Flex-Algo. So LFA, Remote LFA, TI-LFA (and the simulation, coverage…) run unchanged on `flexTopology`. The sidebar's **Algorithm** picker makes it the network on screen, read-only (its metrics are not the IGP ones; moving routers still works).

### Example 11 (`examples/11-flex-algo.yaml`)
S–E 10 (delay 100, red), E–D 10 (100), S–A 10 (10), A–D 30 (10), S–B 15 (50), B–D 15 (50). Flex-Algo 128: delay, exclude red.
- Algorithm 0: S → D via E (20); LFA B (`15 < 15+20`, downstream, node-protecting); TI-LFA S-B-D `[16005]`.
- Algorithm 128: no S–E; S → D via A (20 µs). Protect S–A: B `50 < dist(B,S)+dist(S,D) = 50+20` ✓, node-protecting `50 < dist(B,A)+dist(A,D) = 60+10` ✓: **LFA B**. TI-LFA S-B-D (100): `[PrefixSID(D) in 128]` = 16000 + 1005 = **17005**.

A property test checks that a Flex-Algo on the IGP metric with no constraints gives algorithm 0's paths.

---

## 24. SRv6 (Later #6, D59)
TI-LFA computes the same repair on SRv6 as on SR-MPLS (RFC 9855 §7.2: "the TI-LFA path computation algorithm is the same"). Only the encoding differs: segments are IPv6 addresses (SIDs) from each router's **locator** (RFC 8986 §3.1). `dataplane: srv6` in YAML or "Data plane" in the topology properties.

- **Locator:** the router's `locator` (e.g. `fc00:0:1::/48`), else `fc00:0:<SID index in hex>::/48`. In a Flex-Algo view (§23) the locator comes from the algorithm's SID index, so each algorithm has its own (RFC 9350 §14).
- **End SID** (node segment, RFC 8986 §4.1) = locator + function 1: `fc00:0:4::1`.
- **End.X SID** (adjacency segment, §4.2) = locator + function 0x40 + the link's place among the router's links, in the Adj-SID order of D18 (by neighbor, then link id), so a bundle's links differ.
- **Repair list** = the segment list of §4.2 without the destination's own segment: D stays the inner packet's address (H.Encaps, RFC 8986 §5). An empty list means the outgoing interface is enough (the LFA case). The list is the same as SR-MPLS's; RFC 9855 §7.2 notes an End.X SID needs no node SID before it, which could save a SID, not modelled.
- **Max SID depth** counts the SIDs S pushes (RFC 9352 §4), not a label stack.
- The packet walk (§4.5) and the simulation's labels stay SR-MPLS; the detail panel says so.

Worked check (Example 3, `dataplane: srv6`, S → E): segments `[PrefixSID(B), AdjSID(B→C), PrefixSID(E)]` → **`[fc00:0:4::1, fc00:0:4::41]`** (B's links: to A first, then C, so B→C is 0x41). 2 SIDs: within an MSD of 2, where the 3-label SR-MPLS stack is too deep (§14).

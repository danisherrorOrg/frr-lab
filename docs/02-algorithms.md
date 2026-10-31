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

### 4.4 Node protection (v0.2)
Same as above, but remove node E (all its links) for the post-convergence SPF, and the avoid-check becomes "all normal shortest paths current→Y avoid node E":
```
dist(X,Y) < dist(X,E) + dist(E,Y)
```
If D == E, node protection doesn't apply (fall back to link protection).

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
A failed router E takes all its links down at once and its Prefix-SID stops working. The simulation treats it as "every link of E is down", so the hop-by-hop walk above is unchanged. E's neighbors only see their own link fail, so they use the **link-protecting** backup they built for that link; nobody plans for E itself (node protection is Later #1, §4.4).

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

Example 6 is the lesson: with a router down, link-protecting TI-LFA can do worse than plain LFA, because each router repairs only its own link (RFC 9855 §1; node protection is Later #1).

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

- **Per router R:** the pairs R repairs as the router before a failed link (the PLR), i.e. R's own coverage row (§5). This is link protection, so it answers "if one of R's links fails, how much of R's traffic has a backup", not "what if R fails" (node protection is Later #1).
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

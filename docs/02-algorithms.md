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

---

## 2. LFA (RFC 5286)
For S, destination D, primary next hop E, and every other neighbor N of S (other primary next hops count too: RFC 5286 §3.4):

| Name | Inequality | Meaning |
|---|---|---|
| **Loop-free** (Inequality 1) | `dist(N,D) < dist(N,S) + dist(S,D)` | N won't send the traffic back to S. **Required.** |
| **Downstream** (Inequality 2) | `dist(N,D) < dist(S,D)` | N is closer to D than S. Stronger: also prevents microloops between alternates. |
| **Node-protecting** (Inequality 3) | `dist(N,D) < dist(N,E) + dist(E,D)` | N's path to D avoids router E, so it survives E failing. |

**Link-protecting:** In the MVP, all links are point-to-point, so a loop-free N with N ≠ E never uses link S–E for its first hop. The check in §1.5 confirms N's path to D doesn't come back over S–E (Inequality 1 already implies this).

**Excluded neighbors:** skip N if the link S→N or N→S has the IS-IS maximum metric 16,777,215 (RFC 5286 §3.5).

**ECMP-protected:** another primary next hop for D that avoids link S–E (§1.4). With point-to-point links it is always downstream, so it is also an LFA candidate.

**Choosing the best LFA** (documented in `DECISIONS.md`, can be changed):
1. node-protecting before link-only
2. then downstream before not-downstream
3. then lowest `c(S,N) + dist(N,D)`
4. then lowest router ID

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

**PQ nodes** = (extended) P-space ∩ Q-space, excluding S and E.
S tunnels traffic to the PQ node, and the PQ node forwards it normally to E and then to D. **Which way the tunnel leaves S matters:**
- PQ node in plain P(S): the tunnel follows S's normal shortest path (it already avoids S–E).
- PQ node only in some neighbor's P(N): the tunnel must be **sent out through neighbor N** (S's own normal path to it may use S–E). Store that exit neighbor with the result.

**Choosing the PQ node:**
1. lowest repair cost: `dist(S,PQ) + dist(PQ,D)` for plain-P nodes, `c(S,N) + dist(N,PQ) + dist(PQ,D)` for extended-P nodes
2. then prefer plain-P-space nodes (no forced exit)
3. then lowest router ID

⚠️ Before coding, check the exact extended-P-space wording in RFC 7490 §5.2.1 and the Q-space rule in §5.3. Note the result in `DECISIONS.md`.

---

## 4. TI-LFA (Segment Routing): link protection

### 4.1 Post-convergence path
Remove link S–E (both directions) and run SPF from S. The shortest path to D is the **post-convergence path** (if there's a tie, pick one deterministically: lowest router IDs along the path).
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
- **Clean-up rule:** the outgoing interface is always the path's first hop N. If the first segment is `PrefixSID(N)` (the directly connected first-hop neighbor itself), **drop it**: sending out of that interface already gets there.
- So if the first hop N is already a valid LFA for D, the greedy walk gives `[PrefixSID(N), PrefixSID(D)]` → after clean-up `[PrefixSID(D)]` (zero extra labels).
- Typical results: 0 extra labels (LFA case), 1 (a PQ node exists), 2 (P and Q are adjacent: prefix-SID(P) + adj-SID(P→Q)), more in rare cases.

### 4.3 Label stack
- Prefix-SID label = SRGB base (default 16000) + router's SID index. The MVP assumes **every router uses the same SRGB**.
- Adj-SID label = value from the topology file, or an auto-assigned 24000+ number.
- Show the stack top-first, before any penultimate-hop popping (state this in the UI).

### 4.4 Node protection (v0.2)
Same as above, but remove node E (all its links) for the post-convergence SPF, and the avoid-check becomes "all normal shortest paths current→Y avoid node E":
```
dist(X,Y) < dist(X,E) + dist(E,Y)
```
If D == E, node protection doesn't apply (fall back to link protection).

---

## 5. Coverage numbers
For a source S: for every destination D ≠ S and every primary next-hop link S–E for D, record which methods protect it.
```
LFA coverage    = protected-by-LFA pairs / all pairs
RLFA coverage   = protected-by-(LFA or RLFA) pairs / all pairs
TI-LFA coverage = protected-by-TI-LFA pairs / all pairs   (should be 100% unless the network is partitioned)
```
"All sources" mode repeats this for every router as S and adds the numbers together.

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
- **PQ = {B, C}.** Repair costs: B = `dist(S,B)+dist(B,E) = 2+2 = 4`; C (extended, exit via A) = `c(S,A)+dist(A,C)+dist(C,E) = 1+2+1 = 4`. Tie → prefer plain-P node → **chosen PQ = B**. RLFA: tunnel to B, then B→C→E. (With plain P-space only, PQ = {B}.)
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
- RFC 8667 – IS-IS Extensions for Segment Routing.
- TI-LFA: IETF draft `draft-ietf-rtgwg-segment-routing-ti-lfa`. **Check whether it has been published as an RFC and update this link.**
- RFC 6571 – LFA applicability (good background on coverage in real topologies).

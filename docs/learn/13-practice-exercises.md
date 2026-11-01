# 13 · Practice exercises

Fifteen exercises, from easy to hard. For each one: work it out on paper first (appendix B has every formula), then open the example and check your answer in the app. The answer is hidden under each exercise.

## Easy

### 1. Is N loop-free?

Example 1 (S–E 10, E–D 10, S–N 15, N–D 10). S sends to D via E. Is N a loop-free alternate for D? Is it downstream?

[Open Example 1, row S → D](../../examples/01-square.yaml#source=S&dest=D&via=E)

<details>
<summary>Answer</summary>

Loop-free: `dist(N,D) = 10 < dist(N,S) + dist(S,D) = 15 + 20 = 35` ✓. Downstream: `10 < dist(S,D) = 20` ✓. Yes to both, and it is node-protecting too (`10 < dist(N,E) + dist(E,D) = 20 + 10`).

</details>

### 2. Distances from N

In Example 1, write `dist(N, X)` for every router X.

<details>
<summary>Answer</summary>

N 0, D 10, S 15, E 20 (N → D → E; N → S → E would be 25).

</details>

### 3. Which destinations have an LFA?

Example 2 (ring S – E – C – B – A – S, all metrics 1), source S. For each destination A, B, C and E, does S have an LFA?

[Open Example 2](../../examples/02-ring5.yaml#source=S)

<details>
<summary>Answer</summary>

- **A** (via A): neighbor E, `dist(E,A) = 2 < dist(E,S) + dist(S,A) = 1 + 1` ✗. No LFA.
- **B** (via A): neighbor E, `dist(E,B) = 2 < 1 + 2 = 3` ✓. LFA E.
- **C** (via E): neighbor A, `dist(A,C) = 2 < 1 + 2 = 3` ✓. LFA A.
- **E** (via E): neighbor A, `dist(A,E) = 2 < 1 + 1` ✗. No LFA.

2 of 4: 50%, the same for every router in the ring.

</details>

### 4. ECMP

In Example 5 (leaf-spine, all metrics 10), how many next hops does L1 have for L3, and is that destination protected?

[Open Example 5](../../examples/05-leaf-spine.yaml#source=L1)

<details>
<summary>Answer</summary>

Two (SP1 and SP2, both cost 20). Each protects the other: it is **ECMP-protected**, no backup needed.

</details>

### 5. Prefix-SID labels

In Example 4, the routers' SID indices are PE1 11, P1 1, P2 2, P3 3, P4 4, PE2 12. What is PE2's Prefix-SID label?

<details>
<summary>Answer</summary>

16000 + 12 = **16012**.

</details>

## Medium

### 6. P-space and Q-space

Example 2, source S, link S–E. Work out plain P(S), extended P-space, Q(E) and the PQ nodes. Which PQ node is chosen?

[Open Example 2, row S → E](../../examples/02-ring5.yaml#source=S&dest=E&via=E)

<details>
<summary>Answer</summary>

P(S) = {A, B}; extended adds C (via A) = {A, B, C}; Q(E) = {B, C}; PQ = {B, C}. Chosen: **B** (cost 2; C costs 3 via A).

</details>

### 7. No PQ node

Example 3 is Example 2 with B–C = 10. Explain in one sentence why Remote LFA fails for S → E.

[Open Example 3, row S → E](../../examples/03-ring5-highmetric.yaml#source=S&dest=E&via=E)

<details>
<summary>Answer</summary>

P-space is {A, B} and Q-space is {C}: they share no router, because the only link between them, B–C, costs 10 and no shortest path uses it.

</details>

### 8. TI-LFA labels

Give the TI-LFA label stack (top first) for S → E in Example 2, and in Example 3.

<details>
<summary>Answer</summary>

Example 2: **16004, 16002** (B, then E). Example 3: **16004, 24005, 16002** (B, the Adj-SID B→C, then E).

</details>

### 9. The packet at A

In Example 3's TI-LFA repair, which labels does A receive and which does it send (PHP on)?

<details>
<summary>Answer</summary>

Receives `16004 24005 16002`. The next router is B, the end of B's segment, so A pops 16004 and sends `24005 16002`.

</details>

### 10. Asymmetric metrics

Example 4, source PE1. Which destination is ECMP-protected, and which one has an LFA only because P1–P4 costs 20 one way and 40 the other?

[Open Example 4](../../examples/04-isp-core.yaml#source=PE1)

<details>
<summary>Answer</summary>

PE2 is ECMP-protected (via P1 and via P2, both 30). P4 (primary via P2) has the LFA P1: `dist(P1,P4) = 20 < dist(P1,PE1) + dist(PE1,P4) = 10 + 20 = 30` ✓, thanks to the direct link's 20. If that direction cost 40 too, P1's best path to P4 would cost 30, a tie with the path back through PE1, and P1 would not be loop-free.

</details>

## Hard

### 11. Node-protecting Remote LFA

Example 8 (S–E 2, S–N 2, E–B 1, E–D 2, N–B 3, B–C 3, C–D 3). The link-protecting PQ node for S → D is B. Why isn't it node-protecting, and which PQ node is?

[Open Example 8, row S → D](../../examples/08-node-protection.yaml#source=S&dest=D&via=E)

<details>
<summary>Answer</summary>

B's path to D is B → E → D: `dist(B,D) = 3 < dist(B,E) + dist(E,D) = 1 + 2` ✗. C passes: tunnel via N avoids E (`6 < 4 + 4`) and C's path to D avoids E (`3 < 4 + 2`). **C**, cost 8, repair S → N → B → C → D (11).

</details>

### 12. When TI-LFA loops

Example 6, fail router E, TI-LFA mode, traffic from S to D. What happens, and what setting fixes it?

[Open Example 6 with router E down](../../examples/06-link-protecting.yaml#source=S&dest=D&via=E&down=E&mode=tilfa)

<details>
<summary>Answer</summary>

S's link-protecting repair (`[PrefixSID(D)]` via N) goes through E. N finds N–E down and repairs back through S: the packet **loops** S → N → S. With **Node failure** protection, TI-LFA avoids E and delivers on S → N → M → D (21).

</details>

### 13. SRLG

Example 9, S → D. With link protection the LFA is A. Why does SRLG protection pick C, and what TI-LFA repair does it install?

[Open Example 9, row S → D](../../examples/09-srlg.yaml#source=S&dest=D&via=E)

<details>
<summary>Answer</summary>

A's path to D is A → B → D, and A–B is in `duct-1` with S–E. C's path avoids the duct, and SRLG-disjoint LFAs rank first. TI-LFA removes S–E and A–B: S → C → D, `[PrefixSID(D)]` = 16006.

</details>

### 14. Parallel links

Example 7, S → A, protect link S–A. Which LFA is chosen, and what is the TI-LFA repair?

[Open Example 7, row S → A](../../examples/07-parallel.yaml#source=S&dest=A&via=A)

<details>
<summary>Answer</summary>

Two candidates, E over `S-E` (cost 10 + 20 = 30) and E over `S-E#2` (cost 40); both loop-free, not downstream. **E over `S-E`** (cheaper). TI-LFA: path S → E → D → A (30), `[PrefixSID(D), PrefixSID(A)]` = 16003, 16004: one extra label.

</details>

### 15. Design: one metric to fix the ring

Example 3 has 40% LFA and 40% LFA-or-Remote-LFA coverage. Which single metric change gives 100% with Remote LFA? Check it with **What-if: change a metric**. Then, in Example 2, what does raising S–E to 3 do?

<details>
<summary>Answer</summary>

Set **C–B to 1** (this turns it into Example 2): LFA 40% → 50%, LFA or Remote LFA 40% → 100%. In Example 2, S–E = 3 lowers LFA or Remote LFA from 100% to 80%: six destinations get worse.

</details>

## Keep going

- Press **🎓 Quiz** on any network for ten new questions with the reasoning.
- **Generate…** a random mesh, guess its LFA coverage, then open the Coverage report.
- Pick a network from your work, import it with **Import FRR…**, and run **Weakest spots**.

Next: [Appendix A · Glossary](appendix-a-glossary.md)

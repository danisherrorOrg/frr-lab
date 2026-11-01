# 10 · Design checks

So far we've looked at one row at a time. An engineer wants the whole picture: *how well is this network protected, where are the gaps, and what change would fix them?* LFA Lab has a tool for each question.

## Coverage report: how much is protected?

The **Coverage report** counts pairs (destination D, primary link S–E), for one source or for every router, and shows the share each method protects:

```
LFA coverage    = pairs protected by LFA (or ECMP) / all pairs
RLFA coverage   = pairs protected by LFA or Remote LFA / all pairs
TI-LFA coverage = pairs protected by TI-LFA / all pairs
```

It also lists every pair LFA doesn't protect, with a reason: `no-lfa` (Remote LFA or TI-LFA saves it), `no-rlfa` (only TI-LFA does), `partitioned` (nothing can: the link is the only way to D). Export the list as CSV.

Example 3, every router as the source: LFA 8/20 = 40%, LFA or Remote LFA 40%, TI-LFA 20/20 = 100%.

## Heat map: where are the gaps?

**Coverage heat map** in the sidebar colours each router and link by the share of its pairs protected in a repair mode: green 100%, then amber, orange, red under 50%. The percentage is written on each one, so colour isn't the only signal.

- **On a router R:** of the pairs R repairs (R's own links failing), how many have a backup.
- **On a link:** of the pairs that would need a repair if this link failed, how many have one. A link on no shortest path shows "–": it's only ever a backup (e.g. B–C in Example 3).

## Per-link view: what does this link carry?

Right-click a link → **🔍 What uses this link?** For each direction it lists the destinations whose traffic crosses it, which routers send that traffic, and how each is protected. Example 2, link S–E, direction S→E: C is protected by LFA A (traffic from S), E by Remote LFA via B (traffic from A and S).

## Weakest spots: which single failure hurts most?

**Weakest spots** fails every link and every router on its own, follows all traffic of every source through the simulation, and ranks them by how many flows are lost (dropped, looped, or cut off).

| Network, mode | Weakest first |
|---|---|
| Example 3, LFA only | link A–S and link S–E: 12 of 12 flows dropped each |
| Example 3, TI-LFA | nothing unprotected |
| Example 6, TI-LFA | **router E**: 2 of 4 flows loop (chapter 9) |

This counts router failures too, so it finds problems the coverage numbers can't show.

## What-if: try a change before making it

**What-if: change a metric** compares coverage before and after a new metric on one link, for every router as the source, and lists each destination that gets better or worse.

Example 3, change C–B from 10 to 1 (which gives Example 2):

| | Before | After |
|---|---|---|
| LFA | 8/20 = 40% | 10/20 = 50% |
| LFA or Remote LFA | 40% | 100% |
| TI-LFA | 100% | 100% |

One metric change makes Remote LFA cover the whole ring, so routers without SR are fully protected. Changes can also make things worse: in Example 2, raising S–E from 1 to 3 drops "LFA or Remote LFA" from 100% to 80%.

**What-if: overload a router** does the same for setting a router's overload bit.

## LFA policy: which LFA to pick

When S has several LFAs, the choice is a policy (RFC 7916). LFA Lab has three knobs under **LFA policy (RFC 7916)** in the topology and router settings:

- **Node-protecting LFAs:** prefer (default), require, or ignore.
- **Downstream LFAs:** prefer (default), require, or ignore.
- **Never use as LFA:** per router, a list of neighbors to skip.

A small network to try them on (paste it into **YAML format → checker**, then load it):

```yaml
name: LFA policy
nodes:
  - { id: S, sid: 1, pos: { x: 100, y: 200 } }
  - { id: E, sid: 2, pos: { x: 200, y: 0 } }
  - { id: A, sid: 3, pos: { x: 0, y: 0 } }
  - { id: D, sid: 4, pos: { x: 400, y: 0 } }
  - { id: B, sid: 5, pos: { x: 400, y: 200 } }
links:
  - { a: S, b: E, metric: 10 }
  - { a: E, b: D, metric: 1 }
  - { a: S, b: A, metric: 10 }
  - { a: A, b: E, metric: 1 }
  - { a: S, b: B, metric: 2 }
  - { a: B, b: D, metric: 11 }
```

S → D goes via E (`dist(S,D) = 11`). Two LFAs:

| N | dist(N,D) | Loop-free | Downstream (`< 11`) | Node-protecting | Cost |
|---|---|---|---|---|---|
| A | 2 (A-E-D) | `2 < 10 + 11` ✓ | ✓ | `2 < 1 + 1` ✗ | 12 |
| B | 11 (B-D) | `11 < 2 + 11` ✓ | ✗ | `11 < 12 + 1` ✓ | 13 |

| Policy | Best LFA |
|---|---|
| default | **B** (node-protecting first) |
| node-protecting: ignore | **A** (downstream next) |
| downstream: require | **A** (B is not downstream) |
| both: require | none → Remote LFA |
| S never uses B | **A** |

## Max SID depth

**Max SID depth** in Topology settings (or per router) flags TI-LFA repairs whose label stack is too deep for the hardware. In Example 3 with MSD 2, six pairs become "too deep": TI-LFA coverage falls from 20/20 to 14/20.

## Overload bit

A router with the overload bit is never used for transit, never an LFA, never a PQ node. Example 1 with **N overloaded**: S → D has no LFA (N is skipped), no PQ node, and no TI-LFA either, because the only other path, S → N → D, passes through N. Tick **Overload bit (no transit)** on the router or try it first with **What-if: overload a router**.

> **Try it in LFA Lab**
>
> - [Open Example 3](../../examples/03-ring5-highmetric.yaml#source=S). Open the **Coverage report** for every router, then set **Coverage heat map** to LFA.
> - Open **What-if: change a metric**, pick link C–B and try metric 1.
> - Open **Weakest spots** and switch the repair mode between LFA and TI-LFA.
> - [Open Example 6](../../examples/06-link-protecting.yaml#source=S) and run **Weakest spots** in TI-LFA mode: router E comes first.

## Check yourself

1. What does "–" on a link in the heat map mean?
2. Why can Weakest spots find problems the coverage report misses?
3. In the policy network, which LFA does S pick with the default policy, and why?

<details>
<summary>Answers</summary>

1. No pair uses that link as its primary link: no shortest path crosses it, so it can only be a backup.
2. Coverage counts single-link repairs as planned. Weakest spots also fails whole routers and follows the real traffic, so it finds link-protecting backups that break or loop.
3. B: it's the only node-protecting LFA, and node-protecting comes first in the default order. A is downstream and cheaper, but its path goes through E.

</details>

Next: [11 Advanced topics](11-advanced-topics.md)

# Appendix D · Examples index

Every built-in example (in the app: **Examples…**), what it teaches and where the guide uses it.

| # | Example | Teaches | Open | Chapters |
|---|---|---|---|---|
| 1 | Square: LFA works | SPF, a node-protecting downstream LFA, a 0-label TI-LFA repair | [Open](../../examples/01-square.yaml#source=S&dest=D&via=E) | [2](02-shortest-paths.md), [3](03-when-a-link-fails.md), [4](04-lfa.md) |
| 2 | Ring: Remote LFA works | No LFA in a ring, P / Q / PQ, a 1-label TI-LFA repair, microloops | [Open](../../examples/02-ring5.yaml#source=S&dest=E&via=E) | [4](04-lfa.md), [5](05-remote-lfa.md), [6](06-segment-routing.md), [7](07-ti-lfa.md) |
| 3 | Ring, high metric: TI-LFA needs an Adj-SID | No PQ node, Adj-SID repair, MSD, SRv6 | [Open](../../examples/03-ring5-highmetric.yaml#source=S&dest=E&via=E) | [5](05-remote-lfa.md), [7](07-ti-lfa.md), [10](10-design-checks.md), [11](11-advanced-topics.md) |
| 4 | Small ISP core | Asymmetric metrics, ECMP, extended P-space, Remote LFA longer than the final path | [Open](../../examples/04-isp-core.yaml#source=PE1&dest=P1&via=P1) | [1](01-isis-basics.md), [8](08-comparison.md) |
| 5 | Leaf-spine fabric | ECMP everywhere, a PQ leaf | [Open](../../examples/05-leaf-spine.yaml#source=L1&dest=SP1&via=SP1) | [2](02-shortest-paths.md) |
| 6 | Link-protecting LFA: breaks when E fails | Link vs node protection, router failure, TI-LFA loops | [Open](../../examples/06-link-protecting.yaml#source=S&dest=D&via=E&down=E) | [4](04-lfa.md), [9](09-router-and-multiple-failures.md), [10](10-design-checks.md) |
| 7 | Parallel links: bundles S–E and E–D | A parallel link as an LFA, ECMP bundles | [Open](../../examples/07-parallel.yaml#source=S&dest=E&via=E) | [11](11-advanced-topics.md) |
| 8 | Node protection: avoid the next-hop router | Node-protecting Remote LFA (RFC 8102) and TI-LFA | [Open](../../examples/08-node-protection.yaml#source=S&dest=D&via=E) | [5](05-remote-lfa.md), [7](07-ti-lfa.md) |
| 9 | SRLG: one duct, two links | SRLG-disjoint LFA, SRLG-protecting TI-LFA | [Open](../../examples/09-srlg.yaml#source=S&dest=D&via=E) | [9](09-router-and-multiple-failures.md) |
| 10 | LAN and IS-IS levels | LAN interface failure, Level-1 and Level-2 views | [Open](../../examples/10-lan-levels.yaml#source=R2&dest=R4&via=R4) | [11](11-advanced-topics.md) |
| 11 | Flex-Algo: low delay, avoid red | FRR inside a Flex-Algo | [Open](../../examples/11-flex-algo.yaml#source=S&dest=D&via=E) | [11](11-advanced-topics.md) |

## Example files

The files are in `examples/` in the repository, in the format the **YAML format** button describes. Each file starts with comments giving the expected results.

## "Try it" links

A "Try it" link in this guide loads an example and can also pick a row and fail things. The part after `#` says what:

| Part | Meaning | Example |
|---|---|---|
| `source=S` | source router | `source=PE1` |
| `dest=D&via=E` | open the row for destination D over primary next hop E | `dest=E&via=E` |
| `fail=A-B,C-D` | fail these links (by link id) | `fail=S-E` |
| `down=E` | take these routers down | `down=E` |
| `mode=lfa` | repair mode in the simulation: `lfa`, `rlfa` or `tilfa` | `mode=tilfa` |

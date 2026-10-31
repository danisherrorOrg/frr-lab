# 01 – Requirements

## 1. Goals
1. **Teach:** make LFA / RLFA / TI-LFA easy to understand by showing the numbers behind every decision.
2. **Check:** let an engineer see how well a topology is protected and where the gaps are.
3. **Be correct:** results must match the RFC rules. Every algorithm has tests built from hand-checked examples.
4. **Be free and easy:** runs in the browser, no login, no server, works offline after the first load.

## 2. Users and their main tasks
| User | Main task | What "done" looks like |
|---|---|---|
| Student | "Why does this ring have no LFA?" | Sees the failed inequality with real numbers, then the RLFA / TI-LFA fix |
| Network engineer | "Which destinations aren't protected if I keep plain LFA?" | Coverage report listing unprotected (source, destination, link) |
| Interview candidate | "Show me the TI-LFA label stack for this failure" | Segment list + label values for the repair path |

## 3. Terms used everywhere
| Term | Meaning |
|---|---|
| **S** | Source: the router computing the backup (the "point of local repair") |
| **D** | Destination router (MVP: each router's loopback is a destination) |
| **E** | Primary next hop of S towards D |
| **N** | Some other neighbor of S (a candidate LFA) |
| `dist(X,Y)` | Shortest-path cost from X to Y in the normal (not failed) network |
| **Protected element** | The link S–E (link protection) or the node E (node protection) |
| **Post-convergence path** | The path S will use to reach D once the network has fully reacted to the failure |
| **Prefix-SID / Node-SID** | Segment Routing label for "go to router X by the shortest path" |
| **Adj-SID** | Segment Routing label for "go out of this exact link" |
| **SRGB** | Label range for prefix-SIDs. Default 16000–23999, so label = 16000 + index |

## 4. Features

### MVP (v0.1)
**F1 – Topology editing**
- Add / move / delete routers; add / delete links.
- Each router: name, prefix-SID index.
- Each link: metric (same both ways by default, with the option of a different metric per direction), optional Adj-SID label per direction.
- (v0.2, Phase 9.4) Two routers may have several links (parallel links); each link is protected, drawn and failed on its own.
- Undo / redo.

**F2 – Import / export**
- Load and save topology as YAML (format in `03-architecture.md`).
- 4–5 built-in example topologies (square, ring, ring with a high-metric link, a small ISP core, a leaf-spine).
- Share by URL: topology encoded and compressed in the link.

**F3 – Computation (per selected source S)**
- Shortest paths to all destinations, with ECMP.
- For each destination and each primary next hop:
  - **LFA:** all candidates, labelled *link-protecting*, *node-protecting*, *downstream*. Best one picked by a documented rule.
  - **RLFA:** P-space, extended P-space, Q-space, PQ nodes, chosen PQ node.
  - **TI-LFA (link protection):** post-convergence path, segment list, label stack.
- ECMP: if a destination has 2+ primary next hops, each one protects the other (shown as "ECMP-protected").

**F4 – Visual results**
- Results table: destination · primary next hop(s) · cost · LFA · RLFA · TI-LFA · status (✓ / ✗).
- Click a row: primary path in blue, backup path in orange dashed, P-space / Q-space nodes shaded, PQ node marked.

**F5 – Failure simulation**
- "Fail" a link (click it). Traffic for affected destinations moves along the backup path (animated). Then a "Converge" button shows the final path after the network recomputes.
- Shows whether the repair path equals the post-convergence path (it always does for TI-LFA, and not always for LFA).
- (v0.2, Phase 9.3) "Fail" a router: all its links go down at once. Shows which link-protecting backups survive and which break because they go through it, with the reason and real numbers.

**F6 – Coverage report**
- For the chosen source, or for **all sources**: percentage of (destination, protected link) pairs covered by LFA / RLFA / TI-LFA.
- List of unprotected pairs. Export as CSV.

**F7 – Explain mode**
- For any result, show the steps with the actual numbers:
  `N=A: dist(A,D)=2 < dist(A,S)+dist(S,D)=1+1=2 → ✗ (not loop-free)`.
- Short "why it matters" text per rule, with links to the RFC section.

### Later (v0.2+)
- **Node protection** for RLFA and TI-LFA (post-convergence path with node E removed).
- **SRLG** (shared-risk link groups): links that fail together.
- Import from FRR / Junos / IOS-XR `show isis database detail` output.
- Broadcast (LAN) links and pseudonodes.
- IS-IS multi-level (L1/L2) and multiple areas.
- Microloop view: show possible temporary loops during convergence.
- Flex-Algo, SRv6 (SIDs as IPv6 addresses).
- Quiz mode for students ("which neighbor is a valid LFA?").

## 5. Not doing (non-goals)
- Talking to real routers or configuring anything. **Read-only and offline only.**
- Simulating real packet forwarding or timing (convergence times, BFD timers).
- OSPF-specific details (the maths is the same, so OSPF users can still use it, but the wording is IS-IS).
- Accounts, a backend, a database.

## 6. Quality requirements
| Area | Requirement |
|---|---|
| Correctness | Every algorithm covered by unit tests; the 3 worked examples in `02-algorithms.md` are fixed tests |
| Speed | Up to 200 routers / 600 links: all-sources coverage in < 2 s in a laptop browser (run in a Web Worker so the UI doesn't freeze) |
| Usability | First-time user gets a result in < 30 s from loading an example |
| Accessibility | Keyboard usable; colors aren't the only signal (use line styles + icons too); works in light and dark mode |
| Offline | Static files only; after first load it works without internet |
| Licence | MIT |

## 7. Success after launch
- Live public link + GitHub repo with a demo GIF.
- A blog / LinkedIn post: "TI-LFA explained with pictures".
- 50+ GitHub stars or real feedback from network engineers or students (stretch goal).

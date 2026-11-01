# Appendix A · Glossary

| Term | Meaning | Chapter |
|---|---|---|
| **Adj-SID** | Segment Routing label meaning "go out of this exact link". Local to the router that owns the link. | [6](06-segment-routing.md) |
| **All routers / DUT** | Device under test: the router whose results are shown. "All routers" shows every router as the DUT. | [12](12-using-lfa-lab.md) |
| **BFD** | Bidirectional Forwarding Detection: fast hello packets that detect a dead link in tens of ms. | [3](03-when-a-link-fails.md) |
| **Convergence** | The network reacting to a change: detect, flood, SPF, install. | [3](03-when-a-link-fails.md) |
| **Coverage** | Share of (destination, primary link) pairs a method protects. | [8](08-comparison.md), [10](10-design-checks.md) |
| **`c(X,Y)`** | Metric of the link X→Y. | [0](00-start-here.md) |
| **`dist(X,Y)`** | Cost of the cheapest path X → Y in the normal network. | [2](02-shortest-paths.md) |
| **Downstream** | N is closer to D than S: `dist(N,D) < dist(S,D)`. | [4](04-lfa.md) |
| **ECMP** | Equal-Cost Multi-Path: two or more best paths of the same cost. Each protects the other. | [2](02-shortest-paths.md) |
| **End / End.X SID** | SRv6 node and adjacency segments, IPv6 addresses from the router's locator. | [11](11-advanced-topics.md) |
| **Extended P-space** | P(S) plus the P-spaces of S's other neighbors. | [5](05-remote-lfa.md) |
| **Flex-Algo** | A second SPF in the same network with its own metric and link rules (RFC 9350). | [11](11-advanced-topics.md) |
| **FRR** | Fast Reroute: a pre-computed backup used the moment a failure is detected. | [3](03-when-a-link-fails.md) |
| **IS-IS** | A link-state routing protocol; every router has the whole map. | [1](01-isis-basics.md) |
| **Label stack** | MPLS labels on a packet, read top first. | [6](06-segment-routing.md) |
| **LAN / pseudonode** | A broadcast segment with several routers; IS-IS models it as a fake router in the middle. | [1](01-isis-basics.md), [11](11-advanced-topics.md) |
| **Level 1 / Level 2** | IS-IS areas (L1) and the backbone joining them (L2). | [1](01-isis-basics.md), [11](11-advanced-topics.md) |
| **LFA** | Loop-Free Alternate: a neighbor whose path to D doesn't come back through S (RFC 5286). | [4](04-lfa.md) |
| **Link-protecting** | Survives the link S–E failing, maybe not router E. | [3](03-when-a-link-fails.md) |
| **Local convergence delay** | The PLR keeps its repair a while after computing its new path, so others update first (RFC 8333). | [11](11-advanced-topics.md) |
| **Locator** | An SRv6 router's IPv6 prefix, e.g. `fc00:0:4::/48`; its SIDs come from it. | [11](11-advanced-topics.md) |
| **Loop-free** | Inequality 1: `dist(N,D) < dist(N,S) + dist(S,D)`. | [4](04-lfa.md) |
| **LSP / LSDB** | Link State PDU: a router's description of itself. The set of all LSPs is the link-state database. | [1](01-isis-basics.md) |
| **Metric** | Cost of a link direction; IS-IS wide metrics go from 1 to 16,777,215. | [1](01-isis-basics.md) |
| **Microloop** | A short loop while routers update one at a time. | [3](03-when-a-link-fails.md), [11](11-advanced-topics.md) |
| **MSD** | Max SID depth: how many labels a router can push (RFC 8491). | [6](06-segment-routing.md), [7](07-ti-lfa.md) |
| **Node-protecting** | Survives router E failing: `dist(N,D) < dist(N,E) + dist(E,D)` for an LFA. | [4](04-lfa.md), [5](05-remote-lfa.md) |
| **Overload bit** | "Don't route through me." The router is still a destination. | [1](01-isis-basics.md), [10](10-design-checks.md) |
| **P-space** | Routers S reaches without using the link S–E. | [5](05-remote-lfa.md) |
| **PHP** | Penultimate-hop popping: the router before a segment's end pops its label. | [6](06-segment-routing.md) |
| **PLR** | Point of local repair: the router just before the failure, which switches to the backup. | [3](03-when-a-link-fails.md) |
| **Post-convergence path** | S's shortest path to D in the network without the failed element. | [3](03-when-a-link-fails.md), [7](07-ti-lfa.md) |
| **PQ node** | A router in both (extended) P-space and Q-space: the Remote LFA tunnel end. | [5](05-remote-lfa.md) |
| **Prefix-SID / Node-SID** | Segment Routing label meaning "go to router X by the shortest path". Label = SRGB base + index. | [6](06-segment-routing.md) |
| **Q-space** | Routers that reach E without using the link S–E. | [5](05-remote-lfa.md) |
| **Remote LFA (RLFA)** | Tunnel to a PQ node when no neighbor is a safe LFA (RFC 7490). | [5](05-remote-lfa.md) |
| **Reverse SPF** | SPF on the map with every link turned round: gives distances *to* a router. | [2](02-shortest-paths.md) |
| **Segment list** | The ordered segments a TI-LFA repair pushes. | [7](07-ti-lfa.md) |
| **SPF** | Shortest Path First: Dijkstra's algorithm. | [2](02-shortest-paths.md) |
| **SRGB** | SR Global Block: label range for Prefix-SIDs, default 16000–23999. | [6](06-segment-routing.md) |
| **SRLG** | Shared Risk Link Group: links that fail together. | [9](09-router-and-multiple-failures.md) |
| **SRv6** | Segment Routing with IPv6 addresses as segments. | [11](11-advanced-topics.md) |
| **TI-LFA** | Topology-Independent LFA: a segment list along the post-convergence path (RFC 9855). | [7](07-ti-lfa.md) |
| **Too deep** | A TI-LFA repair with more labels than S's MSD; it can't be installed. | [7](07-ti-lfa.md) |

# LFA Lab

A free, open-source browser tool that **computes and shows backup paths for IS-IS networks**: LFA, Remote LFA and TI-LFA. You can also break a link to see where traffic goes.

> **Status:** MVP feature-complete (2026-10-31, Milestone B). Engine, UI, failure simulation, coverage report and share links are done. Next: launch (Phase 8).

## The problem
Routers use Fast Reroute (FRR) to switch traffic onto a pre-computed backup path within about 50 ms when a link or node fails. There are three main types:

| Type | Standard | Idea in one line |
|---|---|---|
| **LFA** (Loop-Free Alternate) | RFC 5286 | Send traffic to a neighbor that won't send it back to you. |
| **Remote LFA** (RLFA) | RFC 7490 | No safe neighbor? Tunnel the traffic to a safe router further away (a "PQ node"). |
| **TI-LFA** (Topology-Independent LFA) | RFC 9855 | Use Segment Routing labels to force traffic along the path the network will use *after* it reconverges. Works in almost any topology. |

Learning these is hard: textbooks show one or two static diagrams, and vendor tools are closed and only work on live routers. **No open, interactive tool lets you draw a network and see every backup path with the reasoning behind it.** LFA Lab fills that gap.

## Who it's for
- **Students** (CCNP / JNCIE / university networking courses) learning FRR.
- **Network engineers** checking protection coverage before a design or change.
- **Interview prep** for network software roles.

## What it will do (MVP)
1. Draw a topology (routers, links, metrics, SIDs) or load one from a YAML file.
2. Pick a source router and see every destination's primary path, LFA, RLFA and TI-LFA backups (including the SR label stack).
3. **Fail a link** and watch traffic move to the backup path.
4. Get a **coverage report**, e.g. "LFA protects 60% of destinations, TI-LFA protects 100%".
5. **Explain mode** shows the real numbers behind each decision, e.g. `dist(N,D)=10 < dist(N,S)+dist(S,D)=35 ✓`.

## Docs (read in this order)
| File | What's in it |
|---|---|
| [docs/01-requirements.md](docs/01-requirements.md) | Goals, users, features (MVP and later), what we won't build |
| [docs/02-algorithms.md](docs/02-algorithms.md) | Exact maths for SPF, LFA, RLFA and TI-LFA, with 3 worked examples |
| [docs/03-architecture.md](docs/03-architecture.md) | Tech stack, folder layout, data model, YAML format, UI layout |
| [docs/04-roadmap.md](docs/04-roadmap.md) | Phases with checklists (the build order) |
| [docs/05-testing.md](docs/05-testing.md) | Test plan and expected results to check the engine against |
| [TODO.md](TODO.md) | Detailed task list to work through, phase by phase |
| [DECISIONS.md](DECISIONS.md) | Decision log: what was chosen and why |
| [CLAUDE.md](CLAUDE.md) | Rules for AI coding agents working in this repo |
| [examples/](examples/) | Sample topologies used by the docs and the tests |

## Tech stack (short)
TypeScript · React · Vite · Cytoscape.js (graph drawing) · Zustand (state) · Vitest (tests) · deployed as a static site (Vercel or GitHub Pages). **No backend.** Everything runs in the browser.

## Author
Danish Mahajan ([github.com/danisherror](https://github.com/danisherror)). Built from experience implementing IS-IS-SR LFA / RLFA / TI-LFA in router software.

# 12 · Using LFA Lab as a practice lab

This chapter is a tour of the app's screen, and how to build your own networks to practise on. Everything runs in your browser; nothing is uploaded.

## The screen

| Area | What it does |
|---|---|
| **Top bar** | Examples…, Generate…, Import YAML, Import FRR…, Export YAML, YAML format, 🔗 Share, Undo / Redo, **📖 Learn**, ? Tour, light / dark mode |
| **Sidebar (left)** | Tools, **Edit** (the selected router or link, or Topology settings), the **Source router (S)** picker, Extended P-space, Coverage heat map, IS-IS level, Algorithm, keyboard shortcuts |
| **Diagram (centre)** | The network. Zoom, fit, auto layout, ⤓ PNG / ⤓ SVG export |
| **Results table** | One row per destination and primary link: next hop, cost, LFA, Remote LFA, TI-LFA, protected by |
| **Detail panel** | For the open row: LFA candidates, P / Q / PQ sets, segment list, label stack, Explain steps, Packet walk |
| **Panels below** | Compare backups, Failure simulation, Per-link view, What-if, Weakest spots, 🎓 Quiz, Coverage report |

## Tools

| Tool | Key | Use |
|---|---|---|
| Select | V | Click a router or link to edit it. Drag routers with any tool. |
| Add router | R | Click empty space. |
| Add link | L | Click two routers. |
| Fail link | F | Click links to fail or restore them. |
| Fail router | D | Click a router to take it down or bring it back. |

Other handy moves: **double-click a link** to edit its metric where it is, **right-click** a router or link for its menu, **click a router** to open its row as the destination, **Esc** to clear the selection, **Ctrl+Z / Ctrl+Shift+Z** to undo / redo.

## Reading one row

1. Pick the **Source router (S)**.
2. Click a row in the results table (or a router on the diagram).
3. The diagram draws the primary path in blue and a backup dashed. **Draw backup** switches between LFA, Remote LFA and TI-LFA.
4. The detail panel's **Explain** lists every check with its numbers and the RFC section. That's the best place to learn.

**All routers** in the source picker shows the results for every router as the source at once, with filters and CSV export.

## Simulating a failure

1. Choose **Fail link** (F) and click a link, or **Fail router** (D) and click a router. Fail several to see second failures.
2. The **Failure simulation** panel lists every affected destination: delivered, dropped or looped, and why.
3. **Routers run:** picks the FRR methods the routers use: LFA only, LFA + Remote LFA, or TI-LFA.
4. **1. Repair (FRR)** shows traffic on the repair path; **2. Converge ▶** (or C) shows it after reconvergence.
5. The **Packet walk** shows the labels on every hop.

## Building your own network

- **Draw it:** Add router, Add link, then set metrics and SID indices in the sidebar's **Edit** section.
- **Write it in YAML:** the **YAML format** button shows every field, the rules and common mistakes, plus a checker that marks problems as you type. A minimal file:

```yaml
name: My triangle
nodes:
  - { id: S, sid: 1 }
  - { id: E, sid: 2 }
  - { id: D, sid: 3 }
links:
  - { a: S, b: E, metric: 10 }
  - { a: E, b: D, metric: 10 }
  - { a: S, b: D, metric: 30 }
```

- **Import from FRR:** paste the output of `show isis database detail` into **Import FRR…**. The routers, links, metrics, SIDs and LANs are read from it.
- **Generate:** **Generate…** makes a ring, grid, leaf-spine or random mesh of any size. Same settings, same network, so you can share a challenge by its settings.

Save your work with **Export YAML**, or **🔗 Share**, which puts the whole network inside the link itself.

## Topology settings

With nothing selected (click empty space, or pick it in the **Edit** list), the sidebar shows **Topology settings**:

| Setting | What it changes |
|---|---|
| SRGB base | Prefix-SID labels (default 16000) |
| Max SID depth | flags TI-LFA repairs with too many labels |
| Backups protect against: Link failure / Node failure / Link + SRLG / Node + SRLG | what Remote LFA and TI-LFA protect against |
| LFA policy | prefer / require / ignore node-protecting and downstream LFAs |
| Data plane: SR-MPLS (labels) / SRv6 (SIDs) | how segments are written |

## Practice habits that work

- **Predict, then check.** Before you open a row, work out the answer by hand with the formula sheet (appendix B). Then compare with Explain.
- **Change one number.** Double-click a metric, change it, and watch which rows change. Undo, try another.
- **Break it on purpose.** Fail a router next to the source and see which backups survive.
- **Quiz yourself.** **🎓 Quiz** asks ten questions about the network on screen and shows the reasoning after each answer. Every question comes from the engine, so it works on your own networks too.

> **Try it in LFA Lab**
>
> - [Open Example 2](../../examples/02-ring5.yaml#source=S) and press **? Tour** for the two-minute guided tour.
> - Load the triangle above through **YAML format** and check: does S have an LFA for D? (S → D via E costs 20; the only other neighbor is D itself.)
> - Open **🎓 Quiz** and answer ten questions.

## Check yourself

1. Where do you see the numbers behind a result?
2. How do you see traffic after the network reconverges?
3. How do you share a network with someone?

<details>
<summary>Answers</summary>

1. In the detail panel's **Explain** steps for the open row.
2. Fail something, then press **2. Converge ▶** (or C) in the failure panel.
3. **🔗 Share** copies a link that holds the whole network, or **Export YAML** saves a file.

</details>

Next: [13 Practice exercises](13-practice-exercises.md)

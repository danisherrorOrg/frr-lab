# 6 · Segment Routing primer

TI-LFA (chapter 7) steers packets with **Segment Routing (SR)**. This chapter explains just enough SR to read a TI-LFA repair: labels, Prefix-SIDs, Adj-SIDs, the SRGB and label stacks. LFA Lab uses **SR-MPLS** (SR with MPLS labels); chapter 11 covers SRv6.

## MPLS labels in one minute

An MPLS **label** is a 20-bit number placed in front of the IP packet. Routers forward on the top label instead of the IP address. A packet can carry several labels: a **label stack**, read top first. A router can:

- **push** a label (put it on top),
- **swap** the top label for another,
- **pop** the top label (remove it) and look at what is under it.

## Segment Routing: the path is in the packet

With SR, the router that sends a packet writes the route into it as a list of **segments**. Each segment is an instruction, and each instruction is a label. The routers along the way just follow the top instruction. No router needs to keep per-flow state.

IS-IS advertises the segments in its LSPs (RFC 8667), so every router knows every segment.

### Prefix-SID (node segment): "go to router X by the shortest path"

Each router has a **Prefix-SID index**, a small number that is unique in the network. The label is:

```
label = SRGB base + index      (SRGB base 16000 by default)
```

The **SRGB** (SR Global Block) is the label range set aside for Prefix-SIDs, by default 16000–23999. LFA Lab assumes every router uses the same SRGB, so a Prefix-SID label means the same thing everywhere.

In Example 2 the indices are S=1, E=2, A=3, B=4, C=5, so:

| Router | S | E | A | B | C |
|---|---|---|---|---|---|
| Prefix-SID label | 16001 | 16002 | 16003 | 16004 | 16005 |

A packet with top label 16004 means "go to B on the shortest path". Every router on the way forwards it on **its own normal shortest path to B**. This point is the key to TI-LFA: a Prefix-SID follows the routers' *normal* tables.

### Adj-SID (adjacency segment): "go out of this exact link"

An **Adj-SID** belongs to one link direction on one router: "router B, send this out on your link to C", whatever B's routing table says. It is **local**: only B understands B's Adj-SIDs. Other routers may use the same numbers for their own links.

Adj-SIDs force a packet over a link that no shortest path would use. LFA Lab takes them from the YAML file (`adj_sid_ab`, `adj_sid_ba`) or numbers each router's links from 24000 in neighbor-id order. In Example 3, B's Adj-SID for its link to C is set to **24005**.

## A packet walk, step by step

Normal forwarding to C in Example 2 (S → E → C):

| Router | Arrives with | Does | Leaves with |
|---|---|---|---|
| S | (IP packet for C) | push C's Prefix-SID; send to E | 16005 |
| E | 16005 | the next router is C itself: pop it (PHP) | no label |
| C | no label | delivered | – |

### PHP: penultimate-hop popping

The router **before** the end of a segment pops that segment's label, so the end router doesn't have to look up its own label (RFC 8660 §2). That's why E pops 16005 above. LFA Lab's packet walk has PHP on by default and can switch it off.

### Two labels

TI-LFA's repair for E in Example 2 is the stack `16004, 16002` (B, then E), sent out to A:

| Router | Arrives with | Does | Leaves with |
|---|---|---|---|
| S | 16002 | push 16004; send to A | 16004 16002 |
| A | 16004 16002 | top is B's label, next router is B: pop it (PHP) | 16002 |
| B | 16002 | top is E's label: forward on B's normal path to E, via C | 16002 |
| C | 16002 | next router is E: pop (PHP) | no label |
| E | no label | delivered | – |

Each router only reads the top label and uses its normal table. The list does the steering.

## Max SID depth (MSD)

Hardware can only push so many labels. Each router advertises its **Base MPLS Imposition MSD** (RFC 8491). A TI-LFA repair with more labels than S's MSD can't be installed. LFA Lab checks this: set `msd: 2` on Example 3 and its 3-label repair is marked "too deep" (chapter 7).

## Why SR makes FRR easy

- **No signalling.** The PQ node's Prefix-SID *is* the Remote LFA tunnel: one more label, no targeted LDP session.
- **Any path.** A few Prefix-SIDs and Adj-SIDs can describe any path in the network, so a backup can follow exactly the post-convergence path. That is TI-LFA.

> **Try it in LFA Lab**
>
> - [Open Example 2, row S → C](../../examples/02-ring5.yaml#source=S&dest=C&via=E). In the detail panel's **Packet walk**, pick **Primary path** to see the first table above.
> - [Open Example 2, row S → E](../../examples/02-ring5.yaml#source=S&dest=E&via=E) and pick **TI-LFA backup** in the packet walk: the second table. Switch on "Show labels on the diagram".
> - Click router B and read its **Prefix-SID index** (4) in the sidebar's **Edit** section.

## Check yourself

1. With SRGB base 16000, what is the label of a router with index 12?
2. What is the difference between a Prefix-SID and an Adj-SID?
3. In the two-label walk, why does A pop 16004 and not B?

<details>
<summary>Answers</summary>

1. 16000 + 12 = 16012.
2. A Prefix-SID means "go to this router on the shortest path" and every router understands it. An Adj-SID means "go out of this one link", and only the router that owns the link understands it.
3. PHP: A is the hop just before B (the end of B's segment), so A pops B's label before sending.

</details>

Next: [7 TI-LFA](07-ti-lfa.md)

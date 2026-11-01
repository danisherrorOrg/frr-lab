# Appendix C · RFC reading guide

The RFCs are the real definitions. They are dense, so read only these sections at first, in this order.

| Order | RFC | Read | Why |
|---|---|---|---|
| 1 | [RFC 5286](https://www.rfc-editor.org/rfc/rfc5286) – LFA | §1 (intro), then §3 (the loop-free, node-protecting and downstream conditions, LANs, ECMP, the overload bit, and how an alternate is picked) | The core of every method that follows |
| 2 | [RFC 6571](https://www.rfc-editor.org/rfc/rfc6571) – LFA applicability | the topology analysis sections | Why rings and some topologies get low LFA coverage |
| 3 | [RFC 7490](https://www.rfc-editor.org/rfc/rfc7490) – Remote LFA | §1 (the idea), §5.2 (P / Q / PQ and choosing), §5.4 (exclusions) | P-space, Q-space, PQ nodes |
| 4 | [RFC 8102](https://www.rfc-editor.org/rfc/rfc8102) – Remote LFA node protection | §2 | The two extra checks for a node-protecting PQ node |
| 5 | [RFC 8402](https://www.rfc-editor.org/rfc/rfc8402) – SR architecture | §2 (terms, incl. SRGB), §3.1–3.2 (Prefix-SID, Node-SID), §3.4 (Adj-SID) | The building blocks of TI-LFA |
| 6 | [RFC 8660](https://www.rfc-editor.org/rfc/rfc8660) – SR-MPLS | §2 | Push, pop and PHP |
| 7 | [RFC 9855](https://www.rfc-editor.org/rfc/rfc9855) – TI-LFA | §1–3 (idea, post-convergence path), §5 (repair list), §6 (repairing a repair), §7.1–7.2 (MPLS and SRv6) | TI-LFA itself |
| 8 | [RFC 8491](https://www.rfc-editor.org/rfc/rfc8491) – MSD | §1, §5 | Why deep label stacks can't be installed |
| 9 | [RFC 7916](https://www.rfc-editor.org/rfc/rfc7916) – LFA manageability | §6.2 | LFA policy knobs, SRLG criterion |
| 10 | [RFC 5715](https://www.rfc-editor.org/rfc/rfc5715), [RFC 8333](https://www.rfc-editor.org/rfc/rfc8333) | 5715 §1, 8333 §3 | Microloops and local convergence delay |
| 11 | [RFC 9350](https://www.rfc-editor.org/rfc/rfc9350) – Flex-Algo | §5–6 | Flex-Algo definitions and FRR inside them |
| 12 | [RFC 8986](https://www.rfc-editor.org/rfc/rfc8986) – SRv6 | §3.1, §4.1–4.2 | Locators, End and End.X SIDs |

## Tips

- Keep appendix B open: every formula in the RFCs maps to one there. RFC 7490's Q-space writes `dist(S,E)` where this guide writes `c(S,E)`; they are equal whenever S–E is a primary link.
- Read an RFC section, then open the matching example in LFA Lab and read its **Explain** steps: each step cites the RFC section it comes from.
- For how LFA Lab applies each rule, and the few places where it chooses one reading, see `docs/02-algorithms.md` and `DECISIONS.md` in the repository.

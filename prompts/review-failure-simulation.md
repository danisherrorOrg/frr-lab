# Prompt: Review the failure-simulation logic (links, routers and parallel links)

Review the failure-simulation logic in this repo for correctness. The goal is
**zero logic errors**: every rule must match what a real router does, and the RFCs
must back it. **Don't add features.**

## Read first
- `CLAUDE.md`
- `docs/02-algorithms.md` §8 (link failures), §8.1 (router failure) and §9
  (parallel links)
- `DECISIONS.md` entries D22 to D29. D23's "Broken" rule was replaced by D24;
  D25, D26 and D28 are earlier reviews; D29 made every next hop a specific link.
  Re-check what they say they checked. Don't assume it is still right.

## Code to review
- `src/engine/simulate.ts`: the simulation: hop-by-hop walk (link by link),
  repairs, drops, loops, the router-failure "survives / breaks" check, and the
  converged path
- What the walk relies on: `firstLinks` (`spf.ts`), `cheapestEdge` (`graph.ts`),
  `hopLinks` (`paths.ts`), per-link protections in `index.ts`, `lfa.ts`, `rlfa.ts`
  and `tilfa.ts` (`bestLink`, `outLink`, Adj-SID `link`)
- `src/ui/FailurePanel.tsx`: every sentence shown to users, including how a link of
  a bundle is named (`S–E (S-E#2)`)
- `src/App.tsx` and `src/ui/canvas.ts`: which link of a bundle is drawn for the
  normal, repair and converged paths
- Tests: `tests/engine/simulate.test.ts`, `simulate-node.test.ts`,
  `simulate.property.test.ts`, `parallel.test.ts`, `parallel.property.test.ts`
- Example networks: `examples/01-square.yaml` to `examples/07-parallel.yaml`

## The question for every rule
> "Is this what a real router does, and does the RFC back it?"

The RFCs are the source of truth:
- RFC 5286: LFA (§3.2 node-protecting Inequality 3, §3.4 ECMP, §3.5 reverse cost
  of a link, §3.6 a candidate is an (outgoing link, neighbor) pair)
- RFC 7490: Remote LFA (P/Q space, PQ node tunnel)
- RFC 8102: Remote LFA node protection (§2.1)
- RFC 9855: TI-LFA (§3 post-convergence path, §6.1 active segment, §6.2 failed
  Adj-SID, §9 protected Adj-SID in a repair list)
- RFC 8402 / RFC 8667: Segment Routing, one Adj-SID per adjacency (RFC 8402 §3.4,
  RFC 8667 §2.2.1), Adj-SID protection (B-flag)

If code, docs and RFC disagree, follow the RFC (CLAUDE.md rule 3).

## Check these in particular

### Link failures (§8, D22–D26)
1. **Which router repairs:** only a router whose own outgoing link is down; every
   other router uses its normal table, even for traffic already on a backup.
2. **Backup order in each mode:** ECMP first in every mode (lowest-id member whose
   link is up; all members down means dropped), then LFA / Remote LFA / TI-LFA.
   Also what the backup puts on the packet: plain IP, a tunnel to the PQ node, or
   a segment list (Prefix-SIDs and Adj-SIDs).
3. **Several links down:** when a router repairs traffic that is already on another
   router's backup, which target does it repair towards: D, the PQ node, the
   active prefix segment, or the far end of a failed Adj-SID? Also check the case
   where the Adj-SID forced a costlier link than the router's normal path.
4. **Drops:** no backup, or the backup's own first link is down too (one backup
   per router visit). Also the known gap in D25: a plain-P-space Remote LFA tunnel
   always takes the lowest-id first hop, even when an equal-cost one is up.
5. **Loops:** a loop means the same router with the same packet contents. Passing a
   router twice with other labels is not a loop. Check the 255-hop limit and where
   the shown path is cut.
6. **Statuses:** first match wins: unreachable, repaired, dropped, looped. Check the
   "Repair = final?" comparison, which is made at the PLR (same / same-cost /
   longer), and the converged path (SPF with all failed links removed, same
   tie-break).

### Router failure (§8.1, D27, D28)
7. **Model:** a failed router means all its links are down and its Prefix-SID can't
   be reached. Its neighbors only see a link fail and use link-protecting backups.
   Is that what a real router does?
8. **Survives vs breaks:** the PLR's planned backup, followed as if only the link
   PLR–E had failed. Check the reason given for each backup type:
   - LFA / ECMP: Inequality 3 with real numbers, and the ECMP member really used
   - Remote LFA: the tunnel or the PQ node's path to D goes through E
   - TI-LFA: `PrefixSID(E)`, an Adj-SID on a link of E, or a Prefix-SID whose
     normal path crosses E

   Also check that "broken" (the plan fails) is kept separate from the walk's
   status (what the traffic does).
9. **Edge cases:** D = E (unreachable, expected); the source itself down (refused);
   ties (the drawn path vs Inequality 3); a router and links failed together; two
   routers down; the failed router being a second failure rather than the
   protected neighbor; the backup's own neighbor or PQ node being down.

### Parallel links (§9, D29)
10. **Which link carries traffic:** normal forwarding, Remote LFA exits and TI-LFA
    prefix hops take the cheapest link, then the lowest link id; an LFA takes
    `bestLink`, an ECMP member its own link, an Adj-SID its own link, and TI-LFA
    leaves on `outLink`. Is "affected" decided by the link the flow really uses
    (failing the unused link of an equal bundle leaves the flow alone)?
11. **Repairs per link:** a router finding a link down uses the protection for that
    exact link id. Another equal link to the same neighbor is an ECMP member; an
    unequal one is a link-protecting LFA, never node-protecting. Check a failed
    Adj-SID hop whose neighbor is still reachable over another link of the bundle
    (the normal path is the backup), and both links of a bundle down.
12. **Costs and "Repair = final?":** repair costs come from the links walked
    (`repairLinks`), final costs from the SPF without the failed links. `same` must
    mean the same routers *and* the same cost: a repair over the costlier link of a
    bundle is not the same path as a final path over a cheaper one.
13. **Router failure with bundles:** every link of the failed router goes down,
    whichever bundle it is in. Does the "survives / breaks" check use the member
    link the traffic really takes?
14. **Drawing:** the canvas must draw the link the walk used (`repairLinks`), the
    normal path's link, and the converged path over links that are up. Never a
    failed link of a bundle when the other one carried the traffic.

### Text and docs
15. **Every sentence the panel shows:** is it true in every case it can appear?
    That includes chains of repairs, loops, split networks, the PLR not being S,
    repeated failed links, router plus link failures together, and bundles (is the
    exact link named whenever two routers have several?). Are the numbers shown
    measured from the router the sentence names?
16. **Docs vs code vs RFC:** do §8, §8.1, §9 and D22–D29 say exactly what the code
    does, including the worked checks?

## How to search
Don't stop at reading the code. Run it. Write a small throwaway script (in the
scratchpad, not the repo) that calls `simulateFailure` for every network in
Examples 1–7, and for each one:
- every source router
- every mode
- every set of one and two failed links (three on the small examples)
- every single router failure, router + link, and two routers

Also try random networks with asymmetric metrics, and random networks with
bundles (`connectedTopology({ parallel: true })` in `tests/arbitraries.ts`): equal
and unequal links between the same routers, and both links of a bundle failed.

Flag anything a real router would do differently: a drop where a backup exists, a loop that isn't the same router
with the same labels, a repair by a router whose link is up, a wrong target, a
"breaks" for traffic that one backup delivers, traffic sent over a failed link of a
bundle, a cost that doesn't match the links walked, or a sentence that is false for
that case. Check every finding by hand against the RFC before you call it a bug.

## For each problem found
- Give a concrete network and the failed links or routers that show it (use the
  networks in `examples/` if possible).
- Explain why it's wrong, and what the RFC or a real router does (cite the section).

## Then
1. Fix it test-first: write the failing test, then the fix. Add a property test
   where the rule holds for every network.
2. Keep the worked examples in `docs/02-algorithms.md` §6 and the worked checks in
   §8 / §8.1 / §9 passing.
3. Update `docs/02-algorithms.md` and add a new `DECISIONS.md` entry (next number:
   D30) that lists what changed, what was checked and left unchanged, and what is
   still not modelled.
4. Run `npm test`, `npm run lint` and `npm run typecheck`. All must pass, including
   the 200-router speed test (under 2 s).
5. Commit. Use a short imperative subject and no AI attribution (CLAUDE.md).

If nothing is wrong, say so and list everything you checked, including the
networks, modes and failure sets you ran.

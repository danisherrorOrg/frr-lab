# Prompt: Review the failure-simulation logic (links and routers)

Review the failure-simulation logic in this repo for correctness. The goal is
**zero logic errors**: every rule must match what a real router does, and the RFCs
must back it. **Don't add features.**

## Read first
- `CLAUDE.md`
- `docs/02-algorithms.md` §8 (link failures) and §8.1 (router failure)
- `DECISIONS.md` entries D22 to D28. D23's "Broken" rule was replaced by D24, and
  D25, D26 and D28 are earlier reviews. Re-check what they say they checked. Don't
  assume it is still right.

## Code to review
- `src/engine/simulate.ts`: the simulation: hop-by-hop walk, repairs, drops,
  loops, the router-failure "survives / breaks" check, and the converged path
- `src/ui/FailurePanel.tsx`: every sentence shown to users
- Tests: `tests/engine/simulate.test.ts`, `simulate-node.test.ts`,
  `simulate.property.test.ts`
- Example networks: `examples/01-square.yaml` to `examples/06-link-protecting.yaml`

## The question for every rule
> "Is this what a real router does, and does the RFC back it?"

The RFCs are the source of truth:
- RFC 5286: LFA (§3.2 node-protecting Inequality 3, §3.4 ECMP)
- RFC 7490: Remote LFA (P/Q space, PQ node tunnel)
- RFC 8102: Remote LFA node protection (§2.1)
- RFC 9855: TI-LFA (§3 post-convergence path, §6.1 active segment, §6.2 failed
  Adj-SID, §9 protected Adj-SID in a repair list)
- RFC 8402 / RFC 8667: Segment Routing, Adj-SID protection (B-flag, §2.2.1)

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

### Text and docs
10. **Every sentence the panel shows:** is it true in every case it can appear?
    That includes chains of repairs, loops, split networks, the PLR not being S,
    repeated failed links, and router plus link failures together. Are the numbers
    shown measured from the router the sentence names?
11. **Docs vs code vs RFC:** do §8, §8.1 and D22–D28 say exactly what the code
    does, including the worked checks?

## How to search
Don't stop at reading the code. Run it. Write a small throwaway script (in the
scratchpad, not the repo) that calls `simulateFailure` for every network in
Examples 1–6, and for each one:
- every source router
- every mode
- every set of one and two failed links (three on the small examples)
- every single router failure, router + link, and two routers

Also try random networks with asymmetric metrics. Flag anything a real router would
do differently: a drop where a backup exists, a loop that isn't the same router
with the same labels, a repair by a router whose link is up, a wrong target, a
"breaks" for traffic that one backup delivers, or a sentence that is false for that
case. Check every finding by hand against the RFC before you call it a bug.

## For each problem found
- Give a concrete network and the failed links or routers that show it (use the
  networks in `examples/` if possible).
- Explain why it's wrong, and what the RFC or a real router does (cite the section).

## Then
1. Fix it test-first: write the failing test, then the fix. Add a property test
   where the rule holds for every network.
2. Keep the worked examples in `docs/02-algorithms.md` §6 and the worked checks in
   §8 / §8.1 passing.
3. Update `docs/02-algorithms.md` and add a new `DECISIONS.md` entry (next number:
   D29) that lists what changed, what was checked and left unchanged, and what is
   still not modelled.
4. Run `npm test`, `npm run lint` and `npm run typecheck`. All must pass.
5. Commit. Use a short imperative subject and no AI attribution (CLAUDE.md).

If nothing is wrong, say so and list everything you checked, including the
networks, modes and failure sets you ran.

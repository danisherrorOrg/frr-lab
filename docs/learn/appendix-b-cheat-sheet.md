# Appendix B · Formula cheat sheet

Every check in this guide on one page. S = source, D = destination, E = primary next hop, N = another neighbor, Y = any router. All use **strict** `<`: a tie means "may use it", which is never safe.

## Shortest paths

| Check | Formula |
|---|---|
| All shortest paths X → Y avoid the link S→E | `dist(X,Y) < dist(X,S) + c(S,E) + dist(E,Y)` |
| All shortest paths X → Y avoid router E | `dist(X,Y) < dist(X,E) + dist(E,Y)` |
| Link X→N is on a shortest path to D | `c(X,N) + dist(N,D) = dist(X,D)` |

## LFA (RFC 5286)

| Name | Formula | Needed? |
|---|---|---|
| Inequality 1, loop-free | `dist(N,D) < dist(N,S) + dist(S,D)` | yes |
| Inequality 2, downstream | `dist(N,D) < dist(S,D)` | preferred |
| Inequality 3, node-protecting | `dist(N,D) < dist(N,E) + dist(E,D)` | preferred |
| Backup cost | `c(S,N) + dist(N,D)` | for ranking |

Best LFA: node-protecting → downstream → lowest cost → lowest router id → lowest link id.

## Remote LFA (RFC 7490)

| Set | Formula |
|---|---|
| P-space of S | `Y ∈ P(S) ⇔ dist(S,Y) < c(S,E) + dist(E,Y)` |
| P-space of neighbor N | `Y ∈ P(N) ⇔ dist(N,Y) < dist(N,S) + dist(S,Y)` |
| Extended P-space | P(S) ∪ every P(N) |
| Q-space of E | `Y ∈ Q(E) ⇔ dist(Y,E) < dist(Y,S) + c(S,E)` |
| PQ nodes | extended P-space ∩ Q-space |

Best PQ node: lowest cost from S (`dist(S,PQ)`, or `c(S,N) + dist(N,PQ)` through exit neighbor N) → lowest router id.

**Node protection (RFC 8102)**, for PQ candidate Y: tunnel avoids E (`dist(S,Y) < dist(S,E) + dist(E,Y)`, or through N: `dist(N,Y) < dist(N,E) + dist(E,Y)`), and `dist(Y,D) < dist(Y,E) + dist(E,D)`.

## TI-LFA (RFC 9855)

1. Remove S–E (or router E for node protection). SPF from S: the post-convergence path.
2. From `current = S`, take the **furthest** router Y on the path whose old shortest paths from `current` all avoid the failure → `PrefixSID(Y)`. If there is none → `AdjSID(current → next)`.
3. Drop a first segment that only reaches the first hop. End with `PrefixSID(D)`.
4. Extra labels = segments − 1. Too deep if segments > MSD.

## Labels

| Thing | Value |
|---|---|
| Prefix-SID label | SRGB base + index (default base 16000) |
| Adj-SID label | from the file, or each router numbers its links from 24000 in neighbor-id order |
| Flex-Algo Prefix-SID | SRGB base + index + 1000 × the algorithm's place in the list (unless set) |
| SRv6 End SID | locator + 1 |
| SRv6 End.X SID | locator + 0x40 + the link's place among the router's links |

## Coverage

```
LFA    = pairs with ECMP or an LFA         / all pairs
RLFA   = pairs with ECMP, LFA or a PQ node / all pairs
TI-LFA = pairs with a TI-LFA repair         / all pairs
```

A pair is (destination D, primary link S–E).

import { hopText, isBundle, linkText, type Graph } from './graph'
import { MAX_METRIC, type LfaCheck, type LfaResult } from './lfa'
import { isDefaultLfaPolicy, type ResolvedLfaPolicy } from './lfa-policy'
import type { NodeRlfaResult, RlfaResult } from './rlfa'
import type { SegmentCheck, TilfaResult } from './tilfa'
import type { ExplainStep, LfaCandidate, NodeId, Segment } from './types'

const mark = (ok: boolean) => (ok ? '✓' : '✗')
const num = (x: number) => (Number.isFinite(x) ? String(x) : '∞')

/**
 * "= 5+6 = 11", or, when the router in the middle has the overload bit and so can't
 * be transit, "= ∞ (B has the overload bit: no transit through it)" (RFC 7490 §5.4).
 */
const sumText = (parts: number[], total: number, middle: NodeId[], graph?: Graph) => {
  const over = middle.find((m) => graph?.overloaded.has(m))
  if (!Number.isFinite(total) && over !== undefined && parts.every(Number.isFinite))
    return `= ∞ (${over} has the overload bit: no transit through it)`
  return `= ${parts.map(num).join('+')} = ${num(total)}`
}

/** Where S, D and E sit for one protection, so steps can name them. */
export interface LfaContext {
  s: NodeId
  d: NodeId
  e: NodeId
  /** From ecmpProtectors(): other primary next hops that avoid S–E. */
  ecmpProtectors: NodeId[]
  /** The protected link's id, the protectors' link ids and the graph: with them,
   * text names the exact link when two routers have parallel links (D29). */
  link?: string
  ecmpLinks?: string[]
  graph?: Graph
}

/**
 * Turns an LFA result into steps with the real numbers, one per inequality
 * per neighbor, then the ECMP check and the final choice.
 * Example: "Via A: dist(A,E)=2 < dist(A,S)+dist(S,E) = 1+1 = 2 ✗".
 */
export function explainLfa(result: LfaResult, ctx: LfaContext): ExplainStep[] {
  const { s, d, e, graph } = ctx
  const steps: ExplainStep[] = []
  if (!isDefaultLfaPolicy(result.policy)) steps.push(policyStep(s, result.policy))

  for (const skip of result.skipped) {
    const via = hopText(graph, s, skip.neighbor, skip.link)
    steps.push(
      skip.reason === 'overload'
        ? {
            rule: 'LFA skipped',
            text: `Via ${via}: skipped, ${skip.neighbor} has the overload bit set, so it is never an alternate`,
            ok: false,
            rfc: 'RFC 5286 §3.5',
          }
        : skip.reason === 'same-lan'
          ? {
              rule: 'LFA skipped',
              text: `Via ${via}: skipped, it is on the same LAN as the protected link, so it fails with ${s}’s interface to that LAN`,
              ok: false,
              rfc: 'RFC 5286 §3.6',
            }
          : skip.reason === 'excluded'
            ? {
                rule: 'LFA skipped',
                text: `Via ${via}: skipped, ${s}'s policy never uses ${skip.neighbor} as an alternate`,
                ok: false,
                rfc: 'RFC 7916 §6.2.4.4',
              }
            : {
                rule: 'LFA skipped',
                text: `Via ${via}: skipped, link ${linkText(graph, s, skip.neighbor, skip.link)} has the maximum metric ${MAX_METRIC}`,
                ok: false,
                rfc: 'RFC 5286 §3.5',
              },
    )
  }

  result.checks.forEach((c, i) => {
    const cand = result.candidates[i]
    if (cand === undefined) return
    steps.push(...candidateSteps(c, { s, d, e, graph }, cand))
    if (cand.srlgDisjoint !== undefined)
      steps.push({
        rule: 'LFA SRLG-disjoint',
        text: `Via ${via(graph, s, cand)}: ${cand.srlgDisjoint ? 'the link and its path to ' + d + ' avoid every link of the protected link’s SRLG ✓' : `the link or its path to ${d} may use a link of the protected link’s SRLG ✗`}`,
        ok: cand.srlgDisjoint,
        rfc: 'RFC 7916 §6.2.4.1',
      })
    if (cand.policyRejected !== undefined) steps.push(rejectedStep(cand, via(graph, s, cand)))
  })

  steps.push(ecmpStep(ctx))
  steps.push(bestStep(result, ctx))
  return steps
}

const via = (graph: Graph | undefined, s: NodeId, c: LfaCandidate) =>
  hopText(graph, s, c.neighbor, c.link)

const PREF_TEXT = { prefer: 'preferred', require: 'required', ignore: 'ignored' } as const

/** "S's LFA policy: node-protecting required, downstream preferred, never use B". */
function policyStep(s: NodeId, p: ResolvedLfaPolicy): ExplainStep {
  const parts = [
    `node-protecting ${PREF_TEXT[p.nodeProtecting]}`,
    `downstream ${PREF_TEXT[p.downstream]}`,
    ...(p.exclude.length > 0 ? [`never use ${p.exclude.join(', ')}`] : []),
  ]
  return {
    rule: 'LFA policy',
    text: `${s}'s LFA policy: ${parts.join(', ')}`,
    ok: true,
    rfc: 'RFC 7916 §6.2',
  }
}

function rejectedStep(c: LfaCandidate, viaText: string): ExplainStep {
  const node = c.policyRejected === 'not-node-protecting'
  const what = node ? 'node-protecting' : 'downstream'
  return {
    rule: 'LFA policy',
    text: `Via ${viaText}: loop-free, but not ${what}, and the policy requires ${node ? 'node protection' : 'downstream'} ✗`,
    ok: false,
    rfc: node ? 'RFC 7916 §6.2.2' : 'RFC 7916 §6.2.3',
  }
}

function candidateSteps(
  c: LfaCheck,
  { s, d, e, graph }: { s: NodeId; d: NodeId; e: NodeId; graph?: Graph | undefined },
  flags: { loopFree: boolean; downstream: boolean; nodeProtecting: boolean },
): ExplainStep[] {
  const n = c.neighbor
  const via = hopText(graph, s, n, c.link)
  const nd = `dist(${n},${d})=${num(c.distND)}`
  return [
    {
      rule: 'LFA loop-free (Inequality 1)',
      text: `Via ${via}: ${nd} < dist(${n},${s})+dist(${s},${d}) ${sumText([c.distNS, c.distSD], c.viaS, [s], graph)} ${mark(flags.loopFree)}`,
      ok: flags.loopFree,
      rfc: 'RFC 5286 §3.1',
    },
    {
      rule: 'LFA downstream (Inequality 2)',
      text: `Via ${via}: ${nd} < dist(${s},${d})=${num(c.distSD)} ${mark(flags.downstream)}`,
      ok: flags.downstream,
      rfc: 'RFC 5286 §1',
    },
    {
      rule: 'LFA node-protecting (Inequality 3)',
      text: `Via ${via}: ${nd} < dist(${n},${e})+dist(${e},${d}) ${sumText([c.distNE, c.distED], c.viaE, [e], graph)} ${mark(flags.nodeProtecting)}`,
      ok: flags.nodeProtecting,
      rfc: 'RFC 5286 §3.2',
    },
  ]
}

function ecmpStep({ s, d, e, ecmpProtectors, link, ecmpLinks, graph }: LfaContext): ExplainStep {
  const ok = ecmpProtectors.length > 0
  const sE = linkText(graph, s, e, link)
  // With a bundle, name the links: "the other link S-E#2" (D29).
  const bundled = ecmpLinks !== undefined && graph !== undefined && isBundle(graph, s, e)
  const who = bundled ? `link ${ecmpLinks.join(', ')}` : `next hop ${ecmpProtectors.join(', ')}`
  return {
    rule: 'ECMP-protected',
    text: ok
      ? `Other primary ${who} to ${d} avoids ${sE}, so traffic keeps flowing ✓`
      : `No other primary next hop to ${d} avoids ${sE} ✗`,
    ok,
    rfc: 'RFC 5286 §3.4',
  }
}

function bestStep(result: LfaResult, { s, d, graph }: LfaContext): ExplainStep {
  const i = result.candidates.findIndex(
    (c) =>
      c.neighbor === result.best && (result.bestLink === undefined || c.link === result.bestLink),
  )
  const best = result.candidates[i]
  const check = result.checks[i]
  if (best === undefined || check === undefined) {
    if (result.candidates.some((c) => c.loopFree && c.policyRejected !== undefined))
      return {
        rule: 'Best LFA',
        text: `No LFA: the loop-free neighbors of ${s} for ${d} are ruled out by the LFA policy`,
        ok: false,
        rfc: 'RFC 7916 §6.2',
      }
    return {
      rule: 'Best LFA',
      text: `No LFA: no neighbor of ${s} passes Inequality 1 for ${d}`,
      ok: false,
      rfc: 'RFC 5286 §3.6',
    }
  }
  const kinds = [
    best.nodeProtecting ? 'node-protecting' : 'link-protecting',
    ...(best.downstream ? ['downstream'] : []),
  ]
  return {
    rule: 'Best LFA',
    text: `Best LFA: ${hopText(graph, s, best.neighbor, best.link)} (${kinds.join(', ')}, cost c(${s},${best.neighbor})+dist(${best.neighbor},${d}) = ${check.cSN}+${num(check.distND)} = ${num(best.cost)})`,
    ok: true,
    rfc: 'RFC 5286 §3.6',
  }
}

/** What explainRlfa needs besides the RLFA result. */
export interface RlfaContext {
  d: NodeId
  /** The chosen LFA, if any: then RLFA isn't needed (docs/02-algorithms.md §3). */
  lfaBest?: NodeId | undefined
  /** With it, text names the exact link of a bundle (D29). */
  graph?: Graph
}

/**
 * Turns an RLFA result into steps with the real numbers: each P-space,
 * extended P-space and Q-space check, then the PQ set and the chosen node.
 * Example: "Q-space: B: dist(B,E)=2 < dist(B,S)+c(S,E) = 2+1 = 3 ✓".
 */
export function explainRlfa(result: RlfaResult, ctx: RlfaContext): ExplainStep[] {
  const { s, e, cSE } = result
  const { graph } = ctx
  const steps: ExplainStep[] = []

  for (const skip of result.skipped) {
    const why =
      skip.reason === 'same-lan'
        ? `it is on the same LAN as the protected link (RFC 5286 §3.6)`
        : skip.reason === 'overload'
          ? `${skip.neighbor} has the overload bit set`
          : `link ${linkText(graph, s, skip.neighbor, skip.link)} has the maximum metric ${MAX_METRIC}`
    steps.push({
      rule: 'Extended P-space skipped',
      text: `Via ${hopText(graph, s, skip.neighbor, skip.link)}: not used as a tunnel exit, ${why}`,
      ok: false,
      rfc: 'RFC 7490 §5.4',
    })
  }

  for (const c of result.pChecks) {
    const y = c.node
    steps.push({
      rule: 'P-space',
      text:
        c.lanBlocked !== undefined
          ? `P-space: ${y}: ${s}’s path to ${y} may use ${c.lanBlocked}, which fails with ${s}’s LAN interface ✗`
          : `P-space: ${y}: dist(${s},${y})=${num(c.distSY)} < c(${s},${e})+dist(${e},${y}) ${sumText([cSE, c.distEY], c.viaLink, [e], graph)} ${mark(c.inP)}`,
      ok: c.inP,
      rfc: 'RFC 7490 §5.2.1.1',
    })
  }

  for (const c of result.extChecks) {
    const { neighbor: n, node: y } = c
    steps.push({
      rule: 'Extended P-space',
      text: `Extended P-space: ${y} via ${n}: dist(${n},${y})=${num(c.distNY)} < dist(${n},${s})+dist(${s},${y}) ${sumText([c.distNS, c.distSY], c.viaS, [s], graph)} ${mark(c.inP)}`,
      ok: c.inP,
      rfc: 'RFC 7490 §5.2.1.2',
    })
  }

  for (const c of result.qChecks) {
    const y = c.node
    steps.push({
      rule: 'Q-space',
      text: `Q-space: ${y}: dist(${y},${e})=${num(c.distYE)} < dist(${y},${s})+c(${s},${e}) ${sumText([c.distYS, cSE], c.viaLink, [s], graph)} ${mark(c.inQ)}`,
      ok: c.inQ,
      rfc: 'RFC 7490 §5.2.1.3',
    })
  }

  const pName = result.extended ? 'extended P' : 'P'
  if (result.overloadedPq !== undefined) {
    const many = result.overloadedPq.length > 1
    steps.push({
      rule: 'PQ nodes',
      text: `${result.overloadedPq.join(', ')} ${many ? 'are' : 'is'} in both spaces but ${many ? 'have' : 'has'} the overload bit set, so ${many ? 'they' : 'it'} can't be a tunnel end`,
      ok: false,
      rfc: 'RFC 7490 §5.4',
    })
  }
  steps.push({
    rule: 'PQ nodes',
    text:
      result.pq.length > 0
        ? `PQ = ${pName} ∩ Q = {${result.pq.join(', ')}}`
        : result.overloadedPq !== undefined
          ? `No PQ node: the only routers in both ${pName}-space and Q-space have the overload bit ✗`
          : `No PQ node: no router is in both ${pName}-space and Q-space ✗`,
    ok: result.pq.length > 0,
    rfc: 'RFC 7490 §5.2.1',
  })

  steps.push(bestPqStep(result, ctx))
  return steps
}

function bestPqStep(result: RlfaResult, { d, lfaBest, graph }: RlfaContext): ExplainStep {
  const { s, e } = result
  const rfc = 'RFC 7490 §5.2.2'
  if (lfaBest !== undefined) {
    // RFC 7490 §5.2.2: preferring LFA over RLFA is a local choice; we do (docs/02-algorithms.md §3).
    return {
      rule: 'Best PQ node',
      text: `Remote LFA not needed: LFA ${lfaBest} already protects ${d}`,
      ok: true,
      rfc,
    }
  }
  const best = result.costs.find((c) => c.node === result.best)
  if (best === undefined) {
    return {
      rule: 'Best PQ node',
      text: `No Remote LFA for link ${linkText(graph, s, e, result.link)}`,
      ok: false,
      rfc,
    }
  }
  const p = best.node
  const lowest = result.costs.length > 1 ? ', lowest' : ''
  const text =
    best.exitVia === undefined
      ? `Best PQ node: ${p} (cost dist(${s},${p}) = ${best.cost}${lowest}). Tunnel to ${p}, which forwards normally to ${e}`
      : `Best PQ node: ${p} via ${best.exitVia} (cost c(${s},${best.exitVia})+dist(${best.exitVia},${p}) = ${best.cSN}+${best.distNY} = ${best.cost}${lowest}). Tunnel to ${p}, sent out through ${best.exitVia}`
  return { rule: 'Best PQ node', text, ok: true, rfc }
}

/** "Adj-SID(B→C)", or "Adj-SID(B→C over B-C#2)" for one link of a bundle (D29). */
const segmentName = (x: Segment, graph?: Graph) =>
  x.kind === 'prefix'
    ? `Prefix-SID(${x.node})`
    : isBundle(graph, x.from, x.to)
      ? `Adj-SID(${x.from}→${x.to} over ${x.link})`
      : `Adj-SID(${x.from}→${x.to})`

/**
 * Turns a TI-LFA result into steps: the post-convergence path, each step of the
 * greedy walk (why this router, or why an Adj-SID), the clean-up rules, and the
 * final label stack. Example:
 * "From B, C: dist(B,C)=4 matches path cost 10 ✗; avoids S–E: … ✗".
 */
export function explainTilfa(result: TilfaResult, graph?: Graph, msd?: number): ExplainStep[] {
  const { s, d, e } = result
  const sE = linkText(graph, s, e, result.link)
  const name = (x: Segment) => segmentName(x, graph)
  const steps: ExplainStep[] = []
  // Node protection fell back to link protection (D51): say why first.
  if (result.fallback !== undefined) {
    steps.push({
      rule: 'TI-LFA node protection',
      text:
        result.fallback === 'dest-is-next-hop'
          ? `${d} is the next hop ${e} itself, so router ${e} can’t be avoided: ${scopeName(result.scope)} only`
          : `${d} can’t be reached once ${lostText(result)}: no repair for that, ${scopeName(result.scope)} only ✗`,
      ok: false,
      rfc: 'RFC 9855 §1',
    })
  }
  if (result.partitioned || result.path === undefined || result.segments === undefined) {
    steps.push({
      rule: 'Post-convergence path',
      text: `${d} can’t be reached once ${sE} fails: unprotected (the network is partitioned)`,
      ok: false,
      rfc: 'RFC 9855 §3',
    })
    return steps
  }

  const node = result.scope === 'node' || result.scope === 'node-srlg'
  const shared =
    result.scope === 'srlg' || result.scope === 'node-srlg' ? (result.srlgLinks ?? []) : []
  const lan = node ? [] : (result.lanLinks ?? [])
  const removed =
    (node ? `router ${e} (and all its links)` : sE) +
    (lan.length > 0
      ? ` and ${s}’s other ${lan.length === 1 ? 'link' : 'links'} on the same LAN (${lan.join(', ')})`
      : '') +
    (shared.length > 0
      ? ` and ${shared.length === 1 ? 'link' : 'links'} ${shared.join(', ')} (same SRLG)`
      : '')
  steps.push({
    rule: 'Post-convergence path',
    text: `Post-convergence path with ${removed} removed: ${result.path.join(' → ')} (cost ${num(result.cost ?? Infinity)})`,
    ok: true,
    rfc: result.scope === 'link' ? 'RFC 9855 §3' : 'RFC 9855 §2.1',
  })

  for (const w of result.walk) {
    // The algorithm tries the furthest router first, so the failed check comes first.
    if (w.rejected !== undefined) {
      steps.push({
        rule: 'TI-LFA walk',
        text: `From ${w.from}, ${w.rejected.node}: ${checkText(w.rejected, result, sE, graph)}`,
        ok: false,
        rfc: 'RFC 9855 §5',
      })
    }
    if (w.segment.kind === 'prefix' && w.accepted !== undefined) {
      steps.push({
        rule: 'TI-LFA walk',
        text: `From ${w.from}, ${w.accepted.node}: ${checkText(w.accepted, result, sE, graph)} → ${name(w.segment)}`,
        ok: true,
        rfc: 'RFC 9855 §5',
      })
    } else if (w.segment.kind === 'adj') {
      steps.push({
        rule: 'TI-LFA walk',
        text: `From ${w.from}: no router further along can be reached with a prefix-SID, so ${name(w.segment)} forces the link ${w.segment.from}→${w.segment.to}`,
        ok: true,
        rfc: 'RFC 9855 §5.3',
      })
    }
  }

  const n1 = result.path[1]!
  if (result.dropped !== undefined) {
    steps.push({
      rule: 'TI-LFA clean-up',
      text: `Dropped ${name(result.dropped)}: ${n1} is the first hop, so sending out of ${linkText(graph, s, n1, result.outLink)} already gets there`,
      ok: true,
      rfc: 'RFC 9855 §5.1',
    })
  }

  const rawLast = result.rawSegments?.at(-1)
  if (rawLast === undefined || rawLast.kind !== 'prefix' || rawLast.node !== d) {
    steps.push({
      rule: 'TI-LFA destination label',
      text: `Added Prefix-SID(${d}): the destination’s own label stays under the repair list`,
      ok: true,
      rfc: 'RFC 9855 §7.1',
    })
  }

  const extra = result.extraLabels ?? 0
  steps.push({
    rule: 'TI-LFA segment list',
    text: `Segment list [${result.segments.map(name).join(', ')}] → labels ${(result.labelStack ?? []).join(', ')} (top first, before PHP): ${extra} extra label${extra === 1 ? '' : 's'}, sent out via ${hopText(graph, s, n1, result.outLink)}`,
    ok: true,
    rfc: 'RFC 9855 §5',
  })
  if (msd !== undefined) {
    const depth = (result.labelStack ?? []).length
    const fits = depth <= msd
    // RFC 8491 §1.1: imposed = swapped (D's label) + pushed (the repair list).
    steps.push({
      rule: 'TI-LFA max SID depth',
      text: `${depth} label${depth === 1 ? '' : 's'} (1 swapped + ${extra} pushed) ${fits ? '≤' : '>'} MSD ${msd} of ${s} ${mark(fits)}${fits ? '' : `: ${s}’s hardware can’t impose this stack, so no TI-LFA backup is installed`}`,
      ok: fits,
      rfc: 'RFC 8491 §5',
    })
  }
  return steps
}

/** "(a) same cost as the repair path; (b) all normal paths avoid S–E" with the numbers. */
function checkText(c: SegmentCheck, r: TilfaResult, sE: string, graph?: Graph): string {
  const hit =
    c.lanHit !== undefined
      ? `; may use ${c.lanHit}, which fails with ${r.s}’s LAN interface ✗`
      : c.srlgHit === undefined
        ? ''
        : `; may use ${c.srlgHit} of the same SRLG ✗`
  return baseCheckText(c, r, sE, graph) + hit
}

/** "link protection", "node protection", … for the scope a repair really has. */
const scopeName = (scope: TilfaResult['scope']) =>
  ({
    link: 'link protection',
    node: 'node protection',
    srlg: 'link + SRLG protection',
    'node-srlg': 'node + SRLG protection',
  })[scope]

/** What the goal also wanted to survive but couldn't: "router E", "the SRLG links", or both. */
function lostText(r: TilfaResult): string {
  const goalNode = r.goal === 'node' || r.goal === 'node-srlg'
  const goalSrlg = r.goal === 'srlg' || r.goal === 'node-srlg'
  const node = goalNode && r.scope !== 'node' && r.scope !== 'node-srlg'
  const srlg = goalSrlg && r.scope !== 'srlg' && r.scope !== 'node-srlg'
  if (node && srlg) return `router ${r.e} and the links of its SRLG fail`
  return node ? `router ${r.e} fails` : 'the links of its SRLG fail'
}

function baseCheckText(
  c: SegmentCheck,
  { s, e, cSE }: TilfaResult,
  sE: string,
  graph?: Graph,
): string {
  const xy = `dist(${c.from},${c.node})=${num(c.distXY)}`
  if (c.viaNode !== undefined) {
    // Node scope (§4.4): every normal path avoids router E.
    return (
      `${xy} matches path cost ${num(c.pathCost)} ${mark(c.onPath)}; ` +
      `avoids router ${e}: ${xy} < dist(${c.from},${e})+dist(${e},${c.node}) ` +
      `${sumText([c.distXE ?? Infinity, c.distEY], c.viaNode, [e], graph)} ${mark(c.avoids)}`
    )
  }
  // S is only transit when the segment starts elsewhere, E only when it ends elsewhere.
  const middle = [...(c.from !== s ? [s] : []), ...(c.node !== e ? [e] : [])]
  return (
    `${xy} matches path cost ${num(c.pathCost)} ${mark(c.onPath)}; ` +
    `avoids ${sE}: ${xy} < dist(${c.from},${s})+c(${s},${e})+dist(${e},${c.node}) ` +
    `${sumText([c.distXS, cSE, c.distEY], c.viaLink, middle, graph)} ${mark(c.avoids)}`
  )
}

/**
 * Node-protecting Remote LFA steps (RFC 8102, D51): for every Q-space router, how
 * it gets into the node-protecting P-space (or why not), whether its own path to D
 * avoids E, then the choice. `used` = the result really uses this PQ node.
 */
export function explainNodeRlfa(
  result: NodeRlfaResult,
  ctx: { lfaBest?: NodeId | undefined; linkBest?: NodeId | undefined; graph?: Graph },
): ExplainStep[] {
  const { s, e, d } = result
  const { graph } = ctx
  const steps: ExplainStep[] = []
  for (const c of result.pChecks) {
    const y = c.node
    const x = c.via ?? s
    const how = c.via === null ? `${s}’s own path` : `via ${c.via}`
    steps.push({
      rule: 'Node-protecting P-space',
      text: `Node-protecting P-space: ${y} ${how}: dist(${x},${y})=${num(c.distXY)} < dist(${x},${e})+dist(${e},${y}) ${sumText([c.distXE, c.distEY], c.viaE, [e], graph)} ${mark(c.inP)}`,
      ok: c.inP,
      rfc: 'RFC 8102 §2.2.2',
    })
  }
  for (const c of result.destChecks) {
    steps.push({
      rule: 'Node-protecting PQ',
      text: `${c.node}’s path to ${d} avoids ${e}: dist(${c.node},${d})=${num(c.distYD)} < dist(${c.node},${e})+dist(${e},${d}) ${sumText([c.distYE, c.distED], c.viaE, [e], graph)} ${mark(c.ok)}`,
      ok: c.ok,
      rfc: 'RFC 8102 §2.3.2',
    })
  }
  const rfc = 'RFC 8102 §2.3.4'
  if (ctx.lfaBest !== undefined) {
    steps.push({
      rule: 'Node-protecting PQ',
      text: `Remote LFA not needed: LFA ${ctx.lfaBest} already protects ${d}`,
      ok: true,
      rfc,
    })
    return steps
  }
  const best = result.costs.find((c) => c.node === result.best)
  if (best === undefined) {
    steps.push({
      rule: 'Node-protecting PQ',
      text:
        ctx.linkBest !== undefined
          ? `No node-protecting PQ node for ${d}: falls back to link protection, PQ node ${ctx.linkBest} ✗`
          : `No node-protecting PQ node for ${d} ✗`,
      ok: false,
      rfc,
    })
    return steps
  }
  const via = best.exitVia === undefined ? '' : ` via ${best.exitVia}`
  const lowest = result.costs.length > 1 ? ', lowest' : ''
  steps.push({
    rule: 'Node-protecting PQ',
    text: `Best node-protecting PQ node: ${best.node}${via} (cost ${best.cost}${lowest}). The tunnel and ${best.node}’s path to ${d} both avoid router ${e}`,
    ok: true,
    rfc,
  })
  return steps
}

/**
 * SRv6 (D59): the repair list as SIDs (RFC 9855 §7.2), and the max SID depth check on
 * the SIDs S pushes. D stays the inner packet's address, so it is not in the list.
 */
export function explainSrv6(
  sids: string[],
  d: NodeId,
  msd: number | undefined,
  s: NodeId,
): ExplainStep[] {
  const steps: ExplainStep[] = [
    {
      rule: 'SRv6 SID list',
      text:
        sids.length === 0
          ? `SRv6: no SIDs needed: sending out of the repair interface reaches ${d} on normal routing`
          : `SRv6: S encapsulates with SID list [${sids.join(', ')}] (${sids.length} SID${sids.length === 1 ? '' : 's'}); ${d} stays the inner destination`,
      ok: true,
      rfc: 'RFC 9855 §7.2',
    },
  ]
  if (msd !== undefined) {
    const fits = sids.length <= msd
    steps.push({
      rule: 'TI-LFA max SID depth',
      text: `${sids.length} SID${sids.length === 1 ? '' : 's'} ${fits ? '≤' : '>'} MSD ${msd} of ${s} ${mark(fits)}${fits ? '' : `: ${s} can’t push this list, so no TI-LFA backup is installed`}`,
      ok: fits,
      rfc: 'RFC 9352 §4',
    })
  }
  return steps
}

import { hopText, isBundle, linkText, type Graph } from './graph'
import { MAX_METRIC, type LfaCheck, type LfaResult } from './lfa'
import type { RlfaResult } from './rlfa'
import type { SegmentCheck, TilfaResult } from './tilfa'
import type { ExplainStep, NodeId, Segment } from './types'

const mark = (ok: boolean) => (ok ? '✓' : '✗')
const num = (x: number) => (Number.isFinite(x) ? String(x) : '∞')

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

  for (const skip of result.skipped) {
    steps.push({
      rule: 'LFA skipped',
      text: `Via ${hopText(graph, s, skip.neighbor, skip.link)}: skipped, link ${linkText(graph, s, skip.neighbor, skip.link)} has the maximum metric ${MAX_METRIC}`,
      ok: false,
      rfc: 'RFC 5286 §3.5',
    })
  }

  result.checks.forEach((c, i) => {
    const cand = result.candidates[i]
    if (cand === undefined) return
    steps.push(...candidateSteps(c, { s, d, e, graph }, cand))
  })

  steps.push(ecmpStep(ctx))
  steps.push(bestStep(result, ctx))
  return steps
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
      text: `Via ${via}: ${nd} < dist(${n},${s})+dist(${s},${d}) = ${num(c.distNS)}+${num(c.distSD)} = ${num(c.distNS + c.distSD)} ${mark(flags.loopFree)}`,
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
      text: `Via ${via}: ${nd} < dist(${n},${e})+dist(${e},${d}) = ${num(c.distNE)}+${num(c.distED)} = ${num(c.distNE + c.distED)} ${mark(flags.nodeProtecting)}`,
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
    steps.push({
      rule: 'Extended P-space skipped',
      text: `Via ${hopText(graph, s, skip.neighbor, skip.link)}: not used as a tunnel exit, link ${linkText(graph, s, skip.neighbor, skip.link)} has the maximum metric ${MAX_METRIC}`,
      ok: false,
      rfc: 'RFC 7490 §5.4',
    })
  }

  for (const c of result.pChecks) {
    const y = c.node
    steps.push({
      rule: 'P-space',
      text: `P-space: ${y}: dist(${s},${y})=${num(c.distSY)} < c(${s},${e})+dist(${e},${y}) = ${cSE}+${num(c.distEY)} = ${num(cSE + c.distEY)} ${mark(c.inP)}`,
      ok: c.inP,
      rfc: 'RFC 7490 §5.2.1.1',
    })
  }

  for (const c of result.extChecks) {
    const { neighbor: n, node: y } = c
    steps.push({
      rule: 'Extended P-space',
      text: `Extended P-space: ${y} via ${n}: dist(${n},${y})=${num(c.distNY)} < dist(${n},${s})+dist(${s},${y}) = ${num(c.distNS)}+${num(c.distSY)} = ${num(c.distNS + c.distSY)} ${mark(c.inP)}`,
      ok: c.inP,
      rfc: 'RFC 7490 §5.2.1.2',
    })
  }

  for (const c of result.qChecks) {
    const y = c.node
    steps.push({
      rule: 'Q-space',
      text: `Q-space: ${y}: dist(${y},${e})=${num(c.distYE)} < dist(${y},${s})+c(${s},${e}) = ${num(c.distYS)}+${cSE} = ${num(c.distYS + cSE)} ${mark(c.inQ)}`,
      ok: c.inQ,
      rfc: 'RFC 7490 §5.2.1.3',
    })
  }

  const pName = result.extended ? 'extended P' : 'P'
  steps.push({
    rule: 'PQ nodes',
    text:
      result.pq.length > 0
        ? `PQ = ${pName} ∩ Q = {${result.pq.join(', ')}}`
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
export function explainTilfa(result: TilfaResult, graph?: Graph): ExplainStep[] {
  const { s, d, e } = result
  const sE = linkText(graph, s, e, result.link)
  const name = (x: Segment) => segmentName(x, graph)
  if (result.partitioned || result.path === undefined || result.segments === undefined) {
    return [
      {
        rule: 'Post-convergence path',
        text: `${d} can’t be reached once ${sE} fails: unprotected (the network is partitioned)`,
        ok: false,
        rfc: 'RFC 9855 §3',
      },
    ]
  }

  const steps: ExplainStep[] = [
    {
      rule: 'Post-convergence path',
      text: `Post-convergence path with ${sE} removed: ${result.path.join(' → ')} (cost ${num(result.cost ?? Infinity)})`,
      ok: true,
      rfc: 'RFC 9855 §3',
    },
  ]

  for (const w of result.walk) {
    // The algorithm tries the furthest router first, so the failed check comes first.
    if (w.rejected !== undefined) {
      steps.push({
        rule: 'TI-LFA walk',
        text: `From ${w.from}, ${w.rejected.node}: ${checkText(w.rejected, result, sE)}`,
        ok: false,
        rfc: 'RFC 9855 §5',
      })
    }
    if (w.segment.kind === 'prefix' && w.accepted !== undefined) {
      steps.push({
        rule: 'TI-LFA walk',
        text: `From ${w.from}, ${w.accepted.node}: ${checkText(w.accepted, result, sE)} → ${name(w.segment)}`,
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
  return steps
}

/** "(a) same cost as the repair path; (b) all normal paths avoid S–E" with the numbers. */
function checkText(c: SegmentCheck, { s, e, cSE }: TilfaResult, sE: string): string {
  const xy = `dist(${c.from},${c.node})=${num(c.distXY)}`
  const sum = c.distXS + cSE + c.distEY
  return (
    `${xy} matches path cost ${num(c.pathCost)} ${mark(c.onPath)}; ` +
    `avoids ${sE}: ${xy} < dist(${c.from},${s})+c(${s},${e})+dist(${e},${c.node}) = ` +
    `${num(c.distXS)}+${cSE}+${num(c.distEY)} = ${num(sum)} ${mark(c.avoids)}`
  )
}

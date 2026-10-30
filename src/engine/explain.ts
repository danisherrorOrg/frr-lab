import { MAX_METRIC, type LfaCheck, type LfaResult } from './lfa'
import type { RlfaResult } from './rlfa'
import type { ExplainStep, NodeId } from './types'

const mark = (ok: boolean) => (ok ? '✓' : '✗')
const num = (x: number) => (Number.isFinite(x) ? String(x) : '∞')

/** Where S, D and E sit for one protection, so steps can name them. */
export interface LfaContext {
  s: NodeId
  d: NodeId
  e: NodeId
  /** From ecmpProtectors(): other primary next hops that avoid S–E. */
  ecmpProtectors: NodeId[]
}

/**
 * Turns an LFA result into steps with the real numbers, one per inequality
 * per neighbor, then the ECMP check and the final choice.
 * Example: "Via A: dist(A,E)=2 < dist(A,S)+dist(S,E) = 1+1 = 2 ✗".
 */
export function explainLfa(result: LfaResult, ctx: LfaContext): ExplainStep[] {
  const { s, d, e } = ctx
  const steps: ExplainStep[] = []

  for (const skip of result.skipped) {
    steps.push({
      rule: 'LFA skipped',
      text: `Via ${skip.neighbor}: skipped, link ${s}–${skip.neighbor} has the maximum metric ${MAX_METRIC}`,
      ok: false,
      rfc: 'RFC 5286 §3.5',
    })
  }

  result.checks.forEach((c, i) => {
    const cand = result.candidates[i]
    if (cand === undefined) return
    steps.push(...candidateSteps(c, { s, d, e }, cand))
  })

  steps.push(ecmpStep(ctx))
  steps.push(bestStep(result, ctx))
  return steps
}

function candidateSteps(
  c: LfaCheck,
  { s, d, e }: { s: NodeId; d: NodeId; e: NodeId },
  flags: { loopFree: boolean; downstream: boolean; nodeProtecting: boolean },
): ExplainStep[] {
  const n = c.neighbor
  const nd = `dist(${n},${d})=${num(c.distND)}`
  return [
    {
      rule: 'LFA loop-free (Inequality 1)',
      text: `Via ${n}: ${nd} < dist(${n},${s})+dist(${s},${d}) = ${num(c.distNS)}+${num(c.distSD)} = ${num(c.distNS + c.distSD)} ${mark(flags.loopFree)}`,
      ok: flags.loopFree,
      rfc: 'RFC 5286 §3.1',
    },
    {
      rule: 'LFA downstream (Inequality 2)',
      text: `Via ${n}: ${nd} < dist(${s},${d})=${num(c.distSD)} ${mark(flags.downstream)}`,
      ok: flags.downstream,
      rfc: 'RFC 5286 §1',
    },
    {
      rule: 'LFA node-protecting (Inequality 3)',
      text: `Via ${n}: ${nd} < dist(${n},${e})+dist(${e},${d}) = ${num(c.distNE)}+${num(c.distED)} = ${num(c.distNE + c.distED)} ${mark(flags.nodeProtecting)}`,
      ok: flags.nodeProtecting,
      rfc: 'RFC 5286 §3.2',
    },
  ]
}

function ecmpStep({ s, d, e, ecmpProtectors }: LfaContext): ExplainStep {
  const ok = ecmpProtectors.length > 0
  return {
    rule: 'ECMP-protected',
    text: ok
      ? `Other primary next hop ${ecmpProtectors.join(', ')} to ${d} avoids ${s}–${e}, so traffic keeps flowing ✓`
      : `No other primary next hop to ${d} avoids ${s}–${e} ✗`,
    ok,
    rfc: 'RFC 5286 §3.4',
  }
}

function bestStep(result: LfaResult, { s, d }: LfaContext): ExplainStep {
  const i = result.candidates.findIndex((c) => c.neighbor === result.best)
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
    text: `Best LFA: ${best.neighbor} (${kinds.join(', ')}, cost c(${s},${best.neighbor})+dist(${best.neighbor},${d}) = ${check.cSN}+${num(check.distND)} = ${num(best.cost)})`,
    ok: true,
    rfc: 'RFC 5286 §3.6',
  }
}

/** What explainRlfa needs besides the RLFA result. */
export interface RlfaContext {
  d: NodeId
  /** The chosen LFA, if any: then RLFA isn't needed (docs/02-algorithms.md §3). */
  lfaBest?: NodeId | undefined
}

/**
 * Turns an RLFA result into steps with the real numbers: each P-space,
 * extended P-space and Q-space check, then the PQ set and the chosen node.
 * Example: "Q-space: B: dist(B,E)=2 < dist(B,S)+c(S,E) = 2+1 = 3 ✓".
 */
export function explainRlfa(result: RlfaResult, ctx: RlfaContext): ExplainStep[] {
  const { s, e, cSE } = result
  const steps: ExplainStep[] = []

  for (const skip of result.skipped) {
    steps.push({
      rule: 'Extended P-space skipped',
      text: `Via ${skip.neighbor}: not used as a tunnel exit, link ${s}–${skip.neighbor} has the maximum metric ${MAX_METRIC}`,
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

function bestPqStep(result: RlfaResult, { d, lfaBest }: RlfaContext): ExplainStep {
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
    return { rule: 'Best PQ node', text: `No Remote LFA for link ${s}–${e}`, ok: false, rfc }
  }
  const p = best.node
  const lowest = result.costs.length > 1 ? ', lowest' : ''
  const text =
    best.exitVia === undefined
      ? `Best PQ node: ${p} (cost dist(${s},${p}) = ${best.cost}${lowest}). Tunnel to ${p}, which forwards normally to ${e}`
      : `Best PQ node: ${p} via ${best.exitVia} (cost c(${s},${best.exitVia})+dist(${best.exitVia},${p}) = ${best.cSN}+${best.distNY} = ${best.cost}${lowest}). Tunnel to ${p}, sent out through ${best.exitVia}`
  return { rule: 'Best PQ node', text, ok: true, rfc }
}

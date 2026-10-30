import { MAX_METRIC, type LfaCheck, type LfaResult } from './lfa'
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

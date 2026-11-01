// Quiz mode for students (Later #4, D54, docs/02-algorithms.md §19). Questions come
// from the engine's own results on the network on screen, and every answer is
// explained with the same steps (and numbers) the detail panel shows. Pure and
// seeded: the same network and seed always give the same quiz.
import { computeForSource } from './index'
import { protectedBy, type Method } from './rows'
import type { DestinationResult, ExplainStep, NodeId, Protection, Topology } from './types'

export type QuizKind =
  | 'loop-free'
  | 'best-lfa'
  | 'p-space'
  | 'q-space'
  | 'pq-node'
  | 'extra-labels'
  | 'label-stack'
  | 'method'

export interface QuizQuestion {
  kind: QuizKind
  /** The row the question is about: S, D, and the protected link S–E. */
  source: NodeId
  dest: NodeId
  via: NodeId
  link: string
  prompt: string
  choices: string[]
  /** Index of the right choice. */
  answer: number
  /** Why, with the numbers: explain steps of that row. */
  explain: ExplainStep[]
}

/** Every kind, in the order a quiz cycles through them. */
export const QUIZ_KINDS: QuizKind[] = [
  'loop-free',
  'best-lfa',
  'method',
  'p-space',
  'q-space',
  'pq-node',
  'extra-labels',
  'label-stack',
]

/** Park–Miller, as in the generator (D50): a whole-number seed, no Math.random. */
function rng(seed: number): () => number {
  let x = (Math.abs(Math.trunc(seed)) % 2147483646) + 1
  return () => {
    x = (x * 48271) % 2147483647
    return (x - 1) / 2147483646
  }
}

const METHOD_TEXT: Record<Method, string> = {
  ecmp: 'ECMP (another equal-cost next hop)',
  lfa: 'LFA',
  rlfa: 'Remote LFA',
  tilfa: 'TI-LFA',
}
const NOTHING = 'Nothing: it is unprotected'

interface Row {
  source: NodeId
  result: DestinationResult
  p: Protection
}

/**
 * A quiz of `count` questions on this network. Kinds take turns (shuffled by the
 * seed); a kind that doesn't fit the row picked is skipped for the next. Fewer
 * questions come back when the network has nothing to ask about (no links).
 */
export function makeQuiz(topology: Topology, seed: number, count = 10): QuizQuestion[] {
  const rand = rng(seed)
  const pick = <T>(xs: readonly T[]): T => xs[Math.floor(rand() * xs.length)]!
  const shuffle = <T>(xs: readonly T[]): T[] => {
    const out = [...xs]
    for (let i = out.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1))
      ;[out[i], out[j]] = [out[j]!, out[i]!]
    }
    return out
  }

  const sources = topology.nodes.map((n) => n.id).sort()
  const cache = new Map<NodeId, Row[]>()
  const rowsOf = (s: NodeId): Row[] => {
    let rows = cache.get(s)
    if (rows === undefined) {
      rows = computeForSource(topology, s).flatMap((result) =>
        result.protections.map((p) => ({ source: s, result, p })),
      )
      cache.set(s, rows)
    }
    return rows
  }

  const kinds = shuffle(QUIZ_KINDS)
  const out: QuizQuestion[] = []
  const seen = new Set<string>()
  // Gives up after many tries: a tiny network has only so many different questions.
  for (let attempt = 0; out.length < count && attempt < count * 20; attempt++) {
    const s = pick(sources)
    const rows = rowsOf(s)
    if (rows.length === 0) continue
    const row = pick(rows)
    // This turn's kind first, then the others, so a row that doesn't fit one kind still counts.
    const first = out.length % kinds.length
    const order = [...kinds.slice(first), ...kinds.slice(0, first)]
    const q = order
      .map((k) => ask(k, row, topology, pick, shuffle))
      .find((x) => x !== undefined && !seen.has(key(x)))
    if (q === undefined) continue
    seen.add(key(q))
    out.push(q)
  }
  return out
}

const key = (q: QuizQuestion) => `${q.kind}|${q.source}|${q.dest}|${q.link}|${q.prompt}`

/** The explain steps with these rules whose text starts with `prefix` (if given). */
const steps = (p: Protection, rules: string[], prefix?: string) =>
  p.explain.filter(
    (x) => rules.includes(x.rule) && (prefix === undefined || x.text.startsWith(prefix)),
  )

const yesNo = (yes: boolean) => ({ choices: ['Yes', 'No'], answer: yes ? 0 : 1 })

/** Three or four choices with the right one somewhere in them. */
function choicesWith(
  right: string,
  others: string[],
  shuffle: <T>(xs: readonly T[]) => T[],
  max = 4,
): { choices: string[]; answer: number } {
  const wrong = [...new Set(others.filter((x) => x !== right))].slice(0, max - 1)
  const choices = shuffle([right, ...wrong])
  return { choices, answer: choices.indexOf(right) }
}

function ask(
  kind: QuizKind,
  { source: s, result, p }: Row,
  topology: Topology,
  pick: <T>(xs: readonly T[]) => T,
  shuffle: <T>(xs: readonly T[]) => T[],
): QuizQuestion | undefined {
  const d = result.dest
  const e = p.protectedLink.to
  const base = { kind, source: s, dest: d, via: e, link: p.protectedLink.id }
  const fails = `${s} sends traffic for ${d} to ${e}. The link ${s}–${e} fails.`
  const others = topology.nodes.map((n) => n.id).filter((x) => x !== s && x !== e)

  switch (kind) {
    case 'loop-free': {
      // Neighbors with one candidate link only, so "via N" names one candidate.
      const single = p.lfa.candidates.filter(
        (c) => p.lfa.candidates.filter((x) => x.neighbor === c.neighbor).length === 1,
      )
      if (single.length === 0) return undefined
      const c = pick(single)
      return {
        ...base,
        prompt: `${fails} Is neighbor ${c.neighbor} loop-free for ${d}, so it won’t send the traffic back to ${s}?`,
        ...yesNo(c.loopFree),
        explain: steps(p, ['LFA loop-free (Inequality 1)'], `Via ${c.neighbor}:`),
      }
    }
    case 'best-lfa': {
      if (p.lfa.candidates.length === 0 || p.ecmpProtected) return undefined
      const none = 'No LFA'
      const names = [...new Set(p.lfa.candidates.map((c) => c.neighbor))]
      return {
        ...base,
        prompt: `${fails} Which neighbor does ${s} pick as its LFA for ${d}?`,
        ...choicesWith(p.lfa.best ?? none, [...names, none], shuffle),
        explain: [
          ...steps(p, ['LFA loop-free (Inequality 1)', 'LFA node-protecting (Inequality 3)']),
          ...steps(p, ['Best LFA']),
        ],
      }
    }
    case 'method': {
      const m = protectedBy(p)
      const right = m === null ? NOTHING : METHOD_TEXT[m]
      return {
        ...base,
        prompt: `${fails} What is the simplest method that protects ${s}’s traffic to ${d}?`,
        ...choicesWith(right, [...Object.values(METHOD_TEXT), NOTHING], shuffle, 5),
        explain: steps(p, ['ECMP-protected', 'Best LFA', 'Best PQ node', 'TI-LFA segment list']),
      }
    }
    case 'p-space':
    case 'q-space': {
      if (others.length === 0) return undefined
      const y = pick(others)
      const inP = kind === 'p-space'
      const set = inP ? p.rlfa.pSpace : p.rlfa.qSpace
      return {
        ...base,
        prompt: inP
          ? `${fails} Can ${s} reach ${y} on its normal path without using ${s}–${e} (is ${y} in ${s}’s P-space)?`
          : `${fails} Does ${y} reach ${e} on its normal path without using ${s}–${e} (is ${y} in ${e}’s Q-space)?`,
        ...yesNo(set.includes(y)),
        explain: steps(p, [inP ? 'P-space' : 'Q-space'], `${inP ? 'P-space' : 'Q-space'}: ${y}:`),
      }
    }
    case 'pq-node': {
      if (!p.rlfa.needed) return undefined
      const none = 'No PQ node'
      return {
        ...base,
        prompt: `${fails} ${s} has no LFA for ${d}. Which PQ node does Remote LFA tunnel to?`,
        ...choicesWith(p.rlfa.best ?? none, [...shuffle([...p.rlfa.pq, ...others]), none], shuffle),
        explain: steps(p, ['PQ nodes', 'Best PQ node', 'Node-protecting PQ']),
      }
    }
    case 'extra-labels': {
      const extra = p.tilfa.extraLabels
      if (extra === undefined) return undefined
      const choices = ['0', '1', '2', '3 or more']
      return {
        ...base,
        prompt: `${fails} How many labels does ${s}’s TI-LFA repair push on top of ${d}’s own label?`,
        choices,
        answer: Math.min(extra, 3),
        explain: steps(p, ['Post-convergence path', 'TI-LFA walk', 'TI-LFA segment list']),
      }
    }
    case 'label-stack': {
      const stack = p.tilfa.labelStack
      if (stack === undefined || stack.length < 2) return undefined
      const text = (xs: number[]) => xs.join(' ')
      const right = text(stack)
      const wrong = [
        text([...stack].reverse()),
        text(stack.slice(0, -1)),
        text(stack.slice(1)),
        text([stack[0]!, ...stack]),
      ].filter((x) => x !== '' && x !== right)
      return {
        ...base,
        prompt: `${fails} Which label stack (top first, before PHP) does ${s}’s TI-LFA repair send?`,
        ...choicesWith(right, wrong, shuffle),
        explain: steps(p, ['Post-convergence path', 'TI-LFA walk', 'TI-LFA segment list']),
      }
    }
  }
}

/** The share of right answers as "7 of 10". */
export const scoreText = (right: number, asked: number) => `${right} of ${asked}`

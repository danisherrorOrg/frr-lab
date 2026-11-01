// Quiz mode (Later #4, D54, docs/02-algorithms.md §19).
import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { computeForSource, protectedBy } from '../../src/engine/index'
import { makeQuiz, QUIZ_KINDS, type QuizQuestion } from '../../src/engine/quiz'
import type { Topology } from '../../src/engine/types'
import { connectedTopology } from '../arbitraries'
import { loadFixture } from '../helpers'

/** Checks one question's answer against the engine, independently of how it was built. */
function check(t: Topology, q: QuizQuestion) {
  expect(new Set(q.choices).size).toBe(q.choices.length)
  expect(q.answer).toBeGreaterThanOrEqual(0)
  expect(q.answer).toBeLessThan(q.choices.length)
  expect(q.explain.length).toBeGreaterThan(0)
  const p = computeForSource(t, q.source)
    .find((r) => r.dest === q.dest)!
    .protections.find((x) => x.protectedLink.id === q.link)!
  const right = q.choices[q.answer]!
  switch (q.kind) {
    case 'loop-free': {
      const n = /Is neighbor (\S+) loop-free/.exec(q.prompt)![1]!
      expect(right === 'Yes').toBe(p.lfa.candidates.find((c) => c.neighbor === n)!.loopFree)
      break
    }
    case 'best-lfa':
      expect(right).toBe(p.lfa.best ?? 'No LFA')
      break
    case 'p-space':
    case 'q-space': {
      const y = /(?:reach|Does) (\S+) /.exec(q.prompt.replace(/^.*?fails\. /, ''))![1]!
      const set = q.kind === 'p-space' ? p.rlfa.pSpace : p.rlfa.qSpace
      expect(right === 'Yes').toBe(set.includes(y))
      break
    }
    case 'pq-node':
      expect(right).toBe(p.rlfa.best ?? 'No PQ node')
      break
    case 'extra-labels':
      expect(right).toBe(['0', '1', '2', '3 or more'][Math.min(p.tilfa.extraLabels!, 3)])
      break
    case 'label-stack':
      expect(right).toBe(p.tilfa.labelStack!.join(' '))
      break
    case 'method': {
      const m = protectedBy(p)
      expect(
        right.startsWith(
          m === null
            ? 'Nothing'
            : { ecmp: 'ECMP', lfa: 'LFA', rlfa: 'Remote LFA', tilfa: 'TI-LFA' }[m],
        ),
      ).toBe(true)
      break
    }
  }
}

describe('makeQuiz', () => {
  const ring = loadFixture('02-ring5.yaml')

  it('gives the same quiz for the same seed, another for another seed', () => {
    expect(makeQuiz(ring, 1)).toEqual(makeQuiz(ring, 1))
    expect(makeQuiz(ring, 1)).not.toEqual(makeQuiz(ring, 2))
  })

  it('asks 10 questions of several kinds on Example 2, each right by the engine', () => {
    const quiz = makeQuiz(ring, 7)
    expect(quiz).toHaveLength(10)
    expect(new Set(quiz.map((q) => q.kind)).size).toBeGreaterThanOrEqual(5)
    for (const q of quiz) check(ring, q)
  })

  it('a P-space question explains with the numbers (Example 2, S, link S–E)', () => {
    // Search a few seeds for "is B in S's P-space" on S → E: B: dist(S,B)=2 < 1+2 ✓.
    const q = [...Array(50).keys()]
      .flatMap((seed) => makeQuiz(ring, seed))
      .find(
        (x) =>
          x.kind === 'p-space' && x.source === 'S' && x.via === 'E' && x.prompt.includes('reach B'),
      )!
    expect(q.choices[q.answer]).toBe('Yes')
    expect(q.explain[0]!.text).toBe('P-space: B: dist(S,B)=2 < c(S,E)+dist(E,B) = 1+2 = 3 ✓')
  })

  it('every kind shows up on Example 3 over a few seeds', () => {
    const ex3 = loadFixture('03-ring5-highmetric.yaml')
    const kinds = new Set([1, 2, 3, 4, 5].flatMap((s) => makeQuiz(ex3, s).map((q) => q.kind)))
    expect([...kinds].sort()).toEqual([...QUIZ_KINDS].sort())
  })

  it('a network with no links has nothing to ask', () => {
    expect(
      makeQuiz({ name: 'x', srgbBase: 16000, nodes: [{ id: 'A', sidIndex: 1 }], links: [] }, 1),
    ).toEqual([])
  })

  it('property: on random networks every answer agrees with the engine', () => {
    fc.assert(
      fc.property(connectedTopology(), fc.nat(1000), (t, seed) => {
        for (const q of makeQuiz(t, seed, 6)) check(t, q)
      }),
      { numRuns: 25 },
    )
  })
})

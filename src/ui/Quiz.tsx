import { useMemo, useState } from 'react'
import { makeQuiz, scoreText } from '../engine/quiz'
import { useStore } from '../state/store'

const button =
  'rounded border border-slate-300 px-3 py-1 text-sm hover:bg-slate-100 disabled:opacity-40 dark:border-slate-600 dark:hover:bg-slate-700'
const QUESTIONS = 10

/**
 * Quiz mode for students (Later #4, D54): ten questions on the network on screen.
 * After each answer it says why, with the numbers, and draws that row on the diagram.
 */
export function Quiz() {
  const [open, setOpen] = useState(false)
  const [seed, setSeed] = useState(1)
  const [at, setAt] = useState(0)
  const [answers, setAnswers] = useState<number[]>([])
  const topology = useStore((s) => s.topology)
  const pickRow = useStore((s) => s.pickRow)

  const quiz = useMemo(
    () => (open ? makeQuiz(topology, seed, QUESTIONS) : []),
    [open, topology, seed],
  )

  const restart = (next: number) => {
    setSeed(next)
    setAt(0)
    setAnswers([])
  }

  if (!open)
    return (
      <div>
        <button
          type="button"
          className={button}
          onClick={() => {
            restart(seed)
            setOpen(true)
          }}
          title="Ten questions on this network, with the reasoning after each answer"
        >
          🎓 Quiz
        </button>
      </div>
    )

  const right = answers.filter((a, i) => a === quiz[i]?.answer).length
  const q = quiz[at]
  const chosen = answers[at]
  const done = at >= quiz.length

  return (
    <section aria-label="Quiz" className="text-sm">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="mr-auto text-base font-semibold">Quiz</h2>
        <span className="text-xs text-slate-500" aria-label="Score">
          Score {scoreText(right, answers.length)}
        </span>
        <button type="button" className={button} onClick={() => restart(seed + 1)}>
          New quiz
        </button>
        <button type="button" className={button} onClick={() => setOpen(false)}>
          Hide
        </button>
      </div>

      {quiz.length === 0 && (
        <p className="mt-2">
          This network has no links, so there is nothing to ask. Load an example.
        </p>
      )}

      {q && (
        <div className="mt-2 rounded border border-slate-200 p-3 dark:border-slate-700">
          <p className="text-xs text-slate-500">
            Question {at + 1} of {quiz.length} · source {q.source}, destination {q.dest}
          </p>
          <p className="mt-1 font-medium">{q.prompt}</p>
          <div role="group" aria-label="Answers" className="mt-2 flex flex-wrap gap-2">
            {q.choices.map((c, i) => {
              const picked = chosen === i
              const shown = chosen !== undefined
              const tone = !shown
                ? ''
                : i === q.answer
                  ? 'border-green-600 bg-green-50 dark:bg-green-950'
                  : picked
                    ? 'border-red-600 bg-red-50 dark:bg-red-950'
                    : 'opacity-60'
              return (
                <button
                  key={c}
                  type="button"
                  aria-pressed={picked}
                  disabled={shown}
                  className={`${button} ${tone}`}
                  onClick={() => {
                    setAnswers((a) => [...a.slice(0, at), i])
                    // Draw that row, so the answer can be checked on the diagram.
                    pickRow(q.source, { dest: q.dest, via: q.via, link: q.link })
                  }}
                >
                  {shown && i === q.answer ? '✓ ' : shown && picked ? '✗ ' : ''}
                  {c}
                </button>
              )
            })}
          </div>
          {chosen !== undefined && (
            <div className="mt-3" aria-live="polite">
              <p className="font-semibold">
                {chosen === q.answer
                  ? '✓ Right.'
                  : `✗ Not quite: the answer is ${q.choices[q.answer]}.`}
              </p>
              <ul aria-label="Why" className="mt-1 list-disc pl-5 text-xs">
                {q.explain.map((x, i) => (
                  <li key={i}>
                    {x.text}
                    {x.rfc && <span className="ml-1 text-slate-500">({x.rfc})</span>}
                  </li>
                ))}
              </ul>
              <button type="button" className={`${button} mt-2`} onClick={() => setAt(at + 1)}>
                {at + 1 < quiz.length ? 'Next question' : 'See my score'}
              </button>
            </div>
          )}
        </div>
      )}

      {done && quiz.length > 0 && (
        <div className="mt-2 rounded border border-slate-200 p-3 dark:border-slate-700">
          <p className="font-semibold">You got {scoreText(right, quiz.length)} right.</p>
          <p className="text-xs text-slate-500">
            Each question is built from LFA Lab’s own results on this network. Try another quiz, or
            load another example.
          </p>
          <button type="button" className={`${button} mt-2`} onClick={() => restart(seed + 1)}>
            New quiz
          </button>
        </div>
      )}
    </section>
  )
}

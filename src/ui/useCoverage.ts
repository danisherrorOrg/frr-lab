import { useEffect, useState } from 'react'
import type { CoverageReport } from '../engine/index'
import type { NodeId, Topology } from '../engine/types'
import { engine } from './engine'

interface Answer {
  key: unknown[]
  report?: CoverageReport
  error?: string
}

const same = (a: unknown[], b: unknown[]) => a.length === b.length && a.every((x, i) => x === b[i])

/**
 * Coverage report (F6) for one source, or every router when `source` is null.
 * Runs only while `enabled`, with progress from the worker.
 */
export function useCoverage(
  topology: Topology,
  source: NodeId | null,
  extended: boolean,
  enabled: boolean,
) {
  const [answer, setAnswer] = useState<Answer | null>(null)
  const [progress, setProgress] = useState<{ key: unknown[]; done: number; total: number } | null>(
    null,
  )

  useEffect(() => {
    if (!enabled) return
    let live = true
    const key = [topology, source, extended]
    engine()
      .computeCoverage(
        topology,
        { extended, ...(source !== null && { sources: [source] }) },
        (done, total) => live && setProgress({ key, done, total }),
      )
      .then(
        (report) => live && setAnswer({ key, report }),
        (err: unknown) =>
          live && setAnswer({ key, error: err instanceof Error ? err.message : String(err) }),
      )
    return () => {
      live = false
    }
  }, [topology, source, extended, enabled])

  const key = [topology, source, extended]
  const fresh = answer !== null && same(answer.key, key)
  const running = !fresh && progress !== null && same(progress.key, key)
  return {
    report: fresh ? answer.report : undefined,
    error: fresh ? answer.error : undefined,
    progress: running ? { done: progress.done, total: progress.total } : null,
  }
}

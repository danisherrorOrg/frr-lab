import { useEffect, useState } from 'react'
import type { NodeId } from '../engine/types'

type OnProgress = (done: number, total: number, source: NodeId) => void

interface Answer<T> {
  key: unknown[]
  value?: T
  error?: string
}

const same = (a: unknown[], b: unknown[]) => a.length === b.length && a.every((x, i) => x === b[i])

/**
 * Run one engine-worker call while `enabled`, with progress. Only an answer for
 * exactly this `key` is returned, so the page never mixes old results with new
 * inputs. `run` must depend only on what is in `key`.
 */
export function useEngineTask<T>(
  key: unknown[],
  enabled: boolean,
  run: (onProgress: OnProgress) => Promise<T>,
) {
  const [answer, setAnswer] = useState<Answer<T> | null>(null)
  const [progress, setProgress] = useState<{ key: unknown[]; done: number; total: number } | null>(
    null,
  )

  useEffect(() => {
    if (!enabled) return
    let live = true
    run((done, total) => live && setProgress({ key, done, total })).then(
      (value) => live && setAnswer({ key, value }),
      (err: unknown) =>
        live && setAnswer({ key, error: err instanceof Error ? err.message : String(err) }),
    )
    return () => {
      live = false
    }
    // The key holds every input of `run`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, ...key])

  const fresh = enabled && answer !== null && same(answer.key, key)
  const running = enabled && !fresh && progress !== null && same(progress.key, key)
  return {
    value: fresh ? answer.value : undefined,
    error: fresh ? answer.error : undefined,
    progress: running ? { done: progress.done, total: progress.total } : null,
  }
}

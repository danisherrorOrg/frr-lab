import { useEffect, useState } from 'react'
import type { DestinationResult, NodeId, Topology } from '../engine/types'
import { engine } from './engine'

interface Answer {
  topology: Topology
  source: NodeId
  extended: boolean
  results?: DestinationResult[]
  error?: string
}

/**
 * Results for the current topology and source, computed in the engine worker.
 * Only answers for exactly these inputs are returned, so the table and canvas
 * never mix a new topology with old results.
 */
export function useResults(topology: Topology, source: NodeId | null, extended: boolean) {
  const [answer, setAnswer] = useState<Answer | null>(null)

  useEffect(() => {
    if (source === null) return
    let live = true
    const base = { topology, source, extended }
    engine()
      .computeForSource(topology, source, { extended })
      .then(
        (results) => live && setAnswer({ ...base, results }),
        (err: unknown) =>
          live && setAnswer({ ...base, error: err instanceof Error ? err.message : String(err) }),
      )
    return () => {
      live = false
    }
  }, [topology, source, extended])

  const fresh =
    answer !== null &&
    answer.topology === topology &&
    answer.source === source &&
    answer.extended === extended
  return {
    results: fresh ? answer.results : undefined,
    error: fresh ? answer.error : undefined,
    loading: source !== null && !fresh,
  }
}

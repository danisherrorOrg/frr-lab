import { useEffect, useState } from 'react'
import type { FailureSimulation, RepairMode } from '../engine/simulate'
import type { NodeId, Topology } from '../engine/types'
import { engine } from './engine'

interface Answer {
  key: unknown[]
  simulation?: FailureSimulation
  error?: string
}

const same = (a: unknown[], b: unknown[]) => a.length === b.length && a.every((x, i) => x === b[i])

/** The failure simulation for the failed links, computed in the engine worker (F5). */
export function useSimulation(
  topology: Topology,
  source: NodeId | null,
  links: string[],
  mode: RepairMode,
  extended: boolean,
) {
  const [answer, setAnswer] = useState<Answer | null>(null)

  useEffect(() => {
    if (source === null || links.length === 0) return
    let live = true
    const key = [topology, source, links, mode, extended]
    engine()
      .simulateFailure(topology, source, links, mode, { extended })
      .then(
        (simulation) => live && setAnswer({ key, simulation }),
        (err: unknown) =>
          live && setAnswer({ key, error: err instanceof Error ? err.message : String(err) }),
      )
    return () => {
      live = false
    }
  }, [topology, source, links, mode, extended])

  // Only an answer for exactly these inputs, so the canvas never mixes old and new.
  const fresh = answer !== null && same(answer.key, [topology, source, links, mode, extended])
  return {
    simulation: fresh ? answer.simulation : undefined,
    error: fresh ? answer.error : undefined,
  }
}

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

/**
 * The failure simulation for the failed links and routers, computed in the engine
 * worker (F5). Nothing runs while the source itself is down: it sends no traffic.
 */
export function useSimulation(
  topology: Topology,
  source: NodeId | null,
  links: string[],
  nodes: NodeId[],
  mode: RepairMode,
  extended: boolean,
) {
  const [answer, setAnswer] = useState<Answer | null>(null)

  useEffect(() => {
    if (source === null || (links.length === 0 && nodes.length === 0)) return
    if (nodes.includes(source)) return
    let live = true
    const key = [topology, source, links, nodes, mode, extended]
    engine()
      .simulateFailure(topology, source, { links, nodes }, mode, { extended })
      .then(
        (simulation) => live && setAnswer({ key, simulation }),
        (err: unknown) =>
          live && setAnswer({ key, error: err instanceof Error ? err.message : String(err) }),
      )
    return () => {
      live = false
    }
  }, [topology, source, links, nodes, mode, extended])

  // Only an answer for exactly these inputs, so the canvas never mixes old and new.
  const fresh =
    answer !== null && same(answer.key, [topology, source, links, nodes, mode, extended])
  return {
    simulation: fresh ? answer.simulation : undefined,
    error: fresh ? answer.error : undefined,
  }
}

export const MODES: readonly RepairMode[] = ['lfa', 'rlfa', 'tilfa']

/**
 * The same failure in all three repair modes, for the compare view
 * (docs/02-algorithms.md §10.1). Runs in the engine worker like useSimulation;
 * `undefined` until all three answers for exactly these inputs are in.
 */
export function useAllModes(
  topology: Topology,
  source: NodeId | null,
  links: string[],
  nodes: NodeId[],
  extended: boolean,
): Record<RepairMode, FailureSimulation> | undefined {
  const [answer, setAnswer] = useState<{
    key: unknown[]
    sims: Record<RepairMode, FailureSimulation>
  } | null>(null)

  useEffect(() => {
    if (source === null || (links.length === 0 && nodes.length === 0)) return
    if (nodes.includes(source)) return
    let live = true
    const key = [topology, source, links, nodes, extended]
    Promise.all(
      MODES.map((m) =>
        engine().simulateFailure(topology, source, { links, nodes }, m, { extended }),
      ),
    ).then(
      ([lfa, rlfa, tilfa]) =>
        live && setAnswer({ key, sims: { lfa: lfa!, rlfa: rlfa!, tilfa: tilfa! } }),
      // The failure panel already reports errors from the same simulation.
      () => {},
    )
    return () => {
      live = false
    }
  }, [topology, source, links, nodes, extended])

  return answer !== null && same(answer.key, [topology, source, links, nodes, extended])
    ? answer.sims
    : undefined
}

import { useEffect, useState } from 'react'
import {
  hasLfaPolicy,
  lfaPolicyEffect,
  withoutLfaPolicy,
  type LfaPolicyEffect,
} from '../engine/index'
import type { NodeId, Topology } from '../engine/types'
import { engine } from './engine'

interface Answer {
  topology: Topology
  source: NodeId
  effect: LfaPolicyEffect
}

/**
 * What the LFA policy changes for `source` (docs/02-algorithms.md §15): its results
 * with and without the policy, both from the worker. Null with no policy or no source.
 */
export function usePolicyEffect(topology: Topology, source: NodeId | null) {
  const [answer, setAnswer] = useState<Answer | null>(null)
  const active = source !== null && hasLfaPolicy(topology)

  useEffect(() => {
    if (!active || source === null) return
    let live = true
    const run = (t: Topology) => engine().computeForSource(t, source, { explain: false })
    Promise.all([run(withoutLfaPolicy(topology)), run(topology)]).then(
      ([before, after]) =>
        live && setAnswer({ topology, source, effect: lfaPolicyEffect(before, after) }),
      // A source that no longer exists: nothing to say.
      () => undefined,
    )
    return () => {
      live = false
    }
  }, [topology, source, active])

  const fresh = active && answer?.topology === topology && answer.source === source
  return { active, effect: fresh ? answer.effect : undefined }
}

import type { HeatMap } from '../engine/heat-map'
import type { Topology } from '../engine/types'
import { useStore } from '../state/store'
import { engine } from './engine'
import { useEngineTask } from './useEngineTask'

/**
 * The coverage heat map (docs/02-algorithms.md §12), computed in the worker while
 * it is switched on. The mode only changes the colours, so it isn't part of the key.
 */
export function useHeatMap(topology: Topology) {
  const mode = useStore((s) => s.heatMap)
  const extended = useStore((s) => s.settings.extended)
  const { value, error, progress } = useEngineTask<HeatMap>(
    [topology, extended],
    mode !== null,
    (onProgress) => engine().coverageMap(topology, { extended }, onProgress),
  )
  return { mode, map: value, error, progress }
}

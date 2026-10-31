import {
  computeCoverage,
  computeForSource,
  type ComputeOptions,
  type CoverageReport,
} from '../engine/index'
import { simulateFailure, type FailureSimulation, type RepairMode } from '../engine/simulate'
import type { DestinationResult, NodeId, Topology } from '../engine/types'

// Messages between the page and engine.worker.ts. Plain data only, so they
// survive structured cloning (docs/03-architecture.md §1).

export type EngineRequest =
  | {
      id: number
      kind: 'source'
      topology: Topology
      source: NodeId
      options?: ComputeOptions
    }
  | {
      id: number
      kind: 'coverage'
      topology: Topology
      options?: { extended?: boolean; sources?: NodeId[] }
    }
  | {
      id: number
      kind: 'simulate'
      topology: Topology
      source: NodeId
      links: string[]
      /** Failed routers (Phase 9.3). */
      nodes?: string[]
      mode: RepairMode
      options?: { extended?: boolean }
    }

export type EngineResponse =
  | { id: number; kind: 'progress'; done: number; total: number; source: NodeId }
  | { id: number; kind: 'source'; results: DestinationResult[] }
  | { id: number; kind: 'coverage'; report: CoverageReport }
  | { id: number; kind: 'simulate'; simulation: FailureSimulation }
  | { id: number; kind: 'error'; message: string }

/**
 * Runs one request and posts the answer (and progress for coverage).
 * Kept apart from the worker file so tests can call it directly in Node.
 */
export function handleRequest(req: EngineRequest, post: (res: EngineResponse) => void): void {
  try {
    if (req.kind === 'source') {
      post({
        id: req.id,
        kind: 'source',
        results: computeForSource(req.topology, req.source, req.options),
      })
    } else if (req.kind === 'simulate') {
      post({
        id: req.id,
        kind: 'simulate',
        simulation: simulateFailure(
          req.topology,
          req.source,
          { links: req.links, nodes: req.nodes ?? [] },
          req.mode,
          req.options,
        ),
      })
    } else {
      const report = computeCoverage(req.topology, {
        ...req.options,
        onProgress: (done, total, source) =>
          post({ id: req.id, kind: 'progress', done, total, source }),
      })
      post({ id: req.id, kind: 'coverage', report })
    }
  } catch (err) {
    post({ id: req.id, kind: 'error', message: err instanceof Error ? err.message : String(err) })
  }
}

import {
  computeAllSources,
  computeCoverage,
  computeForSource,
  type ComputeOptions,
  type CoverageReport,
  type SourceRows,
} from '../engine/index'
import {
  simulateAllSources,
  simulateFailure,
  type FailureSimulation,
  type RepairMode,
  type SourceFailure,
} from '../engine/simulate'
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
  /** Every router as the DUT (Phase 9.6), with progress. */
  | { id: number; kind: 'all-sources'; topology: Topology; options?: { extended?: boolean } }
  | {
      id: number
      kind: 'simulate-all'
      topology: Topology
      links: string[]
      nodes?: string[]
      mode: RepairMode
      options?: { extended?: boolean }
    }

export type EngineResponse =
  | { id: number; kind: 'progress'; done: number; total: number; source: NodeId }
  | { id: number; kind: 'source'; results: DestinationResult[] }
  | { id: number; kind: 'coverage'; report: CoverageReport }
  | { id: number; kind: 'simulate'; simulation: FailureSimulation }
  | { id: number; kind: 'all-sources'; sources: SourceRows[] }
  | { id: number; kind: 'simulate-all'; sources: SourceFailure[] }
  | { id: number; kind: 'error'; message: string }

/**
 * Runs one request and posts the answer (and progress for coverage).
 * Kept apart from the worker file so tests can call it directly in Node.
 */
export function handleRequest(req: EngineRequest, post: (res: EngineResponse) => void): void {
  const onProgress = (done: number, total: number, source: NodeId) =>
    post({ id: req.id, kind: 'progress', done, total, source })
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
    } else if (req.kind === 'all-sources') {
      post({
        id: req.id,
        kind: 'all-sources',
        sources: computeAllSources(req.topology, { ...req.options, onProgress }),
      })
    } else if (req.kind === 'simulate-all') {
      post({
        id: req.id,
        kind: 'simulate-all',
        sources: simulateAllSources(
          req.topology,
          { links: req.links, nodes: req.nodes ?? [] },
          req.mode,
          { ...req.options, onProgress },
        ),
      })
    } else {
      const report = computeCoverage(req.topology, { ...req.options, onProgress })
      post({ id: req.id, kind: 'coverage', report })
    }
  } catch (err) {
    post({ id: req.id, kind: 'error', message: err instanceof Error ? err.message : String(err) })
  }
}

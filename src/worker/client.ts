import type { ComputeOptions, CoverageReport } from '../engine/index'
import type { FailureSimulation, RepairMode } from '../engine/simulate'
import type { DestinationResult, NodeId, Topology } from '../engine/types'
import { handleRequest, type EngineRequest, type EngineResponse } from './protocol'

/** The parts of a Worker the client uses, so tests can pass a fake. */
export interface WorkerLike {
  postMessage(msg: EngineRequest): void
  addEventListener(type: 'message', fn: (ev: { data: EngineResponse }) => void): void
  terminate(): void
}

export interface EngineClient {
  computeForSource(
    topology: Topology,
    source: NodeId,
    options?: ComputeOptions,
  ): Promise<DestinationResult[]>
  computeCoverage(
    topology: Topology,
    options?: { extended?: boolean; sources?: NodeId[] },
    onProgress?: (done: number, total: number, source: NodeId) => void,
  ): Promise<CoverageReport>
  simulateFailure(
    topology: Topology,
    source: NodeId,
    /** Failed link ids, or failed links and routers. */
    failed: string[] | { links: string[]; nodes: string[] },
    mode: RepairMode,
    options?: { extended?: boolean },
  ): Promise<FailureSimulation>
  /** Stops the worker; pending calls reject. */
  terminate(): void
}

/** A request before it gets an id. Spread over the union so each kind keeps its own fields. */
type NewRequest = EngineRequest extends infer R
  ? R extends unknown
    ? Omit<R, 'id'>
    : never
  : never

interface Pending {
  resolve: (value: never) => void
  reject: (err: Error) => void
  onProgress?: ((done: number, total: number, source: NodeId) => void) | undefined
}

/** The real worker. Vite bundles it from this `new URL(...)` pattern. */
export function createEngineWorker(): WorkerLike {
  return new Worker(new URL('./engine.worker.ts', import.meta.url), {
    type: 'module',
  }) as unknown as WorkerLike
}

/**
 * Runs the engine on the main thread with the same messages, on a later tick.
 * Used where Worker doesn't exist (jsdom in tests); results are identical.
 */
export function createInlineWorker(): WorkerLike {
  const listeners: ((ev: { data: EngineResponse }) => void)[] = []
  let stopped = false
  return {
    postMessage: (msg) =>
      void setTimeout(() =>
        handleRequest(msg, (data) => {
          if (!stopped) for (const fn of listeners) fn({ data })
        }),
      ),
    addEventListener: (_type, fn) => void listeners.push(fn),
    terminate: () => {
      stopped = true
    },
  }
}

/** The real worker when the browser has one, else the inline stand-in. */
export const createDefaultWorker = (): WorkerLike =>
  typeof Worker === 'undefined' ? createInlineWorker() : createEngineWorker()

/** Promise-based calls into the engine worker. Requests are matched to answers by id. */
export function createEngineClient(worker: WorkerLike = createDefaultWorker()): EngineClient {
  let nextId = 1
  const pending = new Map<number, Pending>()

  worker.addEventListener('message', ({ data }) => {
    const p = pending.get(data.id)
    if (p === undefined) return
    if (data.kind === 'progress') {
      p.onProgress?.(data.done, data.total, data.source)
      return
    }
    pending.delete(data.id)
    if (data.kind === 'error') p.reject(new Error(data.message))
    else if (data.kind === 'source') p.resolve(data.results as never)
    else if (data.kind === 'simulate') p.resolve(data.simulation as never)
    else p.resolve(data.report as never)
  })

  const send = <T>(req: NewRequest, onProgress?: Pending['onProgress']): Promise<T> =>
    new Promise<T>((resolve, reject) => {
      const id = nextId++
      pending.set(id, { resolve: resolve as Pending['resolve'], reject, onProgress })
      worker.postMessage({ ...req, id } as EngineRequest)
    })

  return {
    computeForSource: (topology, source, options) =>
      send({ kind: 'source', topology, source, ...(options && { options }) }),
    computeCoverage: (topology, options, onProgress) =>
      send({ kind: 'coverage', topology, ...(options && { options }) }, onProgress),
    simulateFailure: (topology, source, failed, mode, options) => {
      const { links, nodes } = Array.isArray(failed) ? { links: failed, nodes: [] } : failed
      return send({
        kind: 'simulate',
        topology,
        source,
        links,
        ...(nodes.length > 0 && { nodes }),
        mode,
        ...(options && { options }),
      })
    },
    terminate: () => {
      worker.terminate()
      for (const p of pending.values()) p.reject(new Error('The engine worker was stopped.'))
      pending.clear()
    },
  }
}

import { describe, expect, it } from 'vitest'
import { computeCoverage, computeForSource } from '../../src/engine/index'
import { createEngineClient, type WorkerLike } from '../../src/worker/client'
import { handleRequest, type EngineRequest, type EngineResponse } from '../../src/worker/protocol'
import { loadFixture } from '../helpers'

const ring = () => loadFixture('02-ring5.yaml')

/** A stand-in Worker: answers on a later tick, through a structured clone like the real one. */
function fakeWorker(): WorkerLike & { terminated: boolean } {
  const listeners: ((ev: { data: EngineResponse }) => void)[] = []
  const w = {
    terminated: false,
    postMessage(msg: EngineRequest) {
      const req = structuredClone(msg)
      setTimeout(() =>
        handleRequest(req, (res) => {
          if (!w.terminated) for (const fn of listeners) fn({ data: structuredClone(res) })
        }),
      )
    },
    addEventListener(_type: 'message', fn: (ev: { data: EngineResponse }) => void) {
      listeners.push(fn)
    },
    terminate() {
      w.terminated = true
    },
  }
  return w
}

describe('handleRequest', () => {
  it('answers a source request with the engine results', () => {
    const out: EngineResponse[] = []
    handleRequest({ id: 7, kind: 'source', topology: ring(), source: 'S' }, (r) => out.push(r))
    expect(out).toEqual([{ id: 7, kind: 'source', results: computeForSource(ring(), 'S') }])
  })

  it('sends progress for each source, then the report', () => {
    const out: EngineResponse[] = []
    handleRequest({ id: 1, kind: 'coverage', topology: ring() }, (r) => out.push(r))
    expect(out.map((r) => r.kind)).toEqual([...Array(5).fill('progress'), 'coverage'])
    expect(out[0]).toEqual({ id: 1, kind: 'progress', done: 1, total: 5, source: 'A' })
    expect(out.at(-1)).toEqual({ id: 1, kind: 'coverage', report: computeCoverage(ring()) })
  })

  it('turns engine errors into an error message', () => {
    const out: EngineResponse[] = []
    handleRequest({ id: 2, kind: 'source', topology: ring(), source: 'Z' }, (r) => out.push(r))
    expect(out).toEqual([{ id: 2, kind: 'error', message: 'Unknown source router "Z".' }])
  })
})

describe('createEngineClient', () => {
  it('resolves source and coverage calls, with progress', async () => {
    const client = createEngineClient(fakeWorker())
    const progress: number[] = []
    const [results, report] = await Promise.all([
      client.computeForSource(ring(), 'S', { explain: false }),
      client.computeCoverage(ring(), { sources: ['S', 'A'] }, (done) => progress.push(done)),
    ])
    expect(results.map((r) => r.dest)).toEqual(['A', 'B', 'C', 'E'])
    expect(report.total.pairs).toBe(8)
    expect(progress).toEqual([1, 2])
  })

  it('rejects with the engine’s message', async () => {
    const client = createEngineClient(fakeWorker())
    await expect(client.computeForSource(ring(), 'Z')).rejects.toThrow('Unknown source router "Z".')
  })

  it('terminate() stops the worker and rejects pending calls', async () => {
    const worker = fakeWorker()
    const client = createEngineClient(worker)
    const call = client.computeCoverage(ring())
    client.terminate()
    expect(worker.terminated).toBe(true)
    await expect(call).rejects.toThrow('stopped')
  })
})

import { describe, expect, it } from 'vitest'
import { computeAllSources, computeCoverage, computeForSource } from '../../src/engine/index'
import { coverageMap } from '../../src/engine/heat-map'
import { linkView } from '../../src/engine/link-view'
import { simulateAllSources, simulateFailure } from '../../src/engine/simulate'
import { createEngineClient, createInlineWorker, type WorkerLike } from '../../src/worker/client'
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

describe('per-link view requests', () => {
  it('the client resolves the same view as the engine, and rejects an unknown link', async () => {
    const client = createEngineClient(fakeWorker())
    expect(await client.linkView(ring(), 'S-E', { extended: false })).toEqual(
      linkView(ring(), 'S-E', { extended: false }),
    )
    await expect(client.linkView(ring(), 'nope')).rejects.toThrow('Unknown link "nope".')
  })
})

describe('heat-map requests', () => {
  it('the client resolves the same map as the engine, with progress per router', async () => {
    const client = createEngineClient(fakeWorker())
    const progress: number[] = []
    const map = await client.coverageMap(ring(), { extended: false }, (done) => progress.push(done))
    expect(map).toEqual(coverageMap(ring(), { extended: false }))
    expect(progress).toEqual([1, 2, 3, 4, 5])
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

  it('resolves a failure simulation', async () => {
    const client = createEngineClient(fakeWorker())
    const sim = await client.simulateFailure(ring(), 'S', ['S-E'], 'tilfa', { extended: true })
    expect(sim).toEqual(simulateFailure(ring(), 'S', ['S-E'], 'tilfa', { extended: true }))
    await expect(client.simulateFailure(ring(), 'S', ['X-Y'], 'lfa')).rejects.toThrow(
      'Unknown link "X-Y".',
    )
  })

  it('resolves every router as the DUT, rows and failure summary, with progress (9.6)', async () => {
    const client = createEngineClient(fakeWorker())
    const seen: string[] = []
    const rows = await client.computeAllSources(ring(), { extended: false }, (d, t, s) =>
      seen.push(`${d}/${t} ${s}`),
    )
    expect(rows).toEqual(computeAllSources(ring(), { extended: false }))
    expect(seen).toEqual(['1/5 A', '2/5 B', '3/5 C', '4/5 E', '5/5 S'])

    const failed = { links: ['S-E'], nodes: ['C'] }
    const sims = await client.simulateAllSources(ring(), failed, 'tilfa')
    expect(sims).toEqual(simulateAllSources(ring(), failed, 'tilfa'))
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

describe('createInlineWorker', () => {
  it('gives the same results as the engine, without a real Worker', async () => {
    const client = createEngineClient(createInlineWorker())
    expect(await client.computeForSource(ring(), 'S')).toEqual(computeForSource(ring(), 'S'))
  })

  it('is the default where Worker does not exist (Node, jsdom)', async () => {
    expect(typeof Worker).toBe('undefined')
    const client = createEngineClient()
    expect(await client.computeForSource(ring(), 'S')).toHaveLength(4)
  })
})

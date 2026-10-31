import type { SourceFailure } from '../engine/simulate'
import type { NodeId } from '../engine/types'
import { useStore } from '../state/store'
import { engine } from './engine'
import { dutSummary } from './format'
import { useEngineTask } from './useEngineTask'

/**
 * The failure seen from every router in turn (Phase 9.6): one line per DUT, e.g.
 * "PE1: 3 affected, 3 repaired; 3 survive, 0 break". Click one to see its details.
 */
export function FailureByDut() {
  const topology = useStore((s) => s.topology)
  const extended = useStore((s) => s.settings.extended)
  const links = useStore((s) => s.failedLinks)
  const nodes = useStore((s) => s.failedNodes)
  const mode = useStore((s) => s.simMode)
  const dut = useStore((s) => s.source)
  const setSource = useStore((s) => s.setSource)
  const { value, error, progress } = useEngineTask<SourceFailure[]>(
    [topology, links, nodes, mode, extended],
    links.length + nodes.length > 0,
    (onProgress) =>
      engine().simulateAllSources(topology, { links, nodes }, mode, { extended }, onProgress),
  )
  const hurt = (x: SourceFailure) => !('down' in x) && x.summary.affected > 0
  const pick = (s: NodeId) => setSource(s)

  return (
    <section
      aria-label="Failure by DUT"
      className="rounded border border-red-300 p-3 text-sm dark:border-red-800"
    >
      <h2 className="text-base font-semibold">Effect on every router as the DUT</h2>
      <p className="text-xs text-slate-600 dark:text-slate-300">
        The same failure, seen from each router&apos;s own traffic. Click a router to see its
        repairs below and on the diagram.
      </p>
      {error && <p className="mt-2 text-red-600">The engine failed: {error}</p>}
      {!value && !error && (
        <p className="mt-2 text-xs text-slate-500">
          Simulating… {progress && `${progress.done} of ${progress.total} routers`}
        </p>
      )}
      {value && (
        <>
          <p className="mt-1">
            {value.filter(hurt).length} of {value.filter((x) => !('down' in x)).length} routers have
            traffic that crosses something down.
          </p>
          <ul className="mt-1 grid gap-x-4 sm:grid-cols-2">
            {value.map((x) => (
              <li key={x.source}>
                <button
                  type="button"
                  aria-pressed={x.source === dut}
                  disabled={'down' in x}
                  onClick={() => pick(x.source)}
                  className={`w-full rounded px-1 text-left hover:bg-slate-100 disabled:opacity-60 dark:hover:bg-slate-800 ${
                    x.source === dut ? 'bg-indigo-50 dark:bg-indigo-950' : ''
                  } ${hurt(x) ? '' : 'text-slate-500'}`}
                >
                  <strong>{x.source}</strong>: {dutSummary(x, nodes.length > 0)}
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  )
}

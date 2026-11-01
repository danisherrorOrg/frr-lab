import { useMemo, useState } from 'react'
import type { RepairMode } from '../engine/simulate'
import type { WeakSpot, WeakSpots as Spots } from '../engine/weak-spots'
import { useStore } from '../state/store'
import { engine } from './engine'
import { bundles, HEAT_MODE_NAME, linkName, plural, type Bundles } from './format'
import { useEngineTask } from './useEngineTask'

const button =
  'rounded border border-slate-300 px-3 py-1 text-sm hover:bg-slate-100 disabled:opacity-40 dark:border-slate-600 dark:hover:bg-slate-700'
const small =
  'rounded border border-slate-300 px-2 py-0.5 text-xs hover:bg-slate-100 dark:border-slate-600 dark:hover:bg-slate-700'
const control =
  'rounded border border-slate-300 px-2 py-1 text-sm dark:border-slate-600 dark:bg-slate-800'
const cell = 'px-2 py-1 align-top'

const MODES: RepairMode[] = ['lfa', 'rlfa', 'tilfa']

type Show = 'all' | 'link' | 'node'

/** Rows shown before "Show all": the worst ones are what an engineer looks at first. */
const TOP = 10

const spotName = (s: WeakSpot, b: Bundles) =>
  s.kind === 'link' ? `Link ${linkName(b, s.a!, s.b!, s.id)}` : `Router ${s.id}`

const share = (part: number, total: number) =>
  total === 0 ? '0' : `${part} of ${total} (${Math.round((100 * part) / total)}%)`

/** "Link S–E: 12 of 12 flows (100%) unprotected", the line read out for each row. */
const spotText = (s: WeakSpot, b: Bundles) =>
  `${spotName(s, b)}: ${share(s.unprotected, s.counts.affected)} flows unprotected`

/**
 * Weakest spots (TODO backlog, docs/02-algorithms.md §17): fail each link and each
 * router on its own and rank them by the traffic their failure leaves without a
 * working backup, every router as the source. "Fail it" opens the failure view.
 */
export function WeakSpots() {
  const topology = useStore((s) => s.topology)
  const extended = useStore((s) => s.settings.extended)
  const simMode = useStore((s) => s.simMode)
  const anyFailed = useStore((s) => s.failedLinks.length > 0 || s.failedNodes.length > 0)
  const failOnly = useStore((s) => s.failOnly)
  const setSimMode = useStore((s) => s.setSimMode)
  const select = useStore((s) => s.select)
  const [open, setOpen] = useState(false)
  // Starts at the failure view's mode, so "Fail it" shows the same numbers.
  const [modeAt, setMode] = useState<RepairMode | null>(null)
  const mode = modeAt ?? simMode
  const [show, setShow] = useState<Show>('all')
  const [all, setAll] = useState(false)
  const b = useMemo(() => bundles(topology), [topology])
  const task = useEngineTask<Spots>([topology, mode, extended], open, (onProgress) =>
    engine().weakSpots(topology, mode, { extended }, onProgress),
  )

  if (!open)
    return (
      <div>
        <button type="button" className={button} onClick={() => setOpen(true)}>
          Weakest spots
        </button>
      </div>
    )

  const spots = task.value?.spots.filter((s) => show === 'all' || s.kind === show) ?? []
  const shown = all ? spots : spots.slice(0, TOP)
  const worst = spots[0]

  return (
    <section aria-label="Weakest spots" className="text-sm">
      <div className="flex flex-wrap items-end gap-3">
        <h2 className="mr-auto text-base font-semibold">Weakest spots</h2>
        <button type="button" className={button} onClick={() => setOpen(false)}>
          Hide
        </button>
      </div>
      <p className="mt-1 text-xs text-slate-500">
        Each link and each router fails on its own. A flow is the traffic from one router to one
        destination. Unprotected = dropped, looping, or cut off until the network reconverges (cut
        off: no path is left at all).
      </p>
      <div className="mt-2 flex flex-wrap items-end gap-3">
        <label className="text-xs">
          Repair mode
          <select
            className={`${control} block`}
            value={mode}
            onChange={(e) => setMode(e.target.value as RepairMode)}
          >
            {MODES.map((m) => (
              <option key={m} value={m}>
                {HEAT_MODE_NAME[m]}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs">
          Show
          <select
            className={`${control} block`}
            value={show}
            onChange={(e) => setShow(e.target.value as Show)}
          >
            <option value="all">Links and routers</option>
            <option value="link">Links</option>
            <option value="node">Routers</option>
          </select>
        </label>
      </div>

      {task.error ? (
        <p className="mt-2 text-red-600">The engine failed: {task.error}</p>
      ) : !task.value ? (
        <div className="mt-2 flex items-center gap-2">
          <progress
            className="w-48"
            aria-label="Weakest spots progress"
            max={task.progress?.total ?? 1}
            value={task.progress?.done ?? 0}
          />
          <span className="text-xs text-slate-500">
            {task.progress
              ? `${task.progress.done} of ${task.progress.total} links and routers`
              : 'Starting…'}
          </span>
        </div>
      ) : (
        <div className="mt-2 space-y-2">
          <p role="status" aria-label="Weakest spot">
            {worst === undefined ? (
              'Nothing to fail.'
            ) : worst.unprotected === 0 ? (
              <>
                ✓ In {HEAT_MODE_NAME[mode]} mode, no single{' '}
                {show === 'link' ? 'link' : show === 'node' ? 'router' : 'link or router'} failure
                leaves traffic unprotected ({plural(task.value.flows, 'flow')} in all).
              </>
            ) : (
              <>
                Weakest in {HEAT_MODE_NAME[mode]} mode: <strong>{spotName(worst, b)}</strong>, its
                failure leaves {share(worst.unprotected, worst.counts.affected)} of the flows that
                cross it unprotected ({plural(task.value.flows, 'flow')} in the network).
              </>
            )}
          </p>
          {anyFailed && (
            <p className="rounded border border-amber-300 bg-amber-50 px-2 py-1 text-xs dark:border-amber-700 dark:bg-amber-950">
              Each one is failed alone on the full network: what is down now is not included.
            </p>
          )}
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <caption className="sr-only">Links and routers, most unprotected flows first</caption>
              <thead className="border-b border-slate-300 text-xs text-slate-600 dark:border-slate-600 dark:text-slate-300">
                <tr>
                  <th className={cell}>#</th>
                  <th className={cell}>If this fails</th>
                  <th className={cell}>Unprotected</th>
                  <th className={cell}>Dropped</th>
                  <th className={cell}>Loops</th>
                  <th className={cell}>Cut off</th>
                  <th className={cell}>Repaired</th>
                  <th className={cell}>
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody className="tabular-nums">
                {shown.map((s, i) => (
                  <tr
                    key={`${s.kind}:${s.id}`}
                    aria-label={spotText(s, b)}
                    className="border-b border-slate-100 dark:border-slate-800"
                  >
                    <td className={cell}>{i + 1}</td>
                    <td className={cell}>
                      <button
                        type="button"
                        className="font-semibold underline-offset-2 hover:underline"
                        title="Select it on the diagram"
                        onClick={() => select({ kind: s.kind, id: s.id })}
                      >
                        {spotName(s, b)}
                      </button>
                    </td>
                    <td
                      className={`${cell} ${s.unprotected > 0 ? 'font-semibold text-red-700 dark:text-red-400' : 'text-green-700 dark:text-green-400'}`}
                    >
                      {s.counts.affected === 0
                        ? '– carries no traffic'
                        : s.unprotected === 0
                          ? `✓ 0 of ${s.counts.affected}`
                          : `✗ ${share(s.unprotected, s.counts.affected)}`}
                    </td>
                    <td className={cell}>{s.counts.dropped}</td>
                    <td className={cell}>{s.counts.looped}</td>
                    <td className={cell}>{s.counts.unreachable}</td>
                    <td className={cell}>{s.counts.repaired}</td>
                    <td className={cell}>
                      <button
                        type="button"
                        className={small}
                        aria-label={`Fail ${spotName(s, b).toLowerCase()}`}
                        onClick={() => {
                          failOnly(s.kind === 'link' ? { links: [s.id] } : { nodes: [s.id] })
                          setSimMode(mode)
                        }}
                      >
                        Fail it
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {spots.length > TOP && (
            <button type="button" className={small} onClick={() => setAll(!all)}>
              {all ? `Show the top ${TOP}` : `Show all ${spots.length}`}
            </button>
          )}
          {show !== 'link' && (
            <p className="text-xs text-slate-500">
              A failed router&apos;s own traffic, and the traffic to it, are left out: no backup can
              save them.
            </p>
          )}
          <p className="text-xs text-slate-500">
            “Fail it” takes down just that link or router, in this repair mode, so the failure view
            shows each flow hop by hop.
          </p>
        </div>
      )}
    </section>
  )
}

import type { FailureSimulation, Flow, RepairMethod, RepairMode } from '../engine/simulate'
import type { NodeId } from '../engine/types'
import { useStore } from '../state/store'
import { drawnFlow, METHOD_NAME } from './format'
import { rowKeys } from './keys'

const MODES: { mode: RepairMode; label: string }[] = [
  { mode: 'lfa', label: 'LFA only' },
  { mode: 'rlfa', label: 'LFA + Remote LFA' },
  { mode: 'tilfa', label: 'TI-LFA' },
]

const METHOD: Record<RepairMethod, string> = { ...METHOD_NAME }

const button =
  'rounded border border-slate-300 px-3 py-1 text-sm hover:bg-slate-100 dark:border-slate-600 dark:hover:bg-slate-700'
const active =
  'bg-indigo-600 text-white border-indigo-600 hover:bg-indigo-700 dark:hover:bg-indigo-500'
const cell = 'px-2 py-1 align-top'

const arrow = (ids: NodeId[]) => ids.join('→')

function Match({ f }: { f: Flow }) {
  if (f.match === 'same')
    return <span className="text-green-700 dark:text-green-400">✓ same path</span>
  if (f.match === 'same-cost')
    return <span className="text-amber-700 dark:text-amber-400">≈ same cost, other path</span>
  if (f.match === 'longer')
    return (
      <span className="text-red-700 dark:text-red-400">
        ✗ costlier ({f.plrRepairCost} vs {f.plrAfterCost})
      </span>
    )
  return <span className="text-slate-400">–</span>
}

const dash = (a: NodeId, b: NodeId) => `${a}–${b}`

/** The repair and the other failed link it runs into, e.g. "at C it runs into C–E". */
function Broken({ f }: { f: Flow }) {
  const b = f.brokenAt!
  return (
    <>
      {' '}
      That backup was built for {f.plr}–{f.next} alone: at {b.from} it runs into{' '}
      <strong>{dash(b.from, b.to)}</strong>, which is also down, so the repair is{' '}
      <strong>broken</strong>.
    </>
  )
}

/** What happens to the drawn flow, in one or two plain sentences with real numbers. */
function Story({ f, converged, source }: { f: Flow; converged: boolean; source: NodeId }) {
  const hit = `${f.plr}–${f.next}`
  const cutOff =
    f.status === 'unreachable' ? (
      <>
        {' '}
        With these links down, {f.dest} can&apos;t be reached at all (the network is split), so no
        backup could help.
      </>
    ) : null
  if (!converged) {
    if (!f.repair)
      return (
        <p>
          ✗ Traffic to {f.dest} reaches {f.plr}, finds {hit} down and has no backup: it is{' '}
          <strong>dropped</strong>
          {f.status === 'unreachable' ? '.' : ' until the network reconverges.'}
          {cutOff}
        </p>
      )
    if (f.brokenAt)
      return (
        <p>
          ✗ Traffic to {f.dest} reaches {f.plr}, finds {hit} down, and {f.plr} switches to its{' '}
          {METHOD[f.method!]} backup <span className="font-mono">{arrow(f.repair)}</span> (cost{' '}
          {f.repairCost}).
          <Broken f={f} /> Traffic is lost until the network reconverges.{cutOff}
        </p>
      )
    return (
      <p>
        ↻ Traffic to {f.dest} reaches {f.plr}, finds {hit} down, and {f.plr} switches at once (FRR,
        about 50 ms) to its {METHOD[f.method!]} backup:{' '}
        <span className="font-mono">{arrow(f.repair)}</span> (cost {f.repairCost}, was{' '}
        {f.beforeCost}).
      </p>
    )
  }
  if (!f.after)
    return (
      <p>
        ✗ After reconverging, {source} still can&apos;t reach {f.dest}: the failed links cut it off.
      </p>
    )
  const plrNote =
    f.plrAfter && f.plr !== source ? (
      <>
        {' '}
        {f.plr}&apos;s own final path is <span className="font-mono">{arrow(f.plrAfter)}</span>.
      </>
    ) : null
  return (
    <p>
      ✓ After the network reconverges, {source} sends traffic to {f.dest} on{' '}
      <span className="font-mono">{arrow(f.after)}</span> (cost {f.afterCost}).{plrNote}{' '}
      {f.status === 'broken' &&
        `The repair was broken by ${dash(f.brokenAt!.from, f.brokenAt!.to)}, so traffic was lost until now.`}
      {f.status === 'dropped' && 'There was no backup, so traffic was lost until now.'}
      {f.match === 'same' && 'The repair path was already this path, so nothing moves again.'}
      {f.match === 'same-cost' &&
        'The repair path cost the same but used other routers, so traffic moves once more.'}
      {f.match === 'longer' &&
        `The repair path cost ${f.plrRepairCost} from ${f.plr}; the final one costs ${f.plrAfterCost}, so traffic moves again.`}
    </p>
  )
}

/** "Repair (FRR)" cell: who repairs, with what, and whether it survives. */
function RepairCell({ f }: { f: Flow }) {
  const bad = 'text-red-700 dark:text-red-400'
  if (!f.method) return <span className={bad}>✗ no backup</span>
  if (f.brokenAt)
    return (
      <span className={bad}>
        ✗ {f.plr} · {METHOD[f.method]} broken: {dash(f.brokenAt.from, f.brokenAt.to)} down
      </span>
    )
  return (
    <>
      {f.plr} · {METHOD[f.method]}
    </>
  )
}

/** "3 repaired, 1 broken": the non-zero counts, in a fixed order. */
function counts(flows: Flow[]): string {
  const n = (st: Flow['status']) => flows.filter((f) => f.status === st).length
  const parts: [number, string][] = [
    [n('repaired'), 'repaired'],
    [n('broken'), 'repair broken'],
    [n('dropped'), 'dropped until convergence'],
    [n('unreachable'), 'unreachable'],
  ]
  return parts
    .filter(([k], i) => k > 0 || i === 0)
    .map(([k, text]) => `${k} ${text}`)
    .join(', ')
}

interface Props {
  source: NodeId
  simulation: FailureSimulation | undefined
  error: string | undefined
}

/** Failure simulation (F5): repair paths for the failed links, then the converged view. */
export function FailurePanel({ source, simulation: sim, error }: Props) {
  const mode = useStore((s) => s.simMode)
  const setMode = useStore((s) => s.setSimMode)
  const converged = useStore((s) => s.converged)
  const setConverged = useStore((s) => s.setConverged)
  const simDest = useStore((s) => s.simDest)
  const setSimDest = useStore((s) => s.setSimDest)
  const toggleFailedLink = useStore((s) => s.toggleFailedLink)
  const restoreLinks = useStore((s) => s.restoreLinks)
  const failedLinks = useStore((s) => s.failedLinks)
  const topology = useStore((s) => s.topology)

  const down = failedLinks.map((id) => {
    const l = topology.links.find((x) => x.id === id)
    return { id, name: l ? dash(l.a, l.b) : id }
  })
  const many = down.length > 1
  const names = down.map((l) => l.name).join(', ')
  const crossWhat = many ? 'a failed link' : names
  const affected = sim?.flows.filter((f) => f.affected) ?? []
  const unaffected = sim?.flows.filter((f) => !f.affected).map((f) => f.dest) ?? []
  const shown = sim && drawnFlow(sim, simDest)

  return (
    <section
      aria-label="Failure simulation"
      className="rounded border border-red-300 p-3 text-sm dark:border-red-800"
    >
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="mr-auto text-base font-semibold">
          <span aria-hidden="true">✕ </span>
          {many ? `${down.length} links failed: ${names}` : `Link ${names} failed`}
        </h2>
        {many &&
          down.map((l) => (
            <button
              key={l.id}
              type="button"
              className={button}
              aria-label={`Restore ${l.name}`}
              onClick={() => toggleFailedLink(l.id)}
            >
              ↺ {l.name}
            </button>
          ))}
        <button type="button" className={button} onClick={restoreLinks}>
          {many ? 'Restore all' : 'Restore link'}
        </button>
      </div>
      {many && (
        <p className="mt-1 text-xs text-slate-600 dark:text-slate-300">
          FRR backups are built for one failure at a time. With {down.length} links down, a backup
          can run into another failed link: the repair is then broken.
        </p>
      )}

      <fieldset className="mt-2 flex flex-wrap items-center gap-3">
        <legend className="sr-only">FRR method the routers run</legend>
        <span className="text-xs text-slate-500">Routers run:</span>
        {MODES.map((m) => (
          <label key={m.mode} className="flex items-center gap-1">
            <input
              type="radio"
              name="sim-mode"
              checked={mode === m.mode}
              onChange={() => setMode(m.mode)}
            />
            {m.label}
          </label>
        ))}
      </fieldset>

      <div className="mt-2 flex flex-wrap gap-2" role="group" aria-label="Simulation step">
        <button
          type="button"
          aria-pressed={!converged}
          className={`${button} ${converged ? '' : active}`}
          onClick={() => setConverged(false)}
        >
          1. Repair (FRR)
        </button>
        <button
          type="button"
          aria-pressed={converged}
          className={`${button} ${converged ? active : ''}`}
          onClick={() => setConverged(true)}
          title="Shortcut: C"
        >
          2. Converge ▶
        </button>
      </div>

      {error && <p className="mt-2 text-red-600">The engine failed: {error}</p>}
      {!sim && !error && <p className="mt-2 text-slate-500">Simulating…</p>}
      {sim && (
        <>
          <p className="mt-2">
            From {source}: {affected.length} of {sim.flows.length} destination
            {sim.flows.length === 1 ? '' : 's'} cross {crossWhat}.
            {affected.length > 0 && ` ${counts(affected)}.`}
          </p>
          {shown && (
            <div className="mt-2 rounded bg-slate-50 p-2 dark:bg-slate-800" aria-live="polite">
              <Story f={shown} converged={converged} source={source} />
            </div>
          )}
          {affected.length > 0 && (
            <div className="mt-2 overflow-x-auto">
              <table className="w-full text-left">
                <caption className="sr-only">Destinations that cross a failed link</caption>
                <thead className="border-b border-slate-300 text-xs text-slate-600 dark:border-slate-600 dark:text-slate-300">
                  <tr>
                    <th className={cell}>Dest</th>
                    <th className={cell}>Repair (FRR)</th>
                    <th className={cell}>Repair path</th>
                    <th className={cell}>After convergence</th>
                    <th className={cell}>Repair = final?</th>
                  </tr>
                </thead>
                <tbody>
                  {affected.map((f) => {
                    const selected = f.dest === shown?.dest
                    const choose = () => setSimDest(f.dest)
                    return (
                      <tr
                        key={f.dest}
                        tabIndex={0}
                        aria-selected={selected}
                        className={`cursor-pointer border-b border-slate-100 hover:bg-slate-50 focus:outline-2 focus:outline-indigo-500 dark:border-slate-800 dark:hover:bg-slate-800 ${
                          selected ? 'bg-indigo-50 dark:bg-indigo-950' : ''
                        }`}
                        onClick={choose}
                        onKeyDown={(e) => rowKeys(e, choose)}
                      >
                        <td className={`${cell} font-semibold`}>{f.dest}</td>
                        <td className={cell}>
                          <RepairCell f={f} />
                        </td>
                        <td className={`${cell} font-mono text-xs`}>
                          {f.repair ? `${arrow(f.repair)} (${f.repairCost})` : '–'}
                        </td>
                        <td className={`${cell} font-mono text-xs`}>
                          {f.after ? `${arrow(f.after)} (${f.afterCost})` : 'unreachable'}
                        </td>
                        <td className={cell}>
                          <Match f={f} />
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
          {unaffected.length > 0 && (
            <p className="mt-2 text-xs text-slate-500">
              Not affected (their path avoids {many ? 'every failed link' : names}):{' '}
              {unaffected.join(', ')}.
            </p>
          )}
          <p className="mt-1 text-xs text-slate-500">
            &quot;Repair = final?&quot; compares the repairing router&apos;s backup with its own
            path after convergence, for repairs that work. TI-LFA always matches (RFC 9855 §3); LFA
            and Remote LFA may not.
          </p>
        </>
      )}
    </section>
  )
}

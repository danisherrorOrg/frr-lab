import { createContext, useContext, useMemo, useState } from 'react'
import type { PacketWalk as Walk } from '../engine/packet-walk'
import {
  meetsDownRouter,
  summarizeFlows,
  type FailureSimulation,
  type FailureSummary,
  type Flow,
  type RepairMethod,
  type RepairMode,
} from '../engine/simulate'
import type { NodeId } from '../engine/types'
import { useStore } from '../state/store'
import {
  bundles,
  drawnFlow,
  linkName,
  METHOD_NAME,
  outcomeText,
  plural,
  surviveText,
  throughText,
  type Bundles,
} from './format'
import { rowKeys } from './keys'
import { PacketWalk } from './PacketWalk'

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
  // The comparison is made at the PLR (D22), so say so when that isn't S: the row's
  // other costs are from S and would not match the numbers compared here.
  const from = f.plr !== f.before[0] ? ` from ${f.plr}` : ''
  if (f.match === 'same')
    return <span className="text-green-700 dark:text-green-400">✓ same path{from}</span>
  if (f.match === 'same-cost')
    return <span className="text-amber-700 dark:text-amber-400">≈ same cost{from}, other path</span>
  if (f.match === 'longer')
    return (
      <span className="text-red-700 dark:text-red-400">
        ✗ costlier{from} ({f.plrRepairCost} vs {f.plrAfterCost})
      </span>
    )
  return <span className="text-slate-400">–</span>
}

/** Router pairs with parallel links, so text can name the failed link of a bundle (D29). */
const BundleContext = createContext<Bundles>(new Set())

/** "S–E", or "S–E (S-E#2)" for one link of a bundle. */
function useDash() {
  const b = useContext(BundleContext)
  return (x: NodeId, y: NodeId, link?: string) => linkName(b, x, y, link)
}

/** The path text; a looping path gets "…" because traffic goes round again from there. */
const pathText = (f: Flow) => `${arrow(f.repair!)}${f.loopAt !== undefined ? '…' : ''}`

/**
 * The routers after the first PLR that switch to their own backup, then how it
 * ends: "At C it finds C–E down too, and C switches to its own LFA backup."
 */
function Chain({ f }: { f: Flow }) {
  const dash = useDash()
  const more = (f.repairs ?? []).slice(1)
  const drop = f.drop
  // A packet can meet the same failed link twice (it came back with other labels).
  const met = new Set([f.hitLink])
  const word = (link: string) => {
    const w = met.has(link) ? 'again' : 'too'
    met.add(link)
    return w
  }
  const words = more.map((r) => word(r.link))
  const noBackup = drop?.reason === 'no-backup' || drop?.reason === 'too-deep'
  const dropWord = noBackup ? word(drop.link) : ''
  // A backup can also leave on a link the traffic met earlier, at another router.
  const backupMet = drop?.reason === 'backup-down' && met.has(drop.link)
  return (
    <>
      {more.map((r, k) => (
        <span key={k}>
          {' '}
          At {r.at} it finds <strong>{dash(r.at, r.next, r.link)}</strong> down {words[k]}, and{' '}
          {r.at} switches to its own {METHOD[r.method]} backup.
        </span>
      ))}
      {noBackup && (
        <>
          {' '}
          At {drop.at} it finds <strong>{dash(drop.at, drop.next, drop.link)}</strong> down{' '}
          {dropWord}, and {drop.at} has no backup for it
          {drop.reason === 'too-deep' &&
            ' (its TI-LFA label stack is deeper than its max SID depth, so it was never installed)'}
          : traffic is <strong>dropped</strong>.
        </>
      )}
      {drop?.reason === 'backup-down' && (
        <>
          {' '}
          But that backup leaves {drop.at} on <strong>{dash(drop.at, drop.next, drop.link)}</strong>
          , {backupMet ? 'a failed link the traffic already met' : 'which is down too'}: traffic is{' '}
          <strong>dropped</strong>.
        </>
      )}
      {f.loopAt !== undefined && (
        <>
          {' '}
          {more.length > 0 ? 'The backups send' : 'The backup sends'} it back to {f.loopAt}, where
          it has already been: traffic goes round in a <strong>loop</strong>.
        </>
      )}
    </>
  )
}

/** A backup broken by a router failure: where it meets the router, and why (D27). */
function Through({ f }: { f: Flow }) {
  const b = useContext(BundleContext)
  if (!f.through) return null
  return (
    <>
      {' '}
      But that backup goes through <strong>{f.through.node}</strong>, which is down:{' '}
      {throughText(f.through, f.plr!, f.next!, f.dest, f.hitLink, b)}
    </>
  )
}

/** What happens to the drawn flow, in a few plain sentences with real numbers. */
function Story({
  f,
  converged,
  source,
  downNodes,
}: {
  f: Flow
  converged: boolean
  source: NodeId
  downNodes: NodeId[]
}) {
  const dash = useDash()
  const hitDown = `${dash(f.plr!, f.next!, f.hitLink)} down${downNodes.includes(f.next!) ? ` (router ${f.next} is down)` : ''}`
  // Traffic from S doesn't "reach" S: it starts there.
  const reaches = f.plr === source ? `starts at ${source}` : `reaches ${f.plr}`
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
          ✗ Traffic to {f.dest} {reaches}, finds {hitDown} and has no backup: it is{' '}
          <strong>dropped</strong>
          {f.status === 'unreachable' ? '.' : ' until the network reconverges.'}
          {cutOff}
        </p>
      )
    const chained = (f.repairs?.length ?? 0) > 1
    if (f.drop || f.loopAt !== undefined)
      return (
        <p>
          ✗ Traffic to {f.dest} {reaches}, finds {hitDown}, and {f.plr} switches to its{' '}
          {METHOD[f.method!]} backup.
          <Through f={f} />
          <Chain f={f} /> Path: <span className="font-mono">{pathText(f)}</span>.
          {f.status !== 'unreachable' && ' Traffic is lost until the network reconverges.'}
          {cutOff}
        </p>
      )
    return (
      <p>
        ↻ Traffic to {f.dest} {reaches}, finds {hitDown}, and {f.plr} switches at once (FRR, about
        50 ms) to its {METHOD[f.method!]} backup.
        <Through f={f} />
        {chained && <Chain f={f} />} Traffic reaches {f.dest} on{' '}
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
  // Repair = final? is judged at the PLR (D22). When the PLR isn't S, S's own path can
  // still change even though the PLR's part was already final.
  const sMoves = f.repair !== undefined && f.after.join() !== f.repair.join()
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
      {f.status === 'dropped' && 'During FRR the traffic was dropped, so it was lost until now.'}
      {f.status === 'looped' && 'During FRR the traffic was looping, so it was lost until now.'}
      {f.match === 'same' &&
        (sMoves
          ? `From ${f.plr} on, the repair already followed ${f.plr}'s final path, but ${source} now sends the traffic another way.`
          : 'The repair path was already this path, so nothing moves again.')}
      {f.match === 'same-cost' &&
        `From ${f.plr}, the repair cost the same as ${f.plr}'s final path but went another way, so traffic moves once more.`}
      {f.match === 'longer' &&
        `From ${f.plr}, the repair cost ${f.plrRepairCost}; ${f.plr}'s final path costs ${f.plrAfterCost}, so traffic moves again.`}
    </p>
  )
}

/** "Repair (FRR)" cell: who repairs, with what, and how it ends. */
function RepairCell({ f }: { f: Flow }) {
  const dash = useDash()
  const bad = 'text-red-700 dark:text-red-400'
  if (!f.method) return <span className={bad}>✗ no backup</span>
  const who = (f.repairs ?? []).map((r) => `${r.at} · ${METHOD[r.method]}`).join(', then ')
  if (f.drop)
    return (
      <span className={bad}>
        {who} ✗ dropped at {f.drop.at}: {dash(f.drop.at, f.drop.next, f.drop.link)} down
      </span>
    )
  if (f.loopAt !== undefined)
    return (
      <span className={bad}>
        {who} ✗ loops back to {f.loopAt}
      </span>
    )
  return <>{who}</>
}

/**
 * "Backup vs down router" cell: does the PLR's planned backup pass a failed router?
 * Only for flows that meet one, the same flows the router summary counts (D32).
 */
function ThroughCell({ f, routers }: { f: Flow; routers: NodeId[] }) {
  if (!f.method || !meetsDownRouter(f, routers)) return <span className="text-slate-400">–</span>
  if (!f.through) return <span className="text-green-700 dark:text-green-400">✓ survives</span>
  return (
    <span className="text-red-700 dark:text-red-400">
      ✗ breaks: via {f.through.node} at {f.through.at}
    </span>
  )
}

/** "E down: 3 destinations affected, 2 repairs survive, 1 breaks" (Phase 9.3). */
function routerSummary(s: FailureSummary, routers: NodeId[]): string {
  return `${routers.join(', ')} down: ${plural(s.viaRouter, 'destination')} affected, ${surviveText(s, 'repair')}.`
}

interface Props {
  source: NodeId
  simulation: FailureSimulation | undefined
  error: string | undefined
  /** The drawn flow's packet walk (§8.3): the labels on each hop of the real repair. */
  walk?: Walk
  walkStep?: number | null
  onWalkStep?: (step: number | null) => void
  onPhp?: (php: boolean) => void
  walkOnCanvas?: boolean
  onWalkOnCanvas?: (on: boolean) => void
}

/** Failure simulation (F5): repair paths for the failed links, then the converged view. */
export function FailurePanel({
  source,
  simulation: sim,
  error,
  walk,
  walkStep = null,
  onWalkStep = () => {},
  onPhp = () => {},
  walkOnCanvas = true,
  onWalkOnCanvas = () => {},
}: Props) {
  const mode = useStore((s) => s.simMode)
  const setMode = useStore((s) => s.setSimMode)
  const converged = useStore((s) => s.converged)
  const setConverged = useStore((s) => s.setConverged)
  const simDest = useStore((s) => s.simDest)
  const setSimDest = useStore((s) => s.setSimDest)
  const toggleFailedLink = useStore((s) => s.toggleFailedLink)
  const toggleFailedNode = useStore((s) => s.toggleFailedNode)
  const restoreAll = useStore((s) => s.restoreAll)
  const failedLinks = useStore((s) => s.failedLinks)
  const failedNodes = useStore((s) => s.failedNodes)
  const topology = useStore((s) => s.topology)
  const b = useMemo(() => bundles(topology), [topology])
  // The walk's table is only built while its section is open.
  const [walkOpen, setWalkOpen] = useState(false)

  const down = failedLinks.map((id) => {
    const l = topology.links.find((x) => x.id === id)
    return { id, name: l ? linkName(b, l.a, l.b, l.id) : id }
  })
  const routers = failedNodes
  const items = down.length + routers.length
  const many = items > 1
  const names = down.map((l) => l.name).join(', ')
  const routerNames = routers.join(', ')
  const title = [
    routers.length > 0 && `${routers.length > 1 ? 'Routers' : 'Router'} ${routerNames} down`,
    down.length > 1 && `${down.length} links failed: ${names}`,
    down.length === 1 && `${routers.length > 0 ? 'link' : 'Link'} ${names} failed`,
  ]
    .filter(Boolean)
    .join(', ')
  const crossWhat =
    routers.length === 0
      ? many
        ? 'a failed link'
        : names
      : down.length === 0 && routers.length === 1
        ? `router ${routerNames}`
        : 'a failed link or router'
  const sourceDown = routers.includes(source)
  // A failed router as destination is expected to be unreachable: kept out of the table.
  const deadEnds = sim?.flows.filter((f) => f.destDown).map((f) => f.dest) ?? []
  const affected = sim?.flows.filter((f) => f.affected && !f.destDown) ?? []
  const unaffected = sim?.flows.filter((f) => !f.affected).map((f) => f.dest) ?? []
  const shown = sim && drawnFlow(sim, simDest)
  const summary = sim && summarizeFlows(sim.flows, routers)
  const restoreLabel = many ? 'Restore all' : routers.length > 0 ? 'Restore router' : 'Restore link'

  return (
    <BundleContext.Provider value={b}>
      <section
        aria-label="Failure simulation"
        className="rounded border border-red-300 p-3 text-sm dark:border-red-800"
      >
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="mr-auto text-base font-semibold">
            <span aria-hidden="true">✕ </span>
            {title}
          </h2>
          {many &&
            routers.map((r) => (
              <button
                key={r}
                type="button"
                className={button}
                aria-label={`Restore router ${r}`}
                onClick={() => toggleFailedNode(r)}
              >
                ↺ {r}
              </button>
            ))}
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
          <button type="button" className={button} onClick={restoreAll}>
            {restoreLabel}
          </button>
        </div>
        {routers.length > 0 && (
          <p className="mt-1 text-xs text-slate-600 dark:text-slate-300">
            When a router fails, all its links go down at once. Its neighbors only see their own
            link fail, so they use their <em>link-protecting</em> backups, and some of those still
            go through the failed router. That is why node protection exists.
          </p>
        )}
        {down.length > 1 && (
          <p className="mt-1 text-xs text-slate-600 dark:text-slate-300">
            FRR backups are built for one failure at a time. With {down.length} links down, a backup
            can run into another failed link. The router there then uses its own backup, so traffic
            may still get through, or be dropped, or go round in a loop.
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

        {sourceDown && (
          <p className="mt-2">
            The source router {source} is down, so it sends no traffic. Pick another source router
            to see how its traffic is repaired.
          </p>
        )}
        {error && <p className="mt-2 text-red-600">The engine failed: {error}</p>}
        {!sim && !error && !sourceDown && <p className="mt-2 text-slate-500">Simulating…</p>}
        {sim && !sourceDown && (
          <>
            <p className="mt-2">
              From {source}: {affected.length} of {sim.flows.length - deadEnds.length} destination
              {sim.flows.length - deadEnds.length === 1 ? '' : 's'} cross {crossWhat}.
              {summary && summary.affected > 0 && ` ${outcomeText(summary)}.`}
            </p>
            {routers.length > 0 && summary && (
              <p className="mt-1 font-medium">{routerSummary(summary, routers)}</p>
            )}
            {deadEnds.length > 0 && (
              <p className="mt-1 text-xs text-slate-600 dark:text-slate-300">
                {deadEnds.join(', ')} can&apos;t be reached:{' '}
                {deadEnds.length > 1 ? 'they are' : 'it is'} the failed router
                {deadEnds.length > 1 ? 's' : ''} itself. That is expected, not a protection failure.
              </p>
            )}
            {shown && (
              <div className="mt-2 rounded bg-slate-50 p-2 dark:bg-slate-800" aria-live="polite">
                <Story f={shown} converged={converged} source={source} downNodes={routers} />
              </div>
            )}
            {shown && walk && (
              <details
                className="mt-2"
                open={walkOpen}
                onToggle={(ev) => setWalkOpen(ev.currentTarget.open)}
              >
                <summary className="cursor-pointer font-semibold">
                  Packet walk to {shown.dest}
                  {converged ? ' after convergence' : ''}: the labels on each hop
                </summary>
                {walkOpen && (
                  <div className="mt-1">
                    <PacketWalk
                      walk={walk}
                      step={walkStep}
                      onStep={onWalkStep}
                      onPhp={onPhp}
                      onCanvas={walkOnCanvas}
                      onOnCanvas={onWalkOnCanvas}
                      b={b}
                    />
                  </div>
                )}
              </details>
            )}
            {affected.length > 0 && (
              <div className="mt-2 overflow-x-auto">
                <table className="w-full text-left">
                  <caption className="sr-only">Destinations that cross a failed link</caption>
                  <thead className="border-b border-slate-300 text-xs text-slate-600 dark:border-slate-600 dark:text-slate-300">
                    <tr>
                      <th className={cell}>Dest</th>
                      <th className={cell}>Repair (FRR)</th>
                      {routers.length > 0 && <th className={cell}>Backup vs down router</th>}
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
                          {routers.length > 0 && (
                            <td className={cell}>
                              <ThroughCell f={f} routers={routers} />
                            </td>
                          )}
                          <td className={`${cell} font-mono text-xs`}>
                            {f.repair ? `${pathText(f)} (${f.repairCost})` : '–'}
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
                Not affected (their path avoids{' '}
                {routers.length > 0
                  ? 'everything that is down'
                  : many
                    ? 'every failed link'
                    : names}
                ): {unaffected.join(', ')}.
              </p>
            )}
            <p className="mt-1 text-xs text-slate-500">
              &quot;Repair = final?&quot; compares the path from the first router that repairs with
              that router&apos;s own path after convergence, for traffic that gets through. With one
              failed link TI-LFA always matches (RFC 9855 §3); LFA and Remote LFA may not. With
              several, a repair passed on by more than one router may not match either.
            </p>
          </>
        )}
      </section>
    </BundleContext.Provider>
  )
}

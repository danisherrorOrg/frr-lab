import { useMemo } from 'react'
import type { FailureSimulation, Flow, RepairMode } from '../engine/simulate'
import type { NodeId } from '../engine/types'
import { useStore } from '../state/store'
import { Mono } from './CompareView'
import { bundles, linkName, METHOD_NAME, throughText, type Bundles } from './format'
import { MiniMap } from './MiniMap'
import { MODES } from './useSimulation'

interface Props {
  source: NodeId
  /** The destination whose traffic the main diagram shows. */
  dest: NodeId
  sims: Record<RepairMode, FailureSimulation>
  /** The mode the failure panel and the main diagram use. */
  mode: RepairMode
  onMode: (m: RepairMode) => void
  /** Every link that is down, the links of failed routers too. */
  downLinks: ReadonlySet<string>
}

const MODE_NAME: Record<RepairMode, string> = {
  lfa: 'LFA only',
  rlfa: 'LFA + Remote LFA',
  tilfa: 'TI-LFA',
}

const btn =
  'rounded border border-slate-300 px-2 py-0.5 text-xs hover:bg-slate-100 focus:outline-2 focus:outline-indigo-500 disabled:opacity-40 dark:border-slate-600 dark:hover:bg-slate-800'
const arrow = (ids: NodeId[]) => ids.join('→')

/**
 * The compare view while links or routers are down (docs/02-algorithms.md §10.1):
 * the same failure simulated with each repair mode, side by side, for the
 * destination on the diagram. Shows what the traffic really does, not the plan.
 */
export function CompareFailure({ source, dest, sims, mode, onMode, downLinks }: Props) {
  const topology = useStore((s) => s.topology)
  const b = useMemo(() => bundles(topology), [topology])
  const flows = MODES.map((m) => ({ m, f: sims[m].flows.find((x) => x.dest === dest) }))
  const any = flows[0]!.f
  const nodes = sims.tilfa.nodes
  const what = [
    ...sims.tilfa.links.map((l) => `link ${linkName(b, l.a, l.b, l.id)}`),
    ...nodes.map((n) => `router ${n}`),
  ].join(', ')

  return (
    <section id="compare" aria-label="Compare repairs" className="text-sm">
      <h2 className="text-base font-semibold">
        Compare repairs: {source} → {dest} while {what}{' '}
        {nodes.length + sims.tilfa.links.length > 1 ? 'are' : 'is'} down
      </h2>
      {!any ? (
        <p className="text-slate-500">{dest} is not in the simulation.</p>
      ) : (
        <>
          <p className="text-slate-600 dark:text-slate-300">
            Normal path <Mono>{arrow(any.before)}</Mono> (cost {any.beforeCost}).{' '}
            {any.after ? (
              <>
                Once every router has reconverged, {source} uses <Mono>{arrow(any.after)}</Mono>{' '}
                (cost {any.afterCost}), whatever the mode. Until then, FRR decides:
              </>
            ) : (
              <>After reconvergence {dest} can&apos;t be reached at all.</>
            )}
          </p>
          <p className="mt-1 text-slate-600 dark:text-slate-300">{verdict(flows, dest)}</p>
          <ul className="mt-2 grid gap-3 md:grid-cols-3">
            {flows.map(({ m, f }) => (
              <li
                key={m}
                aria-label={MODE_NAME[m]}
                className={`rounded border p-2 ${
                  m === mode
                    ? 'border-indigo-500 ring-1 ring-indigo-500'
                    : 'border-slate-200 dark:border-slate-700'
                }`}
              >
                {f && (
                  <Card
                    m={m}
                    f={f}
                    b={b}
                    nodes={nodes}
                    downLinks={downLinks}
                    shown={m === mode}
                    onShow={() => onMode(m)}
                  />
                )}
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  )
}

/** "Delivered with TI-LFA. Dropped with LFA only and LFA + Remote LFA." */
function verdict(flows: { m: RepairMode; f: Flow | undefined }[], dest: NodeId): string {
  const f0 = flows[0]!.f!
  if (f0.destDown) return `${dest} is itself down, so nothing can reach it in any mode.`
  if (!f0.affected)
    return `The normal path to ${dest} avoids everything that is down, so no router repairs and every mode delivers.`
  const groups: [string, RepairMode[]][] = [
    ['Delivered with', flows.filter((x) => x.f?.status === 'repaired').map((x) => x.m)],
    ['Dropped with', flows.filter((x) => x.f?.status === 'dropped').map((x) => x.m)],
    ['Loops with', flows.filter((x) => x.f?.status === 'looped').map((x) => x.m)],
    ['Unreachable with', flows.filter((x) => x.f?.status === 'unreachable').map((x) => x.m)],
  ]
  return groups
    .filter(([, ms]) => ms.length > 0)
    .map(([word, ms]) => `${word} ${ms.map((m) => MODE_NAME[m]).join(' and ')}.`)
    .join(' ')
}

function status(f: Flow): { text: string; cls: string } {
  const bad = 'text-red-700 dark:text-red-400'
  if (f.destDown) return { text: '✗ Destination down', cls: bad }
  if (!f.affected) return { text: '✓ Not affected', cls: 'text-green-700 dark:text-green-400' }
  if (f.status === 'repaired')
    return { text: '✓ Delivered', cls: 'text-green-700 dark:text-green-400' }
  if (f.status === 'dropped') return { text: `✗ Dropped at ${f.drop!.at}`, cls: bad }
  if (f.status === 'looped') return { text: `↻ Loops at ${f.loopAt}`, cls: bad }
  return { text: '✗ Unreachable', cls: bad }
}

function Card({
  m,
  f,
  b,
  nodes,
  downLinks,
  shown,
  onShow,
}: {
  m: RepairMode
  f: Flow
  b: Bundles
  nodes: NodeId[]
  downLinks: ReadonlySet<string>
  shown: boolean
  onShow: () => void
}) {
  const topology = useStore((s) => s.topology)
  const st = status(f)
  const repaired = f.repair !== undefined
  // What the PLR puts on the packet when it switches to its backup.
  const first = f.repairs?.[0]
  const labels = first && f.repairLabels?.[first.atIndex]
  const path = f.repair ?? f.before
  const pathText = `${arrow(path)}${f.loopAt !== undefined ? '…' : ''}`

  return (
    <>
      <div className="flex items-baseline justify-between gap-2">
        <h3 className="font-semibold">{MODE_NAME[m]}</h3>
        <span className={`text-xs font-semibold ${st.cls}`}>{st.text}</span>
      </div>
      <MiniMap
        topology={topology}
        s={f.before[0]!}
        d={f.dest}
        path={path}
        {...(f.repairLinks && { links: f.repairLinks })}
        kind={repaired ? 'backup' : 'primary'}
        down={downLinks}
        downNodes={nodes}
        {...((f.drop?.at ?? f.loopAt ?? f.plr) !== undefined && {
          mark: (f.drop?.at ?? f.loopAt ?? f.plr)!,
        })}
        label={
          repaired
            ? `${MODE_NAME[m]}: traffic goes ${pathText}`
            : `${MODE_NAME[m]}: normal path ${arrow(f.before)}`
        }
      />
      {f.affected && !f.destDown && (
        <dl className="grid grid-cols-[auto_1fr] gap-x-2 gap-y-0.5 text-xs">
          <dt className="text-slate-500">Repairs</dt>
          <dd>{repairsText(f, b)}</dd>
          {repaired && (
            <>
              <dt className="text-slate-500">Path</dt>
              <dd>
                <Mono>{pathText}</Mono>
              </dd>
            </>
          )}
          {f.status === 'repaired' && (
            <>
              <dt className="text-slate-500">Cost</dt>
              <dd>
                {f.repairCost} (+{f.repairCost! - f.beforeCost} vs normal {f.beforeCost})
              </dd>
            </>
          )}
          {labels && (
            <>
              <dt className="text-slate-500">Labels</dt>
              <dd>
                <Mono>{labels.length === 0 ? 'none' : labels.map((x) => x.label).join(', ')}</Mono>{' '}
                leaving {first.at}
              </dd>
            </>
          )}
          {f.through && (
            <>
              <dt className="text-slate-500">Down router</dt>
              <dd className="text-red-700 dark:text-red-400">
                ✗ Backup breaks: {throughText(f.through, f.plr!, f.next!, f.dest, f.hitLink, b)}
              </dd>
            </>
          )}
          <dt className="text-slate-500">vs final</dt>
          <dd>{finalText(f)}</dd>
        </dl>
      )}
      <button
        type="button"
        className={`${btn} mt-2`}
        disabled={shown}
        onClick={onShow}
        aria-label={`Show ${MODE_NAME[m]} on the diagram`}
      >
        {shown ? 'Shown on the diagram' : 'Show on the diagram'}
      </button>
    </>
  )
}

/** Who repaired, in order, or why nobody could. */
function repairsText(f: Flow, b: Bundles): string {
  const steps = (f.repairs ?? []).map((r) => `${r.at} uses ${METHOD_NAME[r.method]}`)
  const chain = steps.join(', then ')
  if (f.drop) {
    const link = linkName(b, f.drop.at, f.drop.next, f.drop.link)
    const why =
      f.drop.reason === 'no-backup'
        ? `${f.drop.at} has no backup for link ${link}`
        : `the first link of ${f.drop.at}'s backup for ${link} is down too`
    return chain ? `${chain}; then ${why}.` : `${why[0]!.toUpperCase()}${why.slice(1)}.`
  }
  if (f.loopAt !== undefined) return `${chain}; the traffic comes back to ${f.loopAt}.`
  return `${chain}.`
}

function finalText(f: Flow): string {
  if (f.status !== 'repaired')
    return f.after
      ? `Lost until the network reconverges onto ${arrow(f.after)} (cost ${f.afterCost}).`
      : 'Lost: nothing reaches it, even after reconvergence.'
  const from = f.plr !== f.before[0] ? ` from ${f.plr}` : ''
  if (f.match === 'same') return `Same path${from}: nothing moves when the network reconverges.`
  if (f.match === 'same-cost') return `Same cost${from}, other path: traffic moves once more.`
  return `Longer${from}: ${f.plrRepairCost} vs ${f.plrAfterCost} after reconvergence, so traffic moves again.`
}

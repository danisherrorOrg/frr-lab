import { useMemo, useState } from 'react'
import type { RepairMode } from '../engine/simulate'
import type { WhatIf as Diff, WhatIfChange, WhatIfEffect } from '../engine/what-if'
import { updateLink, updateRouter } from '../state/edit'
import { useStore } from '../state/store'
import { engine } from './engine'
import {
  bundles,
  deltaText,
  HEAT_MODE_NAME,
  linkName,
  pairsText,
  plural,
  shareChange,
  toNumber,
} from './format'
import { useEngineTask } from './useEngineTask'

const button =
  'rounded border border-slate-300 px-3 py-1 text-sm hover:bg-slate-100 disabled:opacity-40 dark:border-slate-600 dark:hover:bg-slate-700'
const control =
  'rounded border border-slate-300 px-2 py-1 text-sm dark:border-slate-600 dark:bg-slate-800'
const cell = 'px-2 py-1 align-top'

const MODES: RepairMode[] = ['lfa', 'rlfa', 'tilfa']

/** How many changed destinations to list; the counts above cover them all. */
const LIST_LIMIT = 100

/** Worse first: those are what an engineer must look at before applying. */
const ORDER: WhatIfEffect[] = ['worse', 'better', 'rerouted']

const EFFECT: Record<WhatIfEffect, { text: string; className: string }> = {
  worse: { text: '▼ worse', className: 'font-semibold text-red-700 dark:text-red-400' },
  better: { text: '▲ better', className: 'font-semibold text-green-700 dark:text-green-400' },
  rerouted: { text: '↔ rerouted', className: 'text-slate-600 dark:text-slate-300' },
}

const deltaClass = (d: number | undefined) =>
  d === undefined || d === 0
    ? 'text-slate-500'
    : d > 0
      ? 'font-semibold text-green-700 dark:text-green-400'
      : 'font-semibold text-red-700 dark:text-red-400'

/** The metric tried on one link. It is applied to the current topology, so edits elsewhere count. */
interface Try {
  link: string
  ab: number
  ba: number
}

/** Coverage before and after, one row per repair mode: the "LFA 60% → 80%" line. */
function Shares({ diff }: { diff: Diff }) {
  return (
    <table className="w-full max-w-xl text-left">
      <caption className="sr-only">Coverage before and after</caption>
      <thead className="border-b border-slate-300 text-xs text-slate-600 dark:border-slate-600 dark:text-slate-300">
        <tr>
          <th className={cell}>Repair mode</th>
          <th className={cell}>Before</th>
          <th className={cell}>After</th>
          <th className={cell}>Change</th>
        </tr>
      </thead>
      <tbody className="tabular-nums">
        {MODES.map((m) => {
          const s = shareChange(diff.before, diff.after, m)
          return (
            <tr
              key={m}
              aria-label={s.text}
              className="border-b border-slate-100 dark:border-slate-800"
            >
              <td className={`${cell} font-semibold`}>{HEAT_MODE_NAME[m]}</td>
              <td className={cell}>{s.before}</td>
              <td className={cell}>{s.after}</td>
              <td className={`${cell} ${deltaClass(s.delta)}`}>
                {s.delta !== undefined && s.delta > 0
                  ? '▲ '
                  : s.delta !== undefined && s.delta < 0
                    ? '▼ '
                    : ''}
                {deltaText(s.delta)}
              </td>
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}

/** Routers whose own coverage changed (their row of the coverage report). */
function Routers({ diff }: { diff: Diff }) {
  const changed = diff.sources.filter((s) =>
    MODES.some((m) => shareChange(s.before, s.after, m).delta !== 0),
  )
  if (changed.length === 0) return null
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left">
        <caption className="py-1 text-left font-semibold">
          Routers whose coverage changes ({changed.length})
        </caption>
        <thead className="border-b border-slate-300 text-xs text-slate-600 dark:border-slate-600 dark:text-slate-300">
          <tr>
            <th className={cell}>Router</th>
            {MODES.map((m) => (
              <th key={m} className={cell}>
                {HEAT_MODE_NAME[m]}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="tabular-nums">
          {changed.map((s) => (
            <tr key={s.source} className="border-b border-slate-100 dark:border-slate-800">
              <td className={`${cell} font-semibold`}>{s.source}</td>
              {MODES.map((m) => {
                const c = shareChange(s.before, s.after, m)
                return (
                  <td key={m} className={`${cell} ${deltaClass(c.delta)}`}>
                    {c.change}
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

/** Each (source, destination) whose repair changes, worse first. */
function Changes({ changes }: { changes: WhatIfChange[] }) {
  const topology = useStore((s) => s.topology)
  const b = useMemo(() => bundles(topology), [topology])
  const count = (e: WhatIfEffect) => changes.filter((c) => c.effect === e).length
  const sorted = ORDER.flatMap((e) => changes.filter((c) => c.effect === e))
  return (
    <div className="overflow-x-auto">
      <h3 className="py-1 font-semibold">
        Destinations whose repair changes ({changes.length}){' '}
        <span className="font-normal text-slate-500">
          {ORDER.map((e) => `${count(e)} ${e}`).join(' · ')}
        </span>
      </h3>
      {changes.length === 0 ? (
        <p className="text-xs text-slate-500">
          No router’s primary links or backups change for any destination.
        </p>
      ) : (
        <table className="w-full text-left">
          <thead className="border-b border-slate-300 text-xs text-slate-600 dark:border-slate-600 dark:text-slate-300">
            <tr>
              <th className={cell}>Source</th>
              <th className={cell}>Dest</th>
              <th className={cell}>Before</th>
              <th className={cell}>After</th>
              <th className={cell}>Effect</th>
            </tr>
          </thead>
          <tbody>
            {sorted.slice(0, LIST_LIMIT).map((c) => (
              <tr
                key={`${c.source}>${c.dest}`}
                className="border-b border-slate-100 dark:border-slate-800"
              >
                <td className={`${cell} font-semibold`}>{c.source}</td>
                <td className={cell}>{c.dest}</td>
                <td className={`${cell} text-xs`}>{pairsText(c.source, c.before, b)}</td>
                <td className={`${cell} text-xs`}>{pairsText(c.source, c.after, b)}</td>
                <td className={`${cell} ${EFFECT[c.effect].className}`}>{EFFECT[c.effect].text}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {changes.length > LIST_LIMIT && (
        <p className="text-xs text-slate-500">
          Showing {LIST_LIMIT} of {changes.length}, worse first.
        </p>
      )}
    </div>
  )
}

/** The diff itself: shares, the routers and destinations that change. Shared by both tries. */
function DiffBody({ diff }: { diff: Diff }) {
  const anyFailed = useStore((s) => s.failedLinks.length > 0 || s.failedNodes.length > 0)
  return (
    <>
      <Shares diff={diff} />
      {anyFailed && (
        <p className="rounded border border-amber-300 bg-amber-50 px-2 py-1 text-xs dark:border-amber-700 dark:bg-amber-950">
          These are the backups planned on the full network, as in the coverage report. The links
          and routers down now are not taken out.
        </p>
      )}
      <Routers diff={diff} />
      <Changes changes={diff.changes} />
    </>
  )
}

/** Progress while the worker computes both sides, or its error. */
function Pending({
  task,
}: {
  task: { error?: string | undefined; progress: { done: number; total: number } | null }
}) {
  return task.error ? (
    <p className="mt-2 text-red-600">The engine failed: {task.error}</p>
  ) : (
    <div className="mt-2 flex items-center gap-2">
      <progress
        className="w-48"
        aria-label="What-if progress"
        max={task.progress?.total ?? 1}
        value={task.progress?.done ?? 0}
      />
      <span className="text-xs text-slate-500">
        {task.progress ? `${task.progress.done} of ${task.progress.total} routers` : 'Starting…'}
      </span>
    </div>
  )
}

/**
 * What-if diff (TODO backlog, docs/02-algorithms.md §13): try a new metric on one
 * link, or flip a router's overload bit (§16), and see coverage before and after,
 * every router as the source. Nothing is edited until "Apply", which is one undo step.
 */
export function WhatIf() {
  const state = useStore((s) => s.whatIf)
  const selection = useStore((s) => s.selection)
  const openMetric = useStore((s) => s.openWhatIf)
  const openOverload = useStore((s) => s.openOverloadWhatIf)
  if (state === null)
    return (
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className={button}
          onClick={() => openMetric(selection?.kind === 'link' ? selection.id : null)}
        >
          What-if: change a metric
        </button>
        <button
          type="button"
          className={button}
          onClick={() => openOverload(selection?.kind === 'node' ? selection.id : null)}
        >
          What-if: overload a router
        </button>
      </div>
    )
  return state.kind === 'metric' ? <MetricTry id={state.link} /> : <OverloadTry id={state.node} />
}

/** Pick one kind of try or the other; the panel keeps its place on the page. */
function KindPicker({ kind }: { kind: 'metric' | 'overload' }) {
  const selection = useStore((s) => s.selection)
  const openMetric = useStore((s) => s.openWhatIf)
  const openOverload = useStore((s) => s.openOverloadWhatIf)
  return (
    <label className="text-xs">
      Try
      <select
        className={`${control} block`}
        value={kind}
        onChange={(e) =>
          e.target.value === 'metric'
            ? openMetric(selection?.kind === 'link' ? selection.id : null)
            : openOverload(selection?.kind === 'node' ? selection.id : null)
        }
      >
        <option value="metric">A new metric on a link</option>
        <option value="overload">The overload bit on a router</option>
      </select>
    </label>
  )
}

/**
 * Flip one router's overload bit (D47): set, no other router sends transit traffic
 * through it (ISO 10589). Runs as soon as a router is picked: there is nothing to type.
 */
function OverloadTry({ id }: { id: string | null }) {
  const topology = useStore((s) => s.topology)
  const extended = useStore((s) => s.settings.extended)
  const open = useStore((s) => s.openOverloadWhatIf)
  const close = useStore((s) => s.closeWhatIf)
  const apply = useStore((s) => s.updateRouter)
  const [appliedAt, setApplied] = useState<{ node: string; text: string } | null>(null)
  const [error, setError] = useState<string | null>(null)

  const node = id === null ? undefined : topology.nodes.find((n) => n.id === id)
  const on = node?.overload === true
  const after = useMemo(() => {
    if (node === undefined) return undefined
    const r = updateRouter(topology, node.id, { overload: !on })
    return r.ok ? r.topology : undefined
  }, [topology, node, on])
  const task = useEngineTask<Diff>([topology, after, extended], after !== undefined, (onProgress) =>
    engine().whatIf(topology, after!, { extended }, onProgress),
  )
  const applied = appliedAt !== null && appliedAt.node === id ? appliedAt.text : null
  const options = topology.nodes.map((n) => n.id).sort()
  const change = node ? `${node.id} overload bit ${on ? 'on → off' : 'off → on'}` : ''

  return (
    <section aria-label="What-if diff" className="text-sm">
      <div className="flex flex-wrap items-end gap-3">
        <h2 className="mr-auto text-base font-semibold">What-if: overload a router</h2>
        <button type="button" className={button} onClick={close}>
          Hide
        </button>
      </div>
      <div className="mt-2 flex flex-wrap items-end gap-3">
        <KindPicker kind="overload" />
        <label className="text-xs">
          Router
          <select
            className={`${control} block`}
            value={node ? node.id : ''}
            onChange={(e) => {
              open(e.target.value === '' ? null : e.target.value)
              setError(null)
            }}
          >
            <option value="">Pick a router…</option>
            {options.map((o) => (
              <option key={o} value={o}>
                {o}
                {topology.nodes.find((n) => n.id === o)?.overload ? ' (overloaded)' : ''}
              </option>
            ))}
          </select>
        </label>
      </div>
      {error && (
        <p role="alert" className="mt-1 text-red-700 dark:text-red-400">
          {error}
        </p>
      )}
      {!node ? (
        <p className="mt-2 text-xs text-slate-500">
          Pick a router here or click one on the diagram. With the overload bit set, other routers
          send it traffic for itself only, never through it: it can&apos;t be an LFA, a Remote LFA
          tunnel end or a hop of a TI-LFA path. See how LFA, Remote LFA and TI-LFA coverage change,
          every router as the source.
        </p>
      ) : applied !== null ? (
        <p className="mt-2 text-green-700 dark:text-green-400">
          ✓ Applied: {applied}. Undo with Ctrl+Z.
        </p>
      ) : !task.value ? (
        <Pending task={task} />
      ) : (
        <div className="mt-2 space-y-3">
          <p>
            <strong>{change}</strong>, every router as the source (
            {task.value.before.pairs === task.value.after.pairs
              ? plural(task.value.after.pairs, '(destination, link) pair')
              : `${task.value.before.pairs} → ${plural(task.value.after.pairs, '(destination, link) pair')}: paths through ${node.id} change`}
            ).
          </p>
          <DiffBody diff={task.value} />
          <button
            type="button"
            className={button}
            onClick={() => {
              const err = apply(node.id, { overload: !on })
              if (err !== null) {
                setError(err)
                return
              }
              setApplied({ node: node.id, text: change })
            }}
          >
            {on ? `Clear the overload bit on ${node.id}` : `Set the overload bit on ${node.id}`}
          </button>
        </div>
      )}
    </section>
  )
}

/** A new metric on one link (§13). */
function MetricTry({ id }: { id: string | null }) {
  const topology = useStore((s) => s.topology)
  const extended = useStore((s) => s.settings.extended)
  const open = useStore((s) => s.openWhatIf)
  const close = useStore((s) => s.closeWhatIf)
  const apply = useStore((s) => s.updateLink)
  const b = useMemo(() => bundles(topology), [topology])

  const link = id === null ? undefined : topology.links.find((l) => l.id === id)
  // The boxes start at the link's metrics, and again whenever another link is picked.
  // One box sets both ways, like the metric editor; two only for a link that already
  // differs per direction, or when asked for, so a one-way change is never by accident.
  const [boxes, setBoxes] = useState<{
    link: string
    ab: string
    ba: string
    split: boolean
  } | null>(null)
  const mine = boxes?.link === id ? boxes : null
  const ab = mine ? mine.ab : String(link?.metricAB ?? '')
  const ba = mine ? mine.ba : String(link?.metricBA ?? '')
  const split = mine ? mine.split : link !== undefined && link.metricAB !== link.metricBA
  const [tried, setTried] = useState<Try | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [appliedAt, setApplied] = useState<{ link: string; text: string } | null>(null)

  const applied = appliedAt !== null && appliedAt.link === id ? appliedAt.text : null
  const shown = tried !== null && link !== undefined && tried.link === link.id ? tried : null
  const after = useMemo(() => {
    if (shown === null) return undefined
    const r = updateLink(topology, shown.link, { metricAB: shown.ab, metricBA: shown.ba })
    return r.ok ? r.topology : undefined
  }, [topology, shown])
  const task = useEngineTask<Diff>([topology, after, extended], after !== undefined, (onProgress) =>
    engine().whatIf(topology, after!, { extended }, onProgress),
  )

  const options = topology.links
    .map((l) => ({ id: l.id, name: linkName(b, l.a, l.b, l.id) }))
    .sort((x, y) => (x.name < y.name ? -1 : x.name > y.name ? 1 : 0))
  const name = link ? linkName(b, link.a, link.b, link.id) : ''
  const same =
    shown !== null && link !== undefined && shown.ab === link.metricAB && shown.ba === link.metricBA
  const triedText =
    shown === null || link === undefined
      ? ''
      : shown.ab === shown.ba && link.metricAB === link.metricBA
        ? `metric ${link.metricAB} → ${shown.ab}`
        : `${link.a}→${link.b} ${link.metricAB} → ${shown.ab}, ${link.b}→${link.a} ${link.metricBA} → ${shown.ba}`

  const setBox = (key: 'ab' | 'ba', value: string) => {
    if (id !== null) setBoxes({ link: id, ab, ba, split, [key]: value })
    setError(null)
  }

  return (
    <section aria-label="What-if diff" className="text-sm">
      <div className="flex flex-wrap items-end gap-3">
        <h2 className="mr-auto text-base font-semibold">What-if: change a metric</h2>
        <button type="button" className={button} onClick={close}>
          Hide
        </button>
      </div>

      <div className="mt-2">
        <KindPicker kind="metric" />
      </div>
      <form
        aria-label="Metric to try"
        className="mt-2 flex flex-wrap items-end gap-3"
        onSubmit={(e) => {
          e.preventDefault()
          if (!link) return
          const t = { link: link.id, ab: toNumber(ab), ba: toNumber(split ? ba : ab) }
          // Same checks as an edit, so "Apply" can't fail later.
          const r = updateLink(topology, t.link, { metricAB: t.ab, metricBA: t.ba })
          if (!r.ok) {
            setError(r.error)
            return
          }
          setError(null)
          setApplied(null)
          setTried(t)
        }}
      >
        <label className="text-xs">
          Link
          <select
            className={`${control} block`}
            value={link ? link.id : ''}
            onChange={(e) => {
              open(e.target.value === '' ? null : e.target.value)
              setError(null)
            }}
          >
            <option value="">Pick a link…</option>
            {options.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name}
              </option>
            ))}
          </select>
        </label>
        {link && (
          <>
            <label className="text-xs">
              {split ? `New metric ${link.a}→${link.b}` : 'New metric (both ways)'}
              <input
                className={`${control} block w-24`}
                inputMode="numeric"
                value={ab}
                onChange={(e) => setBox('ab', e.target.value)}
              />
            </label>
            {split && (
              <label className="text-xs">
                New metric {link.b}→{link.a}
                <input
                  className={`${control} block w-24`}
                  inputMode="numeric"
                  value={ba}
                  onChange={(e) => setBox('ba', e.target.value)}
                />
              </label>
            )}
            <label className="flex items-center gap-1 self-center text-xs">
              <input
                type="checkbox"
                checked={split}
                onChange={(e) => {
                  // Splitting starts both boxes at what "both ways" said.
                  if (id !== null)
                    setBoxes({
                      link: id,
                      ab,
                      ba: e.target.checked ? ab : ba,
                      split: e.target.checked,
                    })
                  setError(null)
                }}
              />
              Each direction
            </label>
            <button type="submit" className={button}>
              Compare
            </button>
          </>
        )}
      </form>
      {error && (
        <p role="alert" className="mt-1 text-red-700 dark:text-red-400">
          {error}
        </p>
      )}

      {!link ? (
        <p className="mt-2 text-xs text-slate-500">
          Pick a link here or click one on the diagram, type a new metric and press Compare to see
          LFA, Remote LFA and TI-LFA coverage before and after, every router as the source.
        </p>
      ) : applied !== null ? (
        <p className="mt-2 text-green-700 dark:text-green-400">
          ✓ Applied: {applied}. Undo with Ctrl+Z.
        </p>
      ) : shown === null ? (
        <p className="mt-2 text-xs text-slate-500">
          Now {link.a}→{link.b} {link.metricAB}, {link.b}→{link.a} {link.metricBA}. Nothing changes
          until you press Apply.
        </p>
      ) : !task.value ? (
        <Pending task={task} />
      ) : (
        <div className="mt-2 space-y-3">
          <p>
            <strong>{name}</strong> {triedText}, every router as the source (
            {plural(task.value.after.pairs, '(destination, link) pair')}).
            {same && ' That is the metric it has now, so nothing changes.'}
          </p>
          <DiffBody diff={task.value} />
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className={button}
              disabled={same}
              onClick={() => {
                const err = apply(shown.link, { metricAB: shown.ab, metricBA: shown.ba })
                if (err !== null) {
                  setError(err)
                  return
                }
                setApplied({ link: shown.link, text: `${name} ${triedText}` })
                setTried(null)
                setBoxes(null)
              }}
            >
              Apply this metric
            </button>
          </div>
        </div>
      )}
    </section>
  )
}

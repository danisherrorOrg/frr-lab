import { useMemo } from 'react'
import type { LinkDirection, LinkView as View } from '../engine/link-view'
import type { NodeId } from '../engine/types'
import { linkCsv } from '../io/csv'
import { useStore, type RowKey } from '../state/store'
import { downloadText } from './download'
import { engine } from './engine'
import { bundles, fileName, howText, linkName, METHOD_NAME, plural, type Bundles } from './format'
import { rowKeys } from './keys'
import { useEngineTask } from './useEngineTask'

const button =
  'rounded border border-slate-300 px-3 py-1 text-sm hover:bg-slate-100 disabled:opacity-40 dark:border-slate-600 dark:hover:bg-slate-700'
const control =
  'rounded border border-slate-300 px-2 py-1 text-sm dark:border-slate-600 dark:bg-slate-800'
const cell = 'px-2 py-1 align-top'

/** Sources named in a row before "+ n more"; the CSV and the tooltip have them all. */
const SOURCE_LIMIT = 8

/** "LFA 1 · Remote LFA 1 · ✗ 0": the methods that appear, then the unprotected count. */
function countsText(c: LinkDirection['counts']): string {
  const parts = (['ecmp', 'lfa', 'rlfa', 'tilfa'] as const)
    .filter((m) => c[m] > 0)
    .map((m) => `${METHOD_NAME[m]} ${c[m]}`)
  return [...parts, `✗ ${c.none}`].join(' · ')
}

function Direction({
  d,
  b,
  onSelect,
}: {
  d: LinkDirection
  b: Bundles
  onSelect: (source: NodeId, row: RowKey) => void
}) {
  const open = useStore((s) => s.row)
  const dut = useStore((s) => s.source)
  const title = `${d.from} → ${d.to}`
  if (d.pairs.length === 0)
    return (
      <div>
        <h3 className="py-1 font-semibold">{title}</h3>
        <p className="text-xs text-slate-500">
          No shortest path uses {d.from}→{d.to}, so nothing needs a repair this way. The link may
          still be someone’s backup.
        </p>
      </div>
    )
  return (
    <div className="overflow-x-auto">
      <h3 className="py-1 font-semibold">
        {title}{' '}
        <span className="font-normal text-slate-500">
          {d.from} repairs {plural(d.pairs.length, 'destination')} ({plural(d.flows, 'flow')}) ·{' '}
          {countsText(d.counts)}
        </span>
      </h3>
      <table className="w-full text-left">
        <caption className="sr-only">
          Traffic over {d.from}→{d.to}, repaired by {d.from}
        </caption>
        <thead className="border-b border-slate-300 text-xs text-slate-600 dark:border-slate-600 dark:text-slate-300">
          <tr>
            <th className={cell}>Dest</th>
            <th className={cell}>Cost</th>
            <th className={cell}>Traffic from</th>
            <th className={cell}>Protected by</th>
            <th className={cell}>How</th>
          </tr>
        </thead>
        <tbody>
          {d.pairs.map(({ row: r, sources }) => {
            const selected =
              open !== null && dut === r.source && open.dest === r.dest && open.link === r.link
            const choose = () => onSelect(r.source, { dest: r.dest, via: r.via, link: r.link })
            const more = sources.length - SOURCE_LIMIT
            return (
              <tr
                key={r.dest}
                tabIndex={0}
                aria-selected={selected}
                className={`cursor-pointer border-b border-slate-100 hover:bg-slate-50 focus:outline-2 focus:outline-indigo-500 dark:border-slate-800 dark:hover:bg-slate-800 ${
                  selected ? 'bg-indigo-50 dark:bg-indigo-950' : ''
                }`}
                onClick={choose}
                onKeyDown={(e) => rowKeys(e, choose)}
              >
                <td className={`${cell} font-semibold`}>{r.dest}</td>
                <td className={`${cell} tabular-nums`}>{r.cost}</td>
                <td className={cell} title={sources.join(', ')}>
                  {sources.slice(0, SOURCE_LIMIT).join(', ')}
                  {more > 0 && <span className="text-slate-500"> + {more} more</span>}
                </td>
                <td className={cell}>
                  {r.protectedBy === null ? (
                    <span className="font-semibold text-red-700 dark:text-red-400">✗ none</span>
                  ) : (
                    <span className="font-semibold text-green-700 dark:text-green-400">
                      ✓ {METHOD_NAME[r.protectedBy]}
                    </span>
                  )}
                </td>
                <td className={`${cell} text-xs`}>{howText(r, b)}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

/**
 * Per-link view (TODO backlog, docs/02-algorithms.md §11): pick a link, see every
 * (source, destination) whose traffic crosses it and how each is repaired.
 */
export function LinkView({ onSelect }: { onSelect: (source: NodeId, row: RowKey) => void }) {
  const topology = useStore((s) => s.topology)
  const extended = useStore((s) => s.settings.extended)
  const state = useStore((s) => s.linkView)
  const selection = useStore((s) => s.selection)
  const anyFailed = useStore((s) => s.failedLinks.length > 0 || s.failedNodes.length > 0)
  const openLinkView = useStore((s) => s.openLinkView)
  const close = useStore((s) => s.closeLinkView)
  const b = useMemo(() => bundles(topology), [topology])
  const link = state?.link ?? null
  const known = link !== null && topology.links.some((l) => l.id === link)
  const { value, error } = useEngineTask<View>([topology, link, extended], known, () =>
    engine().linkView(topology, link!, { extended }),
  )

  if (state === null)
    return (
      <button
        type="button"
        className={button}
        onClick={() => openLinkView(selection?.kind === 'link' ? selection.id : null)}
      >
        Per-link view
      </button>
    )

  const options = topology.links
    .map((l) => ({ id: l.id, name: linkName(b, l.a, l.b, l.id) }))
    .sort((x, y) => (x.name < y.name ? -1 : x.name > y.name ? 1 : 0))
  const view = known ? value : undefined
  const name = view ? linkName(b, view.a, view.b, view.link) : ''
  const pairs = view ? view.directions[0].pairs.length + view.directions[1].pairs.length : 0
  const flows = view ? view.directions[0].flows + view.directions[1].flows : 0
  const base = fileName(topology.name).replace(/\.yaml$/, '')

  return (
    <section aria-label="Per-link view" className="text-sm">
      <div className="flex flex-wrap items-end gap-3">
        <h2 className="mr-auto text-base font-semibold">Per-link view</h2>
        <label className="text-xs">
          Link
          <select
            className={`${control} block`}
            value={known ? link : ''}
            onChange={(e) => openLinkView(e.target.value === '' ? null : e.target.value)}
          >
            <option value="">Pick a link…</option>
            {options.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          className={button}
          disabled={!view}
          onClick={() =>
            view &&
            downloadText(
              `${base}-link-${view.link.replace(/#/g, '_')}.csv`,
              linkCsv(view),
              'text/csv',
            )
          }
        >
          ⬇ CSV
        </button>
        <button type="button" className={button} onClick={close}>
          Hide
        </button>
      </div>

      {!known ? (
        <p className="mt-2 text-xs text-slate-500">
          Pick a link here or click one on the diagram to see every (source, destination) whose
          traffic crosses it, and how each is repaired when it fails.
        </p>
      ) : error ? (
        <p className="mt-2 text-red-600">The engine failed: {error}</p>
      ) : !view ? (
        <p className="mt-2 text-xs text-slate-500">Computing…</p>
      ) : (
        <div className="mt-2 space-y-3">
          <p>
            {flows === 0 ? (
              <>
                <strong>{name}</strong> is on no shortest path, so its failure needs no repair.
              </>
            ) : (
              <>
                <strong>{name}</strong> carries {plural(flows, 'flow')} (source, destination). If it
                fails, {view.a} and {view.b} repair {plural(pairs, 'destination')} between them. FRR
                is local: the router before the link repairs everyone’s traffic with its own backup.
              </>
            )}
          </p>
          <p className="text-xs text-slate-500">
            “Traffic from” lists routers with at least one shortest path over the link (ties count).
            Click a row to open it in the results.
          </p>
          {anyFailed && (
            <p className="rounded border border-amber-300 bg-amber-50 px-2 py-1 text-xs dark:border-amber-700 dark:bg-amber-950">
              These are the backups planned for this link failing alone, on the full network. The
              diagram shows the simulated traffic for what is down now.
            </p>
          )}
          {view.directions.map((d) => (
            <Direction key={d.from} d={d} b={b} onSelect={onSelect} />
          ))}
        </div>
      )}
    </section>
  )
}

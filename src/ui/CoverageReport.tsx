import { useState } from 'react'
import { percent, type CoverageCounts, type UnprotectedReason } from '../engine/index'
import type { NodeId } from '../engine/types'
import { coverageCsv, unprotectedCsv } from '../io/csv'
import { useStore } from '../state/store'
import { downloadText } from './download'
import { fileName } from './format'
import { useCoverage } from './useCoverage'

const button =
  'rounded border border-slate-300 px-3 py-1 text-sm hover:bg-slate-100 disabled:opacity-40 dark:border-slate-600 dark:hover:bg-slate-700'
const cell = 'px-2 py-1 text-right'

/** How many unprotected pairs to list on the page; the CSV has them all. */
const LIST_LIMIT = 100

const REASON: Record<UnprotectedReason, string> = {
  'no-lfa': 'Remote LFA',
  'no-rlfa': 'TI-LFA only',
  'too-deep': '✗ TI-LFA too deep',
  partitioned: '✗ nothing',
}

const pct = (part: number, total: number) => {
  const p = percent(part, total)
  return p === undefined ? '–' : `${p}%`
}

/** One method's share as a bar, with the numbers in text as well (not colour alone). */
function Bar(props: { label: string; part: number; total: number; color: string }) {
  const { label, part, total, color } = props
  const p = percent(part, total) ?? 0
  return (
    <div className="grid grid-cols-[9rem_1fr_7rem] items-center gap-2">
      <span>{label}</span>
      <span
        className="h-3 overflow-hidden rounded bg-slate-200 dark:bg-slate-700"
        role="img"
        aria-label={`${label}: ${pct(part, total)}`}
      >
        <span className={`block h-full ${color}`} style={{ width: `${p}%` }} />
      </span>
      <span className="text-right tabular-nums">
        {part}/{total} · {pct(part, total)}
      </span>
    </div>
  )
}

function Bars({ c }: { c: CoverageCounts }) {
  return (
    <div className="space-y-1">
      <Bar label="LFA" part={c.lfa} total={c.pairs} color="bg-sky-600" />
      <Bar label="LFA or Remote LFA" part={c.rlfa} total={c.pairs} color="bg-violet-600" />
      <Bar label="TI-LFA" part={c.tilfa} total={c.pairs} color="bg-green-600" />
      <p className="text-xs text-slate-500">
        {c.pairs} (destination, link) pairs; {c.ecmp} of them ECMP-protected (counted in LFA).
      </p>
      {c.tooDeep > 0 && (
        <p className="text-xs font-semibold text-red-700 dark:text-red-400">
          ⚠ {c.tooDeep} TI-LFA repair{c.tooDeep === 1 ? ' needs' : 's need'} more labels than the
          router&apos;s max SID depth (MSD): not counted as TI-LFA.
        </p>
      )}
    </div>
  )
}

/** Coverage report (F6): numbers for one source or all sources, unprotected list, CSV. */
export function CoverageReport({ source }: { source: NodeId | null }) {
  const [open, setOpen] = useState(false)
  const [all, setAll] = useState(false)
  const topology = useStore((s) => s.topology)
  const extended = useStore((s) => s.settings.extended)
  const scope = all ? null : source
  const { report, error, progress } = useCoverage(
    topology,
    scope,
    extended,
    open && (all || source !== null),
  )

  if (!open)
    return (
      <button type="button" className={button} onClick={() => setOpen(true)}>
        Coverage report
      </button>
    )

  const base = fileName(topology.name).replace(/\.yaml$/, '')
  return (
    <section aria-label="Coverage report" className="text-sm">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="mr-auto text-base font-semibold">Coverage report</h2>
        <fieldset className="flex gap-3">
          <legend className="sr-only">Which sources</legend>
          <label className="flex items-center gap-1">
            <input type="radio" checked={!all} onChange={() => setAll(false)} />
            Source {source ?? '–'}
          </label>
          <label className="flex items-center gap-1">
            <input type="radio" checked={all} onChange={() => setAll(true)} />
            All sources ({topology.nodes.length})
          </label>
        </fieldset>
        <button type="button" className={button} onClick={() => setOpen(false)}>
          Hide
        </button>
      </div>

      {error && <p className="mt-2 text-red-600">The engine failed: {error}</p>}
      {!report && !error && (
        <div className="mt-2 flex items-center gap-2">
          <progress
            className="w-48"
            aria-label="Coverage progress"
            max={progress?.total ?? 1}
            value={progress?.done ?? 0}
          />
          <span className="text-xs text-slate-500">
            {progress ? `${progress.done} of ${progress.total} sources` : 'Starting…'}
          </span>
        </div>
      )}

      {report && (
        <div className="mt-2 space-y-3">
          <Bars c={report.total} />

          {all && (
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <caption className="py-1 text-left font-semibold">Per source</caption>
                <thead className="border-b border-slate-300 text-xs text-slate-600 dark:border-slate-600 dark:text-slate-300">
                  <tr>
                    <th className="px-2 py-1">Source</th>
                    <th className={cell}>Pairs</th>
                    <th className={cell}>LFA</th>
                    <th className={cell}>+ RLFA</th>
                    <th className={cell}>TI-LFA</th>
                    {report.total.tooDeep > 0 && <th className={cell}>Too deep</th>}
                  </tr>
                </thead>
                <tbody className="tabular-nums">
                  {report.sources.map(({ source: s, counts: c }) => (
                    <tr key={s} className="border-b border-slate-100 dark:border-slate-800">
                      <td className="px-2 py-1 font-semibold">{s}</td>
                      <td className={cell}>{c.pairs}</td>
                      <td className={cell}>{pct(c.lfa, c.pairs)}</td>
                      <td className={cell}>{pct(c.rlfa, c.pairs)}</td>
                      <td className={cell}>{pct(c.tilfa, c.pairs)}</td>
                      {report.total.tooDeep > 0 && <td className={cell}>{c.tooDeep}</td>}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className="overflow-x-auto">
            <h3 className="py-1 font-semibold">
              Not protected by LFA ({report.unprotected.length})
            </h3>
            {report.unprotected.length === 0 ? (
              <p className="text-green-700 dark:text-green-400">✓ Plain LFA protects every pair.</p>
            ) : (
              <table className="w-full text-left">
                <thead className="border-b border-slate-300 text-xs text-slate-600 dark:border-slate-600 dark:text-slate-300">
                  <tr>
                    <th className="px-2 py-1">Source</th>
                    <th className="px-2 py-1">Dest</th>
                    <th className="px-2 py-1">Link</th>
                    <th className="px-2 py-1">Best left</th>
                    <th className="px-2 py-1">Why</th>
                  </tr>
                </thead>
                <tbody>
                  {report.unprotected.slice(0, LIST_LIMIT).map((u) => (
                    <tr
                      key={`${u.source}>${u.dest}>${u.link.to}`}
                      className="border-b border-slate-100 align-top dark:border-slate-800"
                    >
                      <td className="px-2 py-1">{u.source}</td>
                      <td className="px-2 py-1">{u.dest}</td>
                      <td className="px-2 py-1">
                        {u.link.from}–{u.link.to}
                      </td>
                      <td
                        className={`px-2 py-1 ${u.reason === 'partitioned' || u.reason === 'too-deep' ? 'text-red-700 dark:text-red-400' : ''}`}
                      >
                        {REASON[u.reason]}
                      </td>
                      <td className="px-2 py-1 text-xs">{u.text}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            {report.unprotected.length > LIST_LIMIT && (
              <p className="text-xs text-slate-500">
                Showing {LIST_LIMIT} of {report.unprotected.length}. The CSV has them all.
              </p>
            )}
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className={button}
              onClick={() => downloadText(`${base}-coverage.csv`, coverageCsv(report), 'text/csv')}
            >
              ⬇ Numbers (CSV)
            </button>
            <button
              type="button"
              className={button}
              onClick={() =>
                downloadText(`${base}-unprotected.csv`, unprotectedCsv(report), 'text/csv')
              }
            >
              ⬇ Unprotected list (CSV)
            </button>
          </div>
        </div>
      )}
    </section>
  )
}

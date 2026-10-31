import { useState } from 'react'
import { useStore } from '../state/store'
import { bundles, linkName, toNumber } from './format'

const input =
  'w-20 rounded border border-slate-300 px-1 py-0.5 text-sm dark:border-slate-600 dark:bg-slate-900'
const small =
  'rounded border border-slate-300 px-2 py-0.5 text-xs hover:bg-slate-100 dark:border-slate-600 dark:hover:bg-slate-700'

/**
 * Edit a link's metric where the link is (double-click, Phase 9.5). One box when
 * both directions cost the same, one per direction when they differ. Enter saves
 * (one undo step), Escape cancels.
 */
export function MetricEditor({
  link: id,
  x,
  y,
  onClose,
}: {
  link: string
  x: number
  y: number
  onClose: () => void
}) {
  const topology = useStore((s) => s.topology)
  const updateLink = useStore((s) => s.updateLink)
  const link = topology.links.find((l) => l.id === id)
  const [ab, setAb] = useState(String(link?.metricAB ?? ''))
  const [ba, setBa] = useState(String(link?.metricBA ?? ''))
  const [error, setError] = useState<string | null>(null)
  if (!link) return null
  const same = link.metricAB === link.metricBA
  const name = linkName(bundles(topology), link.a, link.b, link.id)

  return (
    <form
      aria-label={`Edit metric of ${name}`}
      className="absolute z-20 rounded border border-slate-300 bg-white p-2 text-xs shadow-lg dark:border-slate-600 dark:bg-slate-800"
      style={{ left: x, top: y }}
      onSubmit={(e) => {
        e.preventDefault()
        const m = toNumber(ab)
        const err = updateLink(
          id,
          same ? { metricAB: m, metricBA: m } : { metricAB: m, metricBA: toNumber(ba) },
        )
        if (err === null) onClose()
        else setError(err)
      }}
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          e.stopPropagation()
          onClose()
        }
      }}
    >
      <p className="mb-1 font-semibold">Link {name}</p>
      <div className="flex items-end gap-2">
        <label>
          {same ? 'Metric (both ways)' : `${link.a}→${link.b}`}
          <input
            className={`${input} block`}
            inputMode="numeric"
            autoFocus
            value={ab}
            onChange={(e) => setAb(e.target.value)}
          />
        </label>
        {!same && (
          <label>
            {`${link.b}→${link.a}`}
            <input
              className={`${input} block`}
              inputMode="numeric"
              value={ba}
              onChange={(e) => setBa(e.target.value)}
            />
          </label>
        )}
        <button type="submit" className={small}>
          Save
        </button>
        <button type="button" className={small} onClick={onClose}>
          Cancel
        </button>
      </div>
      {error && (
        <p role="alert" className="mt-1 max-w-56 text-red-700 dark:text-red-400">
          {error}
        </p>
      )}
    </form>
  )
}

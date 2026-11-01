import { useEffect, useMemo, useRef, useState } from 'react'
import {
  generateTopology,
  gridColumns,
  SHAPES,
  SIZE_RANGE,
  spineCount,
  type Shape,
} from '../state/generate'
import { useStore } from '../state/store'

const button =
  'rounded border border-slate-300 px-3 py-1 text-sm hover:bg-slate-100 disabled:opacity-40 dark:border-slate-600 dark:hover:bg-slate-700'
const primary =
  'rounded bg-blue-600 px-3 py-1 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-40 dark:bg-blue-500 dark:hover:bg-blue-600'
const input =
  'w-24 rounded border border-slate-300 bg-white px-2 py-1 text-sm dark:border-slate-600 dark:bg-slate-800'

/** One line on what the chosen shape and size will build. */
function shapeNote(shape: Shape, n: number): string {
  if (shape === 'ring') return `${n} routers in a circle, each linked to the next.`
  if (shape === 'grid') {
    const cols = gridColumns(n)
    return `${Math.ceil(n / cols)} rows of up to ${cols}, each router linked right and down.`
  }
  if (shape === 'leaf-spine') {
    const s = spineCount(n)
    return `${s} spines and ${n - s} leaves; every leaf is linked to every spine.`
  }
  return 'Always connected, about 3 links per router. Change the seed for another one.'
}

/** "Generate" dialog: pick a shape and size, then load a new network (D50). */
export function GenerateDialog() {
  const open = useStore((s) => s.generator)
  const setOpen = useStore((s) => s.setGenerator)
  const [shape, setShape] = useState<Shape>('ring')
  const [routers, setRouters] = useState(8)
  const [seed, setSeed] = useState(1)
  const [varied, setVaried] = useState(false)
  const closeRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (open) closeRef.current?.focus()
  }, [open])

  const range = SIZE_RANGE[shape]
  const n = Math.min(range.max, Math.max(range.min, routers))
  const preview = useMemo(
    () => (open ? generateTopology({ shape, routers: n, seed, variedMetrics: varied }) : undefined),
    [open, shape, n, seed, varied],
  )

  if (!open || !preview) return null
  const usesSeed = shape === 'mesh' || varied

  const load = () => {
    useStore.getState().loadTopology(preview)
    setOpen(false)
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 p-2 sm:p-6"
      onClick={(e) => e.target === e.currentTarget && setOpen(false)}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="generate-title"
        className="flex max-h-full w-full max-w-md flex-col rounded-lg bg-white shadow-xl dark:bg-slate-900"
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            // Keep the app's own Escape (clear selection) from running underneath.
            e.stopPropagation()
            setOpen(false)
          }
        }}
      >
        <div className="flex items-center justify-between border-b border-slate-200 px-4 py-2 dark:border-slate-700">
          <h2 id="generate-title" className="text-base font-bold">
            Generate a network
          </h2>
          <button
            ref={closeRef}
            type="button"
            aria-label="Close the generator"
            className="px-2 text-lg"
            onClick={() => setOpen(false)}
          >
            ✕
          </button>
        </div>

        <div className="flex flex-col gap-4 overflow-y-auto p-4 text-sm">
          <fieldset>
            <legend className="mb-1 font-semibold">Shape</legend>
            <div className="flex flex-wrap gap-3">
              {SHAPES.map((s) => (
                <label key={s.key} className="flex items-center gap-1">
                  <input
                    type="radio"
                    name="shape"
                    value={s.key}
                    checked={shape === s.key}
                    onChange={() => setShape(s.key)}
                  />
                  {s.title}
                </label>
              ))}
            </div>
          </fieldset>

          <div>
            <label htmlFor="gen-size" className="mb-1 block font-semibold">
              Routers: {n}
            </label>
            <input
              id="gen-size"
              type="range"
              min={range.min}
              max={range.max}
              value={n}
              onChange={(e) => setRouters(Number(e.target.value))}
              className="w-full"
            />
            <div className="flex justify-between text-xs text-slate-500 dark:text-slate-400">
              <span>{range.min}</span>
              <span>{range.max}</span>
            </div>
          </div>

          <label className="flex items-center gap-2">
            <input type="checkbox" checked={varied} onChange={(e) => setVaried(e.target.checked)} />
            Varied metrics (5 to 50), so not every path is a tie
          </label>

          {usesSeed && (
            <div className="flex flex-wrap items-center gap-2">
              <label htmlFor="gen-seed" className="font-semibold">
                Seed
              </label>
              <input
                id="gen-seed"
                type="number"
                min={0}
                step={1}
                className={input}
                value={seed}
                onChange={(e) => setSeed(Math.max(0, Math.trunc(Number(e.target.value) || 0)))}
              />
              <button
                type="button"
                className={button}
                onClick={() => setSeed((s) => s + 1)}
                title="Same settings, another random network"
              >
                Another one
              </button>
              <span className="w-full text-xs text-slate-500 dark:text-slate-400">
                The same seed always gives the same network.
              </span>
            </div>
          )}

          <p className="rounded bg-slate-50 p-2 dark:bg-slate-800" aria-live="polite">
            <b>{preview.name}</b>: {preview.nodes.length} routers, {preview.links.length} links.{' '}
            {shapeNote(shape, n)}
          </p>
          <p className="text-xs text-slate-600 dark:text-slate-400">
            This replaces the network on screen. Undo (Ctrl+Z) brings it back.
          </p>

          <div className="flex justify-end gap-2">
            <button type="button" className={button} onClick={() => setOpen(false)}>
              Cancel
            </button>
            <button type="button" className={primary} onClick={load}>
              Generate
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

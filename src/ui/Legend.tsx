import type { HeatMap } from '../engine/heat-map'
import type { RepairMode } from '../engine/simulate'
import { useStore } from '../state/store'
import { HEAT_COLORS } from './canvas'
import { HEAT_LEVELS, HEAT_MODE_NAME } from './format'

interface HeatState {
  mode: RepairMode | null
  map?: HeatMap | undefined
  error?: string | undefined
  progress: { done: number; total: number } | null
}

/** Key for the coverage heat map, with its progress while the worker computes it. */
function HeatKey({ heat }: { heat: HeatState & { mode: RepairMode } }) {
  const anyDown = useStore((s) => s.failedLinks.length > 0 || s.failedNodes.length > 0)
  return (
    <div
      role="group"
      aria-label="Heat map key"
      className="border-b border-slate-200 px-3 py-2 text-xs text-slate-600 dark:border-slate-700 dark:text-slate-300"
    >
      <p>
        <strong>Heat map, {HEAT_MODE_NAME[heat.mode]}:</strong> the share of repairs with a backup.
        A router: the destinations it repairs when one of its links fails. A link: the repairs at
        both ends if it fails. Hover for the numbers.
        {anyDown && ' It shows the plan with nothing down.'}
      </p>
      {heat.error ? (
        <p className="mt-1 text-red-600">The engine failed: {heat.error}</p>
      ) : !heat.map ? (
        <p className="mt-1" role="status">
          Computing…{heat.progress && ` ${heat.progress.done} of ${heat.progress.total} routers`}
        </p>
      ) : (
        <ul className="mt-1 flex flex-wrap gap-x-4 gap-y-1">
          {HEAT_LEVELS.map(({ level, text }) => (
            <li key={level} className="flex items-center gap-1">
              <span
                aria-hidden="true"
                className="inline-block h-3 w-6 rounded-sm border border-slate-500"
                style={{ background: HEAT_COLORS[level].line }}
              />
              {text}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

/** Key for the canvas: line style and symbols as well as colour (docs/01-requirements.md §6). */
export function Legend({ heat }: { heat?: HeatState }) {
  const line = (style: string, color: string) => (
    <svg width="28" height="8" aria-hidden="true" className="inline-block">
      <line x1="0" y1="4" x2="28" y2="4" stroke={color} strokeWidth="4" strokeDasharray={style} />
    </svg>
  )
  const swatch = (bg: string) => (
    <span
      aria-hidden="true"
      className="inline-block h-3 w-3 rounded-full border border-slate-500"
      style={{ background: bg }}
    />
  )
  return (
    <>
      {heat && heat.mode !== null && <HeatKey heat={{ ...heat, mode: heat.mode }} />}
      <ul className="flex flex-wrap gap-x-4 gap-y-1 px-3 py-2 text-xs text-slate-600 dark:text-slate-300">
        <li className="flex items-center gap-1">{line('', '#2563eb')} primary path</li>
        <li className="flex items-center gap-1">{line('6 4', '#ea580c')} backup path</li>
        <li className="flex items-center gap-1">{line('2 3', '#dc2626')} ✕ failed link</li>
        <li className="flex items-center gap-1">
          <span
            aria-hidden="true"
            className="inline-block h-3 w-3 rounded-full border border-dashed border-red-600 bg-slate-300/50"
          />
          ✕ failed router (all its links down)
        </li>
        <li className="flex items-center gap-1">
          <svg
            width="14"
            height="14"
            viewBox="0 0 14 14"
            aria-hidden="true"
            className="inline-block"
          >
            <polygon
              points="4,0.5 10,0.5 13.5,4 13.5,10 10,13.5 4,13.5 0.5,10 0.5,4"
              fill="#e2e8f0"
              stroke="#b45309"
              strokeWidth="2"
            />
          </svg>
          OL = overload bit: no transit traffic through it
        </li>
        <li className="flex items-center gap-1">
          <svg width="28" height="14" aria-hidden="true" className="inline-block">
            <line
              x1="0"
              y1="7"
              x2="28"
              y2="7"
              stroke="#16a34a"
              strokeOpacity="0.3"
              strokeWidth="14"
            />
            <line x1="0" y1="7" x2="28" y2="7" stroke="#16a34a" strokeWidth="4" />
            <polyline points="11,3 16,7 11,11" fill="none" stroke="#fff" strokeWidth="2" />
          </svg>
          path after convergence
        </li>
        <li>Moving dashes = traffic on the repair path.</li>
        <li className="flex items-center gap-1">{swatch('#bfdbfe')} P-space</li>
        <li className="flex items-center gap-1">{swatch('#bbf7d0')} Q-space</li>
        <li className="flex items-center gap-1">★ chosen PQ node</li>
        <li className="flex items-center gap-1">
          {swatch('rgba(79, 70, 229, 0.35)')} ringed = the set picked in the details
        </li>
        <li className="flex items-center gap-1">
          {swatch('rgba(124, 58, 237, 0.45)')} packet walk: where the packet is now
        </li>
        <li>Metrics: one number = same both ways; two numbers = cost leaving each end.</li>
      </ul>
    </>
  )
}

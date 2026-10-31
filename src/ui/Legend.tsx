/** Key for the canvas: line style and symbols as well as colour (docs/01-requirements.md §6). */
export function Legend() {
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
  )
}

import { useRef } from 'react'

interface Props {
  /** 'vertical' = a bar between left and right panels; 'horizontal' = between top and bottom. */
  orientation: 'vertical' | 'horizontal'
  label: string
  value: number
  min: number
  max: number
  /** The new size; dragging right / down makes it bigger unless `invert` is set. */
  onChange: (size: number) => void
  /** Double-click: back to the default size. */
  onReset: () => void
  /** The panel grows when the bar moves left / up (a panel below or to the right of the bar). */
  invert?: boolean
  className?: string
}

const STEP = 16

/**
 * A drag handle between two panels. Works with a mouse, a finger (pointer events)
 * and the keyboard (arrow keys, Home / End), as a WAI-ARIA window splitter.
 */
export function Splitter({
  orientation,
  label,
  value,
  min,
  max,
  onChange,
  onReset,
  invert = false,
  className = '',
}: Props) {
  const drag = useRef<{ start: number; size: number } | null>(null)
  const vertical = orientation === 'vertical'
  const sign = invert ? -1 : 1
  const at = (e: React.PointerEvent) => (vertical ? e.clientX : e.clientY)

  const onKeyDown = (e: React.KeyboardEvent) => {
    const grow = vertical ? 'ArrowRight' : 'ArrowDown'
    const shrink = vertical ? 'ArrowLeft' : 'ArrowUp'
    let next: number | null = null
    if (e.key === grow) next = value + sign * STEP
    else if (e.key === shrink) next = value - sign * STEP
    else if (e.key === 'Home') next = min
    else if (e.key === 'End') next = max
    if (next === null) return
    e.preventDefault()
    onChange(next)
  }

  return (
    <div
      role="separator"
      aria-orientation={vertical ? 'vertical' : 'horizontal'}
      aria-label={label}
      aria-valuenow={value}
      aria-valuemin={min}
      aria-valuemax={max}
      tabIndex={0}
      title={`${label}: drag, or use the arrow keys. Double-click for the default size.`}
      className={`group relative z-20 shrink-0 touch-none bg-slate-200 outline-none select-none hover:bg-blue-400 focus-visible:bg-blue-500 dark:bg-slate-700 dark:hover:bg-blue-500 ${
        vertical ? 'w-1 cursor-col-resize' : 'h-1 cursor-row-resize'
      } ${className}`}
      onPointerDown={(e) => {
        e.preventDefault()
        e.currentTarget.setPointerCapture(e.pointerId)
        drag.current = { start: at(e), size: value }
      }}
      onPointerMove={(e) => {
        if (!drag.current) return
        onChange(drag.current.size + sign * (at(e) - drag.current.start))
      }}
      onPointerUp={() => (drag.current = null)}
      onPointerCancel={() => (drag.current = null)}
      onDoubleClick={onReset}
      onKeyDown={onKeyDown}
    >
      {/* A wider invisible grab area, so the thin bar is easy to hit. */}
      <span
        aria-hidden
        className={`absolute ${vertical ? 'inset-y-0 -right-1.5 -left-1.5' : 'inset-x-0 -top-1.5 -bottom-1.5'}`}
      />
    </div>
  )
}

import { useId, useState } from 'react'

interface Props {
  label: string
  value: string
  /** Apply the typed text. Returns an error message, or null when it worked. */
  onCommit: (text: string) => string | null
  placeholder?: string
  hint?: string
  inputMode?: 'text' | 'numeric'
}

/**
 * A text box that applies its value on Enter or when it loses focus, and shows
 * the error next to it. Give it a `key` that includes `value` so it resets when
 * the value changes elsewhere (undo, another selection).
 */
export function Field({ label, value, onCommit, placeholder, hint, inputMode = 'text' }: Props) {
  const id = useId()
  const [draft, setDraft] = useState(value)
  const [error, setError] = useState<string | null>(null)

  const commit = () => setError(draft === value ? null : onCommit(draft))

  return (
    <div className="mb-2">
      <label htmlFor={id} className="block text-xs font-medium text-slate-600 dark:text-slate-300">
        {label}
      </label>
      <input
        id={id}
        value={draft}
        placeholder={placeholder}
        inputMode={inputMode}
        aria-invalid={error !== null}
        aria-describedby={error ? `${id}-err` : undefined}
        className={`w-full rounded border px-2 py-1 text-sm dark:bg-slate-800 ${
          error ? 'border-red-500' : 'border-slate-300 dark:border-slate-600'
        }`}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') commit()
          if (e.key === 'Escape') {
            setDraft(value)
            setError(null)
          }
        }}
      />
      {error && (
        <p id={`${id}-err`} role="alert" className="mt-0.5 text-xs text-red-600 dark:text-red-400">
          {error}
        </p>
      )}
      {hint && !error && <p className="mt-0.5 text-xs text-slate-500">{hint}</p>}
    </div>
  )
}

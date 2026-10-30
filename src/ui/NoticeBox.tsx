import { useStore } from '../state/store'

const COLORS = {
  error:
    'border-red-300 bg-red-50 text-red-800 dark:border-red-800 dark:bg-red-950 dark:text-red-200',
  warning:
    'border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200',
  info: 'border-slate-300 bg-slate-50 dark:border-slate-600 dark:bg-slate-800',
}

/** Import errors and warnings, under the toolbar until dismissed. */
export function NoticeBox() {
  const notice = useStore((s) => s.notice)
  const setNotice = useStore((s) => s.setNotice)
  if (!notice) return null
  return (
    <div
      role={notice.kind === 'error' ? 'alert' : 'status'}
      className={`mx-4 mt-2 rounded border p-2 text-sm ${COLORS[notice.kind]}`}
    >
      <div className="flex items-start justify-between gap-2">
        <strong>{notice.title}</strong>
        <button type="button" aria-label="Dismiss" onClick={() => setNotice(null)}>
          ✕
        </button>
      </div>
      <ul className="ml-4 list-disc">
        {notice.lines.map((l, i) => (
          <li key={i}>{l}</li>
        ))}
      </ul>
    </div>
  )
}

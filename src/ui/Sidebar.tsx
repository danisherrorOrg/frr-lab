import { useState } from 'react'
import { freePosition } from '../state/edit'
import { useStore, type Tool } from '../state/store'
import { PropertiesPanel } from './PropertiesPanel'

/** Tools, with the one-key shortcut that picks each (App.tsx). */
const TOOLS: { tool: Tool; label: string; key: string; hint: string }[] = [
  { tool: 'select', label: 'Select', key: 'V', hint: 'Click to select, drag to move' },
  { tool: 'add-router', label: 'Add router', key: 'R', hint: 'Click empty space' },
  { tool: 'add-link', label: 'Add link', key: 'L', hint: 'Click two routers' },
  { tool: 'fail-link', label: 'Fail link', key: 'F', hint: 'Click a link to fail or restore it' },
]

const control =
  'w-full rounded border border-slate-300 px-2 py-1 text-sm dark:border-slate-600 dark:bg-slate-800'
const smallButton =
  'rounded border border-slate-300 px-3 py-1 text-sm hover:bg-slate-100 dark:border-slate-600 dark:hover:bg-slate-700'

/**
 * The same job as clicking on the canvas, for keyboard and screen-reader users
 * (docs/01-requirements.md §6). One form per tool.
 */
function KeyboardTool({ tool }: { tool: Tool }) {
  const topology = useStore((s) => s.topology)
  const selection = useStore((s) => s.selection)
  const select = useStore((s) => s.select)
  const addRouter = useStore((s) => s.addRouter)
  const addLinkBetween = useStore((s) => s.addLinkBetween)
  const failedLink = useStore((s) => s.failedLink)
  const failLink = useStore((s) => s.failLink)
  const ids = topology.nodes.map((n) => n.id).sort()
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [error, setError] = useState<string | null>(null)
  const linkName = (id: string) => {
    const l = topology.links.find((x) => x.id === id)
    return l ? `${l.a}–${l.b}` : id
  }

  if (tool === 'select')
    return (
      <label className="mt-2 block text-xs">
        Edit
        <select
          className={control}
          value={selection ? `${selection.kind}:${selection.id}` : ''}
          onChange={(e) => {
            const [kind, ...rest] = e.target.value.split(':')
            const id = rest.join(':')
            select(kind === 'node' || kind === 'link' ? { kind, id } : null)
          }}
        >
          <option value="">Topology settings</option>
          <optgroup label="Routers">
            {ids.map((id) => (
              <option key={id} value={`node:${id}`}>
                Router {id}
              </option>
            ))}
          </optgroup>
          <optgroup label="Links">
            {topology.links.map((l) => (
              <option key={l.id} value={`link:${l.id}`}>
                Link {linkName(l.id)}
              </option>
            ))}
          </optgroup>
        </select>
      </label>
    )

  if (tool === 'add-router')
    return (
      <button
        type="button"
        className={`${smallButton} mt-2`}
        onClick={() => addRouter(freePosition(topology))}
      >
        + Add a router now
      </button>
    )

  if (tool === 'add-link')
    return (
      <form
        className="mt-2 grid grid-cols-[1fr_1fr_auto] items-end gap-1 text-xs"
        onSubmit={(e) => {
          e.preventDefault()
          setError(addLinkBetween(from, to))
        }}
      >
        <label>
          From
          <select className={control} value={from} onChange={(e) => setFrom(e.target.value)}>
            <option value="">–</option>
            {ids.map((id) => (
              <option key={id}>{id}</option>
            ))}
          </select>
        </label>
        <label>
          To
          <select className={control} value={to} onChange={(e) => setTo(e.target.value)}>
            <option value="">–</option>
            {ids.map((id) => (
              <option key={id}>{id}</option>
            ))}
          </select>
        </label>
        <button type="submit" className={smallButton} disabled={!from || !to}>
          Add
        </button>
        {error && (
          <p role="alert" className="col-span-3 text-red-700 dark:text-red-400">
            {error}
          </p>
        )}
      </form>
    )

  return (
    <label className="mt-2 block text-xs">
      Failed link
      <select
        className={control}
        value={failedLink ?? ''}
        onChange={(e) => failLink(e.target.value === '' ? null : e.target.value)}
      >
        <option value="">None (all links up)</option>
        {topology.links.map((l) => (
          <option key={l.id} value={l.id}>
            ✕ {linkName(l.id)}
          </option>
        ))}
      </select>
    </label>
  )
}

/** Left panel: tools, source picker, settings, properties. */
export function Sidebar({ className = '' }: { className?: string }) {
  const tool = useStore((s) => s.tool)
  const setTool = useStore((s) => s.setTool)
  const linkStart = useStore((s) => s.linkStart)
  const nodes = useStore((s) => s.topology.nodes)
  const source = useStore((s) => s.source)
  const setSource = useStore((s) => s.setSource)
  const extended = useStore((s) => s.settings.extended)
  const setExtended = useStore((s) => s.setExtended)
  const ids = nodes.map((n) => n.id).sort()

  return (
    <aside
      aria-label="Tools and settings"
      className={`flex w-full flex-col gap-4 overflow-y-auto border-slate-200 p-3 md:border-r dark:border-slate-700 ${className}`}
    >
      <fieldset>
        <legend className="mb-1 text-sm font-semibold">Tools</legend>
        {TOOLS.map((t) => (
          <label key={t.tool} className="flex items-baseline gap-2 py-0.5 text-sm">
            <input
              type="radio"
              name="tool"
              checked={tool === t.tool}
              onChange={() => setTool(t.tool)}
            />
            <span>
              {t.label}{' '}
              <kbd className="rounded border border-slate-300 px-1 text-xs text-slate-500 dark:border-slate-600">
                {t.key}
              </kbd>
              {tool === t.tool && <span className="block text-xs text-slate-500">{t.hint}</span>}
            </span>
          </label>
        ))}
        {tool === 'add-link' && linkStart && (
          <p className="mt-1 text-xs text-green-700 dark:text-green-400">
            From {linkStart}: now click the other router.
          </p>
        )}
        <KeyboardTool key={tool} tool={tool} />
      </fieldset>

      <div>
        <label htmlFor="source" className="mb-1 block text-sm font-semibold">
          Source router (S)
        </label>
        <select
          id="source"
          className="w-full rounded border border-slate-300 px-2 py-1 text-sm dark:border-slate-600 dark:bg-slate-800"
          value={source ?? ''}
          onChange={(e) => setSource(e.target.value)}
        >
          {ids.map((id) => (
            <option key={id} value={id}>
              {id}
            </option>
          ))}
        </select>
        <label className="mt-2 flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={extended}
            onChange={(e) => setExtended(e.target.checked)}
          />
          Extended P-space (RLFA)
        </label>
      </div>

      <PropertiesPanel />

      <details className="text-xs text-slate-600 dark:text-slate-300">
        <summary className="cursor-pointer font-semibold">Keyboard shortcuts</summary>
        <ul className="mt-1 space-y-0.5">
          <li>
            <kbd>V</kbd> <kbd>R</kbd> <kbd>L</kbd> <kbd>F</kbd>: pick a tool
          </li>
          <li>
            <kbd>C</kbd>: converge / back to repair (when a link is failed)
          </li>
          <li>
            <kbd>↑</kbd> <kbd>↓</kbd>, <kbd>Enter</kbd>: move through and pick table rows
          </li>
          <li>
            <kbd>Ctrl</kbd>+<kbd>Z</kbd> / <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>Z</kbd>: undo /
            redo
          </li>
          <li>
            <kbd>Delete</kbd>: delete the selected router or link
          </li>
          <li>
            <kbd>Esc</kbd>: clear the selection, back to Select
          </li>
        </ul>
      </details>
    </aside>
  )
}

import { useStore, type Tool } from '../state/store'
import { PropertiesPanel } from './PropertiesPanel'

const TOOLS: { tool: Tool; label: string; hint: string }[] = [
  { tool: 'select', label: 'Select', hint: 'Click to select, drag to move' },
  { tool: 'add-router', label: 'Add router', hint: 'Click empty space' },
  { tool: 'add-link', label: 'Add link', hint: 'Click two routers' },
  { tool: 'fail-link', label: 'Fail link', hint: 'Click a link to fail or restore it' },
]

/** Left panel: tools, source picker, settings, properties. */
export function Sidebar() {
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
    <aside className="flex w-full flex-col gap-4 overflow-y-auto border-slate-200 p-3 md:w-64 md:border-r dark:border-slate-700">
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
              {t.label}
              {tool === t.tool && <span className="block text-xs text-slate-500">{t.hint}</span>}
            </span>
          </label>
        ))}
        {tool === 'add-link' && linkStart && (
          <p className="mt-1 text-xs text-green-700 dark:text-green-400">
            From {linkStart}: now click the other router.
          </p>
        )}
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
    </aside>
  )
}

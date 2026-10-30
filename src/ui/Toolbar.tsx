import { useRef } from 'react'
import { parseTopology, serializeTopology } from '../io/yaml'
import { EXAMPLES } from '../state/examples'
import { fileName } from './format'
import { useStore } from '../state/store'

const button =
  'rounded border border-slate-300 px-3 py-1 text-sm hover:bg-slate-100 disabled:opacity-40 dark:border-slate-600 dark:hover:bg-slate-700'

/** Top bar: examples, import, export, undo / redo. */
export function Toolbar() {
  const fileInput = useRef<HTMLInputElement>(null)
  const loadExample = useStore((s) => s.loadExample)
  const canUndo = useStore((s) => s.past.length > 0)
  const canRedo = useStore((s) => s.future.length > 0)
  const undo = useStore((s) => s.undo)
  const redo = useStore((s) => s.redo)

  const importFile = async (file: File) => {
    const { loadTopology, setNotice } = useStore.getState()
    const r = parseTopology(await file.text())
    if (!r.ok) {
      setNotice({ kind: 'error', title: `Can't load ${file.name}`, lines: r.errors })
      return
    }
    loadTopology(r.topology, undefined, r.warnings)
  }

  const exportFile = () => {
    const t = useStore.getState().topology
    const url = URL.createObjectURL(new Blob([serializeTopology(t)], { type: 'text/yaml' }))
    const a = document.createElement('a')
    a.href = url
    a.download = fileName(t.name)
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <header className="flex flex-wrap items-center gap-2 border-b border-slate-200 px-4 py-2 dark:border-slate-700">
      <h1 className="mr-4 text-lg font-bold">LFA Lab</h1>
      <select
        aria-label="Load an example"
        className={button}
        value=""
        onChange={(e) => e.target.value && loadExample(e.target.value)}
      >
        <option value="">Examples…</option>
        {EXAMPLES.map((ex) => (
          <option key={ex.key} value={ex.key}>
            {ex.title}
          </option>
        ))}
      </select>
      <button type="button" className={button} onClick={() => fileInput.current?.click()}>
        Import YAML
      </button>
      <input
        ref={fileInput}
        type="file"
        accept=".yaml,.yml,text/yaml"
        className="hidden"
        data-testid="import-file"
        onChange={(e) => {
          const file = e.target.files?.[0]
          e.target.value = '' // so the same file can be picked again
          if (file) void importFile(file)
        }}
      />
      <button type="button" className={button} onClick={exportFile}>
        Export YAML
      </button>
      <span className="mx-2 h-5 w-px bg-slate-300 dark:bg-slate-600" />
      <button type="button" className={button} onClick={undo} disabled={!canUndo} title="Ctrl+Z">
        ↶ Undo
      </button>
      <button
        type="button"
        className={button}
        onClick={redo}
        disabled={!canRedo}
        title="Ctrl+Shift+Z"
      >
        ↷ Redo
      </button>
    </header>
  )
}

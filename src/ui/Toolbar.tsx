import { useRef, useState } from 'react'
import { shareHash } from '../io/share-url'
import { parseTopology, serializeTopology } from '../io/yaml'
import { EXAMPLES } from '../state/examples'
import { fullTopology, useStore } from '../state/store'
import { downloadText } from './download'
import { fileName } from './format'
import { applyTheme, currentTheme, type Theme } from './theme'

const button =
  'rounded border border-slate-300 px-3 py-1 text-sm hover:bg-slate-100 disabled:opacity-40 dark:border-slate-600 dark:hover:bg-slate-700'

/** Put the topology in the page URL and copy the link. Nothing is uploaded (F2). */
async function share() {
  const st = useStore.getState()
  const { source, setNotice } = st
  // The whole network, also while one IS-IS level is shown (D56).
  const hash = shareHash(fullTopology(st), source)
  window.history.replaceState(null, '', hash)
  const url = window.location.href
  const note = `Anyone who opens it sees this topology. The data is inside the link itself (${url.length} characters); nothing is uploaded.`
  // Shown first: the clipboard can wait on a permission prompt or fail.
  setNotice({
    kind: 'info',
    title: 'Share link ready: copy it from the address bar',
    lines: [note],
  })
  try {
    await navigator.clipboard.writeText(url)
    setNotice({ kind: 'info', title: 'Share link copied', lines: [note] })
  } catch {
    // The address bar already holds the link.
  }
}

/** Top bar: examples, import, export, share, undo / redo, tour, theme. */
export function Toolbar() {
  const fileInput = useRef<HTMLInputElement>(null)
  const [theme, setTheme] = useState<Theme>(currentTheme)
  const toggleTheme = () => {
    const next = theme === 'dark' ? 'light' : 'dark'
    applyTheme(next, true)
    setTheme(next)
  }
  const loadExample = useStore((s) => s.loadExample)
  const canUndo = useStore((s) => s.past.length > 0)
  const canRedo = useStore((s) => s.future.length > 0)
  const undo = useStore((s) => s.undo)
  const redo = useStore((s) => s.redo)
  const setTour = useStore((s) => s.setTour)
  const setYamlGuide = useStore((s) => s.setYamlGuide)
  const setGenerator = useStore((s) => s.setGenerator)

  const importFile = async (file: File) => {
    const { loadTopology, setNotice } = useStore.getState()
    const r = parseTopology(await file.text())
    if (!r.ok) {
      setNotice({
        kind: 'error',
        title: `Can't load ${file.name}: fix ${r.errors.length === 1 ? 'this' : `these ${r.errors.length} problems`} and import again`,
        lines: r.errors,
        yamlHelp: true,
      })
      return
    }
    loadTopology(r.topology, undefined, r.warnings)
  }

  const exportFile = () => {
    const t = fullTopology(useStore.getState())
    downloadText(fileName(t.name), serializeTopology(t), 'text/yaml')
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
      <button
        type="button"
        className={button}
        onClick={() => setGenerator(true)}
        title="Make a ring, grid, leaf-spine or random mesh of any size"
      >
        Generate…
      </button>
      <button type="button" className={button} onClick={() => fileInput.current?.click()}>
        Import YAML
      </button>
      <button
        type="button"
        className={button}
        onClick={() => useStore.getState().setFrrImport(true)}
        title='Paste FRR "show isis database detail" output'
      >
        Import FRR…
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
      <button
        type="button"
        className={button}
        onClick={() => setYamlGuide(true)}
        title="What a topology file looks like, and a checker"
      >
        YAML format
      </button>
      <button type="button" className={button} onClick={() => void share()}>
        🔗 Share
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
      <button
        type="button"
        className={`${button} ml-auto`}
        onClick={() => setTour(0)}
        title="Guided tour"
      >
        ? Tour
      </button>
      <button
        type="button"
        className={button}
        onClick={toggleTheme}
        aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
        title={theme === 'dark' ? 'Light mode' : 'Dark mode'}
      >
        {theme === 'dark' ? '☀' : '☾'}
      </button>
    </header>
  )
}

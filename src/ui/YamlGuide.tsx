import { useEffect, useMemo, useRef, useState } from 'react'
import { parseTopology, serializeTopology } from '../io/yaml'
import {
  BLOCK_STYLE_YAML,
  DEFAULT_SRGB_BASE,
  LINK_FIELDS,
  MAX_LABEL,
  MAX_METRIC,
  NODE_FIELDS,
  STARTER_YAML,
  TOP_FIELDS,
  type FieldDoc,
} from '../io/yaml-format'
import { useStore } from '../state/store'

const button =
  'rounded border border-slate-300 px-3 py-1 text-sm hover:bg-slate-100 disabled:opacity-40 dark:border-slate-600 dark:hover:bg-slate-700'
const primary =
  'rounded bg-blue-600 px-3 py-1 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-40 dark:bg-blue-500 dark:hover:bg-blue-600'
const code = 'rounded bg-slate-100 px-1 font-mono text-[0.85em] dark:bg-slate-800'
const pre =
  'overflow-x-auto rounded border border-slate-200 bg-slate-50 p-2 font-mono text-xs dark:border-slate-700 dark:bg-slate-800'

const fmt = (n: number) => n.toLocaleString('en-US')

function FieldTable({ title, fields }: { title: string; fields: FieldDoc[] }) {
  return (
    <section>
      <h3 className="mb-1 font-semibold">{title}</h3>
      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs">
          <thead className="text-slate-500 dark:text-slate-400">
            <tr>
              <th className="py-1 pr-2">Key</th>
              <th className="py-1 pr-2">Needed?</th>
              <th className="py-1 pr-2">Meaning</th>
              <th className="py-1 pr-2">Rule</th>
              <th className="py-1">Example</th>
            </tr>
          </thead>
          <tbody>
            {fields.map((f) => (
              <tr key={f.key} className="border-t border-slate-200 align-top dark:border-slate-700">
                <td className="py-1 pr-2 font-mono">{f.key}</td>
                <td className="py-1 pr-2">{f.required ? 'yes' : 'no'}</td>
                <td className="py-1 pr-2">{f.what}</td>
                <td className="py-1 pr-2">{f.rule}</td>
                <td className="py-1 font-mono whitespace-pre">{f.example}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}

const MISTAKES: [string, string][] = [
  ['Tabs for indentation', 'YAML only allows spaces. Indent list items with two spaces.'],
  ['id: 1', 'A number is not text. Write id: "1", or use R1.'],
  ['id: PE-1 or id: PE 1', 'Use letters, digits, "_" and "." only: PE_1 or PE1.'],
  ['from: S, to: E', 'The ends of a link are a and b.'],
  ['metric: 0 or metric: 1.5', `Metrics are whole numbers from 1 to ${fmt(MAX_METRIC)}.`],
  ['A link to a router not in nodes', 'Add the router to nodes first, with its own sid.'],
  ['Two routers with the same sid', 'Each router needs its own SID index.'],
  [
    'Missing "- " before a router or link',
    'Each router and each link is a list item starting with "- ".',
  ],
]

/** The topology file format, and a box that checks a file before loading it. */
export function YamlGuide() {
  const open = useStore((s) => s.yamlGuide)
  const setOpen = useStore((s) => s.setYamlGuide)
  const [text, setText] = useState(STARTER_YAML)
  const closeRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (open) closeRef.current?.focus()
  }, [open])

  const result = useMemo(() => (text.trim() === '' ? null : parseTopology(text)), [text])

  if (!open) return null

  const load = () => {
    if (!result?.ok) return
    const { loadTopology } = useStore.getState()
    loadTopology(result.topology, undefined, result.warnings)
    setOpen(false)
  }
  const useCurrent = () => setText(serializeTopology(useStore.getState().topology))

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 p-2 sm:p-6"
      onClick={(e) => e.target === e.currentTarget && setOpen(false)}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="yaml-guide-title"
        className="flex max-h-full w-full max-w-4xl flex-col rounded-lg bg-white shadow-xl dark:bg-slate-900"
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            // Keep the app's own Escape (clear selection) from running underneath.
            e.stopPropagation()
            setOpen(false)
          }
        }}
      >
        <div className="flex items-center justify-between border-b border-slate-200 px-4 py-2 dark:border-slate-700">
          <h2 id="yaml-guide-title" className="text-base font-bold">
            Topology YAML format
          </h2>
          <button
            ref={closeRef}
            type="button"
            aria-label="Close the YAML guide"
            className="px-2 text-lg"
            onClick={() => setOpen(false)}
          >
            ✕
          </button>
        </div>

        <div className="flex flex-col gap-5 overflow-y-auto p-4 text-sm">
          <p>
            A topology file lists the <b>routers</b> (<span className={code}>nodes</span>) and the{' '}
            <b>links</b> between them. Load it with <b>Import YAML</b>; <b>Export YAML</b> writes
            the network on screen in the same format, so drawing one and exporting it is a good way
            to start.
          </p>

          <section>
            <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
              <h3 className="font-semibold">A file that loads</h3>
              <button type="button" className={button} onClick={() => setText(STARTER_YAML)}>
                Put it in the checker
              </button>
            </div>
            <pre className={pre}>{STARTER_YAML}</pre>
            <p className="mt-1 text-xs text-slate-600 dark:text-slate-400">
              Each <span className={code}>{'{ … }'}</span> is one router or link on one line. The
              longer block style works too:
            </p>
            <pre className={`${pre} mt-1`}>{BLOCK_STYLE_YAML}</pre>
          </section>

          <FieldTable title="Top level" fields={TOP_FIELDS} />
          <FieldTable title="Each router (under nodes)" fields={NODE_FIELDS} />
          <FieldTable title="Each link (under links)" fields={LINK_FIELDS} />

          <section>
            <h3 className="mb-1 font-semibold">Rules</h3>
            <ul className="ml-4 list-disc space-y-1">
              <li>Router ids are unique, and so are SID indices.</li>
              <li>
                A link's <span className={code}>a</span> and <span className={code}>b</span> are two
                different routers from <span className={code}>nodes</span>.
              </li>
              <li>
                Two routers may have several links (parallel links). Each is its own line; the
                second S–E link is called <span className={code}>S-E#2</span>.
              </li>
              <li>
                Prefix label = <span className={code}>srgb_base</span> +{' '}
                <span className={code}>sid</span>, e.g. {DEFAULT_SRGB_BASE} + 4 ={' '}
                {DEFAULT_SRGB_BASE + 4}. Labels go up to {fmt(MAX_LABEL)}.
              </li>
              <li>Keys not listed above are errors, so a typo like “metrc” can't slip through.</li>
              <li>A network that is not fully connected still loads, with a warning.</li>
              <li>
                Plain YAML only: custom tags like <span className={code}>!!js/function</span> are
                refused.
              </li>
            </ul>
          </section>

          <section>
            <h3 className="mb-1 font-semibold">Common mistakes</h3>
            <ul className="space-y-1">
              {MISTAKES.map(([wrong, fix]) => (
                <li key={wrong}>
                  <span className={`${code} text-red-700 dark:text-red-300`}>{wrong}</span> → {fix}
                </li>
              ))}
            </ul>
          </section>

          <section>
            <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
              <h3 className="font-semibold">
                <label htmlFor="yaml-check">Check your YAML</label>
              </h3>
              <div className="flex gap-2">
                <button type="button" className={button} onClick={useCurrent}>
                  Use the network on screen
                </button>
                <button type="button" className={button} onClick={() => setText('')}>
                  Clear
                </button>
              </div>
            </div>
            <p className="mb-1 text-xs text-slate-600 dark:text-slate-400">
              Paste or type a file. Problems show below as you type.
            </p>
            <textarea
              id="yaml-check"
              value={text}
              onChange={(e) => setText(e.target.value)}
              spellCheck={false}
              rows={10}
              className="w-full rounded border border-slate-300 bg-white p-2 font-mono text-xs dark:border-slate-600 dark:bg-slate-800"
            />
            <CheckResult result={result} />
            <div className="mt-2 flex justify-end">
              <button type="button" className={primary} disabled={!result?.ok} onClick={load}>
                Load into LFA Lab
              </button>
            </div>
          </section>
        </div>
      </div>
    </div>
  )
}

function CheckResult({ result }: { result: ReturnType<typeof parseTopology> | null }) {
  if (result === null)
    return <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">Nothing to check yet.</p>
  if (!result.ok)
    return (
      <div
        aria-label="YAML problems"
        className="mt-2 rounded border border-red-300 bg-red-50 p-2 text-xs text-red-800 dark:border-red-800 dark:bg-red-950 dark:text-red-200"
      >
        <strong>
          {result.errors.length === 1 ? '1 problem' : `${result.errors.length} problems`} to fix
        </strong>
        <ul className="ml-4 list-disc">
          {result.errors.map((e, i) => (
            <li key={i}>{e}</li>
          ))}
        </ul>
      </div>
    )
  const { nodes, links } = result.topology
  return (
    <div
      aria-label="YAML check passed"
      className="mt-2 rounded border border-green-300 bg-green-50 p-2 text-xs text-green-900 dark:border-green-800 dark:bg-green-950 dark:text-green-200"
    >
      <strong>
        ✓ Looks good: {nodes.length} router{nodes.length === 1 ? '' : 's'}, {links.length} link
        {links.length === 1 ? '' : 's'}.
      </strong>
      {result.warnings.length > 0 && (
        <ul className="ml-4 list-disc text-amber-800 dark:text-amber-200">
          {result.warnings.map((w, i) => (
            <li key={i}>Warning: {w}</li>
          ))}
        </ul>
      )}
    </div>
  )
}

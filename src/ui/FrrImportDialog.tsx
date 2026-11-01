import { useEffect, useMemo, useRef, useState } from 'react'
import { importFrr } from '../io/frr'
import { autoLayout } from '../state/layout'
import { useStore } from '../state/store'

const button =
  'rounded border border-slate-300 px-3 py-1 text-sm hover:bg-slate-100 disabled:opacity-40 dark:border-slate-600 dark:hover:bg-slate-700'
const primary =
  'rounded bg-blue-600 px-3 py-1 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-40 dark:bg-blue-500 dark:hover:bg-blue-600'

/**
 * "Import FRR" dialog (Later #2, D52): paste or open the output of FRR's
 * `show isis database detail`, check what it found, then load it as the network.
 * Nothing leaves the browser.
 */
export function FrrImportDialog() {
  const open = useStore((s) => s.frrImport)
  const setOpen = useStore((s) => s.setFrrImport)
  const [text, setText] = useState('')
  const [level, setLevel] = useState<number | 'all' | undefined>(undefined)
  const closeRef = useRef<HTMLButtonElement>(null)
  const fileInput = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (open) closeRef.current?.focus()
  }, [open])

  const result = useMemo(
    () =>
      open && text.trim() !== ''
        ? importFrr(text, level === undefined ? {} : { level })
        : undefined,
    [open, text, level],
  )

  if (!open) return null

  const load = () => {
    if (!result?.ok) return
    const t = autoLayout(result.topology)
    useStore.getState().loadTopology(t, undefined, result.warnings)
    setOpen(false)
    setText('')
    setLevel(undefined)
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 p-2 sm:p-6"
      onClick={(e) => e.target === e.currentTarget && setOpen(false)}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="frr-title"
        className="flex max-h-full w-full max-w-2xl flex-col rounded-lg bg-white shadow-xl dark:bg-slate-900"
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            e.stopPropagation()
            setOpen(false)
          }
        }}
      >
        <div className="flex items-center justify-between border-b border-slate-200 px-4 py-2 dark:border-slate-700">
          <h2 id="frr-title" className="text-base font-bold">
            Import from FRR
          </h2>
          <button
            ref={closeRef}
            type="button"
            aria-label="Close the FRR import"
            className="px-2 text-lg"
            onClick={() => setOpen(false)}
          >
            ✕
          </button>
        </div>

        <div className="flex flex-col gap-3 overflow-y-auto p-4 text-sm">
          <p>
            On a router running FRR, run{' '}
            <code className="rounded bg-slate-100 px-1 dark:bg-slate-800">
              vtysh -c &quot;show isis database detail&quot;
            </code>{' '}
            and paste the output here, or open a saved file. LFA Lab reads the routers, metrics,
            Prefix-SIDs, Adj-SIDs, SRGB, max SID depth, overload bits, LANs and areas. Nothing is
            uploaded.
          </p>
          <textarea
            aria-label="FRR output"
            className="h-56 w-full rounded border border-slate-300 bg-white p-2 font-mono text-xs dark:border-slate-600 dark:bg-slate-800"
            spellCheck={false}
            placeholder={
              'IS-IS Level-2 link-state database:\nLSP ID   PduLen  SeqNumber  Chksum  Holdtime  ATT/P/OL\nrt1.00-00  *  150  0x00000003  0x1234  1000  0/0/0\n  Hostname: rt1\n  Extended Reachability: rt2.00 (Metric: 10)\n  …'
            }
            value={text}
            onChange={(e) => {
              setText(e.target.value)
              setLevel(undefined)
            }}
          />
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" className={button} onClick={() => fileInput.current?.click()}>
              Open a file…
            </button>
            <input
              ref={fileInput}
              type="file"
              accept=".txt,.log,text/plain"
              className="hidden"
              data-testid="frr-file"
              onChange={(e) => {
                const file = e.target.files?.[0]
                e.target.value = ''
                if (file)
                  void file.text().then((t) => {
                    setText(t)
                    setLevel(undefined)
                  })
              }}
            />
            {result?.ok && result.levels.length > 1 && (
              <label className="flex items-center gap-1">
                Level
                <select
                  aria-label="IS-IS level"
                  className="rounded border border-slate-300 px-1 py-0.5 dark:border-slate-600 dark:bg-slate-800"
                  value={result.level}
                  onChange={(e) =>
                    setLevel(e.target.value === 'all' ? 'all' : Number(e.target.value))
                  }
                >
                  {result.levels.map((l) => (
                    <option key={l} value={l}>
                      Level-{l}
                    </option>
                  ))}
                  {/* D56: both levels, with each router's level and area. */}
                  <option value="all">Both levels (pick one in the sidebar later)</option>
                </select>
              </label>
            )}
          </div>

          {result && !result.ok && (
            <ul
              aria-label="FRR import problems"
              className="list-disc rounded bg-red-50 p-2 pl-6 text-red-800 dark:bg-red-950 dark:text-red-200"
            >
              {result.errors.map((e) => (
                <li key={e}>{e}</li>
              ))}
            </ul>
          )}
          {result?.ok && (
            <div aria-live="polite" className="rounded bg-slate-50 p-2 dark:bg-slate-800">
              <p>
                <b>Found:</b> {result.topology.nodes.length} routers,{' '}
                {result.topology.links.filter((l) => l.lan === undefined).length} links
                {(result.topology.lans ?? []).length > 0 &&
                  `, ${result.topology.lans!.length} LAN${result.topology.lans!.length === 1 ? '' : 's'}`}
                , SRGB {result.topology.srgbBase}
                {result.topology.nodes.some((n) => n.overload) &&
                  `, overloaded: ${result.topology.nodes
                    .filter((n) => n.overload)
                    .map((n) => n.id)
                    .join(', ')}`}
                .
              </p>
              {result.warnings.length > 0 && (
                <ul aria-label="FRR import warnings" className="mt-1 list-disc pl-5 text-xs">
                  {result.warnings.map((w) => (
                    <li key={w}>{w}</li>
                  ))}
                </ul>
              )}
            </div>
          )}

          <p className="text-xs text-slate-600 dark:text-slate-400">
            This replaces the network on screen. Undo (Ctrl+Z) brings it back. Routers are placed
            with the auto layout; drag them where you like.
          </p>
          <div className="flex justify-end gap-2">
            <button type="button" className={button} onClick={() => setOpen(false)}>
              Cancel
            </button>
            <button type="button" className={primary} disabled={!result?.ok} onClick={load}>
              Load network
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

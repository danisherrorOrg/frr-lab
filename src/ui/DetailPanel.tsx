import type { PacketWalk as Walk } from '../engine/packet-walk'
import type { ProtectionPaths } from '../engine/paths'
import type { DestinationResult, NodeId, Protection } from '../engine/types'
import { useMemo } from 'react'
import { useStore, type BackupKind } from '../state/store'
import { bundles, hopName, isBundled, lfaTags, linkName, METHOD_NAME, segmentText } from './format'
import { PacketWalk } from './PacketWalk'

interface Props {
  source: NodeId
  result: DestinationResult
  protection: Protection
  paths: ProtectionPaths
  backup: BackupKind
  /** The kind actually drawn (after 'auto' is resolved). */
  drawn: Exclude<BackupKind, 'auto'> | null
  onBackup: (b: BackupKind) => void
  onClose: () => void
  /** The TI-LFA repair walked router by router; absent when there is none. */
  walk?: Walk
  walkStep?: number | null
  onWalkStep?: (step: number | null) => void
  onPhp?: (php: boolean) => void
}

const h3 = 'mt-3 mb-1 text-sm font-semibold'
const set = (ids: NodeId[]) => (ids.length === 0 ? '∅' : `{${ids.join(', ')}}`)

/** Everything behind one results row: LFA candidates, RLFA spaces, TI-LFA labels, explain steps (F3, F7). */
export function DetailPanel({
  source,
  result,
  protection: p,
  paths,
  backup,
  drawn,
  onBackup,
  onClose,
  walk,
  walkStep = null,
  onWalkStep = () => {},
  onPhp = () => {},
}: Props) {
  const e = p.protectedLink.to
  const kinds = ['lfa', 'rlfa', 'tilfa'] as const
  const topology = useStore((s) => s.topology)
  const b = useMemo(() => bundles(topology), [topology])
  // "S–E", or "S–E (S-E#2)" when S and E have parallel links (D29).
  const sE = linkName(b, source, e, p.protectedLink.id)
  const out = p.tilfa.path?.[1]

  return (
    <section
      aria-label="Details"
      className="text-sm"
      // The window shortcut skips key presses in form fields, so the panel's own radios
      // need this for Escape to close it from inside (keyboard rule, Phase 7).
      onKeyDown={(ev) => {
        if (ev.key === 'Escape') onClose()
      }}
    >
      <div className="flex items-start justify-between gap-2">
        <h2 className="text-base font-semibold">
          {source} → {result.dest}, protecting link {sE}
        </h2>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close details"
          title="Close (Esc)"
          className="-mt-1 rounded px-2 py-0.5 text-lg leading-none text-slate-500 hover:bg-slate-100 hover:text-slate-900 focus:outline-2 focus:outline-indigo-500 dark:hover:bg-slate-800 dark:hover:text-slate-100"
        >
          ✕
        </button>
      </div>
      <p className="text-slate-600 dark:text-slate-300">
        Primary path <Path ids={paths.primary} /> (cost {result.cost}).
      </p>

      <fieldset className="mt-2 flex flex-wrap items-center gap-3">
        <legend className="sr-only">Backup path to draw</legend>
        <span className="text-xs text-slate-500">Draw backup:</span>
        <label className="flex items-center gap-1">
          <input type="radio" checked={backup === 'auto'} onChange={() => onBackup('auto')} />
          Auto
        </label>
        {kinds.map((k) => (
          <label key={k} className={`flex items-center gap-1 ${paths[k] ? '' : 'opacity-40'}`}>
            <input
              type="radio"
              checked={backup === k}
              disabled={!paths[k]}
              onChange={() => onBackup(k)}
            />
            {METHOD_NAME[k]}
          </label>
        ))}
      </fieldset>
      <p className="text-xs text-slate-500">
        {drawn ? (
          <>
            Drawing {METHOD_NAME[drawn]}: <Path ids={paths[drawn]!} />
          </>
        ) : (
          'No backup path to draw.'
        )}
      </p>

      <h3 className={h3}>LFA (RFC 5286)</h3>
      {p.ecmpProtected && (
        <p className="text-green-700 dark:text-green-400">
          ECMP-protected: another primary next hop avoids link {sE}.
        </p>
      )}
      {p.lfa.candidates.length === 0 ? (
        <p className="text-slate-500">No other neighbors to try.</p>
      ) : (
        <table className="text-left">
          <thead className="text-xs text-slate-500">
            <tr>
              <th className="pr-3">N</th>
              <th className="pr-3">Cost</th>
              <th className="pr-3">Result</th>
            </tr>
          </thead>
          <tbody>
            {p.lfa.candidates.map((c) => (
              <tr key={c.link}>
                <td className="pr-3">
                  {c.link === p.lfa.bestLink ? '★ ' : ''}
                  {hopName(b, source, c.neighbor, c.link)}
                </td>
                <td className="pr-3">{c.cost}</td>
                <td className="pr-3">
                  {c.loopFree ? '✓' : '✗'} {lfaTags(c)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <h3 className={h3}>Remote LFA (RFC 7490)</h3>
      <dl className="grid grid-cols-[auto_1fr] gap-x-3">
        <dt className="text-slate-500">P-space</dt>
        <dd>{set(p.rlfa.pSpace)}</dd>
        <dt className="text-slate-500">Extended P</dt>
        <dd>{set(p.rlfa.extPSpace)}</dd>
        <dt className="text-slate-500">Q-space</dt>
        <dd>{set(p.rlfa.qSpace)}</dd>
        <dt className="text-slate-500">PQ ({p.rlfa.extended ? 'extended' : 'plain'} P)</dt>
        <dd>{set(p.rlfa.pq)}</dd>
        <dt className="text-slate-500">Chosen</dt>
        <dd>
          {!p.rlfa.needed
            ? 'not needed: an LFA already protects this'
            : p.rlfa.best === undefined
              ? 'none'
              : `★ ${p.rlfa.best}${p.rlfa.exitVia[p.rlfa.best] ? ` (sent out via ${p.rlfa.exitVia[p.rlfa.best]})` : ''}`}
        </dd>
      </dl>

      <h3 className={h3}>TI-LFA (RFC 9855)</h3>
      {p.tilfa.path && p.tilfa.segments && p.tilfa.labelStack ? (
        <dl className="grid grid-cols-[auto_1fr] gap-x-3">
          <dt className="text-slate-500">Post-convergence path</dt>
          <dd>
            <Path ids={p.tilfa.path} />
          </dd>
          <dt className="text-slate-500">Segment list</dt>
          <dd>[{p.tilfa.segments.map((x) => segmentText(x, b)).join(', ')}]</dd>
          {out !== undefined && isBundled(b, source, out) && (
            <>
              <dt className="text-slate-500">Sent out on</dt>
              <dd>link {p.tilfa.outLink}</dd>
            </>
          )}
          <dt className="text-slate-500">Label stack (top first)</dt>
          <dd className="font-mono">{p.tilfa.labelStack.join(', ')}</dd>
          <dt className="text-slate-500">Extra labels</dt>
          <dd>{p.tilfa.extraLabels}</dd>
        </dl>
      ) : (
        <p className="text-red-700 dark:text-red-400">
          No path: {result.dest} can&apos;t be reached once link {sE} fails.
        </p>
      )}

      {walk && (
        <>
          <h3 className={h3}>Packet walk (TI-LFA)</h3>
          <PacketWalk
            walk={walk}
            e={e}
            failedLink={p.protectedLink.id}
            step={walkStep}
            onStep={onWalkStep}
            onPhp={onPhp}
            b={b}
          />
        </>
      )}

      <h3 className={h3}>Explain</h3>
      <ol className="space-y-1">
        {p.explain.map((s, i) => (
          <li key={i} className="flex gap-2">
            <span
              aria-label={s.ok ? 'passes' : 'fails'}
              className={
                s.ok ? 'text-green-700 dark:text-green-400' : 'text-red-700 dark:text-red-400'
              }
            >
              {s.ok ? '✓' : '✗'}
            </span>
            <span>
              <span className="font-medium">{s.rule}:</span>{' '}
              <span className="font-mono text-xs">{s.text}</span>
              {s.rfc && <span className="ml-1 text-xs text-slate-500">({s.rfc})</span>}
            </span>
          </li>
        ))}
      </ol>
    </section>
  )
}

function Path({ ids }: { ids: NodeId[] }) {
  return <span className="font-mono">{ids.join('→')}</span>
}

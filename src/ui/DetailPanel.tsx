import type { PacketWalk as Walk } from '../engine/packet-walk'
import type { ProtectionPaths } from '../engine/paths'
import type { DestinationResult, NodeId, Protection } from '../engine/types'
import { Fragment, useMemo } from 'react'
import { useStore, type BackupKind } from '../state/store'
import {
  bundles,
  hopName,
  isBundled,
  lfaTags,
  linkName,
  METHOD_NAME,
  protectsText,
  segmentText,
  spaceSet,
  tooDeepText,
  type SpaceKind,
} from './format'
import { PacketWalk, type WalkPath } from './PacketWalk'

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
  /** The path walked router by router: the TI-LFA repair or the primary path. */
  walk?: Walk
  /** Links or routers are down: the walk of the simulated traffic is in the failure panel. */
  walkInFailurePanel?: boolean
  /** Rows with a TI-LFA repair: which path to walk. */
  walkPath?: WalkPath
  onWalkPath?: (path: WalkPath) => void
  walkStep?: number | null
  onWalkStep?: (step: number | null) => void
  onPhp?: (php: boolean) => void
  /** Draw the label stacks on the diagram during the walk. */
  walkOnCanvas?: boolean
  onWalkOnCanvas?: (on: boolean) => void
  /** The Remote LFA set shown on its own on the diagram, if any. */
  space?: SpaceKind | null
  onSpace?: (kind: SpaceKind | null) => void
  /** Links or routers are down: the diagram shows the simulated traffic, not the sets. */
  spacesOff?: boolean
}

const h3 = 'mt-3 mb-1 text-sm font-semibold'
const SPACES: { kind: SpaceKind; name: string }[] = [
  { kind: 'p', name: 'P-space' },
  { kind: 'extP', name: 'Extended P' },
  { kind: 'q', name: 'Q-space' },
  { kind: 'pq', name: 'PQ' },
]
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
  walkPath,
  onWalkPath,
  walkInFailurePanel = false,
  walkStep = null,
  onWalkStep = () => {},
  onPhp = () => {},
  walkOnCanvas = true,
  onWalkOnCanvas = () => {},
  space = null,
  onSpace = () => {},
  spacesOff = false,
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
        {/* SRLG modes (D53): what fails together with the protected link. */}
        {p.srlg !== undefined && (
          <span className="block text-xs">
            Shares an SRLG with {p.srlg.join(', ')}: backups should avoid{' '}
            {p.srlg.length === 1 ? 'it' : 'them'} too.
          </span>
        )}
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
        )}{' '}
        <a href="#compare" className="text-indigo-700 underline dark:text-indigo-300">
          Compare all three side by side ↓
        </a>
      </p>

      <h3 className={h3}>LFA (RFC 5286)</h3>
      {p.ecmpProtected && (
        <p className="text-green-700 dark:text-green-400">
          ECMP-protected: another primary next hop avoids link {sE}.
        </p>
      )}
      {p.lfa.excluded && (
        <p className="text-slate-500">
          Not used, by {source}&apos;s LFA policy: {p.lfa.excluded.join(', ')}.
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
                  {c.loopFree && c.policyRejected === undefined ? '✓' : '✗'} {lfaTags(c)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <h3 className={h3}>Remote LFA (RFC 7490)</h3>
      <p className="text-xs text-slate-500">
        {spacesOff
          ? 'Something is down, so the diagram shows the simulated traffic, not these sets.'
          : 'Click a set to show only its routers on the diagram.'}
      </p>
      <dl className="grid grid-cols-[auto_1fr] items-baseline gap-x-3">
        {SPACES.map(({ kind, name }) => {
          const ids = spaceSet(p.rlfa, kind)
          const label = kind === 'pq' ? `PQ (${p.rlfa.extended ? 'extended' : 'plain'} P)` : name
          const on = space === kind
          return (
            <Fragment key={kind}>
              <dt className="text-slate-500">{label}</dt>
              <dd>
                <button
                  type="button"
                  aria-pressed={on}
                  aria-label={`${label} ${set(ids)}`}
                  title={
                    ids.length === 0
                      ? 'Empty set: nothing to show'
                      : on
                        ? 'Click again to show P and Q together'
                        : `Show only ${label} on the diagram`
                  }
                  disabled={spacesOff || ids.length === 0}
                  onClick={() => onSpace(on ? null : kind)}
                  className={`-mx-1 rounded px-1 text-left focus:outline-2 focus:outline-indigo-500 enabled:hover:bg-indigo-50 disabled:cursor-default dark:enabled:hover:bg-slate-800 ${
                    on
                      ? 'bg-indigo-100 font-semibold text-indigo-900 ring-1 ring-indigo-400 dark:bg-indigo-950 dark:text-indigo-100'
                      : ''
                  } ${ids.length > 0 && !spacesOff ? 'underline decoration-dotted underline-offset-2' : ''}`}
                >
                  {set(ids)}
                </button>
              </dd>
            </Fragment>
          )
        })}
        <dt className="text-slate-500">Chosen</dt>
        <dd>
          {!p.rlfa.needed
            ? 'not needed: an LFA already protects this'
            : p.rlfa.best === undefined
              ? 'none'
              : `★ ${p.rlfa.best}${p.rlfa.exitVia[p.rlfa.best] ? ` (sent out via ${p.rlfa.exitVia[p.rlfa.best]})` : ''}`}
        </dd>
        {/* Node mode (RFC 8102, D51): the node-protecting sets for this destination. */}
        {p.rlfa.node && (
          <>
            <dt className="text-slate-500">Node-protecting P</dt>
            <dd>{set(p.rlfa.node.pSpace)}</dd>
            <dt className="text-slate-500">Node-protecting PQ</dt>
            <dd>{set(p.rlfa.node.pq)}</dd>
          </>
        )}
        {p.rlfa.needed && p.rlfa.best !== undefined && p.rlfa.protects !== undefined && (
          <>
            <dt className="text-slate-500">Protects</dt>
            <dd
              className={
                p.rlfa.protects === 'node' ? '' : 'font-semibold text-amber-700 dark:text-amber-400'
              }
            >
              {protectsText(p.rlfa.protects, p.rlfa.fallback, p.protectedLink.to)}
            </dd>
          </>
        )}
      </dl>

      <h3 className={h3}>TI-LFA (RFC 9855)</h3>
      {p.tilfa.path && p.tilfa.segments && p.tilfa.labelStack ? (
        <dl className="grid grid-cols-[auto_1fr] gap-x-3">
          <dt className="text-slate-500">Post-convergence path</dt>
          <dd>
            <Path ids={p.tilfa.path} />
          </dd>
          {p.tilfa.protects !== undefined && (
            <>
              <dt className="text-slate-500">Protects</dt>
              <dd
                className={
                  p.tilfa.protects === 'node'
                    ? ''
                    : 'font-semibold text-amber-700 dark:text-amber-400'
                }
              >
                {protectsText(p.tilfa.protects, p.tilfa.fallback, p.protectedLink.to)}
              </dd>
            </>
          )}
          <dt className="text-slate-500">Segment list</dt>
          <dd>[{p.tilfa.segments.map((x) => segmentText(x, b)).join(', ')}]</dd>
          {out !== undefined && isBundled(b, source, out) && (
            <>
              <dt className="text-slate-500">Sent out on</dt>
              <dd>link {p.tilfa.outLink}</dd>
            </>
          )}
          {p.tilfa.srv6 !== undefined ? (
            <>
              <dt className="text-slate-500">SRv6 SID list</dt>
              <dd className="font-mono">
                {p.tilfa.srv6.length === 0
                  ? 'none: the outgoing interface is enough'
                  : p.tilfa.srv6.join(', ')}
                <span className="block font-sans text-xs text-slate-500">
                  {result.dest} stays the inner destination (RFC 9855 §7.2). The packet walk below
                  shows the same repair with SR-MPLS labels.
                </span>
              </dd>
            </>
          ) : (
            <>
              <dt className="text-slate-500">Label stack (top first)</dt>
              <dd className="font-mono">{p.tilfa.labelStack.join(', ')}</dd>
            </>
          )}
          <dt className="text-slate-500">Extra labels</dt>
          <dd>{p.tilfa.extraLabels}</dd>
          {p.tilfa.msd !== undefined && (
            <>
              <dt className="text-slate-500">Max SID depth</dt>
              {p.tilfa.tooDeep ? (
                <dd className="font-semibold text-red-700 dark:text-red-400">
                  ⚠ Too deep: {tooDeepText(source, p.tilfa.labelStack.length, p.tilfa.msd)}.{' '}
                  {source}&apos;s hardware can&apos;t put this many labels on a packet, so this
                  backup is not installed.
                </dd>
              ) : (
                <dd>
                  ✓ {p.tilfa.labelStack.length} ≤ MSD {p.tilfa.msd} of {source}
                </dd>
              )}
            </>
          )}
        </dl>
      ) : (
        <p className="text-red-700 dark:text-red-400">
          No path: {result.dest} can&apos;t be reached once link {sE} fails.
        </p>
      )}

      {walkInFailurePanel && (
        <>
          <h3 className={h3}>Packet walk</h3>
          <p className="text-slate-500">
            Something is down, so the diagram shows the simulated traffic. Its packet walk is in the
            failure panel.
          </p>
        </>
      )}
      {walk && (
        <>
          <h3 className={h3}>Packet walk</h3>
          <PacketWalk
            walk={walk}
            e={e}
            failedLink={p.protectedLink.id}
            {...(walkPath !== undefined && onWalkPath && { path: walkPath, onPath: onWalkPath })}
            step={walkStep}
            onStep={onWalkStep}
            onPhp={onPhp}
            onCanvas={walkOnCanvas}
            onOnCanvas={onWalkOnCanvas}
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

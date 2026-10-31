import type { PacketAction, PacketHop, PacketWalk as Walk } from '../engine/packet-walk'
import type { NodeId, Segment } from '../engine/types'
import { hopName, linkName, METHOD_NAME, type Bundles } from './format'

/** Which path of a results row is walked. */
export type WalkPath = 'primary' | 'tilfa'

interface Props {
  walk: Walk
  /** TI-LFA walks: the protected link S–E, for the text at S. */
  e?: NodeId
  failedLink?: string
  /** Rows with a TI-LFA repair: walk the primary path or the backup. */
  path?: WalkPath
  onPath?: (path: WalkPath) => void
  /** Current hop, or null before the walk is started. */
  step: number | null
  onStep: (step: number | null) => void
  onPhp: (php: boolean) => void
  /** Show the label stacks on the diagram while walking. */
  onCanvas: boolean
  onOnCanvas: (on: boolean) => void
  b: Bundles
}

const btn =
  'rounded border border-slate-300 px-2 py-0.5 hover:bg-slate-100 disabled:opacity-40 focus:outline-2 focus:outline-indigo-500 dark:border-slate-600 dark:hover:bg-slate-800'

const segName = (s: Segment, b: Bundles) =>
  s.kind === 'prefix'
    ? `Prefix-SID(${s.node})`
    : `Adj-SID(${s.from}→${hopName(b, s.from, s.to, s.link)})`

/** A label stack, top first: "16004 B · 24005 B→C · 16002 E", or "no labels". */
function Stack({ segs, b }: { segs: Segment[] | undefined; b: Bundles }) {
  if (segs === undefined) return <span className="text-slate-400">–</span>
  if (segs.length === 0) return <span className="text-slate-500 italic">no labels (IP)</span>
  return (
    <span className="inline-flex flex-wrap gap-1">
      {segs.map((s, i) => (
        <span
          key={i}
          title={segName(s, b)}
          className={`rounded px-1 font-mono text-xs ${
            s.kind === 'adj'
              ? 'bg-amber-100 text-amber-900 dark:bg-amber-900/40 dark:text-amber-200'
              : 'bg-indigo-100 text-indigo-900 dark:bg-indigo-900/40 dark:text-indigo-200'
          }`}
        >
          {s.label}{' '}
          <span className="opacity-70">
            {s.kind === 'prefix' ? s.node : `${s.from}→${hopName(b, s.from, s.to, s.link)}`}
          </span>
        </span>
      ))}
    </span>
  )
}

const labelList = (segs: Segment[], b: Bundles) =>
  segs.map((s) => `${s.label} (${segName(s, b)})`).join(', ')

/** What a backup did to the stack: "pushes 16004 (Prefix-SID(B))", or "replaces … with …". */
function stackChange(before: Segment[], after: Segment[], b: Bundles) {
  let same = 0
  while (
    same < before.length &&
    same < after.length &&
    before[before.length - 1 - same]!.label === after[after.length - 1 - same]!.label
  )
    same++
  const gone = before.slice(0, before.length - same)
  const added = after.slice(0, after.length - same)
  if (added.length === 0 && gone.length === 0) return 'keeps the same labels'
  if (gone.length === 0) return `pushes ${labelList(added, b)} on top`
  if (added.length === 0) return `pops ${labelList(gone, b)}`
  return `replaces ${labelList(gone, b)} with ${labelList(added, b)}`
}

/** A simulated router switching to its backup (D24): what it puts on and where it sends. */
function repairText(a: Extract<PacketAction, { kind: 'repair' }>, hop: PacketHop, b: Bundles) {
  const { at, link, next, target, method } = a.step
  const lead = `Link ${linkName(b, at, next, link)} is down, so ${at} switches to its ${METHOD_NAME[method]} backup for ${target}`
  if (a.after === undefined) return `${lead}.`
  const to = hopName(b, at, hop.to!, hop.link)
  const change = stackChange(a.before, a.after, b)
  switch (method) {
    case 'ecmp':
      return `${lead}: another equal-cost next hop. It ${change} and sends to ${to}.`
    case 'lfa':
      return `${lead}: neighbor ${to}, which won't send it back (RFC 5286). It ${change} and sends there.`
    case 'rlfa':
      return `${lead}: a tunnel to the PQ node ${a.after[0]?.kind === 'prefix' ? a.after[0].node : ''}. It ${change} (RFC 7490) and sends to ${to}.`
    case 'tilfa':
      return `${lead}. It ${change} (RFC 9855) and sends to ${to}.`
  }
}

/** One action as a plain-English sentence with the real numbers (UI rule: show numbers). */
function actionText(
  a: PacketAction,
  hop: PacketHop,
  walk: Walk,
  e: NodeId | undefined,
  failed: string | undefined,
  b: Bundles,
) {
  const r = hop.router
  const own = walk.hops[0]!.received[0]!
  switch (a.kind) {
    case 'push':
      return a.segments.length === 0
        ? `The packet comes in with ${walk.d}'s label ${own.label}. The repair needs no extra labels.`
        : `Pushes ${a.segments.map((s) => `${s.label} (${segName(s, b)})`).join(', ')} on top of ${walk.d}'s label ${own.label} (RFC 9855 §5).`
    case 'repair-out':
      return `Link ${linkName(b, r, e ?? '?', failed)} is down, so ${r} sends out of its repair interface to ${hopName(b, r, a.to, a.link)}, not its normal next hop ${e}.`
    case 'forward': {
      const y = a.segment.node
      return `Top label ${a.segment.label} is ${y}'s Prefix-SID: ${r} uses its normal table to reach ${y}. Next hop ${a.to}, since c(${r},${a.to}) + dist(${a.to},${y}) = ${a.metric} + ${a.distNextY} = ${a.distRY} = dist(${r},${y}).`
    }
    case 'php':
      return `PHP: ${hop.to} is the end of the segment ${segName(a.segment, b)}, so ${r} pops ${a.segment.label} before sending (penultimate-hop popping).`
    case 'pop-end':
      return `${a.segment.label} is ${r}'s own Prefix-SID: this segment ends here, so ${r} pops it.`
    case 'pop-adj':
      return `${a.segment.label} is ${r}'s own Adj-SID for link ${linkName(b, r, a.segment.to, a.segment.link)}: ${r} pops it and sends out that link (metric ${hop.metric}), whatever its normal table says.`
    case 'deliver':
      return walk.php && walk.hops.length > 1
        ? `No labels left (the previous router popped ${walk.d}'s label): delivered as a plain IP packet.`
        : `No labels left: delivered as a plain IP packet.`
    case 'repair':
      return repairText(a, hop, b)
    case 'drop': {
      const l = linkName(b, a.drop.at, a.drop.next, a.drop.link)
      return a.drop.reason === 'no-backup'
        ? `Link ${l} is down and ${r} has no backup for it: the packet is dropped here.`
        : `The backup's own first link ${l} is down too, and a router holds only one backup: the packet is dropped here.`
    }
    case 'loop':
      return a.exact
        ? `${r} already had this packet with the same labels, so it sends it round the same way again: a loop until the network reconverges.`
        : `The packet is back at ${r}. The labels change each time round, but it keeps circling until the network reconverges or its TTL runs out.`
  }
}

/** The line under the table: what the walk shows and its total. */
function footer(walk: Walk) {
  const last = walk.hops.at(-1)!
  const from = `Assumes the packet reaches ${walk.s} already carrying ${walk.d}'s label.`
  if (walk.kind === 'tilfa')
    return `Total ${walk.cost}, the post-convergence cost. Only ${walk.s} uses the repair; every other router just reads the top label. ${from}`
  if (walk.kind === 'converged')
    return `Total ${walk.cost}, the cost after convergence. Every router has run SPF again without what failed, so no backup is used: each one just reads ${walk.d}'s label. ${from}`
  if (walk.kind === 'primary')
    return `Total ${walk.cost}, the normal cost. Nothing has failed, so every router, ${walk.s} too, just reads ${walk.d}'s label. ${from}`
  const end =
    walk.status === 'repaired'
      ? `Delivered, total ${walk.cost}.`
      : last.actions.some((a) => a.kind === 'drop')
        ? `Dropped at ${last.router} after ${walk.cost} in metrics.`
        : `Loops back to ${last.router}; nothing reaches ${walk.d} until the network reconverges.`
  return `${end} Every router uses its normal table unless its own link is down; then it uses the backup it computed for that one link. ${from}`
}

/**
 * Step through the TI-LFA repair router by router, with the label stack at each one
 * (docs/02-algorithms.md §4.5, TODO backlog "Packet walk").
 */
export function PacketWalk({
  walk,
  e,
  failedLink,
  path,
  onPath,
  step,
  onStep,
  onPhp,
  onCanvas,
  onOnCanvas,
  b,
}: Props) {
  const last = walk.hops.length - 1
  const hop = step === null ? undefined : walk.hops[step]

  return (
    <div
      aria-label="Packet walk"
      role="group"
      onKeyDown={(ev) => {
        if (step === null) return
        if (ev.key === 'ArrowRight' && step < last) onStep(step + 1)
        else if (ev.key === 'ArrowLeft' && step > 0) onStep(step - 1)
        else return
        ev.preventDefault()
      }}
    >
      {path !== undefined && onPath && (
        <fieldset className="mb-2 flex flex-wrap items-center gap-3 text-xs">
          <legend className="sr-only">Path to walk</legend>
          <span className="text-slate-500">Walk:</span>
          {(
            [
              ['primary', 'Primary path (no failure)'],
              ['tilfa', 'TI-LFA backup'],
            ] as const
          ).map(([value, text]) => (
            <label key={value} className="flex items-center gap-1">
              <input
                type="radio"
                name="walk-path"
                checked={path === value}
                onChange={() => onPath(value)}
              />
              {text}
            </label>
          ))}
        </fieldset>
      )}
      <div className="flex flex-wrap items-center gap-2">
        {step === null ? (
          <button type="button" className={btn} onClick={() => onStep(0)}>
            ▶ Start packet walk
          </button>
        ) : (
          <>
            <button
              type="button"
              className={btn}
              disabled={step === 0}
              onClick={() => onStep(step - 1)}
              aria-label="Previous router"
            >
              ◀ Back
            </button>
            <span className="text-xs text-slate-600 dark:text-slate-300" aria-live="polite">
              Router {step + 1} of {walk.hops.length}: <strong>{hop!.router}</strong>
            </span>
            <button
              type="button"
              className={btn}
              disabled={step === last}
              onClick={() => onStep(step + 1)}
              aria-label="Next router"
            >
              Next ▶
            </button>
            <button type="button" className={btn} onClick={() => onStep(null)}>
              Stop
            </button>
          </>
        )}
        <label className="flex items-center gap-1 text-xs">
          <input type="checkbox" checked={walk.php} onChange={(ev) => onPhp(ev.target.checked)} />
          PHP (penultimate-hop popping)
        </label>
        <label className="flex items-center gap-1 text-xs">
          <input
            type="checkbox"
            checked={onCanvas}
            onChange={(ev) => onOnCanvas(ev.target.checked)}
          />
          Show labels on the diagram
        </label>
      </div>

      {hop && (
        <div className="mt-2 rounded border border-violet-300 bg-violet-50 p-2 dark:border-violet-700 dark:bg-violet-950/40">
          <p>
            <span className="text-slate-500">Arrives at {hop.router} with:</span>{' '}
            <Stack segs={hop.received} b={b} />
          </p>
          <ol className="my-1 list-decimal pl-5">
            {hop.actions.map((a, i) => (
              <li key={i}>{actionText(a, hop, walk, e, failedLink, b)}</li>
            ))}
          </ol>
          {hop.to !== undefined && (
            <p>
              <span className="text-slate-500">
                Leaves for {hopName(b, hop.router, hop.to, hop.link)} with:
              </span>{' '}
              <Stack segs={hop.sent} b={b} />
            </p>
          )}
        </div>
      )}

      <table className="mt-2 w-full text-left text-xs">
        <thead className="text-slate-500">
          <tr>
            <th className="pr-2">Router</th>
            <th className="pr-2">Arrives with (top first)</th>
            <th className="pr-2">Does</th>
            <th className="pr-2">Leaves with</th>
          </tr>
        </thead>
        <tbody>
          {walk.hops.map((h, i) => (
            <tr
              key={i}
              onClick={() => onStep(i)}
              aria-current={i === step ? 'step' : undefined}
              className={`cursor-pointer align-top ${i === step ? 'bg-violet-100 dark:bg-violet-900/40' : 'hover:bg-slate-50 dark:hover:bg-slate-800'}`}
            >
              <td className="pr-2 font-semibold">{h.router}</td>
              <td className="pr-2">
                <Stack segs={h.received} b={b} />
              </td>
              <td className="pr-2">{h.actions.map((a) => ACTION_SHORT[a.kind]).join(', ')}</td>
              <td className="pr-2">
                {h.to === undefined ? END[h.actions.at(-1)!.kind] : <Stack segs={h.sent} b={b} />}
                {h.to !== undefined && <span className="text-slate-500"> → {h.to}</span>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mt-1 text-xs text-slate-500">{footer(walk)}</p>
    </div>
  )
}

const ACTION_SHORT: Record<PacketAction['kind'], string> = {
  push: 'push',
  'repair-out': 'repair interface',
  forward: 'forward',
  php: 'PHP pop',
  'pop-end': 'pop (own SID)',
  'pop-adj': 'pop Adj-SID',
  deliver: 'deliver',
  repair: 'repair (backup)',
  drop: 'drop',
  loop: 'loop',
}

/** The last column for the last router. */
const END: Partial<Record<PacketAction['kind'], string>> = {
  deliver: 'delivered',
  drop: 'dropped',
  loop: 'loop',
}

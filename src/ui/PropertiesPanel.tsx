import { useId } from 'react'
import { adjLabel } from '../engine/labels'
import type {
  LfaPreference,
  Link,
  NodeId,
  ProtectionGoal,
  RouterNode,
  Topology,
} from '../engine/types'
import { srlgGroups } from '../engine/srlg'
import { useStore } from '../state/store'
import { Field } from './Field'
import { usePolicyEffect } from './usePolicyEffect'
import { bundles, isBundled, toNumber } from './format'

const heading = 'mb-2 text-sm font-semibold'
const danger =
  'mt-1 rounded border border-red-300 px-3 py-1 text-sm text-red-700 hover:bg-red-50 dark:border-red-700 dark:text-red-300 dark:hover:bg-red-950'

/** Edit the selected router or link, or the topology when nothing is selected (F1). */
export function PropertiesPanel() {
  const topology = useStore((s) => s.topology)
  const selection = useStore((s) => s.selection)

  if (selection?.kind === 'node') {
    const node = topology.nodes.find((n) => n.id === selection.id)
    if (node) return <RouterForm node={node} topology={topology} />
  }
  if (selection?.kind === 'link') {
    const link = topology.links.find((l) => l.id === selection.id)
    if (link) return <LinkForm link={link} topology={topology} />
  }
  return <TopologyForm topology={topology} />
}

function TopologyForm({ topology: t }: { topology: Topology }) {
  const update = useStore((s) => s.updateTopology)
  const source = useStore((s) => s.source)
  return (
    <section aria-label="Topology properties">
      <h2 className={heading}>Topology</h2>
      <Field
        key={`name:${t.name}`}
        label="Name"
        value={t.name}
        onCommit={(v) => update({ name: v })}
      />
      <Field
        key={`srgb:${t.srgbBase}`}
        label="SRGB base"
        value={String(t.srgbBase)}
        inputMode="numeric"
        hint="Prefix label = SRGB base + SID index"
        onCommit={(v) => update({ srgbBase: toNumber(v) })}
      />
      <Field
        key={`msd:${t.msd ?? ''}`}
        label="Max SID depth (MSD)"
        value={t.msd === undefined ? '' : String(t.msd)}
        placeholder="no limit"
        inputMode="numeric"
        hint="Most labels a router can push. Deeper TI-LFA repairs are flagged."
        onCommit={(v) => update({ msd: v.trim() === '' ? null : toNumber(v) })}
      />
      <ProtectionSelect
        value={t.protection ?? 'link'}
        onChange={(v) => update({ protection: v })}
      />
      <DataplaneSelect value={t.dataplane ?? 'mpls'} onChange={(v) => update({ dataplane: v })} />
      <h3 className="mt-3 mb-1 text-xs font-semibold">LFA policy (RFC 7916)</h3>
      <PolicySelect
        label="Node-protecting LFAs"
        value={t.lfaPolicy?.nodeProtecting ?? 'prefer'}
        onChange={(v) => update({ lfaPolicy: { nodeProtecting: v } })}
      />
      <PolicySelect
        label="Downstream LFAs"
        value={t.lfaPolicy?.downstream ?? 'prefer'}
        onChange={(v) => update({ lfaPolicy: { downstream: v } })}
      />
      <p className="mb-2 text-xs text-slate-500">
        Prefer = rank first. Require = use no other LFA. Ignore = don&apos;t care. To stop a router
        using one neighbor, click the router.
      </p>
      <PolicyEffect topology={t} source={source} />
      <p className="text-xs text-slate-500">
        {t.nodes.length} routers, {t.links.length} links. Click a router or link to edit it.
      </p>
    </section>
  )
}

/**
 * "Fail SRLG duct-7 (3 links)": takes down every link of the group at once, the
 * failure an SRLG stands for (D53). Replaces whatever was down.
 */
function SrlgButtons({ link, topology }: { link: Link; topology: Topology }) {
  const failOnly = useStore((s) => s.failOnly)
  const groups = srlgGroups(topology).filter((g) => (link.srlg ?? []).includes(g.group))
  if (groups.length === 0) return null
  return (
    <div className="mb-2 flex flex-wrap gap-2">
      {groups.map((g) => (
        <button
          key={g.group}
          type="button"
          title={`Links: ${g.links.join(', ')}`}
          className="rounded border border-red-300 px-2 py-0.5 text-xs text-red-700 hover:bg-red-50 dark:border-red-700 dark:text-red-300 dark:hover:bg-red-950"
          onClick={() => failOnly({ links: g.links })}
        >
          ✕ Fail SRLG {g.group} ({g.links.length} link{g.links.length === 1 ? '' : 's'})
        </button>
      ))}
    </div>
  )
}

const MAX_LISTED = 5

/**
 * "Changes S's LFA for 2 of 4 destinations: D (N → none), M (E → none)", so a
 * policy that changes nothing for this router says so instead of looking broken.
 */
function PolicyEffect({ topology, source }: { topology: Topology; source: NodeId | null }) {
  const { active, effect } = usePolicyEffect(topology, source)
  if (!active || source === null) return null
  let text: string
  if (effect === undefined) text = `Checking what the policy changes for ${source}…`
  else if (effect.changes.length === 0)
    text = `No effect for ${source}: it picks the same LFAs as with the default policy.`
  else {
    const dests = new Set(effect.changes.map((c) => c.dest)).size
    const list = effect.changes
      .slice(0, MAX_LISTED)
      .map((c) => `${c.dest} (${c.before ?? 'none'} → ${c.after ?? 'none'})`)
      .join(', ')
    const more = effect.changes.length > MAX_LISTED ? ', …' : ''
    text = `Changes ${source}'s LFA for ${dests} destination${dests === 1 ? '' : 's'}: ${list}${more}.`
  }
  return (
    <p
      role="status"
      aria-label="LFA policy effect"
      className="mb-2 text-xs font-medium text-indigo-700 dark:text-indigo-300"
    >
      {text}
    </p>
  )
}

/** SR-MPLS or SRv6 (D59): how TI-LFA repairs are written. */
function DataplaneSelect({
  value,
  onChange,
}: {
  value: 'mpls' | 'srv6'
  onChange: (v: 'mpls' | 'srv6') => void
}) {
  const id = useId()
  return (
    <div className="mb-2 flex items-center justify-between gap-2">
      <label htmlFor={id} className="text-xs font-medium text-slate-600 dark:text-slate-300">
        Data plane
      </label>
      <select
        id={id}
        value={value}
        className="rounded border border-slate-300 px-1 py-0.5 text-sm dark:border-slate-600 dark:bg-slate-800"
        onChange={(e) => onChange(e.target.value as 'mpls' | 'srv6')}
      >
        <option value="mpls">SR-MPLS (labels)</option>
        <option value="srv6">SRv6 (SIDs)</option>
      </select>
    </div>
  )
}

const GOAL_HINT: Record<ProtectionGoal, string> = {
  link: 'Remote LFA and TI-LFA only avoid the failed link. Pick node to survive a router failure.',
  node: 'Remote LFA and TI-LFA avoid the next-hop router too (RFC 8102, RFC 9855); link protection when they can’t.',
  srlg: 'Backups also avoid every link that shares an SRLG with the failed one (RFC 9855). Set SRLGs on links.',
  'node-srlg':
    'Backups avoid the next-hop router and the failed link’s SRLG; they fall back one step at a time.',
}

/**
 * Link, node or SRLG protection for Remote LFA and TI-LFA (D51, D53). A network setting, like
 * the MSD, so it is saved in the file and the share link.
 */
function ProtectionSelect({
  value,
  onChange,
}: {
  value: ProtectionGoal
  onChange: (v: ProtectionGoal) => void
}) {
  const id = useId()
  return (
    <div className="mb-2">
      <div className="flex items-center justify-between gap-2">
        <label htmlFor={id} className="text-xs font-medium text-slate-600 dark:text-slate-300">
          Backups protect against
        </label>
        <select
          id={id}
          value={value}
          className="rounded border border-slate-300 px-1 py-0.5 text-sm dark:border-slate-600 dark:bg-slate-800"
          onChange={(e) => onChange(e.target.value as ProtectionGoal)}
        >
          <option value="link">Link failure</option>
          <option value="node">Node failure</option>
          <option value="srlg">Link + SRLG</option>
          <option value="node-srlg">Node + SRLG</option>
        </select>
      </div>
      <p className="mt-1 text-xs text-slate-500">{GOAL_HINT[value]}</p>
    </div>
  )
}

const PREF_LABEL: Record<LfaPreference, string> = {
  prefer: 'Prefer',
  require: 'Require',
  ignore: 'Ignore',
}

function PolicySelect({
  label,
  value,
  onChange,
}: {
  label: string
  value: LfaPreference
  onChange: (v: LfaPreference) => void
}) {
  const id = useId()
  return (
    <div className="mb-2 flex items-center justify-between gap-2">
      <label htmlFor={id} className="text-xs font-medium text-slate-600 dark:text-slate-300">
        {label}
      </label>
      <select
        id={id}
        value={value}
        className="rounded border border-slate-300 px-1 py-0.5 text-sm dark:border-slate-600 dark:bg-slate-800"
        onChange={(e) => onChange(e.target.value as LfaPreference)}
      >
        {(Object.keys(PREF_LABEL) as LfaPreference[]).map((p) => (
          <option key={p} value={p}>
            {PREF_LABEL[p]}
          </option>
        ))}
      </select>
    </div>
  )
}

function RouterForm({ node, topology: t }: { node: RouterNode; topology: Topology }) {
  const update = useStore((s) => s.updateRouter)
  const openOverloadWhatIf = useStore((s) => s.openOverloadWhatIf)
  const remove = useStore((s) => s.deleteSelection)
  const neighbors = [
    ...new Set(t.links.flatMap((l) => (l.a === node.id ? [l.b] : l.b === node.id ? [l.a] : []))),
  ].sort()
  return (
    <section aria-label="Router properties">
      <h2 className={heading}>Router {node.id}</h2>
      <Field
        key={`id:${node.id}`}
        label="Id"
        value={node.id}
        onCommit={(v) => update(node.id, { id: v })}
      />
      <Field
        key={`name:${node.id}:${node.name ?? ''}`}
        label="Name (optional)"
        value={node.name ?? ''}
        onCommit={(v) => update(node.id, { name: v })}
      />
      <Field
        key={`sid:${node.id}:${node.sidIndex}`}
        label="Prefix-SID index"
        value={String(node.sidIndex)}
        inputMode="numeric"
        hint={`Label ${t.srgbBase + node.sidIndex}`}
        onCommit={(v) => update(node.id, { sidIndex: toNumber(v) })}
      />
      <Field
        key={`msd:${node.id}:${node.msd ?? ''}`}
        label="Max SID depth (MSD)"
        value={node.msd === undefined ? '' : String(node.msd)}
        placeholder={t.msd === undefined ? 'no limit' : `network (${t.msd})`}
        inputMode="numeric"
        hint="Empty = the network's value"
        onCommit={(v) => update(node.id, { msd: v.trim() === '' ? null : toNumber(v) })}
      />
      <Field
        key={`exclude:${node.id}:${(node.lfaExclude ?? []).join(',')}`}
        label="Never use as LFA"
        value={(node.lfaExclude ?? []).join(', ')}
        placeholder={neighbors.length > 0 ? `e.g. ${neighbors[0]}` : 'no neighbors'}
        hint={`Neighbor ids, comma-separated (RFC 7916). Neighbors: ${neighbors.join(', ') || 'none'}`}
        onCommit={(v) => update(node.id, { lfaExclude: v.split(/[\s,]+/) })}
      />
      <PolicyEffect topology={t} source={node.id} />
      <label className="mb-1 flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={node.overload === true}
          onChange={(e) => update(node.id, { overload: e.target.checked })}
        />
        Overload bit (no transit)
      </label>
      <p className="mb-2 text-xs text-slate-500">
        Other routers send {node.id} only traffic for {node.id} itself: never through it, and never
        use it as a backup (RFC 5286 §3.5, RFC 7490 §5.4).
      </p>
      <button
        type="button"
        className="mt-1 mr-2 rounded border border-slate-300 px-3 py-1 text-sm hover:bg-slate-100 dark:border-slate-600 dark:hover:bg-slate-700"
        onClick={() => openOverloadWhatIf(node.id)}
      >
        {node.overload ? 'What if the overload bit is cleared?' : 'What if it is overloaded?'}
      </button>
      <button type="button" className={danger} onClick={remove}>
        Delete router
      </button>
    </section>
  )
}

function LinkForm({ link, topology: t }: { link: Link; topology: Topology }) {
  const update = useStore((s) => s.updateLink)
  const openLinkView = useStore((s) => s.openLinkView)
  const openWhatIf = useStore((s) => s.openWhatIf)
  const remove = useStore((s) => s.deleteSelection)
  const { a, b } = link
  const adj = (key: 'adjSidAB' | 'adjSidBA', from: string, to: string) => {
    const value = link[key]
    return (
      <Field
        key={`${key}:${link.id}:${value ?? ''}`}
        label={`Adj-SID ${from}→${to}`}
        value={value === undefined ? '' : String(value)}
        placeholder={`auto (${adjLabel(t, from, to, link.id)})`}
        inputMode="numeric"
        onCommit={(v) => update(link.id, { [key]: v.trim() === '' ? null : toNumber(v) })}
      />
    )
  }
  return (
    <section aria-label="Link properties">
      <h2 className={heading}>
        Link {a} — {b}
        {/* Parallel links (D29): name which one of the bundle this is. */}
        {isBundled(bundles(t), a, b) && (
          <span className="ml-1 font-normal text-slate-500">({link.id})</span>
        )}
      </h2>
      {link.lan !== undefined && (
        <p className="mb-2 text-xs text-slate-600 dark:text-slate-300">
          On LAN {link.lan} (a pseudonode): {a}→{b} costs {a}&apos;s metric to the LAN and {b}→{a}{' '}
          costs {b}&apos;s. Changing one changes it for every neighbor of that router on the LAN. A
          failure of a router&apos;s interface takes down all its links on the LAN.
        </p>
      )}
      <Field
        key={`mab:${link.id}:${link.metricAB}`}
        label={`Metric ${a}→${b}`}
        value={String(link.metricAB)}
        inputMode="numeric"
        onCommit={(v) => update(link.id, { metricAB: toNumber(v) })}
      />
      <Field
        key={`mba:${link.id}:${link.metricBA}`}
        label={`Metric ${b}→${a}`}
        value={String(link.metricBA)}
        inputMode="numeric"
        onCommit={(v) => update(link.id, { metricBA: toNumber(v) })}
      />
      {adj('adjSidAB', a, b)}
      {adj('adjSidBA', b, a)}
      <Field
        key={`srlg:${link.id}:${(link.srlg ?? []).join(',')}`}
        label="SRLGs"
        value={(link.srlg ?? []).join(', ')}
        placeholder="none"
        hint="Shared risk groups, comma-separated. Links with a name in common fail together."
        onCommit={(v) => update(link.id, { srlg: v.split(/[\s,]+/) })}
      />
      <SrlgButtons link={link} topology={t} />
      <button
        type="button"
        className="mt-1 mr-2 rounded border border-slate-300 px-3 py-1 text-sm hover:bg-slate-100 dark:border-slate-600 dark:hover:bg-slate-700"
        onClick={() => openLinkView(link.id)}
      >
        What uses this link?
      </button>
      <button
        type="button"
        className="mt-1 mr-2 rounded border border-slate-300 px-3 py-1 text-sm hover:bg-slate-100 dark:border-slate-600 dark:hover:bg-slate-700"
        onClick={() => openWhatIf(link.id)}
      >
        What if the metric changes?
      </button>
      <button type="button" className={danger} onClick={remove}>
        {link.lan === undefined ? 'Delete link' : `Delete LAN ${link.lan}`}
      </button>
    </section>
  )
}

import { useId } from 'react'
import { adjLabel } from '../engine/labels'
import type { LfaPreference, Link, NodeId, RouterNode, Topology } from '../engine/types'
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
        Delete link
      </button>
    </section>
  )
}

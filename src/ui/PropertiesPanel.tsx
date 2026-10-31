import { adjLabel } from '../engine/labels'
import type { Link, RouterNode, Topology } from '../engine/types'
import { useStore } from '../state/store'
import { Field } from './Field'
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
      <p className="text-xs text-slate-500">
        {t.nodes.length} routers, {t.links.length} links. Click a router or link to edit it.
      </p>
    </section>
  )
}

function RouterForm({ node, topology: t }: { node: RouterNode; topology: Topology }) {
  const update = useStore((s) => s.updateRouter)
  const remove = useStore((s) => s.deleteSelection)
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

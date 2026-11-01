// Multi-level IS-IS (Later #5, D56, docs/02-algorithms.md §21). Each level runs its own
// SPF over its own adjacencies (ISO 10589 §7.2), and FRR is computed per level, so a
// level is shown as its own network: the Level-2 backbone, or one Level-1 area.
import { expandLans } from './lan'
import type { Lan, Link, RouterNode, Topology } from './types'

/** A level view: `2`, or `1:<area>` ("" = routers with no area). */
export type LevelKey = string

export interface LevelView {
  key: LevelKey
  title: string
  routers: number
}

const inL2 = (n: RouterNode) => n.level !== '1'
const inL1 = (n: RouterNode, area: string) => n.level !== '2' && (n.area ?? '') === area

/** Does the file use levels or areas at all? Without them the network is one level. */
export function isMultiLevel(t: Topology): boolean {
  return (
    t.nodes.some((n) => n.level !== undefined || n.area !== undefined) ||
    t.links.some((l) => l.level !== undefined)
  )
}

/** The level views of a multi-level network: Level-2, then each area's Level-1. */
export function levelViews(t: Topology): LevelView[] {
  const areas = [...new Set(t.nodes.filter((n) => n.level !== '2').map((n) => n.area ?? ''))].sort()
  return [
    { key: '2', title: 'Level-2', routers: t.nodes.filter(inL2).length },
    ...areas.map((a) => ({
      key: `1:${a}`,
      title: a === '' ? 'Level-1 (no area)' : `Level-1, area ${a}`,
      routers: t.nodes.filter((n) => inL1(n, a)).length,
    })),
  ].filter((v) => v.routers > 0)
}

/**
 * The routers and adjacencies of one level (ISO 10589 §7.2.1): Level-2 is every
 * L2-capable router and link; Level-1 of an area is that area's L1-capable routers
 * and the links between them (L1 adjacencies only form inside one area). A LAN keeps
 * the members in the level.
 */
export function levelTopology(t: Topology, key: LevelKey): Topology {
  const l2 = key === '2'
  const area = l2 ? '' : key.slice(2)
  const keep = (n: RouterNode) => (l2 ? inL2(n) : inL1(n, area))
  const nodes = t.nodes.filter(keep)
  const ids = new Set(nodes.map((n) => n.id))
  const linkOk = (l: Link) =>
    l.lan === undefined && ids.has(l.a) && ids.has(l.b) && l.level !== (l2 ? '1' : '2')
  const lans: Lan[] = (t.lans ?? [])
    .filter((lan) => lan.level !== (l2 ? '1' : '2'))
    .map((lan) => ({ ...lan, members: lan.members.filter((m) => ids.has(m.node)) }))
    .filter((lan) => lan.members.length >= 2)
  const view: Topology = {
    ...t,
    name: `${t.name} (${l2 ? 'Level-2' : area === '' ? 'Level-1' : `Level-1 ${area}`})`,
    nodes,
    links: [...t.links.filter(linkOk), ...t.links.filter((l) => l.lan !== undefined)],
    lans,
  }
  return expandLans(view)
}

/**
 * Put the edits made in a level view back into the whole network. Routers and links
 * the view showed are replaced by their edited versions (or removed if deleted there);
 * new ones are added. Network settings (MSD, policy, protection, SRGB) come from the
 * view; the name stays the network's. LAN members in the view take their new metric.
 */
export function mergeLevel(full: Topology, key: LevelKey, edited: Topology): Topology {
  const before = levelTopology(full, key)
  const shownNodes = new Set(before.nodes.map((n) => n.id))
  const shownLinks = new Set(before.links.filter((l) => l.lan === undefined).map((l) => l.id))
  const editedNodes = new Map(edited.nodes.map((n) => [n.id, n]))
  const nodes = [
    ...full.nodes.flatMap((n) => {
      if (!shownNodes.has(n.id)) return [n]
      const e = editedNodes.get(n.id)
      return e === undefined ? [] : [e]
    }),
    ...edited.nodes.filter((n) => !shownNodes.has(n.id) && !full.nodes.some((x) => x.id === n.id)),
  ]
  const alive = new Set(nodes.map((n) => n.id))
  const editedLinks = new Map(edited.links.filter((l) => l.lan === undefined).map((l) => [l.id, l]))
  const taken = new Set(full.links.map((l) => l.id))
  const links = [
    ...full.links.flatMap((l) => {
      if (l.lan !== undefined) return []
      if (!shownLinks.has(l.id)) return alive.has(l.a) && alive.has(l.b) ? [l] : []
      const e = editedLinks.get(l.id)
      return e === undefined ? [] : [e]
    }),
    ...[...editedLinks.values()]
      .filter((l) => !shownLinks.has(l.id))
      .map((l) => {
        if (!taken.has(l.id)) return l
        // A new link whose id another level already uses: number it on (D29).
        let k = 2
        const base = l.id.replace(/#\d+$/, '')
        while (taken.has(`${base}#${k}`)) k++
        taken.add(`${base}#${k}`)
        return { ...l, id: `${base}#${k}` }
      }),
  ]
  const editedLans = new Map((edited.lans ?? []).map((x) => [x.id, x]))
  const lans = (full.lans ?? [])
    .map((lan) => {
      const e = editedLans.get(lan.id)
      const shown = before.lans?.find((x) => x.id === lan.id)
      const members = lan.members.flatMap((m) => {
        if (!alive.has(m.node)) return []
        // Shown in the view: take the edited member, or drop it if the view removed it.
        if (!shown?.members.some((x) => x.node === m.node)) return [m]
        const em = e?.members.find((x) => x.node === m.node)
        return em === undefined ? [] : [em]
      })
      return { ...lan, members }
    })
    .filter((lan) => lan.members.length >= 2)
  const merged: Topology = { ...edited, name: full.name, nodes, links, lans }
  return expandLans(merged)
}

import { Fragment, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { CHAPTERS, chapterBySlug } from '../learn/chapters'
import { diagramSvg } from '../learn/diagrams'
import { parseGuideLink } from '../learn/links'
import type { Block, Inline } from '../learn/markdown'
import { useStore } from '../state/store'

const button =
  'rounded border border-slate-300 px-3 py-1 text-sm hover:bg-slate-100 disabled:opacity-40 dark:border-slate-600 dark:hover:bg-slate-700'
const linkClass = 'text-blue-700 underline hover:text-blue-900 dark:text-blue-300'
const tryClass =
  'rounded bg-blue-600 px-2 py-0.5 text-sm font-medium text-white hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-600'
const codeClass = 'rounded bg-slate-100 px-1 font-mono text-[0.85em] dark:bg-slate-800'

/** Anchor id of a heading inside one chapter, unique on the page. */
const anchorId = (slug: string, id: string) => `learn-${slug}-${id}`

/** The diagram as a data URL: drawn from the engine, so it works offline. */
function useDiagramUrl(src: string): string | undefined {
  return useMemo(() => {
    const file = src.replace(/^img\//, '')
    const svg = diagramSvg(file)
    return svg && `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
  }, [src])
}

function Diagram({ src, alt }: { src: string; alt: string }) {
  const url = useDiagramUrl(src)
  if (!url) return <p className="text-red-600">Missing diagram: {src}</p>
  return (
    <figure className="my-3">
      <img
        src={url}
        alt={alt}
        className="mx-auto max-w-full rounded border border-slate-200 bg-white dark:border-slate-700"
      />
      <figcaption className="mt-1 text-center text-xs text-slate-500 dark:text-slate-400">
        {alt}
      </figcaption>
    </figure>
  )
}

function Article({ slug, go }: { slug: string; go: (slug: string, anchor?: string) => void }) {
  const tryIt = useStore((s) => s.tryIt)
  const chapter = chapterBySlug(slug)
  if (!chapter) return <p>Chapter not found.</p>

  const inline = (xs: Inline[]): ReactNode =>
    xs.map((x, i) => {
      switch (x.kind) {
        case 'text':
          return <Fragment key={i}>{x.text}</Fragment>
        case 'code':
          return (
            <code key={i} className={codeClass}>
              {x.text}
            </code>
          )
        case 'strong':
          return <strong key={i}>{inline(x.children)}</strong>
        case 'em':
          return <em key={i}>{inline(x.children)}</em>
        case 'link': {
          const l = parseGuideLink(x.href)
          if (l.kind === 'external')
            return (
              <a key={i} href={l.href} target="_blank" rel="noreferrer" className={linkClass}>
                {inline(x.children)}
              </a>
            )
          if (l.kind === 'example')
            return (
              <button
                key={i}
                type="button"
                className={tryClass}
                title="Load this example on the diagram"
                onClick={() => tryIt(l.tryIt)}
              >
                ▶ {inline(x.children)}
              </button>
            )
          if (l.kind === 'chapter' || l.kind === 'anchor')
            return (
              <button
                key={i}
                type="button"
                className={linkClass}
                onClick={() => (l.kind === 'chapter' ? go(l.slug, l.anchor) : go(slug, l.anchor))}
              >
                {inline(x.children)}
              </button>
            )
          // A file in the repository: name it, there is nothing to open in the app.
          return <Fragment key={i}>{inline(x.children)}</Fragment>
        }
      }
    })

  const blocks = (bs: Block[]): ReactNode =>
    bs.map((b, i) => {
      switch (b.kind) {
        case 'heading': {
          const id = anchorId(slug, b.id)
          const cls =
            [
              '',
              'mb-3 text-xl font-bold',
              'mt-6 mb-2 text-lg font-bold',
              'mt-4 mb-1 font-semibold',
              'mt-3 mb-1 font-semibold',
            ][b.level] ?? 'font-semibold'
          const H = (['h2', 'h2', 'h3', 'h4', 'h5', 'h6'] as const)[b.level - 1] ?? 'h6'
          return (
            <H key={i} id={id} className={cls}>
              {inline(b.children)}
            </H>
          )
        }
        case 'para':
          return (
            <p key={i} className="my-2 leading-relaxed">
              {inline(b.children)}
            </p>
          )
        case 'code':
          return (
            <pre
              key={i}
              className="my-2 overflow-x-auto rounded border border-slate-200 bg-slate-50 p-2 font-mono text-xs dark:border-slate-700 dark:bg-slate-800"
            >
              {b.text}
            </pre>
          )
        case 'list': {
          const L = b.ordered ? 'ol' : 'ul'
          return (
            <L
              key={i}
              className={`my-2 space-y-1 pl-5 ${b.ordered ? 'list-decimal' : 'list-disc'}`}
            >
              {b.items.map((item, j) => (
                <li key={j} className="[&>p]:my-0">
                  {blocks(item)}
                </li>
              ))}
            </L>
          )
        }
        case 'quote':
          return (
            <div
              key={i}
              className="my-3 rounded border-l-4 border-blue-500 bg-blue-50 px-3 py-1 dark:bg-blue-950/40"
            >
              {blocks(b.children)}
            </div>
          )
        case 'table':
          return (
            <div key={i} className="my-2 overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="text-slate-600 dark:text-slate-300">
                  <tr>
                    {b.head.map((c, j) => (
                      <th
                        key={j}
                        className="border-b border-slate-300 py-1 pr-3 dark:border-slate-600"
                      >
                        {inline(c)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {b.rows.map((r, j) => (
                    <tr
                      key={j}
                      className="border-b border-slate-200 align-top dark:border-slate-700"
                    >
                      {r.map((c, k) => (
                        <td key={k} className="py-1 pr-3">
                          {inline(c)}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        case 'details':
          return (
            <details
              key={i}
              className="my-2 rounded border border-slate-200 px-3 py-1 dark:border-slate-700"
            >
              <summary className="cursor-pointer font-semibold">{inline(b.summary)}</summary>
              {blocks(b.children)}
            </details>
          )
        case 'image':
          return <Diagram key={i} src={b.src} alt={b.alt} />
        case 'hr':
          return <hr key={i} className="my-4 border-slate-200 dark:border-slate-700" />
      }
    })

  return <article className="text-sm">{blocks(chapter.blocks)}</article>
}

/** The Learn guide (D60): docs/learn/*.md in a panel beside the diagram. */
export function LearnGuide() {
  const { open, slug } = useStore((s) => s.learn)
  const setLearn = useStore((s) => s.setLearn)
  const [wide, setWide] = useState(false)
  const [anchor, setAnchor] = useState<string | undefined>()
  const scroller = useRef<HTMLDivElement>(null)
  const panel = useRef<HTMLElement>(null)
  const closeRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (open) closeRef.current?.focus()
  }, [open])

  // A new chapter starts at the top, or at the heading a link asked for.
  useEffect(() => {
    if (!open) return
    const el = anchor ? document.getElementById(anchorId(slug, anchor)) : null
    if (el) el.scrollIntoView?.({ block: 'start' })
    else if (scroller.current) scroller.current.scrollTop = 0
    // The link clicked is gone with the old page: keep focus (and Esc) in the guide.
    const lost = !panel.current?.contains(document.activeElement)
    if (lost || anchor) scroller.current?.focus({ preventScroll: true })
  }, [open, slug, anchor])

  if (!open) return null

  const at = CHAPTERS.findIndex((c) => c.slug === slug)
  const prev = CHAPTERS[at - 1]
  const next = CHAPTERS[at + 1]
  const go = (to: string, a?: string) => {
    setAnchor(a)
    setLearn(true, to)
  }

  return (
    <aside
      ref={panel}
      aria-label="Learn guide"
      className={`fixed inset-y-0 right-0 z-40 flex w-full flex-col border-l border-slate-200 bg-white shadow-xl dark:border-slate-700 dark:bg-slate-900 ${wide ? 'sm:w-[min(64rem,100vw)]' : 'sm:w-[min(36rem,100vw)]'}`}
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          e.stopPropagation()
          setLearn(false)
        }
      }}
    >
      <div className="flex items-center gap-2 border-b border-slate-200 px-3 py-2 dark:border-slate-700">
        <h2 className="text-base font-bold whitespace-nowrap">📖 Learn</h2>
        <select
          aria-label="Chapter"
          className={`${button} min-w-0 flex-1`}
          value={slug}
          onChange={(e) => go(e.target.value)}
        >
          {CHAPTERS.map((c) => (
            <option key={c.slug} value={c.slug}>
              {c.title}
            </option>
          ))}
        </select>
        <button
          type="button"
          className={`${button} hidden sm:block`}
          onClick={() => setWide(!wide)}
          aria-pressed={wide}
          title={wide ? 'Narrow: see more of the diagram' : 'Wide: easier to read tables'}
        >
          {wide ? '⇥' : '⇤'}
        </button>
        <button
          ref={closeRef}
          type="button"
          className={button}
          onClick={() => setLearn(false)}
          aria-label="Close the guide"
          title="Close (Esc)"
        >
          ✕
        </button>
      </div>
      <div ref={scroller} tabIndex={-1} className="flex-1 overflow-y-auto px-4 py-3 outline-none">
        <Article slug={slug} go={go} />
      </div>
      <div className="flex justify-between gap-2 border-t border-slate-200 px-3 py-2 dark:border-slate-700">
        <button
          type="button"
          className={button}
          disabled={!prev}
          onClick={() => prev && go(prev.slug)}
        >
          ← {prev ? 'Previous' : 'Start'}
        </button>
        <button
          type="button"
          className={button}
          disabled={!next}
          onClick={() => next && go(next.slug)}
        >
          {next ? 'Next' : 'The end'} →
        </button>
      </div>
    </aside>
  )
}

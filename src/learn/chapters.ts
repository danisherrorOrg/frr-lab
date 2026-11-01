// The Learn guide's chapters (docs/learn/*.md, D60), bundled as text so the guide
// works offline and stays the one copy shared with GitHub.
import { parseMarkdown, plain, type Block } from './markdown'

const files = import.meta.glob('../../docs/learn/*.md', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>

export interface Chapter {
  /** File name without `.md`, e.g. `04-lfa`. */
  slug: string
  title: string
  blocks: Block[]
}

/** Every chapter, in file-name order (00 … 13, then the appendices). */
export const CHAPTERS: Chapter[] = Object.entries(files)
  .map(([path, text]) => {
    const slug = path.replace(/^.*\//, '').replace(/\.md$/, '')
    const blocks = parseMarkdown(text)
    const h1 = blocks.find((b) => b.kind === 'heading' && b.level === 1)
    return { slug, title: h1?.kind === 'heading' ? plain(h1.children) : slug, blocks }
  })
  .sort((a, b) => (a.slug < b.slug ? -1 : 1))

export const chapterBySlug = (slug: string) => CHAPTERS.find((c) => c.slug === slug)

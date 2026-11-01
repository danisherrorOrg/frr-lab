// A small Markdown reader for the Learn guide (D60). It knows only the parts the
// guide uses, so the app can show docs/learn/*.md offline with no extra library.
// Out: a tree the UI turns into React elements (never raw HTML).

export type Inline =
  | { kind: 'text'; text: string }
  | { kind: 'code'; text: string }
  | { kind: 'strong'; children: Inline[] }
  | { kind: 'em'; children: Inline[] }
  | { kind: 'link'; href: string; children: Inline[] }

export type Block =
  | { kind: 'heading'; level: number; id: string; children: Inline[] }
  | { kind: 'para'; children: Inline[] }
  | { kind: 'code'; lang: string; text: string }
  | { kind: 'list'; ordered: boolean; items: Block[][] }
  | { kind: 'quote'; children: Block[] }
  | { kind: 'table'; head: Inline[][]; rows: Inline[][][] }
  | { kind: 'details'; summary: Inline[]; children: Block[] }
  | { kind: 'image'; src: string; alt: string }
  | { kind: 'hr' }

/** GitHub-style heading anchor: lower case, spaces to `-`, punctuation dropped. */
export function slug(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s_-]/gu, '')
    .trim()
    .replace(/\s/g, '-')
}

/** Plain text of some inline content (for anchors and alt text). */
export function plain(xs: Inline[]): string {
  return xs.map((x) => ('text' in x ? x.text : plain(x.children))).join('')
}

/** Inline Markdown: `code`, **strong**, *em*, [links](href). */
export function parseInline(src: string): Inline[] {
  const out: Inline[] = []
  let buf = ''
  const flush = () => {
    if (buf) out.push({ kind: 'text', text: buf })
    buf = ''
  }
  let i = 0
  while (i < src.length) {
    const c = src[i]!
    if (c === '\\' && i + 1 < src.length && /[\\`*_[\]()#|<>-]/.test(src[i + 1]!)) {
      buf += src[i + 1]
      i += 2
      continue
    }
    if (c === '`') {
      const end = src.indexOf('`', i + 1)
      if (end > i) {
        flush()
        out.push({ kind: 'code', text: src.slice(i + 1, end) })
        i = end + 1
        continue
      }
    }
    if (c === '*' && src[i + 1] === '*') {
      const end = src.indexOf('**', i + 2)
      if (end > i + 2) {
        flush()
        out.push({ kind: 'strong', children: parseInline(src.slice(i + 2, end)) })
        i = end + 2
        continue
      }
    }
    if (c === '*' && src[i + 1] !== ' ' && src[i + 1] !== undefined) {
      const end = src.indexOf('*', i + 1)
      if (end > i + 1 && src[end - 1] !== ' ') {
        flush()
        out.push({ kind: 'em', children: parseInline(src.slice(i + 1, end)) })
        i = end + 1
        continue
      }
    }
    if (c === '[') {
      const close = matching(src, i, '[', ']')
      if (close > 0 && src[close + 1] === '(') {
        const end = matching(src, close + 1, '(', ')')
        if (end > 0) {
          flush()
          out.push({
            kind: 'link',
            href: src.slice(close + 2, end),
            children: parseInline(src.slice(i + 1, close)),
          })
          i = end + 1
          continue
        }
      }
    }
    buf += c
    i++
  }
  flush()
  return out
}

/** Index of the bracket closing the one at `i`, or -1. */
function matching(src: string, i: number, open: string, close: string): number {
  let depth = 0
  for (let j = i; j < src.length; j++) {
    if (src[j] === '`') {
      const end = src.indexOf('`', j + 1)
      if (end > j) j = end
      continue
    }
    if (src[j] === open) depth++
    else if (src[j] === close && --depth === 0) return j
  }
  return -1
}

const LIST_ITEM = /^(\s*)([-*]|\d+\.)\s+(.*)$/
const indentOf = (line: string) => line.length - line.trimStart().length

/** Table cells of `| a | b |`, keeping `\|` inside a cell. */
function cells(line: string): string[] {
  const s = line.trim().replace(/^\|/, '').replace(/\|$/, '')
  const out: string[] = []
  let cur = ''
  let inCode = false
  for (let i = 0; i < s.length; i++) {
    const c = s[i]!
    if (c === '\\' && s[i + 1] === '|') {
      cur += '|'
      i++
    } else if (c === '`') {
      inCode = !inCode
      cur += c
    } else if (c === '|' && !inCode) {
      out.push(cur.trim())
      cur = ''
    } else cur += c
  }
  out.push(cur.trim())
  return out
}

/** Block Markdown: headings, paragraphs, lists, quotes, tables, code, details, images. */
export function parseMarkdown(src: string): Block[] {
  return parseLines(src.replace(/\r\n/g, '\n').split('\n'))
}

function parseLines(lines: string[]): Block[] {
  const out: Block[] = []
  let i = 0
  const isBlank = (l: string | undefined) => l === undefined || l.trim() === ''
  // Lines that start a new block, so a paragraph stops before them.
  const startsBlock = (l: string) =>
    /^#{1,6}\s/.test(l) ||
    l.startsWith('```') ||
    l.startsWith('>') ||
    l.trimStart().startsWith('|') ||
    LIST_ITEM.test(l) ||
    /^<\/?details>/.test(l.trim()) ||
    /^!\[[^\]]*\]\([^)]*\)\s*$/.test(l.trim()) ||
    /^---+\s*$/.test(l)

  while (i < lines.length) {
    const line = lines[i]!
    if (isBlank(line)) {
      i++
      continue
    }
    const h = /^(#{1,6})\s+(.*)$/.exec(line)
    if (h) {
      const text = h[2]!.trim()
      out.push({
        kind: 'heading',
        level: h[1]!.length,
        id: slug(plain(parseInline(text))),
        children: parseInline(text),
      })
      i++
      continue
    }
    if (line.startsWith('```')) {
      const lang = line.slice(3).trim()
      const body: string[] = []
      i++
      while (i < lines.length && !lines[i]!.startsWith('```')) body.push(lines[i++]!)
      i++ // closing fence
      out.push({ kind: 'code', lang, text: body.join('\n') })
      continue
    }
    if (/^---+\s*$/.test(line)) {
      out.push({ kind: 'hr' })
      i++
      continue
    }
    const img = /^!\[([^\]]*)\]\(([^)]*)\)\s*$/.exec(line.trim())
    if (img) {
      out.push({ kind: 'image', alt: img[1]!, src: img[2]! })
      i++
      continue
    }
    if (line.trim() === '<details>') {
      // <details> … <summary>text</summary> … </details>, nesting allowed.
      let depth = 1
      const body: string[] = []
      i++
      while (i < lines.length) {
        const l = lines[i]!.trim()
        if (l === '<details>') depth++
        if (l === '</details>' && --depth === 0) break
        body.push(lines[i]!)
        i++
      }
      i++
      const sumAt = body.findIndex((l) => /<summary>.*<\/summary>/.test(l))
      const summary = sumAt >= 0 ? /<summary>(.*)<\/summary>/.exec(body[sumAt]!)![1]! : 'Details'
      if (sumAt >= 0) body.splice(sumAt, 1)
      out.push({ kind: 'details', summary: parseInline(summary), children: parseLines(body) })
      continue
    }
    if (line.startsWith('>')) {
      const body: string[] = []
      while (i < lines.length && lines[i]!.startsWith('>'))
        body.push(lines[i++]!.replace(/^> ?/, ''))
      out.push({ kind: 'quote', children: parseLines(body) })
      continue
    }
    if (line.trimStart().startsWith('|') && /^\s*\|?[\s:|-]+\|[\s:|-]*$/.test(lines[i + 1] ?? '')) {
      const head = cells(line).map(parseInline)
      i += 2
      const rows: Inline[][][] = []
      while (i < lines.length && lines[i]!.trimStart().startsWith('|'))
        rows.push(cells(lines[i++]!).map(parseInline))
      out.push({ kind: 'table', head, rows })
      continue
    }
    const li = LIST_ITEM.exec(line)
    if (li) {
      const base = li[1]!.length
      const ordered = /\d/.test(li[2]!)
      const items: Block[][] = []
      while (i < lines.length) {
        const m = LIST_ITEM.exec(lines[i]!)
        if (!m || m[1]!.length !== base || /\d/.test(m[2]!) !== ordered) break
        // The item: its first line, then every line indented past the marker
        // (nested lists, more paragraphs), blank lines included.
        const body = [m[3]!]
        const contentIndent = base + m[2]!.length + 1
        i++
        while (i < lines.length) {
          const l = lines[i]!
          if (isBlank(l)) {
            const next = lines.slice(i + 1).find((x) => !isBlank(x))
            if (next === undefined || indentOf(next) < contentIndent) break
            body.push('')
            i++
            continue
          }
          if (indentOf(l) < contentIndent) {
            if (startsBlock(l)) break
            // A lazy continuation line of the item's paragraph.
            body.push(l.trim())
            i++
            continue
          }
          body.push(l.slice(Math.min(contentIndent, indentOf(l))))
          i++
        }
        items.push(parseLines(body))
        while (i < lines.length && isBlank(lines[i])) {
          const next = lines.slice(i).find((x) => !isBlank(x))
          const nm = next === undefined ? null : LIST_ITEM.exec(next)
          if (!nm || nm[1]!.length !== base) break
          i++
        }
      }
      out.push({ kind: 'list', ordered, items })
      continue
    }
    // A paragraph: lines up to a blank line or the start of another block.
    const para: string[] = [line.trim()]
    i++
    while (i < lines.length && !isBlank(lines[i]) && !startsBlock(lines[i]!))
      para.push(lines[i++]!.trim())
    out.push({ kind: 'para', children: parseInline(para.join(' ')) })
  }
  return out
}

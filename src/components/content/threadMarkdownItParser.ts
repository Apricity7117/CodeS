import MarkdownIt from 'markdown-it'
import taskLists from 'markdown-it-task-lists'
import { getBasename, parseFileReference, toRenderableImageUrl } from './threadFileLinks'
import type { ListItem, MessageBlock, TableAlignment } from './threadMarkdownBlocks'
import type { InlineSegment } from './threadInlineSegments'

type MarkdownToken = {
  type: string
  tag: string
  attrs: Array<[string, string]> | null
  content: string
  info: string
  children: MarkdownToken[] | null
  attrGet: (name: string) => string | null
}

// markdown-it 负责通用 Markdown/GFM 结构，业务链接和图片仍由 CodeS 自己处理。
const markdownIt = new MarkdownIt({
  html: false,
  linkify: true,
  typographer: false,
}).use(taskLists, { enabled: true })

function findClosingToken(tokens: MarkdownToken[], start: number, openType: string, closeType: string): number {
  let depth = 0
  for (let index = start; index < tokens.length; index += 1) {
    if (tokens[index].type === openType) depth += 1
    if (tokens[index].type === closeType) {
      depth -= 1
      if (depth === 0) return index
    }
  }
  return tokens.length
}

function tokenAttr(token: MarkdownToken, name: string): string | null {
  return token.attrGet(name) ?? null
}

function readAlignment(token: MarkdownToken): TableAlignment {
  const style = tokenAttr(token, 'style') ?? ''
  const match = style.match(/text-align\s*:\s*(left|center|right)/u)
  return (match?.[1] as TableAlignment | undefined) ?? null
}

function isInsideCodeSpan(text: string, index: number): boolean {
  let inCode = false
  let cursor = 0
  while (cursor < index) {
    if (text[cursor] !== '`') {
      cursor += 1
      continue
    }
    let delimiterLength = 1
    while (cursor + delimiterLength < text.length && text[cursor + delimiterLength] === '`') delimiterLength += 1
    inCode = !inCode
    cursor += delimiterLength
  }
  return inCode
}

function splitParagraphImages(content: string): MessageBlock[] {
  const blocks: MessageBlock[] = []
  const imagePattern = /!\[([^\]]*)\]\(([^)\n]+)\)/gu
  let cursor = 0

  for (const match of content.matchAll(imagePattern)) {
    if (typeof match.index !== 'number' || isInsideCodeSpan(content, match.index)) continue
    const [markdown, altRaw, urlRaw] = match
    const imageUrl = toRenderableImageUrl(urlRaw.trim())
    if (!imageUrl) continue

    const start = match.index
    const before = content.slice(cursor, start).trim()
    if (before) blocks.push({ kind: 'paragraph', value: before })
    blocks.push({ kind: 'image', url: imageUrl, alt: altRaw.trim(), markdown })
    cursor = start + markdown.length
  }

  const after = content.slice(cursor).trim()
  if (after) blocks.push({ kind: 'paragraph', value: after })
  return blocks.length > 0 ? blocks : [{ kind: 'paragraph', value: content.trim() }]
}

function parseTable(tokens: MarkdownToken[], start: number): { block: MessageBlock; nextIndex: number } {
  const end = findClosingToken(tokens, start, 'table_open', 'table_close')
  const headers: string[] = []
  const rows: string[][] = []
  const alignments: TableAlignment[] = []
  let section: 'head' | 'body' | null = null
  let currentRow: string[] = []
  let currentIsHead = false

  for (let index = start + 1; index < end; index += 1) {
    const token = tokens[index]
    if (token.type === 'thead_open') section = 'head'
    if (token.type === 'tbody_open') section = 'body'
    if (token.type === 'tr_open') {
      currentRow = []
      currentIsHead = section === 'head'
    } else if (token.type === 'th_open' || token.type === 'td_open') {
      const inline = tokens[index + 1]
      currentRow.push(inline?.type === 'inline' ? inline.content.trim() : '')
      if (token.type === 'th_open') alignments.push(readAlignment(token))
      index += 2
    } else if (token.type === 'tr_close') {
      if (currentIsHead) headers.push(...currentRow)
      else if (currentRow.length > 0) rows.push(currentRow)
    }
  }

  return {
    block: { kind: 'table', headers, rows, alignments },
    nextIndex: end + 1,
  }
}

function parseListItem(tokens: MarkdownToken[], start: number): { item: ListItem; isTask: boolean; checked: boolean; nextIndex: number } {
  const end = findClosingToken(tokens, start, 'list_item_open', 'list_item_close')
  const paragraphs: string[] = []
  const children: MessageBlock[] = []
  const itemClass = tokenAttr(tokens[start], 'class') ?? ''
  const isTask = itemClass.split(/\s+/u).includes('task-list-item')
  let checked = false

  for (let index = start + 1; index < end;) {
    const token = tokens[index]
    if (token.type === 'paragraph_open') {
      const inline = tokens[index + 1]
      if (inline?.type === 'inline') {
        if (isTask) {
          checked = inline.children?.some((child) => child.type === 'html_inline' && /checked=/u.test(child.content)) ?? false
        }
        if (inline.content.trim()) paragraphs.push(inline.content.trim())
      }
      index += 3
      continue
    }
    if (token.type === 'bullet_list_open' || token.type === 'ordered_list_open') {
      const parsed = parseList(tokens, index)
      children.push(...parsed.blocks)
      index = parsed.nextIndex
      continue
    }
    const parsed = parseTokens(tokens, index, end)
    children.push(...parsed.blocks)
    index = parsed.nextIndex
  }

  return {
    item: {
      paragraphs,
      ...(children.length > 0 ? { children } : {}),
    },
    isTask,
    checked,
    nextIndex: end + 1,
  }
}

function parseList(tokens: MarkdownToken[], start: number): { blocks: MessageBlock[]; nextIndex: number } {
  const open = tokens[start]
  const ordered = open.type === 'ordered_list_open'
  const closeType = ordered ? 'ordered_list_close' : 'bullet_list_close'
  const end = findClosingToken(tokens, start, open.type, closeType)
  const items: ListItem[] = []
  const parsedItems: Array<{ item: ListItem; isTask: boolean; checked: boolean }> = []

  for (let index = start + 1; index < end;) {
    if (tokens[index].type !== 'list_item_open') {
      index += 1
      continue
    }
    const parsed = parseListItem(tokens, index)
    items.push(parsed.item)
    parsedItems.push(parsed)
    index = parsed.nextIndex
  }

  const startAttr = tokenAttr(open, 'start')
  if (ordered) {
    return {
      blocks: [{ kind: 'orderedList', items, start: startAttr ? Number(startAttr) : 1 }],
      nextIndex: end + 1,
    }
  }

  const blocks: MessageBlock[] = []
  let taskGroup: Array<{ text: string; checked: boolean }> = []
  let listGroup: ListItem[] = []

  const flushTaskGroup = (): void => {
    if (taskGroup.length === 0) return
    blocks.push({ kind: 'taskList', items: taskGroup })
    taskGroup = []
  }
  const flushListGroup = (): void => {
    if (listGroup.length === 0) return
    blocks.push({ kind: 'unorderedList', items: listGroup })
    listGroup = []
  }

  for (const parsed of parsedItems) {
    if (parsed.isTask && parsed.item.children === undefined && parsed.item.paragraphs.length === 1) {
      flushListGroup()
      taskGroup.push({ text: parsed.item.paragraphs[0], checked: parsed.checked })
      continue
    }
    flushTaskGroup()
    if (parsed.isTask && parsed.item.paragraphs.length > 0) {
      const marker = parsed.checked ? '[x]' : '[ ]'
      parsed.item.paragraphs[0] = `${marker} ${parsed.item.paragraphs[0]}`
    }
    listGroup.push(parsed.item)
  }
  flushTaskGroup()
  flushListGroup()

  return { blocks, nextIndex: end + 1 }
}

function parseTokens(tokens: MarkdownToken[], start = 0, end = tokens.length): { blocks: MessageBlock[]; nextIndex: number } {
  const blocks: MessageBlock[] = []
  let index = start

  while (index < end) {
    const token = tokens[index]
    if (token.type === 'heading_open') {
      const inline = tokens[index + 1]
      blocks.push({ kind: 'heading', level: Number(token.tag.slice(1)) || 1, value: inline?.type === 'inline' ? inline.content.trim() : '' })
      index += 3
      continue
    }
    if (token.type === 'paragraph_open') {
      const inline = tokens[index + 1]
      if (inline?.type === 'inline') blocks.push(...splitParagraphImages(inline.content))
      index += 3
      continue
    }
    if (token.type === 'blockquote_open') {
      const close = findClosingToken(tokens, index, 'blockquote_open', 'blockquote_close')
      const value = tokens
        .slice(index + 1, close)
        .filter((candidate) => candidate.type === 'inline')
        .map((candidate) => candidate.content.trim())
        .filter(Boolean)
        .join('\n')
      if (value) blocks.push({ kind: 'blockquote', value })
      index = close + 1
      continue
    }
    if (token.type === 'bullet_list_open' || token.type === 'ordered_list_open') {
      const parsed = parseList(tokens, index)
      blocks.push(...parsed.blocks)
      index = parsed.nextIndex
      continue
    }
    if (token.type === 'table_open') {
      const parsed = parseTable(tokens, index)
      blocks.push(parsed.block)
      index = parsed.nextIndex
      continue
    }
    if (token.type === 'fence') {
      blocks.push({ kind: 'codeBlock', language: token.info.trim().split(/\s+/u)[0] ?? '', value: token.content.replace(/\n$/u, '') })
      index += 1
      continue
    }
    if (token.type === 'hr') {
      blocks.push({ kind: 'thematicBreak' })
      index += 1
      continue
    }
    index += 1
  }

  return { blocks, nextIndex: index }
}

export function parseMessageBlocksWithMarkdownIt(text: string): MessageBlock[] {
  const tokens = markdownIt.parse(text.replace(/\r\n/gu, '\n'), {}) as unknown as MarkdownToken[]
  const blocks = parseTokens(tokens).blocks
  return blocks.length > 0 ? blocks : [{ kind: 'paragraph', value: text }]
}

type InlineFormat = Extract<InlineSegment['kind'], 'bold' | 'italic' | 'strikethrough'>

function inlineTokenText(tokens: MarkdownToken[]): string {
  return tokens
    .map((token) => {
      if (token.type === 'text' || token.type === 'code_inline') return token.content
      if (token.type === 'softbreak' || token.type === 'hardbreak') return '\n'
      if (token.type === 'image') return token.content
      return ''
    })
    .join('')
}

function findInlineClose(tokens: MarkdownToken[], start: number, openType: string, closeType: string): number {
  let depth = 0
  for (let index = start; index < tokens.length; index += 1) {
    if (tokens[index].type === openType) depth += 1
    if (tokens[index].type === closeType) {
      depth -= 1
      if (depth === 0) return index
    }
  }
  return tokens.length
}

function applyInlineFormat(segment: InlineSegment, formats: InlineFormat[]): InlineSegment {
  if (segment.kind !== 'text' || formats.length === 0) return segment
  return { kind: formats[formats.length - 1], value: segment.value }
}

export function parseInlineSegmentsWithMarkdownIt(
  text: string,
  splitPlainText: (value: string) => InlineSegment[],
): InlineSegment[] {
  const rootTokens = markdownIt.parseInline(text, {}) as unknown as MarkdownToken[]
  const tokens = rootTokens[0]?.children ?? []
  const segments: InlineSegment[] = []
  const formats: InlineFormat[] = []

  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index]
    if (token.type === 'strong_open') {
      formats.push('bold')
      continue
    }
    if (token.type === 'em_open') {
      formats.push('italic')
      continue
    }
    if (token.type === 's_open') {
      formats.push('strikethrough')
      continue
    }
    if (token.type === 'strong_close' || token.type === 'em_close' || token.type === 's_close') {
      formats.pop()
      continue
    }
    if (token.type === 'text') {
      segments.push(...splitPlainText(token.content).map((segment) => applyInlineFormat(segment, formats)))
      continue
    }
    if (token.type === 'code_inline') {
      segments.push({ kind: 'code', value: token.content })
      continue
    }
    if (token.type === 'softbreak' || token.type === 'hardbreak') {
      segments.push(applyInlineFormat({ kind: 'text', value: '\n' }, formats))
      continue
    }
    if (token.type === 'link_open') {
      const close = findInlineClose(tokens, index, 'link_open', 'link_close')
      const label = inlineTokenText(tokens.slice(index + 1, close))
      const target = tokenAttr(token, 'href') ?? ''
      if (/^(?:https?:|mailto:)/u.test(target)) {
        segments.push({ kind: 'url', value: label || target, href: target })
      } else {
        const ref = parseFileReference(target)
        if (ref) {
          segments.push({
            kind: 'file',
            value: target,
            path: ref.path,
            displayPath: label || target,
            downloadName: getBasename(ref.path),
          })
        } else if (label) {
          segments.push(applyInlineFormat({ kind: 'text', value: label }, formats))
        }
      }
      index = close
      continue
    }
    if (token.type === 'image') {
      segments.push(applyInlineFormat({ kind: 'text', value: token.content }, formats))
    }
  }

  return segments.length > 0 ? segments : [{ kind: 'text', value: text }]
}

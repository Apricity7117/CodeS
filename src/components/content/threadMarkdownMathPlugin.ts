import type MarkdownIt from 'markdown-it'

type MarkdownToken = {
  block: boolean
  content: string
  map: [number, number] | null
  markup: string
}

type InlineState = {
  src: string
  pos: number
  posMax: number
  push: (type: string, tag: string, nesting: 0) => MarkdownToken
}

type BlockState = {
  bMarks: number[]
  eMarks: number[]
  tShift: number[]
  src: string
  line: number
  push: (type: string, tag: string, nesting: 0) => MarkdownToken
}

function isEscaped(source: string, index: number): boolean {
  let slashCount = 0
  for (let cursor = index - 1; cursor >= 0 && source[cursor] === '\\'; cursor -= 1) slashCount += 1
  return slashCount % 2 === 1
}

function isDigit(character: string | undefined): boolean {
  return character !== undefined && character >= '0' && character <= '9'
}

function findClosingDelimiter(source: string, delimiter: string, start: number, end: number): number {
  let cursor = start
  while (cursor < end) {
    const found = source.indexOf(delimiter, cursor)
    if (found < 0 || found >= end) return -1
    if (!isEscaped(source, found)) return found
    cursor = found + delimiter.length
  }
  return -1
}

function readInlineMath(state: InlineState, silent: boolean): boolean {
  const source = state.src
  const start = state.pos
  let delimiter = ''
  let tokenType = ''

  if (source.startsWith('$$', start)) {
    delimiter = '$$'
    tokenType = 'math_inline_double'
  } else if (source[start] === '$') {
    delimiter = '$'
    tokenType = 'math_inline'
  } else if (source.startsWith('\\(', start)) {
    delimiter = '\\('
    tokenType = 'math_inline'
  } else {
    return false
  }

  if (isEscaped(source, start) || (delimiter.startsWith('$') && isDigit(source[start - 1]))) return false
  const closingDelimiter = delimiter === '\\(' ? '\\)' : delimiter
  const contentStart = start + delimiter.length
  const closing = findClosingDelimiter(source, closingDelimiter, contentStart, state.posMax)
  if (closing < 0) return false

  const content = source.slice(contentStart, closing)
  if (!content || /^\s|\s$/u.test(content)) return false
  const nextCharacter = source[closing + closingDelimiter.length]
  if (delimiter.startsWith('$') && isDigit(nextCharacter)) return false

  if (!silent) {
    const token = state.push(tokenType, 'math', 0)
    token.content = content
    token.markup = delimiter
  }
  state.pos = closing + closingDelimiter.length
  return true
}

function findBlockClosing(
  state: BlockState,
  delimiter: string,
  start: number,
  endLine: number,
): { index: number; line: number } | null {
  const searchEnd = state.eMarks[endLine - 1] ?? state.src.length
  let cursor = start
  while (cursor < searchEnd) {
    const found = findClosingDelimiter(state.src, delimiter, cursor, searchEnd)
    if (found < 0) return null
    for (let line = state.line; line < endLine; line += 1) {
      if (found > state.eMarks[line]) continue
      const trailing = state.src.slice(found + delimiter.length, state.eMarks[line])
      if (trailing.trim().length === 0) return { index: found, line }
      cursor = found + delimiter.length
      break
    }
  }
  return null
}

function readBlockMath(state: BlockState, startLine: number, endLine: number, silent: boolean): boolean {
  const start = state.bMarks[startLine] + state.tShift[startLine]
  let opening = ''
  let closingDelimiter = ''

  if (state.src.startsWith('$$', start)) {
    opening = '$$'
    closingDelimiter = '$$'
  } else if (state.src.startsWith('\\[', start)) {
    opening = '\\['
    closingDelimiter = '\\]'
  } else {
    return false
  }

  const contentStart = start + opening.length
  const closing = findBlockClosing(state, closingDelimiter, contentStart, endLine)
  if (!closing) return false
  if (silent) return true

  const token = state.push('math_block', 'math', 0)
  token.block = true
  token.content = state.src.slice(contentStart, closing.index).trim()
  token.markup = opening
  token.map = [startLine, closing.line + 1]
  state.line = closing.line + 1
  return true
}

export function markdownMathPlugin(markdown: MarkdownIt): void {
  markdown.inline.ruler.before('escape', 'math_inline', readInlineMath)
  markdown.block.ruler.before('fence', 'math_block', readBlockMath)
}

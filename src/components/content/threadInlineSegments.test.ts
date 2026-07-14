import { describe, expect, it } from 'vitest'
import { parseInlineSegments } from './threadInlineSegments'

describe('thread inline segment parsing', () => {
  it('keeps file paths inside inline code as code text', () => {
    const path = '/Users/a/Projects/js/anti-codex'

    const segments = parseInlineSegments(`明确参考 \`${path}\` 的视觉。`)

    expect(segments).toEqual([
      { kind: 'text', value: '明确参考 ' },
      { kind: 'code', value: path },
      { kind: 'text', value: ' 的视觉。' },
    ])
    expect(segments).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: 'file', path }),
    ]))
  })

  it('does not linkify urls or markdown links inside inline code', () => {
    const segments = parseInlineSegments('保留 `[App](src/App.vue:10)` 和 `https://example.com`。')

    expect(segments).toEqual([
      { kind: 'text', value: '保留 ' },
      { kind: 'code', value: '[App](src/App.vue:10)' },
      { kind: 'text', value: ' 和 ' },
      { kind: 'code', value: 'https://example.com' },
      { kind: 'text', value: '。' },
    ])
  })

  it('parses bold content across inline code without showing markdown markers', () => {
    expect(parseInlineSegments('**采用 `markdown-it` 作为解析内核**')).toEqual([
      { kind: 'bold', value: '采用 ' },
      { kind: 'code', value: 'markdown-it' },
      { kind: 'bold', value: ' 作为解析内核' },
    ])
  })

  it('parses inline LaTeX formulas without consuming currency text', () => {
    expect(parseInlineSegments('Energy $E = mc^2$, price is $20.')).toEqual([
      { kind: 'text', value: 'Energy ' },
      { kind: 'math', value: 'E = mc^2', displayMode: false },
      { kind: 'text', value: ', price is $20.' },
    ])
  })

  it('supports bracket formulas and keeps formulas inside inline code literal', () => {
    expect(parseInlineSegments('Use \\(a^2 + b^2 = c^2\\) and `$E = mc^2$`.')).toEqual([
      { kind: 'text', value: 'Use ' },
      { kind: 'math', value: 'a^2 + b^2 = c^2', displayMode: false },
      { kind: 'text', value: ' and ' },
      { kind: 'code', value: '$E = mc^2$' },
      { kind: 'text', value: '.' },
    ])
  })

  it('still parses file links outside inline code', () => {
    const path = '/Users/a/Projects/js/CodeS/.trellis/spec/frontend/component-guidelines.md'

    const segments = parseInlineSegments(`前端：[component-guidelines.md](${path})，参考 \`anti-codex\`。`)

    expect(segments).toEqual([
      { kind: 'text', value: '前端：' },
      {
        kind: 'file',
        value: path,
        path,
        displayPath: 'component-guidelines.md',
        downloadName: 'component-guidelines.md',
      },
      { kind: 'text', value: '，参考 ' },
      { kind: 'code', value: 'anti-codex' },
      { kind: 'text', value: '。' },
    ])
  })
})

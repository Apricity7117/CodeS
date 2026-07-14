import { describe, expect, it } from 'vitest'
import { parseInlineSegments } from './threadInlineSegments'
import { escapeHtml, parseMessageBlocks, renderMarkdownBlocksAsHtml } from './threadMarkdownBlocks'
import { loadMathRenderer } from './threadMath'

describe('thread markdown block parsing', () => {
  it('parses headings, paragraphs, task lists, tables, code blocks, and images', () => {
    const blocks = parseMessageBlocks([
      '# Title',
      '',
      'Intro paragraph',
      '',
      '- [x] Done',
      '- [ ] Todo',
      '',
      '| Name | Count |',
      '| :--- | ---: |',
      '| alpha | 2 |',
      '',
      '```ts',
      'const value = 1',
      '```',
      '',
      '![Chart](/tmp/chart.png)',
    ].join('\n'))

    expect(blocks).toEqual([
      { kind: 'heading', level: 1, value: 'Title' },
      { kind: 'paragraph', value: 'Intro paragraph' },
      {
        kind: 'taskList',
        items: [
          { checked: true, text: 'Done' },
          { checked: false, text: 'Todo' },
        ],
      },
      {
        kind: 'table',
        headers: ['Name', 'Count'],
        rows: [['alpha', '2']],
        alignments: ['left', 'right'],
      },
      { kind: 'codeBlock', language: 'ts', value: 'const value = 1' },
      {
        kind: 'image',
        url: '/codex-local-image?path=%2Ftmp%2Fchart.png',
        alt: 'Chart',
        markdown: '![Chart](/tmp/chart.png)',
      },
    ])
  })

  it('keeps markdown image syntax inside fenced code blocks as code text', () => {
    const blocks = parseMessageBlocks([
      '```md',
      '![not image](/tmp/a.png)',
      '```',
    ].join('\n'))

    expect(blocks).toEqual([
      {
        kind: 'codeBlock',
        language: 'md',
        value: '![not image](/tmp/a.png)',
      },
    ])
  })

  it('keeps markdown image syntax inside inline code as paragraph text', () => {
    expect(parseMessageBlocks('Use `![not image](/tmp/a.png)` as an example.')).toEqual([
      {
        kind: 'paragraph',
        value: 'Use `![not image](/tmp/a.png)` as an example.',
      },
    ])
  })

  it('parses GitHub-style task lists and ordered list start values', () => {
    expect(parseMessageBlocks([
      '- [X] Finished',
      '- [ ] Pending',
      '',
      '3. Third',
      '4. Fourth',
    ].join('\n'))).toEqual([
      {
        kind: 'taskList',
        items: [
          { checked: true, text: 'Finished' },
          { checked: false, text: 'Pending' },
        ],
      },
      {
        kind: 'orderedList',
        start: 3,
        items: [
          { paragraphs: ['Third'] },
          { paragraphs: ['Fourth'] },
        ],
      },
    ])
  })

  it('keeps task-list rendering when task and regular items are adjacent', () => {
    expect(parseMessageBlocks([
      '- [x] Done',
      '- Regular',
      '- [ ] Later',
    ].join('\n'))).toEqual([
      { kind: 'taskList', items: [{ checked: true, text: 'Done' }] },
      { kind: 'unorderedList', items: [{ paragraphs: ['Regular'] }] },
      { kind: 'taskList', items: [{ checked: false, text: 'Later' }] },
    ])
  })

  it('parses display LaTeX formulas as dedicated blocks', () => {
    expect(parseMessageBlocks([
      '$$',
      '\\begin{aligned}',
      'f(x) &= x^2 \\\\',
      "f'(x) &= 2x",
      '\\end{aligned}',
      '$$',
    ].join('\n'))).toEqual([
      {
        kind: 'mathBlock',
        value: [
          '\\begin{aligned}',
          'f(x) &= x^2 \\\\',
          "f'(x) &= 2x",
          '\\end{aligned}',
        ].join('\n'),
      },
    ])
  })

  it('keeps formula delimiters inside fenced code blocks as code text', () => {
    expect(parseMessageBlocks([
      '```latex',
      '$$E = mc^2$$',
      '```',
    ].join('\n'))).toEqual([
      {
        kind: 'codeBlock',
        language: 'latex',
        value: '$$E = mc^2$$',
      },
    ])
  })

  it('parses nested list content into child blocks', () => {
    const blocks = parseMessageBlocks([
      '1. Parent',
      '   - Child one',
      '   - Child two',
    ].join('\n'))

    expect(blocks).toEqual([
      {
        kind: 'orderedList',
        start: 1,
        items: [
          {
            paragraphs: ['Parent'],
            children: [
              {
                kind: 'unorderedList',
                items: [
                  { paragraphs: ['Child one'] },
                  { paragraphs: ['Child two'] },
                ],
              },
            ],
          },
        ],
      },
    ])
  })

  it('renders escaped HTML, local file links, and highlighted code through injected callbacks', () => {
    const html = renderMarkdownBlocksAsHtml([
      'Open [file](src/App.vue:10) and `<unsafe>`.',
      '',
      '```ts',
      'const value = "<tag>"',
      '```',
    ].join('\n'), {
      getInlineSegments: parseInlineSegments,
      toBrowseUrl: (pathValue) => `/browse/${pathValue}`,
      renderHighlightedCodeAsHtml: (language, value) => `<span data-language="${language}">${escapeHtml(value)}</span>`,
    })

    expect(html).toContain('href="/browse/src/App.vue"')
    expect(html).toContain('title="src/App.vue"')
    expect(html).toContain('&lt;unsafe&gt;')
    expect(html).toContain(`<span data-language="ts">${escapeHtml('const value = "<tag>"')}</span>`)
    expect(html).not.toContain('<unsafe>')
  })

  it('renders block formulas through KaTeX', async () => {
    await loadMathRenderer()
    const html = renderMarkdownBlocksAsHtml('$$E = mc^2$$', {
      getInlineSegments: parseInlineSegments,
      toBrowseUrl: (pathValue) => `/browse/${pathValue}`,
      renderHighlightedCodeAsHtml: (_language, value) => escapeHtml(value),
    })

    expect(html).toContain('class="message-math-block"')
    expect(html).toContain('class="katex-display"')
  })
})

import { describe, expect, it } from 'vitest'
import { loadMathRenderer, renderMathToHtml } from './threadMath'

describe('thread math rendering', () => {
  it('renders inline and display formulas with KaTeX markup', async () => {
    await loadMathRenderer()
    expect(renderMathToHtml('E = mc^2', false)).toContain('class="katex"')
    expect(renderMathToHtml('E = mc^2', true)).toContain('class="katex-display"')
  })

  it('does not allow trusted URL commands', async () => {
    await loadMathRenderer()
    const html = renderMathToHtml('\\href{javascript:alert(1)}{unsafe}', false)
    expect(html).not.toContain('href="javascript:')
  })
})

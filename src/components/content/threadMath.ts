import { ref } from 'vue'

type KatexRenderer = typeof import('katex')['default']

let katexRenderer: KatexRenderer | null = null
let katexLoader: Promise<KatexRenderer> | null = null

export const mathRenderVersion = ref(0)

function escapeHtml(value: string): string {
  return value
    .replace(/&/gu, '&amp;')
    .replace(/</gu, '&lt;')
    .replace(/>/gu, '&gt;')
    .replace(/"/gu, '&quot;')
    .replace(/'/gu, '&#39;')
}

export function renderMathToHtml(expression: string, displayMode: boolean): string {
  mathRenderVersion.value
  if (!katexRenderer) {
    void loadMathRenderer()
    return escapeHtml(expression)
  }

  try {
    return katexRenderer.renderToString(expression, {
      displayMode,
      output: 'htmlAndMathml',
      throwOnError: false,
      strict: 'ignore',
      trust: false,
      maxExpand: 1000,
      maxSize: 20,
    })
  } catch {
    return escapeHtml(expression)
  }
}

export function loadMathRenderer(): Promise<KatexRenderer> {
  if (katexRenderer) return Promise.resolve(katexRenderer)
  if (katexLoader) return katexLoader

  katexLoader = Promise.all([
    import('katex'),
    import('katex/dist/katex.min.css'),
  ]).then(([module]) => {
    katexRenderer = module.default
    mathRenderVersion.value += 1
    return katexRenderer
  })
  return katexLoader
}

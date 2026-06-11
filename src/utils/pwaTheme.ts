export const PWA_LIGHT_THEME_COLOR = '#ffffff'
export const PWA_DARK_THEME_COLOR = '#1e1e1e'

export type PwaThemeMode = 'system' | 'light' | 'dark'

type ThemeMetaDocument = Pick<Document, 'querySelectorAll'>

export function resolvePwaThemeColor(mode: PwaThemeMode, prefersDark: boolean): string {
  if (mode === 'dark') return PWA_DARK_THEME_COLOR
  if (mode === 'light') return PWA_LIGHT_THEME_COLOR
  return prefersDark ? PWA_DARK_THEME_COLOR : PWA_LIGHT_THEME_COLOR
}

export function applyPwaThemeColor(documentRef: ThemeMetaDocument, color: string): void {
  documentRef.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]').forEach((meta) => {
    meta.setAttribute('content', color)
    meta.removeAttribute('media')
  })
}

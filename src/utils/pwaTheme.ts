export const PWA_LIGHT_THEME_COLOR = '#ffffff'
export const PWA_DARK_THEME_COLOR = '#1e1e1e'

export type PwaThemeMode = 'system' | 'light' | 'dark'

type ThemeMetaDocument = Pick<Document, 'querySelectorAll'>
type PwaDisplayWindow = Pick<Window, 'matchMedia'>
type PwaDisplayNavigator = { standalone?: boolean; userAgent?: string }

export function isPwaDisplayMode(windowRef: PwaDisplayWindow, navigatorRef: PwaDisplayNavigator): boolean {
  return windowRef.matchMedia('(display-mode: standalone)').matches
    || windowRef.matchMedia('(display-mode: window-controls-overlay)').matches
    || navigatorRef.standalone === true
}

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

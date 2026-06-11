import { describe, expect, it } from 'vitest'
import {
  PWA_DARK_THEME_COLOR,
  PWA_LIGHT_THEME_COLOR,
  applyPwaThemeColor,
  resolvePwaThemeColor,
} from './pwaTheme'

class FakeMeta {
  attrs: Record<string, string> = {}

  constructor(attrs: Record<string, string>) {
    this.attrs = { ...attrs }
  }

  setAttribute(name: string, value: string): void {
    this.attrs[name] = value
  }

  removeAttribute(name: string): void {
    delete this.attrs[name]
  }
}

describe('resolvePwaThemeColor', () => {
  it('uses white for explicit light mode', () => {
    expect(resolvePwaThemeColor('light', true)).toBe(PWA_LIGHT_THEME_COLOR)
  })

  it('uses the app dark surface for explicit dark mode', () => {
    expect(resolvePwaThemeColor('dark', false)).toBe(PWA_DARK_THEME_COLOR)
  })

  it('follows system preference in system mode', () => {
    expect(resolvePwaThemeColor('system', false)).toBe(PWA_LIGHT_THEME_COLOR)
    expect(resolvePwaThemeColor('system', true)).toBe(PWA_DARK_THEME_COLOR)
  })
})

describe('applyPwaThemeColor', () => {
  it('updates all theme-color meta tags and removes media constraints', () => {
    const metas = [
      new FakeMeta({ content: '#020617', media: '(prefers-color-scheme: light)' }),
      new FakeMeta({ content: '#020617', media: '(prefers-color-scheme: dark)' }),
    ]
    const fakeDocument = {
      querySelectorAll: () => metas,
    }

    applyPwaThemeColor(fakeDocument as unknown as Document, PWA_DARK_THEME_COLOR)

    expect(metas.map((meta) => meta.attrs)).toEqual([
      { content: PWA_DARK_THEME_COLOR },
      { content: PWA_DARK_THEME_COLOR },
    ])
  })
})

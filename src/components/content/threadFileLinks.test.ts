import { describe, expect, it } from 'vitest'
import {
  normalizeFileUrlToPath,
  normalizePathDots,
  parseFileReference,
  parseMarkdownLinkToken,
  resolveRelativePath,
  toBrowseUrl,
  toEditUrlFromBrowseHref,
  toRenderableImageUrl,
  trimLinkWrappers,
} from './threadFileLinks'

describe('thread file link utilities', () => {
  it('normalizes file URLs and path dot segments', () => {
    expect(normalizeFileUrlToPath('file:///Users/a/My%20File.md')).toBe('/Users/a/My File.md')
    expect(normalizeFileUrlToPath('file:///C:/Users/a/file.txt')).toBe('C:/Users/a/file.txt')
    expect(normalizePathDots('/Users/a/project/src/../README.md')).toBe('/Users/a/project/README.md')
  })

  it('resolves relative paths against cwd and home shorthand', () => {
    expect(resolveRelativePath('./src/App.vue', '/Users/a/project')).toBe('/Users/a/project/src/App.vue')
    expect(resolveRelativePath('~/notes/todo.md', '/Users/a/project')).toBe('/Users/a/notes/todo.md')
    expect(resolveRelativePath('../README.md', '/Users/a/project/src')).toBe('/Users/a/project/README.md')
  })

  it('parses file references with line suffixes', () => {
    expect(parseFileReference('src/App.vue:42')).toEqual({ path: 'src/App.vue', line: 42 })
    expect(parseFileReference('(/Users/a/project/src/App.vue#L7)')).toEqual({
      path: '/Users/a/project/src/App.vue',
      line: 7,
    })
    expect(parseFileReference('https://example.com/file.txt')).toBeNull()
  })

  it('trims balanced link wrappers and parses markdown links', () => {
    expect(trimLinkWrappers('`/tmp/file.md`')).toEqual({
      core: '/tmp/file.md',
      leading: '`',
      trailing: '`',
    })
    expect(parseMarkdownLinkToken('[App](src/App.vue:10)')).toEqual({
      label: 'App',
      target: 'src/App.vue:10',
    })
  })

  it('builds browse and edit URLs without component state', () => {
    expect(toBrowseUrl('src/App.vue:10', '/Users/a/project')).toBe('/codex-local-browse/Users/a/project/src/App.vue')
    expect(toEditUrlFromBrowseHref(
      '/codex-local-browse/Users/a/project/src/App.vue?x=1#L10',
      'http://localhost:5173/#/thread/1',
    )).toBe('/codex-local-edit/Users/a/project/src/App.vue?x=1#L10')
  })

  it('converts local image paths to the local image proxy', () => {
    expect(toRenderableImageUrl('/tmp/image.png')).toBe('/codex-local-image?path=%2Ftmp%2Fimage.png')
    expect(toRenderableImageUrl('file:///tmp/image.png')).toBe('/codex-local-image?path=file%3A%2F%2F%2Ftmp%2Fimage.png')
    expect(toRenderableImageUrl('https://example.com/image.png')).toBe('https://example.com/image.png')
  })
})

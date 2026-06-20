import { getPathLeafName, normalizePathForUi } from '../pathUtils'

/**
 * 拼接父目录和子路径，自动处理分隔符
 */
export function joinPath(parent: string, child: string): string {
  const rawParent = normalizePathForUi(parent).trim()
  const normalizedChild = normalizePathForUi(child).trim().replace(/^[\\/]+/u, '')
  if (!rawParent || !normalizedChild) return ''
  const separator = rawParent.includes('\\') && !rawParent.includes('/') ? '\\' : '/'
  if (/^[a-zA-Z]:[\\/]?$/u.test(rawParent)) {
    return `${rawParent.slice(0, 2)}${separator}${normalizedChild}`
  }
  if (/^\/+$/u.test(rawParent)) {
    return `/${normalizedChild}`
  }
  const normalizedParent = rawParent.replace(/[\\/]+$/u, '')
  if (!normalizedParent) return ''
  return `${normalizedParent}${separator}${normalizedChild}`
}

/**
 * 折叠路径片段，处理 . 和 ..
 */
function collapsePathSegments(rawSegments: readonly string[]): string[] {
  const segments: string[] = []
  for (const rawSegment of rawSegments) {
    const segment = rawSegment.trim()
    if (!segment || segment === '.') continue
    if (segment === '..') {
      if (segments.length > 0) {
        segments.pop()
      }
      continue
    }
    segments.push(segment)
  }
  return segments
}

/**
 * 规范化绝对路径，处理 UNC、盘符、Unix 路径
 */
export function normalizeAbsolutePath(value: string): string {
  const normalizedValue = normalizePathForUi(value).trim()
  if (!normalizedValue) return ''

  const uncMatch = normalizedValue.match(/^\\\\([^\\/]+)[\\/]+([^\\/]+)([\\/].*)?$/u)
  if (uncMatch) {
    const [, server, share, suffix = ''] = uncMatch
    const segments = collapsePathSegments(suffix.split(/[\\/]+/u))
    return segments.length > 0
      ? `\\\\${server}\\${share}\\${segments.join('\\')}`
      : `\\\\${server}\\${share}`
  }

  const driveMatch = normalizedValue.match(/^([a-zA-Z]:)([\\/].*)?$/u)
  if (driveMatch) {
    const [, drive, suffix = ''] = driveMatch
    const separator = normalizedValue.includes('\\') && !normalizedValue.includes('/') ? '\\' : '/'
    const segments = collapsePathSegments(suffix.split(/[\\/]+/u))
    return segments.length > 0 ? `${drive}${separator}${segments.join(separator)}` : `${drive}${separator}`
  }

  if (normalizedValue.startsWith('/')) {
    const segments = collapsePathSegments(normalizedValue.split('/'))
    return segments.length > 0 ? `/${segments.join('/')}` : '/'
  }

  return normalizedValue
}

/**
 * 检查路径是否是 worktree 路径
 */
export function isWorktreePath(cwdRaw: string): boolean {
  const cwd = cwdRaw.trim().replace(/\\/gu, '/')
  if (!cwd) return false
  return cwd.includes('/.codex/worktrees/') || cwd.includes('/.git/worktrees/')
}

/**
 * 检查给定路径的叶子名称是否在已知路径中重复
 */
export function hasDuplicateFolderLeaf(path: string, knownPaths: string[]): boolean {
  const normalizedPath = normalizePathForUi(path).trim()
  const leafName = getPathLeafName(normalizedPath)
  if (!normalizedPath || !leafName) return false
  return knownPaths.some((knownPath) => {
    const normalizedKnownPath = normalizePathForUi(knownPath).trim()
    return normalizedKnownPath !== normalizedPath && getPathLeafName(normalizedKnownPath) === leafName
  })
}

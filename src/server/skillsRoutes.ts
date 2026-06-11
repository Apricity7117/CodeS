import { readFile, rm } from 'node:fs/promises'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { ENV_KEYS, readTrimmedEnv } from '../config/env.js'

type AppServerLike = {
  rpc(method: string, params: unknown): Promise<unknown>
}

type ReadJsonBody = (req: IncomingMessage) => Promise<unknown>

type SkillRouteContext = {
  appServer: AppServerLike
  readJsonBody: ReadJsonBody
}

type RpcSkillRecord = {
  name?: string
  description?: string
  shortDescription?: string
  path?: string
  scope?: string
  enabled?: boolean
}

type InstalledSkillInfo = {
  name: string
  path: string
  enabled: boolean
}

type SkillHubEntry = {
  name: string
  owner: string
  description: string
  displayName: string
  publishedAt: number
  avatarUrl: string
  url: string
  installed: boolean
  path?: string
  enabled?: boolean
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

function getErrorMessage(payload: unknown, fallback: string): string {
  if (payload instanceof Error && payload.message.trim().length > 0) {
    return payload.message
  }
  const record = asRecord(payload)
  if (!record) return fallback
  const error = record.error
  if (typeof error === 'string' && error.length > 0) return error
  const nestedError = asRecord(error)
  if (nestedError && typeof nestedError.message === 'string' && nestedError.message.length > 0) {
    return nestedError.message
  }
  return fallback
}

function setJson(res: ServerResponse, statusCode: number, payload: unknown): void {
  res.statusCode = statusCode
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.end(JSON.stringify(payload))
}

function getCodexHomeDir(): string {
  const codexHome = readTrimmedEnv(ENV_KEYS.codexHome[0])
  return codexHome && codexHome.length > 0 ? codexHome : join(homedir(), '.codex')
}

function getSkillsInstallDir(): string {
  return join(getCodexHomeDir(), 'skills')
}

function normalizeSkillMarkdownPath(skillPath: string): string {
  const trimmed = skillPath.trim()
  if (!trimmed) return ''
  return trimmed.endsWith('/SKILL.md') ? trimmed : `${trimmed}/SKILL.md`
}

function normalizePathForCompare(value: string): string {
  return value.replace(/\\/gu, '/').replace(/\/+$/u, '')
}

function splitAbsolutePath(pathValue: string): string[] {
  return normalizePathForCompare(pathValue).split('/').filter(Boolean)
}

function buildAbsolutePath(parts: string[]): string {
  return `/${parts.join('/')}`
}

function deriveSkillPathInfo(skillPath: string, knownPaths: Set<string> = new Set()): {
  normalizedPath: string
  rootSkillPath: string
  rootSkillName: string
  installDir: string
  isNestedSkill: boolean
} | null {
  const normalizedPath = normalizeSkillMarkdownPath(skillPath)
  const parts = splitAbsolutePath(normalizedPath)
  if (parts.length < 2) return null

  const firstSkillsIndex = parts.indexOf('skills')
  if (firstSkillsIndex < 0 || firstSkillsIndex + 1 >= parts.length - 1) return null
  const rootSkillName = parts[firstSkillsIndex + 1] ?? ''
  if (!rootSkillName || rootSkillName === '.system') return null

  const rootParts = parts.slice(0, firstSkillsIndex + 2)
  const installDirParts = parts.slice(0, firstSkillsIndex + 1)
  const rootSkillPath = buildAbsolutePath([...rootParts, 'SKILL.md'])
  const hasRoot = knownPaths.size === 0 || knownPaths.has(rootSkillPath)

  return {
    normalizedPath,
    rootSkillPath: hasRoot ? rootSkillPath : normalizedPath,
    rootSkillName,
    installDir: buildAbsolutePath(installDirParts),
    isNestedSkill: normalizedPath !== rootSkillPath,
  }
}

function extractSkillDescriptionFromMarkdown(raw: string): string {
  const frontmatter = raw.match(/^---\s*\n([\s\S]*?)\n---/u)?.[1] ?? ''
  if (frontmatter) {
    const descriptionMatch = frontmatter.match(/^description:\s*(.+)$/im)
    if (descriptionMatch?.[1]) {
      return descriptionMatch[1].trim().replace(/^['"]|['"]$/gu, '')
    }
  }

  for (const line of raw.split(/\r?\n/u)) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith('---')) continue
    return trimmed.replace(/^[-*>]\s*/u, '').slice(0, 220)
  }
  return ''
}

async function collectInstalledSkillsMap(appServer: AppServerLike): Promise<Map<string, InstalledSkillInfo>> {
  const result = await appServer.rpc('skills/list', {}) as { data?: Array<{ skills?: RpcSkillRecord[] }> }
  const skills = (result.data ?? []).flatMap((entry) => entry.skills ?? [])
  const knownPaths = new Set(skills.map((skill) => normalizeSkillMarkdownPath(skill.path ?? '')).filter(Boolean))
  const installed = new Map<string, InstalledSkillInfo>()

  for (const skill of skills) {
    const name = typeof skill.name === 'string' ? skill.name.trim() : ''
    const path = typeof skill.path === 'string' ? skill.path.trim() : ''
    if (!name || !path) continue
    const pathInfo = deriveSkillPathInfo(path, knownPaths)
    if (!pathInfo) continue
    const key = pathInfo.rootSkillPath
    if (installed.has(key) && pathInfo.isNestedSkill) continue
    installed.set(key, {
      name: pathInfo.rootSkillName || name,
      path: pathInfo.rootSkillPath,
      enabled: skill.enabled !== false,
    })
  }

  return installed
}

async function buildLocalHubEntry(info: InstalledSkillInfo): Promise<SkillHubEntry> {
  let description = ''
  if (info.path) {
    try {
      description = extractSkillDescriptionFromMarkdown(await readFile(info.path, 'utf8'))
    } catch {}
  }
  return {
    name: info.name,
    owner: 'local',
    description,
    displayName: info.name,
    publishedAt: 0,
    avatarUrl: '',
    url: '',
    installed: true,
    path: info.path,
    enabled: info.enabled,
  }
}

function isUserSkillPath(skillPath: string): boolean {
  const normalizedPath = normalizePathForCompare(skillPath)
  const skillsDir = normalizePathForCompare(getSkillsInstallDir())
  return normalizedPath.startsWith(`${skillsDir}/`) && !normalizedPath.startsWith(`${skillsDir}/.system/`)
}

async function uninstallLocalSkill(appServer: AppServerLike, rawPath: string): Promise<void> {
  const normalizedPath = normalizeSkillMarkdownPath(rawPath)
  if (!normalizedPath || !isUserSkillPath(normalizedPath)) {
    throw new Error('Only user-installed local skills can be removed')
  }
  const pathInfo = deriveSkillPathInfo(normalizedPath)
  if (!pathInfo) {
    throw new Error('Invalid skill path')
  }
  await rm(pathInfo.rootSkillPath.slice(0, -'/SKILL.md'.length), { recursive: true, force: true })
  await appServer.rpc('skills/list', { forceReload: true }).catch(() => {})
}

export async function handleSkillsRoutes(
  req: IncomingMessage,
  res: ServerResponse,
  url: URL,
  context: SkillRouteContext,
): Promise<boolean> {
  const { appServer, readJsonBody } = context

  if (req.method === 'GET' && url.pathname === '/codex-api/skills-hub') {
    try {
      const installedMap = await collectInstalledSkillsMap(appServer)
      const installed = await Promise.all(Array.from(installedMap.values()).map(buildLocalHubEntry))
      setJson(res, 200, { installed })
    } catch (error) {
      setJson(res, 500, { error: getErrorMessage(error, 'Failed to list local skills') })
    }
    return true
  }

  if (req.method === 'GET' && url.pathname === '/codex-api/skills-hub/readme') {
    try {
      const skillPath = url.searchParams.get('path')?.trim() ?? ''
      const normalizedPath = normalizeSkillMarkdownPath(skillPath)
      if (!normalizedPath) {
        setJson(res, 400, { error: 'Missing skill path' })
        return true
      }
      const content = await readFile(normalizedPath, 'utf8')
      setJson(res, 200, {
        content,
        description: extractSkillDescriptionFromMarkdown(content),
      })
    } catch (error) {
      setJson(res, 404, { error: getErrorMessage(error, 'Skill contents not found') })
    }
    return true
  }

  if (req.method === 'POST' && url.pathname === '/codex-api/skills-hub/uninstall') {
    try {
      const body = asRecord(await readJsonBody(req))
      const skillPath = typeof body?.path === 'string' ? body.path : ''
      await uninstallLocalSkill(appServer, skillPath)
      setJson(res, 200, { ok: true })
    } catch (error) {
      setJson(res, 400, { ok: false, error: getErrorMessage(error, 'Failed to uninstall skill') })
    }
    return true
  }

  return false
}

import { spawn, spawnSync, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { createHash, randomBytes } from 'node:crypto'
import { mkdtemp, readFile, readdir, rename, rm, mkdir, stat, cp, lstat, readlink, symlink } from 'node:fs/promises'
import { createReadStream, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { request as httpRequest } from 'node:http'
import { request as httpsRequest } from 'node:https'
import { homedir } from 'node:os'
import { tmpdir } from 'node:os'
import { basename, dirname, isAbsolute, join, relative, resolve } from 'node:path'
import { createInterface } from 'node:readline'
import { writeFile } from 'node:fs/promises'
import { handleAccountRoutes } from './accountRoutes.js'
import { buildAppServerArgs } from './appServerRuntimeConfig.js'
import { handleModelCatalogRoutes, watchModelCatalogConfigFile } from './modelCatalog.js'
import { handleReviewRoutes } from './reviewGit.js'
import { handleSkillsRoutes } from './skillsRoutes.js'
import { TelegramThreadBridge } from './telegramThreadBridge.js'
import { getSpawnInvocation } from '../utils/commandInvocation.js'
import {
  resolveCodexCommand,
  resolveRipgrepCommand,
} from '../commandResolution.js'
import type { CollaborationModeKind, ReasoningEffort } from '../types/codex.js'
import { isAbsoluteLikePath } from '../pathUtils.js'
import {
  ENV_KEYS,
  readBooleanEnvConfig,
  readFirstTrimmedEnv,
  readIntegerEnv,
  readNumberEnvConfig,
  readTrimmedEnv,
} from '../config/env.js'

type JsonRpcCall = {
  jsonrpc: '2.0'
  id: number
  method: string
  params?: unknown
}

type JsonRpcResponse = {
  id?: number
  result?: unknown
  error?: {
    code: number
    message: string
  }
  method?: string
  params?: unknown
}

type RpcProxyRequest = {
  method: string
  params?: unknown
}

type RpcExecutor = {
  rpc: (method: string, params: unknown) => Promise<unknown>
}

type ServerRequestReply = {
  result?: unknown
  error?: {
    code: number
    message: string
  }
}

type WorkspaceRootsState = {
  order: string[]
  labels: Record<string, string>
  active: string[]
  projectOrder: string[]
  remoteProjects: Array<{
    id: string
    hostId: string
    remotePath: string
    label: string
  }>
}

type PendingServerRequest = {
  id: number
  method: string
  params: unknown
  receivedAtIso: string
}

type ChatgptAuthTokensRefreshParams = {
  reason?: string
  previousAccountId?: string | null
}

type ChatgptAuthTokensRefreshResponse = {
  accessToken: string
  chatgptAccountId: string
  chatgptPlanType: string | null
}

type ThreadSearchDocument = {
  id: string
  title: string
  preview: string
  messageText: string
  searchableText: string
}

type ThreadSearchIndex = {
  docsById: Map<string, ThreadSearchDocument>
}

type ThreadSessionDeletionTarget = {
  threadId: string
  sessionPath: string | null
  fileExists: boolean
}

type DeletedThreadSessionsResult = {
  deletedThreadIds: string[]
}

type ProviderModelsResponse = {
  data: string[]
  providerId: string
  source: 'provider'
}

const PROVIDER_MODELS_FETCH_TIMEOUT_MS = 5_000

const THREAD_RESPONSE_TURN_LIMIT = 10
const THREAD_TURN_PAGE_READ_CACHE_TTL_MS = 30_000
const THREAD_METHODS_WITH_TURNS = new Set(['thread/read', 'thread/resume', 'thread/fork', 'thread/rollback'])
const THREAD_METHODS_WITH_THREAD_SNAPSHOT = new Set([...THREAD_METHODS_WITH_TURNS, 'thread/start'])
const THREAD_SEARCH_FULL_TEXT_THREAD_LIMIT = 100
const PROJECTLESS_THREAD_DIRECTORY_MAX_ATTEMPTS = 100
const PROJECTLESS_THREAD_SLUG_MAX_LENGTH = 80
const DEFAULT_API_PERF_MS_THRESHOLD = 300
const DEFAULT_API_PERF_BODY_MB_THRESHOLD = 1
const MB_DIVISOR = 1024 * 1024

type SessionRecoveredFileChange = {
  path: string
  operation: 'add' | 'delete' | 'update'
  movedToPath: string | null
  diff: string
  addedLineCount: number
  removedLineCount: number
}

type SessionRecoveredTurnFileChanges = {
  turnId: string
  turnIndex: number
  fileChanges: SessionRecoveredFileChange[]
}

type SessionRecoveredSkillInput = {
  name: string
  path: string
}

type SessionSkillInputCacheEntry = {
  size: number
  mtimeMs: number
  skillsByTurnId: Map<string, SessionRecoveredSkillInput[]>
}

const SESSION_SKILL_INPUT_CACHE_LIMIT = 64
const sessionSkillInputCache = new Map<string, SessionSkillInputCacheEntry>()

function parseSessionSkillText(value: string): SessionRecoveredSkillInput | null {
  const trimmed = value.trim()
  if (!trimmed.startsWith('<skill>')) return null
  const name = trimmed.match(/<name>\s*([\s\S]*?)\s*<\/name>/u)?.[1]?.trim() ?? ''
  const path = trimmed.match(/<path>\s*([\s\S]*?)\s*<\/path>/u)?.[1]?.trim() ?? ''
  if (!name || !path) return null
  return { name, path }
}

function buildSessionSkillInputsByTurn(sessionLogRaw: string): Map<string, SessionRecoveredSkillInput[]> {
  let currentTurnId = ''
  const skillsByTurnId = new Map<string, SessionRecoveredSkillInput[]>()

  for (const line of sessionLogRaw.split('\n')) {
    if (!line.trim()) continue
    let row: Record<string, unknown> | null = null
    try {
      row = JSON.parse(line) as Record<string, unknown>
    } catch {
      continue
    }

    if (row.type === 'turn_context') {
      const payloadRecord = asRecord(row.payload)
      currentTurnId = readNonEmptyString(payloadRecord?.turn_id) || currentTurnId
      continue
    }
    if (row.type === 'event_msg') {
      const payloadRecord = asRecord(row.payload)
      if (payloadRecord?.type === 'task_started') {
        currentTurnId = readNonEmptyString(payloadRecord.turn_id) || currentTurnId
      }
      continue
    }

    if (row.type !== 'response_item' || !currentTurnId) continue
    const payloadRecord = asRecord(row.payload)
    if (payloadRecord?.type !== 'message' || payloadRecord.role !== 'user') continue
    const content = Array.isArray(payloadRecord.content) ? payloadRecord.content : []

    for (const contentItem of content) {
      const contentRecord = asRecord(contentItem)
      if (contentRecord?.type !== 'input_text' || typeof contentRecord.text !== 'string') continue
      const skill = parseSessionSkillText(contentRecord.text)
      if (!skill) continue
      const existing = skillsByTurnId.get(currentTurnId) ?? []
      if (!existing.some((item) => item.path === skill.path)) {
        existing.push(skill)
        skillsByTurnId.set(currentTurnId, existing)
      }
    }
  }

  return skillsByTurnId
}

async function readCachedSessionSkillInputsByTurn(sessionPath: string): Promise<Map<string, SessionRecoveredSkillInput[]>> {
  const sessionStat = await stat(sessionPath)
  const cached = sessionSkillInputCache.get(sessionPath)
  if (cached && cached.size === sessionStat.size && cached.mtimeMs === sessionStat.mtimeMs) {
    return cached.skillsByTurnId
  }

  const sessionLogRaw = await readFile(sessionPath, 'utf8')
  const skillsByTurnId = buildSessionSkillInputsByTurn(sessionLogRaw)
  sessionSkillInputCache.set(sessionPath, {
    size: sessionStat.size,
    mtimeMs: sessionStat.mtimeMs,
    skillsByTurnId,
  })
  if (sessionSkillInputCache.size > SESSION_SKILL_INPUT_CACHE_LIMIT) {
    const oldestKey = sessionSkillInputCache.keys().next().value
    if (oldestKey) sessionSkillInputCache.delete(oldestKey)
  }
  return skillsByTurnId
}

function mergeSessionSkillInputsIntoTurnsFromMap(
  turns: unknown[],
  skillsByTurnId: Map<string, SessionRecoveredSkillInput[]>,
): unknown[] {
  const turnIds = new Set<string>()
  for (const turn of turns) {
    const turnRecord = asRecord(turn)
    const turnId = readNonEmptyString(turnRecord?.id)
    if (turnId) turnIds.add(turnId)
  }
  if (turnIds.size === 0) return turns

  if (skillsByTurnId.size === 0) return turns

  let changed = false
  const nextTurns = turns.map((turn) => {
    const turnRecord = asRecord(turn)
    const turnId = readNonEmptyString(turnRecord?.id)
    const skills = turnId ? skillsByTurnId.get(turnId) : undefined
    const items = Array.isArray(turnRecord?.items) ? turnRecord.items : null
    if (!turnRecord || !skills || skills.length === 0 || !items) return turn

    let targetUserMessageIndex = -1
    for (let index = items.length - 1; index >= 0; index -= 1) {
      const itemRecord = asRecord(items[index])
      if (itemRecord?.type === 'userMessage' && Array.isArray(itemRecord.content)) {
        targetUserMessageIndex = index
        break
      }
    }
    if (targetUserMessageIndex < 0) return turn

    let addedToMessage = false
    const nextItems = items.map((item, index) => {
      const itemRecord = asRecord(item)
      const content = Array.isArray(itemRecord?.content) ? itemRecord.content : null
      if (index !== targetUserMessageIndex || itemRecord?.type !== 'userMessage' || !content) return item

      const existingSkillPaths = new Set(
        content.flatMap((contentItem) => {
          const contentRecord = asRecord(contentItem)
          const path = typeof contentRecord?.path === 'string' ? contentRecord.path.trim() : ''
          return contentRecord?.type === 'skill' && path ? [path] : []
        }),
      )
      const missingSkills = skills.filter((skill) => !existingSkillPaths.has(skill.path))
      if (missingSkills.length === 0) return item

      addedToMessage = true
      changed = true
      return {
        ...itemRecord,
        content: [
          ...content,
          ...missingSkills.map((skill) => ({ type: 'skill', name: skill.name, path: skill.path })),
        ],
      }
    })

    return addedToMessage ? { ...turnRecord, items: nextItems } : turn
  })

  return changed ? nextTurns : turns
}

export function mergeSessionSkillInputsIntoTurns(turns: unknown[], sessionLogRaw: string): unknown[] {
  return mergeSessionSkillInputsIntoTurnsFromMap(turns, buildSessionSkillInputsByTurn(sessionLogRaw))
}

async function mergeSessionSkillInputsIntoThreadResult(result: unknown): Promise<unknown> {
  const record = asRecord(result)
  const thread = asRecord(record?.thread)
  const turns = Array.isArray(thread?.turns) ? thread.turns : null
  const sessionPath = readNonEmptyString(thread?.path)
  if (!record || !thread || !turns || turns.length === 0 || !sessionPath || !isAbsolute(sessionPath)) {
    return result
  }

  try {
    const skillsByTurnId = await readCachedSessionSkillInputsByTurn(sessionPath)
    const mergedTurns = mergeSessionSkillInputsIntoTurnsFromMap(turns, skillsByTurnId)
    if (mergedTurns === turns) return result
    return {
      ...record,
      thread: {
        ...thread,
        turns: mergedTurns,
      },
    }
  } catch {
    return result
  }
}

const API_PERF_LOGGING_ENABLED = readBooleanEnvConfig(ENV_KEYS.apiPerfLogging, false)
const API_PERF_MS_THRESHOLD = readNumberEnvConfig(ENV_KEYS.apiPerfMsThreshold, DEFAULT_API_PERF_MS_THRESHOLD)
const API_PERF_BODY_MB_THRESHOLD = readNumberEnvConfig(ENV_KEYS.apiPerfBodyMbThreshold, DEFAULT_API_PERF_BODY_MB_THRESHOLD)

function getChunkByteLength(chunk: unknown, encoding?: BufferEncoding): number {
  if (typeof chunk === 'string') {
    return Buffer.byteLength(chunk, encoding)
  }
  if (chunk instanceof Uint8Array) {
    return chunk.byteLength
  }
  if (ArrayBuffer.isView(chunk)) {
    return chunk.byteLength
  }
  if (chunk instanceof ArrayBuffer) {
    return chunk.byteLength
  }
  return 0
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

function isInlineDataUrl(value: string): boolean {
  return /^data:/iu.test(value.trim())
}

function inferImageMimeTypeFromBytes(bytes: Uint8Array): string | null {
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  ) {
    return 'image/png'
  }
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return 'image/jpeg'
  }
  if (
    bytes.length >= 12 &&
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  ) {
    return 'image/webp'
  }
  if (
    bytes.length >= 6 &&
    bytes[0] === 0x47 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x38 &&
    (bytes[4] === 0x37 || bytes[4] === 0x39) &&
    bytes[5] === 0x61
  ) {
    return 'image/gif'
  }
  return null
}

function inferImageMimeTypeFromBase64(value: string): string | null {
  const compact = value.trim().replace(/\s+/gu, '')
  if (compact.length < 32 || !/^[A-Za-z0-9+/]+={0,2}$/u.test(compact)) return null
  try {
    return inferImageMimeTypeFromBytes(Buffer.from(compact.slice(0, 64), 'base64'))
  } catch {
    return null
  }
}

function normalizeBase64ImageDataUrl(value: string, mimeType: string): string | null {
  const trimmed = value.trim()
  if (!trimmed) return null
  if (isInlineDataUrl(trimmed)) {
    return /^data:image\//iu.test(trimmed) ? trimmed : null
  }
  const compact = trimmed.replace(/\s+/gu, '')
  const inferredMimeType = inferImageMimeTypeFromBase64(compact)
  if (!inferredMimeType) return null
  const normalizedMimeType = mimeType.trim().toLowerCase()
  const finalMimeType = normalizedMimeType.startsWith('image/') && normalizedMimeType !== 'image/*'
    ? normalizedMimeType
    : inferredMimeType
  return `data:${finalMimeType};base64,${compact}`
}

function extensionFromMimeType(mimeType: string): string {
  const normalized = mimeType.trim().toLowerCase()
  if (normalized === 'image/png') return '.png'
  if (normalized === 'image/jpeg') return '.jpg'
  if (normalized === 'image/webp') return '.webp'
  if (normalized === 'image/gif') return '.gif'
  if (normalized === 'image/svg+xml') return '.svg'
  if (normalized === 'application/pdf') return '.pdf'
  return ''
}

function asNonEmptyString(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

function toAttachmentLinkTarget(block: Record<string, unknown>, fallback: string): string {
  const candidate = asNonEmptyString(block.path)
    ?? asNonEmptyString(block.file_path)
    ?? asNonEmptyString(block.filename)
    ?? asNonEmptyString(block.file_id)
    ?? fallback
  if (candidate.startsWith('file://')) return candidate
  if (candidate.startsWith('/')) return `file://${candidate}`
  return `attachment://${candidate}`
}

async function persistInlineDataUrlToLocalFile(dataUrl: string, baseName: string): Promise<string | null> {
  const trimmed = dataUrl.trim()
  const match = /^data:([^;,]*)(;base64)?,(.*)$/isu.exec(trimmed)
  if (!match) return null
  const mimeType = (match[1] ?? '').trim().toLowerCase()
  const encodedPayload = match[3] ?? ''
  let bytes: Buffer
  try {
    bytes = match[2]
      ? Buffer.from(encodedPayload, 'base64')
      : Buffer.from(decodeURIComponent(encodedPayload), 'utf8')
  } catch {
    return null
  }
  if (bytes.length === 0) return null

  const hash = createHash('sha1').update(bytes).digest('hex')
  const ext = extensionFromMimeType(mimeType)
  const mediaDir = join(tmpdir(), 'codes-inline-media')
  await mkdir(mediaDir, { recursive: true })
  const fileName = `${baseName}-${hash}${ext}`
  const filePath = join(mediaDir, fileName)
  try {
    await stat(filePath)
  } catch {
    await writeFile(filePath, bytes)
  }
  return filePath
}

function toLocalImageProxyUrl(path: string): string {
  return `/codex-local-image?path=${encodeURIComponent(path)}`
}

const INLINE_IMAGE_FIELD_NAMES = new Set([
  'b64_json',
  'image',
  'image_url',
  'images',
  'result',
  'url',
])

type InlinePayloadSanitizeContext = {
  turnId: string
  itemId: string
  blockIndex: number
  fieldName?: string
}

function isPotentialInlineImageField(fieldName: string | undefined): boolean {
  return typeof fieldName === 'string' && INLINE_IMAGE_FIELD_NAMES.has(fieldName)
}

async function sanitizeInlineImageString(
  value: string,
  context: InlinePayloadSanitizeContext,
): Promise<{ value: string; changed: boolean }> {
  if (!isPotentialInlineImageField(context.fieldName)) {
    return { value, changed: false }
  }

  const dataUrl = normalizeBase64ImageDataUrl(value, 'image/*')
  if (!dataUrl) return { value, changed: false }

  const localUrl = await persistInlineDataUrlToLocalFile(
    dataUrl,
    `inline-image-${context.turnId}-${context.itemId}-${context.fieldName}-${String(context.blockIndex)}`,
  )
  if (!localUrl) return { value, changed: false }

  return { value: toLocalImageProxyUrl(localUrl), changed: true }
}

async function sanitizeInlineUserContentBlock(
  block: unknown,
  context: InlinePayloadSanitizeContext,
): Promise<unknown> {
  const record = asRecord(block)
  if (!record) return block

  const type = asNonEmptyString(record.type) ?? ''
  const imageUrl = asNonEmptyString(record.url) ?? asNonEmptyString(record.image_url)
  if (imageUrl && isInlineDataUrl(imageUrl)) {
    const localUrl = await persistInlineDataUrlToLocalFile(imageUrl, `inline-image-${context.turnId}-${context.itemId}-${String(context.blockIndex)}`)
    if (localUrl) {
      const nextRecord = { ...record }
      if (typeof record.url === 'string') {
        nextRecord.url = toLocalImageProxyUrl(localUrl)
      }
      if (typeof record.image_url === 'string') {
        nextRecord.image_url = toLocalImageProxyUrl(localUrl)
      }
      return {
        ...nextRecord,
        type: 'image',
      }
    }
    const target = toAttachmentLinkTarget(record, `inline-image/${context.turnId}/${context.itemId}/${String(context.blockIndex)}`)
    return {
      type: 'text',
      text: `Image attachment: ${target}`,
    }
  }

  if (type === 'imageGeneration' || type === 'image_generation') {
    const rawResult = asNonEmptyString(record.result)
      ?? asNonEmptyString(record.b64_json)
      ?? asNonEmptyString(record.image)
    const mimeType = asNonEmptyString(record.mime_type)
      ?? asNonEmptyString(record.mimeType)
      ?? 'image/png'
    const dataUrl = rawResult ? normalizeBase64ImageDataUrl(rawResult, mimeType) : null
    if (dataUrl) {
      const localUrl = await persistInlineDataUrlToLocalFile(dataUrl, `generated-image-${context.turnId}-${context.itemId}`)
      if (localUrl) {
        return {
          ...record,
          type: 'imageView',
          path: localUrl,
        }
      }
    }
  }

  const inlineFileData = asNonEmptyString(record.file_data)
    ?? asNonEmptyString(record.data)
    ?? asNonEmptyString(record.base64)
  if ((type.includes('file') || type === 'input_file' || type === 'file') && inlineFileData) {
    const mimeType = asNonEmptyString(record.mime_type) ?? 'application/octet-stream'
    const fileDataUrl = `data:${mimeType};base64,${inlineFileData}`
    const localUrl = await persistInlineDataUrlToLocalFile(fileDataUrl, `inline-file-${context.turnId}-${context.itemId}-${String(context.blockIndex)}`)
    if (localUrl) {
      return {
        type: 'text',
        text: `File attachment: ${localUrl}`,
      }
    }
    const target = toAttachmentLinkTarget(record, `inline-file/${context.turnId}/${context.itemId}/${String(context.blockIndex)}`)
    return {
      type: 'text',
      text: `File attachment: ${target}`,
    }
  }

  return block
}

async function sanitizeInlinePayloadDeep(
  value: unknown,
  context: InlinePayloadSanitizeContext,
): Promise<{ value: unknown; changed: boolean }> {
  const maybeBlock = await sanitizeInlineUserContentBlock(value, context)
  if (maybeBlock !== value) {
    return { value: maybeBlock, changed: true }
  }

  if (typeof value === 'string') {
    return sanitizeInlineImageString(value, context)
  }

  if (Array.isArray(value)) {
    let changed = false
    const nextArray: unknown[] = []
    for (let index = 0; index < value.length; index += 1) {
      const nested = await sanitizeInlinePayloadDeep(value[index], {
        turnId: context.turnId,
        itemId: context.itemId,
        blockIndex: index,
        fieldName: context.fieldName,
      })
      if (nested.changed) changed = true
      nextArray.push(nested.value)
    }
    return changed ? { value: nextArray, changed: true } : { value, changed: false }
  }

  const record = asRecord(value)
  if (!record) return { value, changed: false }

  let changed = false
  const nextRecord: Record<string, unknown> = {}
  for (const [key, nestedValue] of Object.entries(record)) {
    const nested = await sanitizeInlinePayloadDeep(nestedValue, {
      turnId: context.turnId,
      itemId: context.itemId,
      blockIndex: context.blockIndex,
      fieldName: key,
    })
    if (nested.changed) changed = true
    nextRecord[key] = nested.value
  }

  return changed ? { value: nextRecord, changed: true } : { value, changed: false }
}

export async function sanitizeThreadTurnsInlinePayloads(method: string, result: unknown): Promise<unknown> {
  if (!THREAD_METHODS_WITH_TURNS.has(method)) return result

  const record = asRecord(result)
  const thread = asRecord(record?.thread)
  const turns = Array.isArray(thread?.turns) ? thread.turns : null
  if (!record || !thread || !turns || turns.length === 0) return result

  let changed = false
  const nextTurns: unknown[] = []
  for (let turnIndex = 0; turnIndex < turns.length; turnIndex += 1) {
    const turn = turns[turnIndex]
    const turnRecord = asRecord(turn)
    const turnId = asNonEmptyString(turnRecord?.id) ?? 'turn'
    const items = Array.isArray(turnRecord?.items) ? turnRecord.items : null
    if (!turnRecord || !items) {
      nextTurns.push(turn)
      continue
    }

    let itemChanged = false
    const nextItems: unknown[] = []
    for (let itemIndex = 0; itemIndex < items.length; itemIndex += 1) {
      const item = items[itemIndex]
      const itemRecord = asRecord(item)
      const itemId = asNonEmptyString(itemRecord?.id) ?? 'item'
      if (!itemRecord) {
        nextItems.push(item)
        continue
      }
      const sanitizedItem = await sanitizeInlinePayloadDeep(item, {
        turnId,
        itemId,
        blockIndex: itemIndex + turnIndex,
      })
      if (!sanitizedItem.changed) {
        nextItems.push(item)
        continue
      }
      itemChanged = true
      nextItems.push(sanitizedItem.value)
    }

    if (!itemChanged) {
      nextTurns.push(turn)
      continue
    }
    changed = true
    nextTurns.push({
      ...turnRecord,
      items: nextItems,
    })
  }

  if (!changed) return result
  return {
    ...record,
    thread: {
      ...thread,
      turns: nextTurns,
    },
  }
}

function trimThreadTurnsInRpcResult(method: string, result: unknown): unknown {
  if (!THREAD_METHODS_WITH_TURNS.has(method)) return result

  const record = asRecord(result)
  const thread = asRecord(record?.thread)
  const turns = Array.isArray(thread?.turns) ? thread.turns : null
  if (!record || !thread || !turns || turns.length <= THREAD_RESPONSE_TURN_LIMIT) return result
  const startTurnIndex = Math.max(0, turns.length - THREAD_RESPONSE_TURN_LIMIT)

  return {
    ...record,
    threadTurnStartIndex: startTurnIndex,
    thread: {
      ...thread,
      turns: turns.slice(startTurnIndex),
    },
  }
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

export function isUnauthenticatedRateLimitError(error: unknown): boolean {
  const message = getErrorMessage(error, '').toLowerCase()
  return message.includes('authentication required') && message.includes('rate limits')
}

export function isEmptyThreadReadError(error: unknown): boolean {
  const message = getErrorMessage(error, '').toLowerCase()
  return message.includes('failed to read thread') && message.includes('rollout') && message.includes('is empty')
}

const warnedCodexAuthReadFailures = new Set<string>()

function getErrorCode(error: unknown): string | null {
  return typeof error === 'object' && error !== null && 'code' in error
    ? String((error as { code?: unknown }).code ?? '')
    : null
}

function getCodexAuthReadErrorMessage(error: unknown): string {
  return error instanceof Error && error.message.trim().length > 0
    ? error.message
    : String(error)
}

function warnCodexAuthReadFailure(authPath: string, error: unknown): void {
  const message = getCodexAuthReadErrorMessage(error)
  const warningKey = `${authPath}:${message}`
  if (warnedCodexAuthReadFailures.has(warningKey)) return
  warnedCodexAuthReadFailures.add(warningKey)
  console.warn('[codex-auth] Unable to read Codex auth state', { path: authPath, error: message })
}

export async function hasUsableCodexAuth(): Promise<boolean> {
  const authPath = getCodexAuthPath()
  try {
    const raw = await readFile(authPath, 'utf8')
    const auth = JSON.parse(raw) as CodexAuth
    return Boolean(auth.tokens?.access_token?.trim() || auth.tokens?.refresh_token?.trim())
  } catch (error) {
    if (getErrorCode(error) !== 'ENOENT') {
      warnCodexAuthReadFailure(authPath, error)
    }
    return false
  }
}

function setJson(res: ServerResponse, statusCode: number, payload: unknown): void {
  res.statusCode = statusCode
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.end(JSON.stringify(payload))
}

function logProviderModelDiscoveryWarning(message: string, details: Record<string, unknown>): void {
  console.warn('[codex-provider-models]', message, details)
}

function isTimeoutError(payload: unknown): boolean {
  return payload instanceof Error && (payload.name === 'AbortError' || payload.name === 'TimeoutError')
}

function formatProjectlessDateSegment(date = new Date()): string {
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${date.getFullYear()}-${month}-${day}`
}

function buildProjectlessPromptSlug(prompt: string | null): string {
  const slug = prompt
    ?.toLowerCase()
    .match(/[a-z0-9]+/g)
    ?.slice(0, 6)
    .join('-')
    .slice(0, PROJECTLESS_THREAD_SLUG_MAX_LENGTH)
  return slug && slug.length > 0 ? slug : 'new-chat'
}

async function ensureRealDirectory(path: string, label: string): Promise<void> {
  const info = await lstat(path)
  if (info.isSymbolicLink() || !info.isDirectory()) {
    throw new Error(`${label} must be a real directory`)
  }
}

async function createProjectlessThreadDirectory(prompt: string | null): Promise<{ cwd: string; outputDirectory: string; workspaceRoot: string }> {
  const workspaceRoot = join(homedir(), 'Documents', 'Codex')
  await mkdir(workspaceRoot, { recursive: true })
  await ensureRealDirectory(workspaceRoot, 'Projectless workspace root')

  const dateDir = join(workspaceRoot, formatProjectlessDateSegment())
  await mkdir(dateDir, { recursive: true })
  await ensureRealDirectory(dateDir, 'Projectless thread date directory')

  const slug = buildProjectlessPromptSlug(prompt)
  for (let index = 0; index < PROJECTLESS_THREAD_DIRECTORY_MAX_ATTEMPTS; index += 1) {
    const folderName = index === 0 ? slug : `${slug}-${index + 1}`
    const cwd = join(dateDir, folderName)
    try {
      await mkdir(cwd, { recursive: false })
      return { cwd, outputDirectory: cwd, workspaceRoot }
    } catch {
      try {
        await stat(cwd)
      } catch {
        throw new Error('Failed to create new chat folder')
      }
    }
  }

  throw new Error('Unable to create a unique new chat folder')
}

function normalizeGithubCloneUrl(rawUrl: string): { url: string; repoName: string } {
  const trimmedUrl = rawUrl.trim()
  if (!trimmedUrl) throw new Error('Missing GitHub repository URL')

  const sshMatch = trimmedUrl.match(/^git@github\.com:([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+?)(?:\.git)?$/u)
  if (sshMatch) {
    const repoName = sshMatch[2]
    return { url: `git@github.com:${sshMatch[1]}/${repoName}.git`, repoName }
  }

  let parsed: URL
  try {
    parsed = new URL(trimmedUrl)
  } catch {
    throw new Error('Enter a valid GitHub repository URL')
  }
  if (parsed.hostname.toLowerCase() !== 'github.com') {
    throw new Error('Only github.com repository URLs are supported')
  }
  const segments = parsed.pathname.split('/').filter(Boolean)
  if (segments.length < 2) {
    throw new Error('Enter a GitHub repository URL with owner and repository name')
  }
  const owner = segments[0]
  const repoName = segments[1].replace(/\.git$/iu, '')
  if (!/^[A-Za-z0-9_.-]+$/u.test(owner) || !/^[A-Za-z0-9_.-]+$/u.test(repoName)) {
    throw new Error('GitHub repository owner or name contains unsupported characters')
  }
  return { url: `https://github.com/${owner}/${repoName}.git`, repoName }
}

async function cloneGithubRepositoryIntoBase(rawUrl: string, rawBasePath: string): Promise<string> {
  const basePath = rawBasePath.trim()
  if (!basePath) throw new Error('Missing clone destination folder')
  const normalizedBasePath = isAbsolute(basePath) ? basePath : resolve(basePath)
  await ensureRealDirectory(normalizedBasePath, 'Clone destination folder')

  const { url, repoName } = normalizeGithubCloneUrl(rawUrl)
  const targetPath = join(normalizedBasePath, repoName)
  try {
    await stat(targetPath)
    throw new Error(`Destination already exists: ${targetPath}`)
  } catch (error) {
    if ((error as NodeJS.ErrnoException)?.code !== 'ENOENT') throw error
  }

  try {
    await runCommand('git', ['clone', url, targetPath], { cwd: normalizedBasePath, timeoutMs: 5 * 60_000 })
  } catch (error) {
    await rm(targetPath, { recursive: true, force: true }).catch(() => undefined)
    throw error
  }
  await persistWorkspaceRoot(targetPath, '')
  return targetPath
}

function normalizeHeaderValue(value: unknown): string | null {
  if (typeof value === 'string') {
    const trimmed = value.trim()
    return trimmed.length > 0 ? trimmed : null
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value)
  }
  return null
}

function normalizeQueryParams(value: unknown): URLSearchParams {
  const params = new URLSearchParams()
  const record = asRecord(value)
  if (!record) return params

  for (const [key, rawValue] of Object.entries(record)) {
    const normalized = normalizeHeaderValue(rawValue)
    if (!normalized) continue
    params.set(key, normalized)
  }

  return params
}

function buildProviderModelsUrl(baseUrl: string, queryParams: unknown): URL {
  const url = new URL(baseUrl)
  url.pathname = url.pathname.endsWith('/') ? `${url.pathname}models` : `${url.pathname}/models`
  const extraParams = normalizeQueryParams(queryParams)
  for (const [key, value] of extraParams.entries()) {
    url.searchParams.set(key, value)
  }
  return url
}

function normalizeProviderModelsData(payload: unknown): string[] {
  const record = asRecord(payload)
  const rows = Array.isArray(record?.data) ? record.data : null
  if (!rows) {
    throw new Error('provider /models payload is missing a data array')
  }

  const ids: string[] = []
  for (const row of rows) {
    const entry = asRecord(row)
    const candidate = readNonEmptyString(entry?.id)
    if (!candidate || ids.includes(candidate)) continue
    ids.push(candidate)
  }
  return ids
}

async function readCodexBackedModelIds(appServer: AppServerProcess): Promise<string[]> {
  const payload = asRecord(await appServer.rpc('model/list', {}))
  const rows = Array.isArray(payload?.data) ? payload.data : []
  const ids: string[] = []
  for (const row of rows) {
    const record = asRecord(row)
    const candidate = readNonEmptyString(record?.id) || readNonEmptyString(record?.model)
    if (!candidate || ids.includes(candidate)) continue
    ids.push(candidate)
  }
  return ids
}

async function readProviderBackedModelIds(appServer: AppServerProcess): Promise<ProviderModelsResponse> {
  const configPayload = asRecord(await appServer.rpc('config/read', {}))
  const config = asRecord(configPayload?.config)
  const providerId = readNonEmptyString(config?.model_provider)
  if (!providerId) {
    return { data: [], providerId: '', source: 'provider' }
  }

  const providers = asRecord(config?.model_providers)
  const provider = asRecord(providers?.[providerId])
  if (!provider) {
    logProviderModelDiscoveryWarning('configured provider is missing from model_providers', { providerId })
    return { data: [], providerId, source: 'provider' }
  }

  const wireApi = readNonEmptyString(provider.wire_api)
  if (wireApi !== 'responses') {
    return { data: [], providerId, source: 'provider' }
  }

  const baseUrl = readNonEmptyString(provider.base_url)
  if (!baseUrl) {
    logProviderModelDiscoveryWarning('responses provider is missing base_url', { providerId })
    return { data: [], providerId, source: 'provider' }
  }

  const headers = new Headers()
  const configuredHeaders = asRecord(provider.http_headers)
  if (configuredHeaders) {
    for (const [key, rawValue] of Object.entries(configuredHeaders)) {
      const normalized = normalizeHeaderValue(rawValue)
      if (!normalized) continue
      headers.set(key, normalized)
    }
  }

  const bearerToken = readNonEmptyString(provider.experimental_bearer_token)
  if (bearerToken && !headers.has('Authorization')) {
    headers.set('Authorization', `Bearer ${bearerToken}`)
  }

  const envKey = readNonEmptyString(provider.env_key)
  const envHttpHeaders = asRecord(provider.env_http_headers)
  if (envKey || envHttpHeaders) {
    logProviderModelDiscoveryWarning('provider discovery skipped env-backed auth/header expansion', {
      providerId,
      hasEnvKey: Boolean(envKey),
      hasEnvHttpHeaders: Boolean(envHttpHeaders),
    })
  }

  let requestUrl: URL
  try {
    requestUrl = buildProviderModelsUrl(baseUrl, provider.query_params)
  } catch (error) {
    logProviderModelDiscoveryWarning('provider /models URL was invalid', {
      providerId,
      error: getErrorMessage(error, 'invalid url'),
    })
    return { data: [], providerId, source: 'provider' }
  }

  let response: Response
  try {
    response = await fetch(requestUrl, {
      method: 'GET',
      headers,
      signal: AbortSignal.timeout(PROVIDER_MODELS_FETCH_TIMEOUT_MS),
    })
  } catch (error) {
    logProviderModelDiscoveryWarning('provider /models request failed', {
      providerId,
      error: isTimeoutError(error) ? `request timed out after ${PROVIDER_MODELS_FETCH_TIMEOUT_MS}ms` : getErrorMessage(error, 'network error'),
    })
    return { data: [], providerId, source: 'provider' }
  }

  let payload: unknown = null
  try {
    payload = await response.json()
  } catch (error) {
    logProviderModelDiscoveryWarning('provider /models response was not valid JSON', {
      providerId,
      status: response.status,
      error: getErrorMessage(error, 'invalid json'),
    })
    return { data: [], providerId, source: 'provider' }
  }

  if (!response.ok) {
    logProviderModelDiscoveryWarning('provider /models request returned non-2xx', {
      providerId,
      status: response.status,
      statusText: response.statusText,
    })
    return { data: [], providerId, source: 'provider' }
  }

  try {
    return {
      data: normalizeProviderModelsData(payload),
      providerId,
      source: 'provider',
    }
  } catch (error) {
    logProviderModelDiscoveryWarning('provider /models payload was invalid', {
      providerId,
      error: getErrorMessage(error, 'invalid payload'),
    })
    return { data: [], providerId, source: 'provider' }
  }
}

function extractThreadMessageText(threadReadPayload: unknown): string {
  const payload = asRecord(threadReadPayload)
  const thread = asRecord(payload?.thread)
  const turns = Array.isArray(thread?.turns) ? thread.turns : []
  const parts: string[] = []

  for (const turn of turns) {
    const turnRecord = asRecord(turn)
    const items = Array.isArray(turnRecord?.items) ? turnRecord.items : []
    for (const item of items) {
      const itemRecord = asRecord(item)
      const type = typeof itemRecord?.type === 'string' ? itemRecord.type : ''
      if (type === 'agentMessage' && typeof itemRecord?.text === 'string' && itemRecord.text.trim().length > 0) {
        parts.push(itemRecord.text.trim())
        continue
      }
      if (type === 'userMessage') {
        const content = Array.isArray(itemRecord?.content) ? itemRecord.content : []
        for (const block of content) {
          const blockRecord = asRecord(block)
          if (blockRecord?.type === 'text' && typeof blockRecord.text === 'string' && blockRecord.text.trim().length > 0) {
            parts.push(blockRecord.text.trim())
          }
        }
        continue
      }
      if (type === 'commandExecution') {
        const command = typeof itemRecord?.command === 'string' ? itemRecord.command.trim() : ''
        const output = typeof itemRecord?.aggregatedOutput === 'string' ? itemRecord.aggregatedOutput.trim() : ''
        if (command) parts.push(command)
        if (output) parts.push(output)
      }
    }
  }

  return parts.join('\n').trim()
}

function readNonEmptyString(value: unknown): string {
  return typeof value === 'string' && value.trim().length > 0 ? value : ''
}

function readThreadArchiveFallbackName(threadReadResult: unknown): string {
  const record = asRecord(threadReadResult)
  const thread = asRecord(record?.thread)
  return (
    readNonEmptyString(thread?.name)
    || readNonEmptyString(thread?.title)
    || readNonEmptyString(thread?.preview)
    || 'Untitled thread'
  )
}

function isArchivedThreadReadResult(threadReadResult: unknown): boolean {
  const record = asRecord(threadReadResult)
  const thread = asRecord(record?.thread)
  const sessionPath = readNonEmptyString(thread?.path)
  return sessionPath.split(/[\\/]+/u).includes('archived_sessions')
}

export async function callRpcWithArchiveRecovery(
  appServer: RpcExecutor,
  method: string,
  params: unknown,
): Promise<unknown> {
  try {
    return await appServer.rpc(method, params ?? null)
  } catch (error) {
    if (method !== 'thread/archive') {
      throw error
    }

    const paramsRecord = asRecord(params)
    const threadId = readNonEmptyString(paramsRecord?.threadId)
    const errorMessage = getErrorMessage(error, '')
    if (!threadId || !errorMessage.includes('no rollout found')) {
      throw error
    }

    let threadReadResult: unknown = null
    try {
      threadReadResult = await appServer.rpc('thread/read', {
        threadId,
        includeTurns: false,
      })
      if (isArchivedThreadReadResult(threadReadResult)) {
        return null
      }
    } catch {
      // If metadata cannot be read, still try materializing a title before retrying archive.
    }

    await appServer.rpc('thread/name/set', {
      threadId,
      name: readThreadArchiveFallbackName(threadReadResult),
    })
    return appServer.rpc(method, params ?? null)
  }
}

type TerminalQuickCommand = {
  label: string
  value: string
  source: 'package' | 'script' | 'make'
}

async function listTerminalQuickCommands(cwd: string): Promise<TerminalQuickCommand[]> {
  const normalizedCwd = isAbsolute(cwd) ? cwd : resolve(cwd)
  const info = await stat(normalizedCwd)
  if (!info.isDirectory()) {
    throw new Error('Terminal cwd is not a directory')
  }

  const commands: TerminalQuickCommand[] = []
  const seen = new Set<string>()
  const addCommand = (command: TerminalQuickCommand) => {
    if (!command.value || seen.has(command.value)) return
    seen.add(command.value)
    commands.push(command)
  }

  await addPackageJsonCommands(normalizedCwd, addCommand)
  await addMakefileCommands(normalizedCwd, addCommand)
  await addRootScriptCommands(normalizedCwd, addCommand)
  await addScriptsDirectoryCommands(normalizedCwd, addCommand)
  return commands
}

async function addPackageJsonCommands(
  cwd: string,
  addCommand: (command: TerminalQuickCommand) => void,
): Promise<void> {
  try {
    const raw = await readFile(join(cwd, 'package.json'), 'utf8')
    const parsed = JSON.parse(raw) as unknown
    const record = asRecord(parsed)
    const scripts = asRecord(record?.scripts)
    if (!scripts) return
    const packageManager = resolvePackageManager(cwd)
    for (const scriptName of Object.keys(scripts)) {
      if (typeof scripts[scriptName] !== 'string') continue
      const value = formatPackageScriptCommand(packageManager, scriptName)
      addCommand({
        label: value,
        value,
        source: 'package',
      })
    }
  } catch {
    // A project without package.json simply has no package quick commands.
  }
}

async function addMakefileCommands(
  cwd: string,
  addCommand: (command: TerminalQuickCommand) => void,
): Promise<void> {
  const makefilePath = existsSync(join(cwd, 'Makefile'))
    ? join(cwd, 'Makefile')
    : existsSync(join(cwd, 'makefile'))
      ? join(cwd, 'makefile')
      : ''
  if (!makefilePath) return

  try {
    const raw = await readFile(makefilePath, 'utf8')
    for (const line of raw.split(/\r?\n/)) {
      const match = /^([A-Za-z0-9_.@%/+~-][A-Za-z0-9_.@%/+~-]*)\s*:(?![=])/.exec(line)
      if (!match) continue
      const target = match[1]
      if (!target || target.startsWith('.')) continue
      const value = `make ${quoteShellTokenIfNeeded(target)}`
      addCommand({
        label: value,
        value,
        source: 'make',
      })
    }
  } catch {
    // Ignore unreadable Makefiles for quick-command discovery.
  }
}

async function addRootScriptCommands(
  cwd: string,
  addCommand: (command: TerminalQuickCommand) => void,
): Promise<void> {
  await addScriptFileCommands(cwd, '.', addCommand)
}

async function addScriptsDirectoryCommands(
  cwd: string,
  addCommand: (command: TerminalQuickCommand) => void,
): Promise<void> {
  await addScriptFileCommands(join(cwd, 'scripts'), './scripts', addCommand)
}

async function addScriptFileCommands(
  directory: string,
  commandPrefix: string,
  addCommand: (command: TerminalQuickCommand) => void,
): Promise<void> {
  try {
    const entries = await readdir(directory, { withFileTypes: true })
    for (const entry of entries) {
      if (!entry.isFile()) continue
      if (!entry.name.endsWith('.sh') && !entry.name.endsWith('.cmd')) continue
      const value = `${commandPrefix}/${quoteShellTokenIfNeeded(entry.name)}`
      addCommand({
        label: value,
        value,
        source: 'script',
      })
    }
  } catch {
    // A project without script files simply has no script-file quick commands.
  }
}

function resolvePackageManager(cwd: string): 'npm' | 'pnpm' | 'yarn' | 'bun' {
  if (existsSync(join(cwd, 'pnpm-lock.yaml'))) return 'pnpm'
  if (existsSync(join(cwd, 'yarn.lock'))) return 'yarn'
  if (existsSync(join(cwd, 'bun.lock')) || existsSync(join(cwd, 'bun.lockb'))) return 'bun'
  return 'npm'
}

function formatPackageScriptCommand(packageManager: 'npm' | 'pnpm' | 'yarn' | 'bun', scriptName: string): string {
  const quoted = quoteShellTokenIfNeeded(scriptName)
  if (packageManager === 'npm') return `npm run ${quoted}`
  if (packageManager === 'pnpm') return `pnpm run ${quoted}`
  if (packageManager === 'bun') return `bun run ${quoted}`
  return `yarn ${quoted}`
}

function quoteShellTokenIfNeeded(value: string): string {
  return /^[A-Za-z0-9_./:@-]+$/.test(value) ? value : `'${value.replace(/'/g, `'\\''`)}'`
}

function readBoolean(value: unknown): boolean {
  return value === true
}

function readNumber(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0
}

function countRecoveredContentLines(value: string): number {
  if (!value) return 0
  const normalized = value.replace(/\r\n/g, '\n')
  const trimmed = normalized.endsWith('\n') ? normalized.slice(0, -1) : normalized
  if (!trimmed) return 0
  return trimmed.split('\n').length
}

function countRecoveredPatchLines(value: string): { addedLineCount: number; removedLineCount: number } {
  let addedLineCount = 0
  let removedLineCount = 0

  for (const line of value.replace(/\r\n/g, '\n').split('\n')) {
    if (!line) continue
    if (line.startsWith('+++') || line.startsWith('---') || line.startsWith('@@')) continue
    if (line.startsWith('+')) {
      addedLineCount += 1
      continue
    }
    if (line.startsWith('-')) {
      removedLineCount += 1
    }
  }

  return { addedLineCount, removedLineCount }
}

function mergeRecoveredDiff(first: string, second: string): string {
  if (!first) return second
  if (!second || first === second) return first
  return `${first}\n${second}`.trim()
}

function mergeRecoveredFileChange(first: SessionRecoveredFileChange, second: SessionRecoveredFileChange): SessionRecoveredFileChange {
  const operation = first.operation === 'add' || second.operation === 'add'
    ? 'add'
    : first.operation === 'delete' || second.operation === 'delete'
      ? 'delete'
      : 'update'

  return {
    path: second.path || first.path,
    operation,
    movedToPath: second.movedToPath ?? first.movedToPath ?? null,
    diff: mergeRecoveredDiff(first.diff, second.diff),
    addedLineCount: first.addedLineCount + second.addedLineCount,
    removedLineCount: first.removedLineCount + second.removedLineCount,
  }
}

function isApplyPatchSectionBoundary(value: string): boolean {
  return value.startsWith('*** Update File: ')
    || value.startsWith('*** Add File: ')
    || value.startsWith('*** Delete File: ')
    || value === '*** End Patch'
}

function parseApplyPatchInput(input: string): SessionRecoveredFileChange[] {
  const normalized = input.replace(/\r\n/g, '\n')
  const lines = normalized.split('\n')
  const changes: SessionRecoveredFileChange[] = []

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] ?? ''

    if (line.startsWith('*** Add File: ')) {
      const path = line.slice('*** Add File: '.length).trim()
      const contentLines: string[] = []
      for (index += 1; index < lines.length; index += 1) {
        const nextLine = lines[index] ?? ''
        if (isApplyPatchSectionBoundary(nextLine)) {
          index -= 1
          break
        }
        contentLines.push(nextLine.startsWith('+') ? nextLine.slice(1) : nextLine)
      }
      const diff = contentLines.join('\n').trimEnd()
      if (path) {
        changes.push({
          path,
          operation: 'add',
          movedToPath: null,
          diff,
          addedLineCount: countRecoveredContentLines(diff),
          removedLineCount: 0,
        })
      }
      continue
    }

    if (line.startsWith('*** Delete File: ')) {
      const path = line.slice('*** Delete File: '.length).trim()
      if (path) {
        changes.push({
          path,
          operation: 'delete',
          movedToPath: null,
          diff: '',
          addedLineCount: 0,
          removedLineCount: 0,
        })
      }
      continue
    }

    if (line.startsWith('*** Update File: ')) {
      const path = line.slice('*** Update File: '.length).trim()
      let movedToPath: string | null = null
      const diffLines: string[] = []

      for (index += 1; index < lines.length; index += 1) {
        const nextLine = lines[index] ?? ''
        if (nextLine.startsWith('*** Move to: ')) {
          const moved = nextLine.slice('*** Move to: '.length).trim()
          movedToPath = moved || null
          continue
        }
        if (isApplyPatchSectionBoundary(nextLine)) {
          index -= 1
          break
        }
        diffLines.push(nextLine)
      }

      const diff = diffLines.join('\n').trimEnd()
      const counts = countRecoveredPatchLines(diff)
      if (path) {
        changes.push({
          path,
          operation: 'update',
          movedToPath,
          diff,
          ...counts,
        })
      }
    }
  }

  return changes
}

function buildSessionFileChangeFallback(threadReadPayload: unknown, sessionLogRaw: string): SessionRecoveredTurnFileChanges[] {
  const payload = asRecord(threadReadPayload)
  const thread = asRecord(payload?.thread)
  const turns = Array.isArray(thread?.turns) ? thread.turns : []
  const turnIndexById = new Map<string, number>()

  for (let turnIndex = 0; turnIndex < turns.length; turnIndex += 1) {
    const turnRecord = asRecord(turns[turnIndex])
    const turnId = readNonEmptyString(turnRecord?.id)
    if (turnId) {
      turnIndexById.set(turnId, turnIndex)
    }
  }

  const collectedByTurnId = new Map<string, SessionRecoveredFileChange[]>()
  let currentTurnId = ''

  for (const line of sessionLogRaw.split('\n')) {
    if (!line.trim()) continue
    let row: Record<string, unknown> | null = null
    try {
      row = JSON.parse(line) as Record<string, unknown>
    } catch {
      continue
    }

    if (row.type === 'turn_context') {
      const payloadRecord = asRecord(row.payload)
      currentTurnId = readNonEmptyString(payloadRecord?.turn_id) || currentTurnId
      continue
    }

    if (row.type !== 'response_item' || !currentTurnId || !turnIndexById.has(currentTurnId)) {
      continue
    }

    const payloadRecord = asRecord(row.payload)
    if (
      payloadRecord?.type !== 'custom_tool_call'
      || payloadRecord.name !== 'apply_patch'
      || payloadRecord.status !== 'completed'
    ) {
      continue
    }

    const input = readNonEmptyString(payloadRecord.input)
    if (!input) continue

    const parsedChanges = parseApplyPatchInput(input)
    if (parsedChanges.length === 0) continue

    const previous = collectedByTurnId.get(currentTurnId) ?? []
    previous.push(...parsedChanges)
    collectedByTurnId.set(currentTurnId, previous)
  }

  const recovered: SessionRecoveredTurnFileChanges[] = []
  for (const [turnId, fileChanges] of collectedByTurnId.entries()) {
    const turnIndex = turnIndexById.get(turnId)
    if (typeof turnIndex !== 'number' || fileChanges.length === 0) continue

    const mergedByPath = new Map<string, SessionRecoveredFileChange>()
    for (const fileChange of fileChanges) {
      const key = `${fileChange.path}\u0000${fileChange.movedToPath ?? ''}`
      const previous = mergedByPath.get(key)
      mergedByPath.set(key, previous ? mergeRecoveredFileChange(previous, fileChange) : { ...fileChange })
    }

    recovered.push({
      turnId,
      turnIndex,
      fileChanges: Array.from(mergedByPath.values()),
    })
  }

  return recovered.sort((first, second) => first.turnIndex - second.turnIndex)
}

type SessionRecoveredCommand = {
  id: string
  type: 'commandExecution'
  command: string
  cwd: string | null
  status: 'completed' | 'failed'
  aggregatedOutput: string
  exitCode: number | null
  durationMs: number | null
}

function parseExecCommandOutput(output: string): { exitCode: number | null; wallTime: number | null; cleanOutput: string } {
  let exitCode: number | null = null
  let wallTime: number | null = null
  const outputLines: string[] = []
  let pastHeader = false

  for (const line of output.split('\n')) {
    if (!pastHeader) {
      const exitMatch = line.match(/^Process exited with code (\d+)/)
      if (exitMatch) {
        exitCode = Number.parseInt(exitMatch[1]!, 10)
        continue
      }
      const wallMatch = line.match(/^Wall time:\s+([\d.]+)\s+seconds/)
      if (wallMatch) {
        wallTime = Math.round(Number.parseFloat(wallMatch[1]!) * 1000)
        continue
      }
      if (line.startsWith('Command:') || line.startsWith('Chunk ID:') || line.startsWith('Original token count:')) {
        continue
      }
      if (line === 'Output:') {
        pastHeader = true
        continue
      }
    }
    outputLines.push(line)
  }

  return { exitCode, wallTime, cleanOutput: outputLines.join('\n').trimEnd() }
}

type SessionRecoveredFileChangeItem = {
  id: string
  type: 'fileChange'
  status: 'completed'
  changes: Record<string, unknown>[]
}

type SessionItemSlot = {
  type: 'agentMessage' | 'commandExecution' | 'fileChange'
  command?: SessionRecoveredCommand
  fileChange?: SessionRecoveredFileChangeItem
}

function buildSessionItemOrder(sessionLogRaw: string, turnIds: Set<string>): Map<string, SessionItemSlot[]> {
  let currentTurnId = ''
  const orderByTurnId = new Map<string, SessionItemSlot[]>()
  const callIdToCommand = new Map<string, SessionRecoveredCommand>()

  for (const line of sessionLogRaw.split('\n')) {
    if (!line.trim()) continue
    let row: Record<string, unknown> | null = null
    try {
      row = JSON.parse(line) as Record<string, unknown>
    } catch {
      continue
    }

    if (row.type === 'turn_context') {
      const p = asRecord(row.payload)
      currentTurnId = readNonEmptyString(p?.turn_id) || currentTurnId
      continue
    }
    if (row.type === 'event_msg') {
      const p = asRecord(row.payload)
      if (p?.type === 'task_started') {
        currentTurnId = readNonEmptyString(p.turn_id) || currentTurnId
      }
      continue
    }

    if (row.type !== 'response_item' || !currentTurnId || !turnIds.has(currentTurnId)) continue
    const payload = asRecord(row.payload)
    if (!payload) continue

    let slots = orderByTurnId.get(currentTurnId)
    if (!slots) {
      slots = []
      orderByTurnId.set(currentTurnId, slots)
    }

    if (payload.type === 'message' && payload.role === 'assistant') {
      slots.push({ type: 'agentMessage' })
      continue
    }

    if (payload.type === 'function_call' && payload.name === 'exec_command') {
      const callId = readNonEmptyString(payload.call_id)
      if (!callId) continue
      let cmd = ''
      try {
        const args = JSON.parse(payload.arguments as string) as Record<string, unknown>
        cmd = typeof args.cmd === 'string' ? args.cmd : ''
      } catch { /* empty */ }
      const command: SessionRecoveredCommand = {
        id: `session-cmd-${callId}`,
        type: 'commandExecution',
        command: cmd,
        cwd: null,
        status: 'completed',
        aggregatedOutput: '',
        exitCode: null,
        durationMs: null,
      }
      callIdToCommand.set(callId, command)
      slots.push({ type: 'commandExecution', command })
      continue
    }

    if (payload.type === 'function_call_output') {
      const callId = readNonEmptyString(payload.call_id)
      if (!callId) continue
      const existing = callIdToCommand.get(callId)
      if (!existing) continue
      const rawOutput = typeof payload.output === 'string' ? payload.output : ''
      const parsed = parseExecCommandOutput(rawOutput)
      existing.aggregatedOutput = parsed.cleanOutput
      existing.exitCode = parsed.exitCode
      existing.durationMs = parsed.wallTime
      existing.status = parsed.exitCode === 0 || parsed.exitCode === null ? 'completed' : 'failed'
    }

    if (payload.type === 'custom_tool_call' && payload.name === 'apply_patch' && payload.status === 'completed') {
      const input = typeof payload.input === 'string' ? payload.input : ''
      const callId = readNonEmptyString(payload.call_id)
      if (!input || !callId) continue
      const parsedChanges = parseApplyPatchInput(input)
      if (parsedChanges.length === 0) continue
      const fcItem: SessionRecoveredFileChangeItem = {
        id: `session-fc-${callId}`,
        type: 'fileChange',
        status: 'completed',
        changes: parsedChanges.map((fc) => ({
          ...fc,
          kind: { type: fc.operation, ...(fc.movedToPath ? { move_path: fc.movedToPath } : {}) },
        })),
      }
      slots.push({ type: 'fileChange', fileChange: fcItem })
    }
  }

  return orderByTurnId
}

function extractFilePathsFromCommand(cmd: string, cwd: string): string[] {
  const paths: string[] = []
  const absPathPattern = /(?:^|\s|>>|>|<)(\/?(?:Users|home|tmp|var|etc|root)\/[^\s;|&><"']+)/g
  let match: RegExpExecArray | null
  while ((match = absPathPattern.exec(cmd)) !== null) {
    const p = match[1]?.trim()
    if (p && !p.endsWith('/') && !p.startsWith('-')) paths.push(p)
  }

  const redirectPattern = /(?:>>?|cat\s*>\s*)([^\s;|&><"']+)/g
  while ((match = redirectPattern.exec(cmd)) !== null) {
    const p = match[1]?.trim()
    if (p && !p.startsWith('-') && !p.startsWith('/dev/')) {
      paths.push(isAbsolute(p) ? p : join(cwd, p))
    }
  }

  return [...new Set(paths)]
}

type CollectedTurnFileInfo = {
  patchInputs: { callId: string; input: string }[]
  commandFilePaths: string[]
}

function collectFileChangesForTurns(
  sessionLogRaw: string,
  turnIdsToRevert: Set<string>,
  cwd: string,
): Map<string, CollectedTurnFileInfo> {
  let currentTurnId = ''
  const infoByTurnId = new Map<string, CollectedTurnFileInfo>()

  for (const line of sessionLogRaw.split('\n')) {
    if (!line.trim()) continue
    let row: Record<string, unknown> | null = null
    try {
      row = JSON.parse(line) as Record<string, unknown>
    } catch {
      continue
    }

    if (row.type === 'turn_context') {
      const p = asRecord(row.payload)
      currentTurnId = readNonEmptyString(p?.turn_id) || currentTurnId
      continue
    }
    if (row.type === 'event_msg') {
      const p = asRecord(row.payload)
      if (p?.type === 'task_started') {
        currentTurnId = readNonEmptyString(p.turn_id) || currentTurnId
      }
      continue
    }

    if (row.type !== 'response_item' || !currentTurnId || !turnIdsToRevert.has(currentTurnId)) continue
    const payload = asRecord(row.payload)
    if (!payload) continue

    let info = infoByTurnId.get(currentTurnId)
    if (!info) {
      info = { patchInputs: [], commandFilePaths: [] }
      infoByTurnId.set(currentTurnId, info)
    }

    if (payload.type === 'custom_tool_call' && payload.name === 'apply_patch' && payload.status === 'completed') {
      const input = typeof payload.input === 'string' ? payload.input : ''
      const callId = readNonEmptyString(payload.call_id)
      if (input && callId) {
        info.patchInputs.push({ callId, input })
      }
    }

    if (payload.type === 'function_call' && payload.name === 'exec_command') {
      let cmd = ''
      try {
        const args = JSON.parse(payload.arguments as string) as Record<string, unknown>
        cmd = typeof args.cmd === 'string' ? args.cmd : ''
      } catch { /* empty */ }
      if (cmd) {
        const extracted = extractFilePathsFromCommand(cmd, cwd)
        for (const p of extracted) {
          if (!info.commandFilePaths.includes(p)) info.commandFilePaths.push(p)
        }
      }
    }
  }

  return infoByTurnId
}

function reverseV4aDiff(fileContent: string, diffText: string): string | null {
  const fileLines = fileContent.split('\n')
  const rawDiffLines = diffText.split('\n')
  while (rawDiffLines.length > 0 && rawDiffLines[rawDiffLines.length - 1]?.trim() === '') rawDiffLines.pop()
  const diffLines = rawDiffLines
  const result = [...fileLines]

  type DiffEntry = { type: 'context' | 'add' | 'remove'; text: string }
  const hunks: DiffEntry[][] = []
  let currentHunk: DiffEntry[] | null = null

  for (const dl of diffLines) {
    if (dl.startsWith('@@')) {
      if (currentHunk) hunks.push(currentHunk)
      currentHunk = []
      continue
    }
    if (!currentHunk) continue
    if (dl.startsWith('+')) {
      currentHunk.push({ type: 'add', text: dl.slice(1) })
    } else if (dl.startsWith('-')) {
      currentHunk.push({ type: 'remove', text: dl.slice(1) })
    } else if (dl.startsWith(' ')) {
      currentHunk.push({ type: 'context', text: dl.slice(1) })
    } else {
      currentHunk.push({ type: 'context', text: dl })
    }
  }
  if (currentHunk) hunks.push(currentHunk)

  for (let hi = hunks.length - 1; hi >= 0; hi--) {
    const hunk = hunks[hi]!
    const expectedSequence = hunk
      .filter((e) => e.type === 'context' || e.type === 'add')
      .map((e) => e.text)

    if (expectedSequence.length === 0) continue

    let seqStart = -1
    outer: for (let ri = result.length - expectedSequence.length; ri >= 0; ri--) {
      for (let si = 0; si < expectedSequence.length; si++) {
        if (result[ri + si] !== expectedSequence[si]) continue outer
      }
      seqStart = ri
      break
    }

    if (seqStart < 0) return null

    const newLines: string[] = []
    let seqIdx = 0
    for (const entry of hunk) {
      if (entry.type === 'context') {
        newLines.push(result[seqStart + seqIdx]!)
        seqIdx++
      } else if (entry.type === 'add') {
        seqIdx++
      } else if (entry.type === 'remove') {
        newLines.push(entry.text)
      }
    }

    result.splice(seqStart, expectedSequence.length, ...newLines)
  }

  return result.join('\n')
}

async function revertTurnFileChanges(
  cwd: string,
  turnInfos: Map<string, CollectedTurnFileInfo>,
): Promise<{ reverted: number; errors: string[] }> {
  if (turnInfos.size === 0) return { reverted: 0, errors: [] }

  let reverted = 0
  const errors: string[] = []

  const allEntries = [...turnInfos.values()]
  const allPatchInputs = allEntries.flatMap((info) => info.patchInputs).reverse()
  const allCommandPaths = new Set(allEntries.flatMap((info) => info.commandFilePaths))

  let isGitRepo = false
  let gitRoot = ''
  try {
    gitRoot = await runCommandCapture('git', ['rev-parse', '--show-toplevel'], { cwd })
    isGitRepo = !!gitRoot
  } catch { /* not a git repo */ }

  const trackedFiles = new Set<string>()
  if (isGitRepo) {
    try {
      const tracked = await runCommandCapture('git', ['ls-files', '--full-name'], { cwd: gitRoot })
      for (const f of tracked.split('\n')) {
        if (f.trim()) trackedFiles.add(join(gitRoot, f.trim()))
      }
    } catch { /* empty */ }
  }

  const patchRevertedPaths = new Set<string>()

  for (const patch of allPatchInputs) {
    const changes = parseApplyPatchInput(patch.input)
    for (let ci = changes.length - 1; ci >= 0; ci--) {
      const change = changes[ci]!
      const filePath = isAbsolute(change.path) ? change.path : join(cwd, change.path)

      try {
        if (change.operation === 'add') {
          const fileStat = await stat(filePath).catch(() => null)
          if (fileStat) {
            await rm(filePath, { force: true })
            reverted++
            patchRevertedPaths.add(filePath)
          }
        } else if (change.operation === 'update' && change.diff) {
          let reversed = false
          try {
            const currentContent = await readFile(filePath, 'utf8')
            const newContent = reverseV4aDiff(currentContent, change.diff)
            if (newContent !== null && newContent !== currentContent) {
              const { writeFile } = await import('node:fs/promises')
              await writeFile(filePath, newContent)
              reverted++
              patchRevertedPaths.add(filePath)
              reversed = true
            }
          } catch { /* file read/write failed */ }

          if (!reversed) {
            const isTracked = trackedFiles.has(filePath)
            if (isTracked && isGitRepo) {
              const relativePath = filePath.startsWith(gitRoot + '/') ? filePath.slice(gitRoot.length + 1) : filePath
              try {
                await runCommand('git', ['checkout', 'HEAD', '--', relativePath], { cwd: gitRoot })
                reverted++
                patchRevertedPaths.add(filePath)
              } catch {
                errors.push(`Could not revert: ${filePath}`)
              }
            } else {
              errors.push(`Could not reverse patch for untracked file: ${filePath}`)
            }
          }
        } else if (change.operation === 'delete') {
          const isTracked = trackedFiles.has(filePath)
          if (isTracked && isGitRepo) {
            const relativePath = filePath.startsWith(gitRoot + '/') ? filePath.slice(gitRoot.length + 1) : filePath
            try {
              await runCommand('git', ['checkout', 'HEAD', '--', relativePath], { cwd: gitRoot })
              reverted++
              patchRevertedPaths.add(filePath)
            } catch {
              errors.push(`Could not restore deleted file: ${filePath}`)
            }
          }
        }
      } catch (err) {
        errors.push(`Failed to revert patch for ${filePath}: ${err instanceof Error ? err.message : String(err)}`)
      }
    }
  }

  for (const filePath of allCommandPaths) {
    if (patchRevertedPaths.has(filePath)) continue
    const isTracked = trackedFiles.has(filePath)
    if (isTracked && isGitRepo) {
      const relativePath = filePath.startsWith(gitRoot + '/') ? filePath.slice(gitRoot.length + 1) : filePath
      try {
        await runCommand('git', ['checkout', 'HEAD', '--', relativePath], { cwd: gitRoot })
        reverted++
      } catch {
        errors.push(`Could not restore command-modified file: ${filePath}`)
      }
    }
  }

  return { reverted, errors }
}

function mergeSessionCommandsIntoTurns(turns: unknown[], sessionLogRaw: string): unknown[] {
  const turnIds = new Set<string>()
  for (const turn of turns) {
    const turnRecord = asRecord(turn)
    const turnId = readNonEmptyString(turnRecord?.id)
    if (turnId) turnIds.add(turnId)
  }

  if (turnIds.size === 0) return turns

  const orderByTurnId = buildSessionItemOrder(sessionLogRaw, turnIds)
  if (orderByTurnId.size === 0) return turns

  return turns.map((turn) => {
    const turnRecord = asRecord(turn)
    if (!turnRecord) return turn
    const turnId = readNonEmptyString(turnRecord.id)
    if (!turnId) return turn

    const slots = orderByTurnId.get(turnId)
    if (!slots || slots.length === 0) return turn

    const existingItems = Array.isArray(turnRecord.items) ? (turnRecord.items as Record<string, unknown>[]) : []
    const alreadyHasRecoveredItems = existingItems.some((it) => it.type === 'commandExecution' || it.type === 'fileChange')
    if (alreadyHasRecoveredItems) return turn

    const agentMessages = existingItems.filter((it) => it.type === 'agentMessage')
    const nonAgentNonUserItems = existingItems.filter((it) => it.type !== 'agentMessage' && it.type !== 'userMessage')
    const userMessages = existingItems.filter((it) => it.type === 'userMessage')

    let agentIdx = 0
    const interleaved: Record<string, unknown>[] = [...userMessages]

    for (const slot of slots) {
      if (slot.type === 'agentMessage') {
        if (agentIdx < agentMessages.length) {
          interleaved.push(agentMessages[agentIdx]!)
          agentIdx++
        }
      } else if (slot.type === 'commandExecution' && slot.command) {
        interleaved.push(slot.command as unknown as Record<string, unknown>)
      } else if (slot.type === 'fileChange' && slot.fileChange) {
        interleaved.push(slot.fileChange as unknown as Record<string, unknown>)
      }
    }

    while (agentIdx < agentMessages.length) {
      interleaved.push(agentMessages[agentIdx]!)
      agentIdx++
    }

    interleaved.push(...nonAgentNonUserItems)

    return {
      ...turnRecord,
      items: interleaved,
    }
  })
}

function isExactPhraseMatch(query: string, doc: ThreadSearchDocument): boolean {
  const q = query.trim().toLowerCase()
  if (!q) return false
  return (
    doc.title.toLowerCase().includes(q) ||
    doc.preview.toLowerCase().includes(q) ||
    doc.messageText.toLowerCase().includes(q)
  )
}

function scoreFileCandidate(path: string, query: string): number {
  if (!query) return 0
  const lowerPath = path.toLowerCase()
  const lowerQuery = query.toLowerCase()
  const baseName = lowerPath.slice(lowerPath.lastIndexOf('/') + 1)
  if (baseName === lowerQuery) return 0
  if (baseName.startsWith(lowerQuery)) return 1
  if (baseName.includes(lowerQuery)) return 2
  if (lowerPath.includes(`/${lowerQuery}`)) return 3
  if (lowerPath.includes(lowerQuery)) return 4
  return 10
}

async function listFilesWithRipgrep(cwd: string): Promise<string[]> {
  return await new Promise<string[]>((resolve, reject) => {
    const ripgrepCommand = resolveRipgrepCommand()
    if (!ripgrepCommand) {
      reject(new Error('ripgrep (rg) is not available'))
      return
    }

    const proc = spawn(ripgrepCommand, ['--files', '--hidden', '-g', '!.git', '-g', '!node_modules'], {
      cwd,
      env: process.env,
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    let stdout = ''
    let stderr = ''
    proc.stdout.on('data', (chunk: Buffer) => { stdout += chunk.toString() })
    proc.stderr.on('data', (chunk: Buffer) => { stderr += chunk.toString() })
    proc.on('error', reject)
    proc.on('close', (code) => {
      if (code === 0) {
        const rows = stdout
          .split(/\r?\n/)
          .map((line) => line.trim())
          .filter(Boolean)
        resolve(rows)
        return
      }
      const details = [stderr.trim(), stdout.trim()].filter(Boolean).join('\n')
      reject(new Error(details || 'rg --files failed'))
    })
  })
}

function getCodexHomeDir(): string {
  const codexHome = readTrimmedEnv(ENV_KEYS.codexHome[0])
  return codexHome && codexHome.length > 0 ? codexHome : join(homedir(), '.codex')
}

function getSkillsInstallDir(): string {
  return join(getCodexHomeDir(), 'skills')
}

function getPromptsDir(): string {
  return join(getCodexHomeDir(), 'prompts')
}

type ComposerPromptRecord = {
  name: string
  path: string
  content: string
  description: string
}

function promptNameToFileName(name: string): string {
  const trimmed = name.trim()
  const withoutExtension = trimmed.replace(/\.md$/i, '')
  const sanitized = withoutExtension
    .replace(/[\/\\:*?"<>|]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  return `${sanitized || 'prompt'}.md`
}

function buildPromptDescription(content: string): string {
  const firstNonEmptyLine = content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find(Boolean) ?? ''
  return firstNonEmptyLine.slice(0, 120)
}

async function listComposerPrompts(): Promise<ComposerPromptRecord[]> {
  const promptsDir = getPromptsDir()
  try {
    const entries = await readdir(promptsDir, { withFileTypes: true })
    const prompts = await Promise.all(entries
      .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith('.md'))
      .map(async (entry) => {
        const promptPath = join(promptsDir, entry.name)
        const content = await readFile(promptPath, 'utf8')
        return {
          name: entry.name.replace(/\.md$/i, ''),
          path: promptPath,
          content,
          description: buildPromptDescription(content),
        } satisfies ComposerPromptRecord
      }))
    return prompts.sort((a, b) => a.name.localeCompare(b.name))
  } catch (error) {
    if ((error as NodeJS.ErrnoException)?.code === 'ENOENT') return []
    throw error
  }
}

async function createComposerPromptFile(name: string, content: string): Promise<ComposerPromptRecord> {
  const trimmedName = name.trim()
  if (!trimmedName) throw new Error('Prompt name is required')
  const trimmedContent = content.trim()
  if (!trimmedContent) throw new Error('Prompt content is required')
  const promptsDir = getPromptsDir()
  await mkdir(promptsDir, { recursive: true })

  const baseFileName = promptNameToFileName(trimmedName)
  let targetPath = join(promptsDir, baseFileName)
  let suffix = 2
  while (existsSync(targetPath)) {
    const nextFileName = `${baseFileName.replace(/\.md$/i, '')}-${suffix}.md`
    targetPath = join(promptsDir, nextFileName)
    suffix += 1
  }

  await writeFile(targetPath, `${trimmedContent}\n`, 'utf8')
  return {
    name: basename(targetPath).replace(/\.md$/i, ''),
    path: targetPath,
    content: `${trimmedContent}\n`,
    description: buildPromptDescription(trimmedContent),
  }
}

async function removeComposerPromptFile(promptPath: string): Promise<boolean> {
  const resolvedPath = resolve(promptPath)
  const promptsDir = resolve(getPromptsDir())
  const relative = resolvedPath.startsWith(`${promptsDir}/`) ? resolvedPath.slice(promptsDir.length + 1) : ''
  if (!relative || relative.includes('..') || !resolvedPath.toLowerCase().endsWith('.md')) {
    throw new Error('Invalid prompt path')
  }
  try {
    await rm(resolvedPath, { force: false })
    return true
  } catch (error) {
    if ((error as NodeJS.ErrnoException)?.code === 'ENOENT') return false
    throw error
  }
}

async function runCommand(command: string, args: string[], options: { cwd?: string; timeoutMs?: number } = {}): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const proc = spawn(command, args, {
      cwd: options.cwd,
      env: process.env,
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    let stdout = ''
    let stderr = ''
    let timedOut = false
    let closed = false
    const timeout =
      typeof options.timeoutMs === 'number' && Number.isFinite(options.timeoutMs) && options.timeoutMs > 0
        ? setTimeout(() => {
          timedOut = true
          proc.kill('SIGTERM')
          setTimeout(() => {
            if (!closed) proc.kill('SIGKILL')
          }, 5_000).unref()
        }, options.timeoutMs)
        : null
    timeout?.unref()
    proc.stdout.on('data', (chunk: Buffer) => { stdout += chunk.toString() })
    proc.stderr.on('data', (chunk: Buffer) => { stderr += chunk.toString() })
    proc.on('error', (error) => {
      if (timeout) clearTimeout(timeout)
      reject(error)
    })
    proc.on('close', (code) => {
      closed = true
      if (timeout) clearTimeout(timeout)
      if (timedOut) {
        reject(new Error(`Command timed out after ${options.timeoutMs}ms (${command} ${args.join(' ')})`))
        return
      }
      if (code === 0) {
        resolve()
        return
      }
      const details = [stderr.trim(), stdout.trim()].filter(Boolean).join('\n')
      const suffix = details.length > 0 ? `: ${details}` : ''
      reject(new Error(`Command failed (${command} ${args.join(' ')})${suffix}`))
    })
  })
}

function isMissingHeadError(error: unknown): boolean {
  const message = getErrorMessage(error, '').toLowerCase()
  return (
    message.includes("not a valid object name: 'head'") ||
    message.includes('not a valid object name: head') ||
    message.includes('invalid reference: head')
  )
}

function isNotGitRepositoryError(error: unknown): boolean {
  const message = getErrorMessage(error, '').toLowerCase()
  return message.includes('not a git repository') || message.includes('fatal: not a git repository')
}

async function ensureRepoHasInitialCommit(repoRoot: string): Promise<void> {
  const agentsPath = join(repoRoot, 'AGENTS.md')
  try {
    await stat(agentsPath)
  } catch {
    await writeFile(agentsPath, '', 'utf8')
  }

  await runCommand('git', ['add', 'AGENTS.md'], { cwd: repoRoot })
  await runCommand(
    'git',
    ['-c', 'user.name=Codex', '-c', 'user.email=codex@local', 'commit', '-m', 'Initialize repository for worktree support'],
    { cwd: repoRoot },
  )
}

async function runCommandCapture(command: string, args: string[], options: { cwd?: string } = {}): Promise<string> {
  return await new Promise<string>((resolve, reject) => {
    const proc = spawn(command, args, {
      cwd: options.cwd,
      env: process.env,
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    let stdout = ''
    let stderr = ''
    proc.stdout.on('data', (chunk: Buffer) => { stdout += chunk.toString() })
    proc.stderr.on('data', (chunk: Buffer) => { stderr += chunk.toString() })
    proc.on('error', reject)
    proc.on('close', (code) => {
      if (code === 0) {
        resolve(stdout.trim())
        return
      }
      const details = [stderr.trim(), stdout.trim()].filter(Boolean).join('\n')
      const suffix = details.length > 0 ? `: ${details}` : ''
      reject(new Error(`Command failed (${command} ${args.join(' ')})${suffix}`))
    })
  })
}

function normalizeBranchRefName(value: string): string {
  const trimmed = value.trim()
  if (!trimmed) return ''
  if (trimmed.startsWith('refs/heads/')) return trimmed.slice('refs/heads/'.length)
  if (trimmed.startsWith('refs/remotes/')) return trimmed.slice('refs/remotes/'.length)
  return trimmed
}

function toHeaderGitResetHistoryRef(branchName: string, commitSha: string): string {
  return `refs/codex/header-git-reset-history/${branchName}/${commitSha}`
}

const HEADER_GIT_RESET_HISTORY_REF_LIMIT = 25

async function assertLocalGitBranch(repoRoot: string, branchName: string): Promise<void> {
  await runCommandCapture('git', ['show-ref', '--verify', `refs/heads/${branchName}`], { cwd: repoRoot })
}

async function checkoutGitBranchWithWorktreeRecovery(repoRoot: string, branchName: string): Promise<void> {
  try {
    await runCommand('git', ['checkout', branchName], { cwd: repoRoot })
  } catch (checkoutError) {
    const blockingWorktreePath = extractBranchLockedWorktreePath(checkoutError, branchName)
    if (!blockingWorktreePath) {
      throw checkoutError
    }
    await runCommand('git', ['checkout', '--detach'], { cwd: blockingWorktreePath })
    await runCommand('git', ['checkout', branchName], { cwd: repoRoot })
  }
}

async function pruneHeaderGitResetHistoryRefs(repoRoot: string, branchName: string): Promise<void> {
  const resetHistoryRefPrefix = `refs/codex/header-git-reset-history/${branchName}/`
  const refsRaw = await runCommandCapture(
    'git',
    ['for-each-ref', '--sort=-creatordate', '--format=%(refname)', resetHistoryRefPrefix],
    { cwd: repoRoot },
  ).catch(() => '')
  const refs = refsRaw
    .split('\n')
    .map((entry) => entry.trim())
    .filter(Boolean)
  const staleRefs = refs.slice(HEADER_GIT_RESET_HISTORY_REF_LIMIT)
  for (const refName of staleRefs) {
    await runCommand('git', ['update-ref', '-d', refName], { cwd: repoRoot })
  }
}

async function readGitHeaderState(cwd: string): Promise<{
  currentBranch: string | null
  headSha: string | null
  headSubject: string | null
  headDate: string | null
  detached: boolean
  dirty: boolean
  gitRoot: string
}> {
  const gitRoot = await runCommandCapture('git', ['rev-parse', '--show-toplevel'], { cwd })
  const currentBranchRaw = await runCommandCapture('git', ['branch', '--show-current'], { cwd: gitRoot })
  const currentBranch = currentBranchRaw.trim() || null
  const headShaRaw = await runCommandCapture('git', ['rev-parse', '--short=12', 'HEAD'], { cwd: gitRoot })
  const headCommitRaw = await runCommandCapture('git', ['show', '-s', '--date=short', '--format=%cd%x09%s', 'HEAD'], { cwd: gitRoot })
  const [headDate = '', ...headSubjectParts] = headCommitRaw.split('\t')
  const statusRaw = await runCommandCapture('git', ['status', '--porcelain'], { cwd: gitRoot })
  return {
    currentBranch,
    headSha: headShaRaw.trim() || null,
    headSubject: headSubjectParts.join('\t').trim() || null,
    headDate: headDate.trim() || null,
    detached: !currentBranch,
    dirty: statusRaw.trim().length > 0,
    gitRoot,
  }
}

async function assertNoTrackedGitChanges(repoRoot: string): Promise<void> {
  const statusRaw = await runCommandCapture('git', ['status', '--porcelain'], { cwd: repoRoot })
  const trackedChanges = statusRaw
    .split('\n')
    .map((line) => line.trimEnd())
    .filter((line) => line && !line.startsWith('?? '))
  if (trackedChanges.length > 0) {
    throw new Error('Cannot switch branches or reset with tracked uncommitted changes. Commit, stash, or discard tracked changes first. Untracked files are allowed unless Git would overwrite them.')
  }
}

function extractBranchLockedWorktreePath(error: unknown, branchName: string): string {
  const message = getErrorMessage(error, '')
  if (!message || !branchName) return ''
  const escapedBranch = branchName.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&')
  const pattern = new RegExp(`'${escapedBranch}' is already checked out at '([^']+)'`, 'u')
  const match = pattern.exec(message)
  return match?.[1]?.trim() ?? ''
}

function toPermanentWorktreeBranchNameDraft(worktreeName: string): string {
  const sanitized = worktreeName
    .trim()
    .replace(/[^A-Za-z0-9._-]+/gu, '-')
    .replace(/\.+/gu, '.')
    .replace(/-+/gu, '-')
    .replace(/^[.-]+|[.-]+$/gu, '')
  return sanitized || 'worktree'
}

async function isValidGitBranchName(gitRoot: string, branchName: string): Promise<boolean> {
  try {
    await runCommand('git', ['check-ref-format', '--branch', branchName], { cwd: gitRoot })
    return true
  } catch {
    return false
  }
}

async function doesLocalGitBranchExist(gitRoot: string, branchName: string): Promise<boolean> {
  try {
    await runCommand('git', ['show-ref', '--verify', '--quiet', `refs/heads/${branchName}`], { cwd: gitRoot })
    return true
  } catch {
    return false
  }
}

async function allocatePermanentWorktreeBranchName(gitRoot: string, worktreeName: string): Promise<string> {
  const base = toPermanentWorktreeBranchNameDraft(worktreeName)
  for (let attempt = 0; attempt < 50; attempt += 1) {
    const candidate = attempt === 0 ? base : `${base}-${attempt + 1}`
    if (!await isValidGitBranchName(gitRoot, candidate)) continue
    if (!await doesLocalGitBranchExist(gitRoot, candidate)) return candidate
  }
  throw new Error('Failed to allocate a unique branch name for worktree')
}

async function runCommandWithOutput(command: string, args: string[], options: { cwd?: string } = {}): Promise<string> {
  return await new Promise<string>((resolve, reject) => {
    const proc = spawn(command, args, {
      cwd: options.cwd,
      env: process.env,
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    let stdout = ''
    let stderr = ''
    proc.stdout.on('data', (chunk: Buffer) => { stdout += chunk.toString() })
    proc.stderr.on('data', (chunk: Buffer) => { stderr += chunk.toString() })
    proc.on('error', reject)
    proc.on('close', (code) => {
      if (code === 0) {
        resolve(stdout.trim())
        return
      }
      const details = [stderr.trim(), stdout.trim()].filter(Boolean).join('\n')
      const suffix = details.length > 0 ? `: ${details}` : ''
      reject(new Error(`Command failed (${command} ${args.join(' ')})${suffix}`))
    })
  })
}


function normalizeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  const normalized: string[] = []
  for (const item of value) {
    if (typeof item === 'string' && item.length > 0 && !normalized.includes(item)) {
      normalized.push(item)
    }
  }
  return normalized
}

function normalizeStringRecord(value: unknown): Record<string, string> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  const next: Record<string, string> = {}
  for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
    if (typeof key === 'string' && key.length > 0 && typeof item === 'string') {
      next[key] = item
    }
  }
  return next
}

function normalizeRemoteProjects(value: unknown): WorkspaceRootsState['remoteProjects'] {
  if (!Array.isArray(value)) return []
  const next: WorkspaceRootsState['remoteProjects'] = []
  const seen = new Set<string>()
  for (const item of value) {
    const record = asRecord(item)
    if (!record) continue
    const id = typeof record.id === 'string' ? record.id.trim() : ''
    if (!id || seen.has(id)) continue
    seen.add(id)
    next.push({
      id,
      hostId: typeof record.hostId === 'string' ? record.hostId.trim() : '',
      remotePath: typeof record.remotePath === 'string' ? record.remotePath.trim() : '',
      label: typeof record.label === 'string' ? record.label.trim() : '',
    })
  }
  return next
}



function getCodexAuthPath(): string {
  return join(getCodexHomeDir(), 'auth.json')
}

type CodexAuth = {
  auth_mode?: string
  last_refresh?: number
  tokens?: {
    access_token?: string
    refresh_token?: string
    id_token?: string
    account_id?: string
  }
}

const CODEX_CHATGPT_CLIENT_ID = 'app_EMoamEEZ73f0CkXaXp7hrann'
const DEFAULT_CODEX_REFRESH_TOKEN_URL = 'https://auth.openai.com/oauth/token'

function decodeBase64UrlJson(value: string): Record<string, unknown> | null {
  try {
    const padded = `${value}${'='.repeat((4 - (value.length % 4)) % 4)}`
    const decoded = Buffer.from(padded.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8')
    const parsed = JSON.parse(decoded) as unknown
    return asRecord(parsed)
  } catch {
    return null
  }
}

function decodeJwtPayload(token: string | undefined): Record<string, unknown> | null {
  if (!token) return null
  const parts = token.split('.')
  if (parts.length < 2) return null
  return decodeBase64UrlJson(parts[1] ?? '')
}

function extractChatgptTokenMetadata(accessToken: string | undefined): {
  chatgptAccountId: string | null
  chatgptPlanType: string | null
} {
  const payload = decodeJwtPayload(accessToken)
  const auth = asRecord(payload?.['https://api.openai.com/auth'])
  return {
    chatgptAccountId: readNonEmptyString(auth?.chatgpt_account_id) || null,
    chatgptPlanType: readNonEmptyString(auth?.chatgpt_plan_type) || null,
  }
}

function readTokenErrorMessage(payload: unknown, fallback: string): string {
  const record = asRecord(payload)
  const message = readNonEmptyString(record?.message)
  if (message) return message
  const error = record?.error
  if (typeof error === 'string' && error.trim().length > 0) return error.trim()
  const nestedError = asRecord(error)
  return readNonEmptyString(nestedError?.message)
    || readNonEmptyString(nestedError?.error_description)
    || readNonEmptyString(record?.error_description)
    || fallback
}

function readTokenResponseString(payload: Record<string, unknown> | null, ...keys: string[]): string | null {
  if (!payload) return null
  for (const key of keys) {
    const value = readNonEmptyString(payload[key])
    if (value) return value
  }
  return null
}

export async function refreshChatgptAuthTokensForExternalAuth(
  params: ChatgptAuthTokensRefreshParams = {},
): Promise<ChatgptAuthTokensRefreshResponse> {
  const authPath = getCodexAuthPath()
  const raw = await readFile(authPath, 'utf8')
  const auth = JSON.parse(raw) as CodexAuth
  const currentRefreshToken = auth.tokens?.refresh_token?.trim() ?? ''
  if (!currentRefreshToken) {
    throw new Error('No ChatGPT refresh token is available. Please sign in again.')
  }

  const refreshUrl = process.env.CODEX_REFRESH_TOKEN_URL_OVERRIDE?.trim() || DEFAULT_CODEX_REFRESH_TOKEN_URL
  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: currentRefreshToken,
    client_id: CODEX_CHATGPT_CLIENT_ID,
  })

  const response = await fetch(refreshUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: body.toString(),
    signal: AbortSignal.timeout(25_000),
  })

  const text = await response.text()
  let payload: Record<string, unknown> | null = null
  try {
    payload = asRecord(JSON.parse(text))
  } catch {
    payload = null
  }

  if (!response.ok) {
    throw new Error(readTokenErrorMessage(payload, `ChatGPT token refresh failed with HTTP ${String(response.status)}`))
  }

  const accessToken = readTokenResponseString(payload, 'access_token', 'accessToken')
  if (!accessToken) {
    throw new Error('ChatGPT token refresh response did not include an access token.')
  }

  const nextRefreshToken = readTokenResponseString(payload, 'refresh_token', 'refreshToken') ?? currentRefreshToken
  const nextIdToken = readTokenResponseString(payload, 'id_token', 'idToken') ?? auth.tokens?.id_token
  const metadata = extractChatgptTokenMetadata(accessToken)
  const chatgptAccountId =
    metadata.chatgptAccountId
    || readTokenResponseString(payload, 'chatgpt_account_id', 'chatgptAccountId')
    || readNonEmptyString(params.previousAccountId)
    || readNonEmptyString(auth.tokens?.account_id)
  if (!chatgptAccountId) {
    throw new Error('ChatGPT token refresh response did not include account metadata.')
  }

  const nextAuth: CodexAuth = {
    ...auth,
    auth_mode: auth.auth_mode || 'chatgpt',
    last_refresh: Date.now(),
    tokens: {
      ...auth.tokens,
      access_token: accessToken,
      refresh_token: nextRefreshToken,
      account_id: chatgptAccountId,
      ...(nextIdToken ? { id_token: nextIdToken } : {}),
    },
  }
  await writeFile(authPath, JSON.stringify(nextAuth, null, 2), { encoding: 'utf8', mode: 0o600 })

  return {
    accessToken,
    chatgptAccountId,
    chatgptPlanType: metadata.chatgptPlanType,
  }
}

async function readCodexAuth(): Promise<{ accessToken: string; accountId?: string } | null> {
  try {
    const raw = await readFile(getCodexAuthPath(), 'utf8')
    const auth = JSON.parse(raw) as CodexAuth
    const token = auth.tokens?.access_token
    if (!token) return null
    return { accessToken: token, accountId: auth.tokens?.account_id ?? undefined }
  } catch {
    return null
  }
}

function hasUsableCodexAuthSync(): boolean {
  try {
    const raw = readFileSync(getCodexAuthPath(), 'utf8')
    const auth = JSON.parse(raw) as CodexAuth
    return Boolean(auth.tokens?.access_token?.trim())
  } catch {
    return false
  }
}

function isLoopbackRemoteAddress(remoteAddress: string | undefined): boolean {
  if (!remoteAddress) return false
  const normalized = remoteAddress.startsWith('::ffff:')
    ? remoteAddress.slice('::ffff:'.length)
    : remoteAddress
  return normalized === '127.0.0.1' || normalized === '::1'
}

function getCodexGlobalStatePath(): string {
  return join(getCodexHomeDir(), '.codex-global-state.json')
}

function getTelegramBridgeConfigPath(): string {
  return join(getCodexHomeDir(), 'telegram-bridge.json')
}

function getCodexSessionIndexPath(): string {
  return join(getCodexHomeDir(), 'session_index.jsonl')
}

function getCodexStateDatabasePath(): string {
  return join(getCodexHomeDir(), 'state_5.sqlite')
}

function getCodexLogsDatabasePath(): string {
  return join(getCodexHomeDir(), 'logs_2.sqlite')
}

type ThreadTitleCache = { titles: Record<string, string>; order: string[] }
const MAX_THREAD_TITLES = 500
const EMPTY_THREAD_TITLE_CACHE: ThreadTitleCache = { titles: {}, order: [] }
const PINNED_THREAD_IDS_KEY = 'pinned-thread-ids'

type SessionIndexThreadTitleCacheState = {
  fileSignature: string | null
  cache: ThreadTitleCache
}

let sessionIndexThreadTitleCacheState: SessionIndexThreadTitleCacheState = {
  fileSignature: null,
  cache: EMPTY_THREAD_TITLE_CACHE,
}

type TelegramBridgeConfigState = {
  botToken: string
  chatIds: number[]
  allowedUserIds: Array<number | '*'>
}

function normalizeThreadTitleCache(value: unknown): ThreadTitleCache {
  const record = asRecord(value)
  if (!record) return EMPTY_THREAD_TITLE_CACHE
  const rawTitles = asRecord(record.titles)
  const titles: Record<string, string> = {}
  if (rawTitles) {
    for (const [k, v] of Object.entries(rawTitles)) {
      if (typeof v === 'string' && v.length > 0) titles[k] = v
    }
  }
  const order = normalizeStringArray(record.order)
  return { titles, order }
}

function normalizePinnedThreadIds(value: unknown): string[] {
  return normalizeStringArray(value)
}

function updateThreadTitleCache(cache: ThreadTitleCache, id: string, title: string): ThreadTitleCache {
  const titles = { ...cache.titles, [id]: title }
  const order = [id, ...cache.order.filter((o) => o !== id)]
  while (order.length > MAX_THREAD_TITLES) {
    const removed = order.pop()
    if (removed) delete titles[removed]
  }
  return { titles, order }
}

function removeFromThreadTitleCache(cache: ThreadTitleCache, id: string): ThreadTitleCache {
  const { [id]: _, ...titles } = cache.titles
  return { titles, order: cache.order.filter((o) => o !== id) }
}

type SessionIndexThreadTitle = {
  id: string
  title: string
  updatedAtMs: number
}

function normalizeSessionIndexThreadTitle(value: unknown): SessionIndexThreadTitle | null {
  const record = asRecord(value)
  if (!record) return null

  const id = typeof record.id === 'string' ? record.id.trim() : ''
  const title = typeof record.thread_name === 'string' ? record.thread_name.trim() : ''
  const updatedAtIso = typeof record.updated_at === 'string' ? record.updated_at.trim() : ''
  const updatedAtMs = updatedAtIso ? Date.parse(updatedAtIso) : Number.NaN

  if (!id || !title) return null
  return {
    id,
    title,
    updatedAtMs: Number.isFinite(updatedAtMs) ? updatedAtMs : 0,
  }
}

function trimThreadTitleCache(cache: ThreadTitleCache): ThreadTitleCache {
  const titles = { ...cache.titles }
  const order = cache.order.filter((id) => {
    if (!titles[id]) return false
    return true
  }).slice(0, MAX_THREAD_TITLES)

  for (const id of Object.keys(titles)) {
    if (!order.includes(id)) {
      delete titles[id]
    }
  }

  return { titles, order }
}

function mergeThreadTitleCaches(base: ThreadTitleCache, overlay: ThreadTitleCache): ThreadTitleCache {
  const titles = { ...base.titles, ...overlay.titles }
  const order: string[] = []

  for (const id of [...overlay.order, ...base.order]) {
    if (!titles[id] || order.includes(id)) continue
    order.push(id)
  }

  for (const id of Object.keys(titles)) {
    if (!order.includes(id)) {
      order.push(id)
    }
  }

  return trimThreadTitleCache({ titles, order })
}

async function readThreadTitleCache(): Promise<ThreadTitleCache> {
  const statePath = getCodexGlobalStatePath()
  try {
    const raw = await readFile(statePath, 'utf8')
    const payload = asRecord(JSON.parse(raw)) ?? {}
    return normalizeThreadTitleCache(payload['thread-titles'])
  } catch {
    return EMPTY_THREAD_TITLE_CACHE
  }
}

async function writeThreadTitleCache(cache: ThreadTitleCache): Promise<void> {
  const statePath = getCodexGlobalStatePath()
  let payload: Record<string, unknown> = {}
  try {
    const raw = await readFile(statePath, 'utf8')
    payload = asRecord(JSON.parse(raw)) ?? {}
  } catch {
    payload = {}
  }
  payload['thread-titles'] = cache
  await writeFile(statePath, JSON.stringify(payload), 'utf8')
}

async function readPinnedThreadIds(): Promise<string[]> {
  const statePath = getCodexGlobalStatePath()
  try {
    const raw = await readFile(statePath, 'utf8')
    const payload = asRecord(JSON.parse(raw)) ?? {}
    return normalizePinnedThreadIds(payload[PINNED_THREAD_IDS_KEY])
  } catch {
    return []
  }
}

async function writePinnedThreadIds(threadIds: string[]): Promise<void> {
  const statePath = getCodexGlobalStatePath()
  let payload: Record<string, unknown> = {}
  try {
    const raw = await readFile(statePath, 'utf8')
    payload = asRecord(JSON.parse(raw)) ?? {}
  } catch {
    payload = {}
  }

  payload[PINNED_THREAD_IDS_KEY] = normalizePinnedThreadIds(threadIds)
  await writeFile(statePath, JSON.stringify(payload), 'utf8')
}

const THREAD_QUEUE_STATE_KEY = 'thread-queue-state'

type StoredQueuedMessage = {
  id: string
  text: string
  imageUrls: string[]
  skills: Array<{ name: string; path: string }>
  fileAttachments: Array<{ label: string; path: string; fsPath: string }>
  collaborationMode: 'default' | 'plan'
}

type ThreadQueueState = Record<string, StoredQueuedMessage[]>

type BackendQueuedTurn = {
  threadId: string
  message: StoredQueuedMessage
}

type ThreadQueueStateUpdate<T> = {
  nextState: ThreadQueueState
  result: T
}

type ResolvedCollaborationModeSettings = {
  model: string
  reasoningEffort: ReasoningEffort | null
}

function normalizeStoredQueuedMessage(value: unknown): StoredQueuedMessage | null {
  const record = asRecord(value)
  if (!record) return null

  const id = typeof record.id === 'string' ? record.id.trim() : ''
  if (!id) return null

  const normalizeNamedPathItems = (items: unknown): Array<{ name: string; path: string }> => {
    if (!Array.isArray(items)) return []
    return items.flatMap((item) => {
      const itemRecord = asRecord(item)
      if (!itemRecord) return []
      const name = typeof itemRecord.name === 'string' ? itemRecord.name.trim() : ''
      const path = typeof itemRecord.path === 'string' ? itemRecord.path.trim() : ''
      return name && path ? [{ name, path }] : []
    })
  }

  const normalizeFileAttachments = (items: unknown): Array<{ label: string; path: string; fsPath: string }> => {
    if (!Array.isArray(items)) return []
    return items.flatMap((item) => {
      const itemRecord = asRecord(item)
      if (!itemRecord) return []
      const label = typeof itemRecord.label === 'string' ? itemRecord.label.trim() : ''
      const path = typeof itemRecord.path === 'string' ? itemRecord.path.trim() : ''
      const fsPath = typeof itemRecord.fsPath === 'string' ? itemRecord.fsPath.trim() : ''
      return label && path && fsPath ? [{ label, path, fsPath }] : []
    })
  }

  return {
    id,
    text: typeof record.text === 'string' ? record.text : '',
    imageUrls: normalizeStringArray(record.imageUrls),
    skills: normalizeNamedPathItems(record.skills),
    fileAttachments: normalizeFileAttachments(record.fileAttachments),
    collaborationMode: record.collaborationMode === 'plan' ? 'plan' : 'default',
  }
}

function normalizeThreadQueueState(value: unknown): ThreadQueueState {
  const record = asRecord(value)
  if (!record) return {}

  const state: ThreadQueueState = {}
  for (const [threadId, rawMessages] of Object.entries(record)) {
    const normalizedThreadId = threadId.trim()
    if (!normalizedThreadId || !Array.isArray(rawMessages)) continue
    const messages = rawMessages.flatMap((item) => {
      const message = normalizeStoredQueuedMessage(item)
      return message ? [message] : []
    })
    if (messages.length > 0) {
      state[normalizedThreadId] = messages
    }
  }
  return state
}

let threadQueueMutationChain: Promise<unknown> = Promise.resolve()

async function readThreadQueueState(): Promise<ThreadQueueState> {
  const statePath = getCodexGlobalStatePath()
  try {
    const raw = await readFile(statePath, 'utf8')
    const payload = asRecord(JSON.parse(raw)) ?? {}
    return normalizeThreadQueueState(payload[THREAD_QUEUE_STATE_KEY])
  } catch {
    return {}
  }
}

async function writeThreadQueueStateUnlocked(nextState: ThreadQueueState): Promise<void> {
  const statePath = getCodexGlobalStatePath()
  let payload: Record<string, unknown> = {}
  try {
    const raw = await readFile(statePath, 'utf8')
    payload = asRecord(JSON.parse(raw)) ?? {}
  } catch {
    payload = {}
  }
  const normalized = normalizeThreadQueueState(nextState)
  if (Object.keys(normalized).length > 0) {
    payload[THREAD_QUEUE_STATE_KEY] = normalized
  } else {
    delete payload[THREAD_QUEUE_STATE_KEY]
  }
  await writeFile(statePath, JSON.stringify(payload), 'utf8')
}

async function withThreadQueueStateUpdate<T>(
  update: (state: ThreadQueueState) => ThreadQueueStateUpdate<T> | Promise<ThreadQueueStateUpdate<T>>,
): Promise<T> {
  const run = threadQueueMutationChain.then(async () => {
    const currentState = await readThreadQueueState()
    const { nextState, result } = await update(currentState)
    await writeThreadQueueStateUnlocked(nextState)
    return result
  })
  threadQueueMutationChain = run.catch(() => {})
  return run
}

async function writeThreadQueueState(nextState: ThreadQueueState): Promise<void> {
  await withThreadQueueStateUpdate(() => ({
    nextState: normalizeThreadQueueState(nextState),
    result: undefined,
  }))
}

async function appendThreadQueuedMessage(threadId: string, message: StoredQueuedMessage): Promise<void> {
  const normalizedThreadId = threadId.trim()
  if (!normalizedThreadId) throw new Error('threadId is required')
  await withThreadQueueStateUpdate((state) => ({
    nextState: {
      ...state,
      [normalizedThreadId]: [...(state[normalizedThreadId] ?? []), message],
    },
    result: undefined,
  }))
}

function normalizeReasoningEffort(value: unknown): ReasoningEffort | '' {
  const allowed: ReasoningEffort[] = ['none', 'minimal', 'low', 'medium', 'high', 'xhigh']
  return typeof value === 'string' && allowed.includes(value as ReasoningEffort)
    ? (value as ReasoningEffort)
    : ''
}

function normalizeCollaborationModeReasoningEffort(value: ReasoningEffort | '' | null | undefined): ReasoningEffort | null {
  return value && value.length > 0 ? value : null
}

function extractLocalImagePathFromUrl(value: string): string | null {
  if (!value) return null
  try {
    const parsed = new URL(value, 'http://localhost')
    if (parsed.pathname !== '/codex-local-image') return null
    const path = parsed.searchParams.get('path')?.trim() ?? ''
    return path.length > 0 ? path : null
  } catch {
    return null
  }
}

function buildTextWithAttachments(prompt: string, files: StoredQueuedMessage['fileAttachments']): string {
  if (files.length === 0) return prompt
  let prefix = '# Files mentioned by the user:\n'
  for (const f of files) {
    prefix += `\n## ${f.label}: ${f.path}\n`
  }
  return `${prefix}\n## My request for Codex:\n\n${prompt}\n`
}

function escapeHeartbeatXmlText(value: string): string {
  return value
    .replace(/&/gu, '&amp;')
    .replace(/</gu, '&lt;')
    .replace(/>/gu, '&gt;')
}

function fileNameFromPath(pathValue: string): string {
  const normalized = pathValue.replace(/\\/g, '/')
  const segments = normalized.split('/').filter(Boolean)
  return segments.at(-1) ?? normalized
}

function extractThreadIdFromNotificationParams(params: unknown): string {
  const record = asRecord(params)
  if (!record) return ''
  const threadId =
    (typeof record.threadId === 'string' ? record.threadId : '') ||
    (typeof record.thread_id === 'string' ? record.thread_id : '') ||
    (typeof record.conversationId === 'string' ? record.conversationId : '') ||
    (typeof record.conversation_id === 'string' ? record.conversation_id : '')
  if (threadId) return threadId
  const thread = asRecord(record.thread)
  if (thread && typeof thread.id === 'string') return thread.id
  const turn = asRecord(record.turn)
  if (turn) {
    const turnThreadId =
      (typeof turn.threadId === 'string' ? turn.threadId : '') ||
      (typeof turn.thread_id === 'string' ? turn.thread_id : '')
    if (turnThreadId) return turnThreadId
  }
  return ''
}

function isTurnCompletedNotification(notification: { method: string; params: unknown }): boolean {
  return notification.method === 'turn/completed'
}

function getSessionIndexFileSignature(stats: { mtimeMs: number; size: number }): string {
  return `${String(stats.mtimeMs)}:${String(stats.size)}`
}

async function parseThreadTitlesFromSessionIndex(sessionIndexPath: string): Promise<ThreadTitleCache> {
  const latestById = new Map<string, SessionIndexThreadTitle>()
  const input = createReadStream(sessionIndexPath, { encoding: 'utf8' })
  const lines = createInterface({
    input,
    crlfDelay: Infinity,
  })

  try {
    for await (const line of lines) {
      const trimmed = line.trim()
      if (!trimmed) continue

      try {
        const entry = normalizeSessionIndexThreadTitle(JSON.parse(trimmed) as unknown)
        if (!entry) continue

        const previous = latestById.get(entry.id)
        if (!previous || entry.updatedAtMs >= previous.updatedAtMs) {
          latestById.set(entry.id, entry)
        }
      } catch {
        // Skip malformed lines and keep scanning the rest of the index.
      }
    }
  } finally {
    lines.close()
    input.close()
  }

  const entries = Array.from(latestById.values()).sort((first, second) => second.updatedAtMs - first.updatedAtMs)
  const titles: Record<string, string> = {}
  const order: string[] = []
  for (const entry of entries) {
    titles[entry.id] = entry.title
    order.push(entry.id)
  }

  return trimThreadTitleCache({ titles, order })
}

async function readThreadTitlesFromSessionIndex(): Promise<ThreadTitleCache> {
  const sessionIndexPath = getCodexSessionIndexPath()

  try {
    const stats = await stat(sessionIndexPath)
    const fileSignature = getSessionIndexFileSignature(stats)
    if (sessionIndexThreadTitleCacheState.fileSignature === fileSignature) {
      return sessionIndexThreadTitleCacheState.cache
    }

    const cache = await parseThreadTitlesFromSessionIndex(sessionIndexPath)
    sessionIndexThreadTitleCacheState = { fileSignature, cache }
    return cache
  } catch {
    sessionIndexThreadTitleCacheState = {
      fileSignature: 'missing',
      cache: EMPTY_THREAD_TITLE_CACHE,
    }
    return sessionIndexThreadTitleCacheState.cache
  }
}

async function readMergedThreadTitleCache(): Promise<ThreadTitleCache> {
  const [sessionIndexCache, persistedCache] = await Promise.all([
    readThreadTitlesFromSessionIndex(),
    readThreadTitleCache(),
  ])
  return mergeThreadTitleCaches(persistedCache, sessionIndexCache)
}

function removeThreadIdsFromThreadTitleCache(cache: ThreadTitleCache, threadIds: Set<string>): ThreadTitleCache {
  const titles = { ...cache.titles }
  for (const threadId of threadIds) {
    delete titles[threadId]
  }
  return trimThreadTitleCache({
    titles,
    order: cache.order.filter((threadId) => !threadIds.has(threadId)),
  })
}

function isPathInsideDirectory(pathValue: string, directory: string): boolean {
  const relativePath = relative(resolve(directory), resolve(pathValue))
  return relativePath.length > 0 && !relativePath.startsWith('..') && !isAbsolute(relativePath)
}

function getAllowedSessionDirectories(): string[] {
  const codexHome = getCodexHomeDir()
  return [
    join(codexHome, 'sessions'),
    join(codexHome, 'archived_sessions'),
    join(codexHome, 'browser', 'sessions'),
  ]
}

function assertAllowedThreadSessionPath(sessionPath: string): string {
  if (!sessionPath || !isAbsolute(sessionPath)) {
    throw new Error('Thread session path is missing or not absolute')
  }

  const resolvedPath = resolve(sessionPath)
  if (!resolvedPath.endsWith('.jsonl')) {
    throw new Error('Thread session path is not a JSONL file')
  }

  if (!getAllowedSessionDirectories().some((directory) => isPathInsideDirectory(resolvedPath, directory))) {
    throw new Error('Thread session path is outside allowed Codex session directories')
  }

  return resolvedPath
}

async function doesFileExist(filePath: string): Promise<boolean> {
  try {
    const info = await stat(filePath)
    return info.isFile()
  } catch (error) {
    if ((error as NodeJS.ErrnoException)?.code === 'ENOENT') return false
    throw error
  }
}

async function doesRegularFileExist(filePath: string): Promise<boolean> {
  try {
    const info = await lstat(filePath)
    if (!info.isFile()) {
      throw new Error('Thread session path is not a regular file')
    }
    return true
  } catch (error) {
    if ((error as NodeJS.ErrnoException)?.code === 'ENOENT') return false
    throw error
  }
}

function sqlStringLiteral(value: string): string {
  return `'${value.replace(/'/g, "''")}'`
}

function sqlIdentifier(value: string): string {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/u.test(value)) {
    throw new Error(`Invalid SQLite identifier: ${value}`)
  }
  return `"${value}"`
}

async function runSqliteScript(databasePath: string, script: string): Promise<string> {
  const sqliteCommand = readFirstTrimmedEnv(['CODES_SQLITE_COMMAND', 'SQLITE3']) || 'sqlite3'
  const invocation = getSpawnInvocation(sqliteCommand, [databasePath])
  return await new Promise<string>((resolve, reject) => {
    const proc = spawn(invocation.command, invocation.args, {
      env: process.env,
      stdio: ['pipe', 'pipe', 'pipe'],
    })
    let stdout = ''
    let stderr = ''
    proc.stdout.on('data', (chunk: Buffer) => { stdout += chunk.toString() })
    proc.stderr.on('data', (chunk: Buffer) => { stderr += chunk.toString() })
    proc.on('error', (error) => {
      reject(new Error(`sqlite3 is required to update Codex session database: ${error.message}`))
    })
    proc.on('close', (code) => {
      if (code === 0) {
        resolve(stdout.trim())
        return
      }
      const details = [stderr.trim(), stdout.trim()].filter(Boolean).join('\n')
      reject(new Error(details || `sqlite3 failed with exit code ${String(code)}`))
    })
    proc.stdin.end(`${script.trim()}\n`)
  })
}

async function sqliteTableExists(databasePath: string, tableName: string): Promise<boolean> {
  const output = await runSqliteScript(
    databasePath,
    `SELECT name FROM sqlite_master WHERE type = 'table' AND name = ${sqlStringLiteral(tableName)} LIMIT 1;`,
  )
  return output.split(/\r?\n/u).some((line) => line.trim() === tableName)
}

async function deleteThreadIdsFromSqliteTable(
  databasePath: string,
  tableName: string,
  threadIdColumn: string,
  threadIds: Set<string>,
): Promise<number> {
  if (threadIds.size === 0) return 0
  if (!await doesFileExist(databasePath)) return 0
  if (!await sqliteTableExists(databasePath, tableName)) return 0

  const table = sqlIdentifier(tableName)
  const column = sqlIdentifier(threadIdColumn)
  const idList = Array.from(threadIds).map(sqlStringLiteral).join(', ')
  const output = await runSqliteScript(databasePath, `
    PRAGMA foreign_keys = ON;
    PRAGMA busy_timeout = 5000;
    BEGIN IMMEDIATE;
    DELETE FROM ${table} WHERE ${column} IN (${idList});
    SELECT changes();
    COMMIT;
  `)
  const changedRows = Number.parseInt(output.split(/\r?\n/u).at(-1)?.trim() ?? '0', 10)
  return Number.isFinite(changedRows) ? changedRows : 0
}

async function readThreadRolloutPathFromStateDatabase(threadId: string): Promise<string | null> {
  const stateDatabasePath = getCodexStateDatabasePath()
  if (!await doesFileExist(stateDatabasePath)) return null
  if (!await sqliteTableExists(stateDatabasePath, 'threads')) return null

  const output = await runSqliteScript(stateDatabasePath, `
    .mode tabs
    SELECT id, COALESCE(rollout_path, '')
    FROM threads
    WHERE id = ${sqlStringLiteral(threadId)}
    LIMIT 1;
  `)
  const firstLine = output.split(/\r?\n/u).find((line) => line.trim().length > 0)
  if (!firstLine) return null
  const [rowThreadId, ...rolloutPathParts] = firstLine.split('\t')
  if (rowThreadId !== threadId) return null
  return rolloutPathParts.join('\t').trim()
}

function isMissingThreadSessionReadError(error: unknown): boolean {
  const message = getErrorMessage(error, '').toLowerCase()
  return (
    message.includes('enoent') ||
    message.includes('no such file') ||
    message.includes('not found') ||
    message.includes('no rollout found') ||
    message.includes('missing rollout')
  )
}

async function resolveMissingThreadSessionDeletionTarget(threadId: string): Promise<ThreadSessionDeletionTarget | null> {
  const rolloutPath = await readThreadRolloutPathFromStateDatabase(threadId)
  if (rolloutPath === null) return null
  if (!rolloutPath) {
    return { threadId, sessionPath: null, fileExists: false }
  }

  const sessionPath = assertAllowedThreadSessionPath(rolloutPath)
  const fileExists = await doesRegularFileExist(sessionPath)
  return { threadId, sessionPath, fileExists }
}

function isThreadRecordInProgress(thread: Record<string, unknown> | null): boolean {
  if (!thread) return false
  if (thread.inProgress === true) return true

  const status = asRecord(thread.status)
  const statusType = readNonEmptyString(status?.type) || readNonEmptyString(thread.status)
  if (statusType === 'inProgress' || statusType === 'running' || statusType === 'active') return true

  const turns = Array.isArray(thread.turns) ? thread.turns : []
  return turns.some((turn) => readNonEmptyString(asRecord(turn)?.status) === 'inProgress')
}

async function resolveThreadSessionDeletionTarget(
  appServer: RpcExecutor,
  threadId: string,
): Promise<ThreadSessionDeletionTarget> {
  const normalizedThreadId = threadId.trim()
  if (!normalizedThreadId) {
    throw new Error('threadId is required')
  }

  let threadReadResult: Record<string, unknown> | null = null
  try {
    threadReadResult = asRecord(await appServer.rpc('thread/read', {
      threadId: normalizedThreadId,
      includeTurns: true,
    }))
  } catch (error) {
    if (isMissingThreadSessionReadError(error)) {
      const fallbackTarget = await resolveMissingThreadSessionDeletionTarget(normalizedThreadId)
      if (fallbackTarget) return fallbackTarget
    }
    throw error
  }
  const thread = asRecord(threadReadResult?.thread)
  if (!thread) {
    throw new Error(`Thread not found: ${normalizedThreadId}`)
  }

  const resultThreadId = readNonEmptyString(thread.id) || normalizedThreadId
  if (resultThreadId !== normalizedThreadId) {
    throw new Error('thread/read returned a different thread')
  }

  if (isThreadRecordInProgress(thread)) {
    throw new Error(`Thread is still running: ${normalizedThreadId}`)
  }

  const sessionPath = assertAllowedThreadSessionPath(readNonEmptyString(thread.path))
  const fileExists = await doesRegularFileExist(sessionPath)

  return {
    threadId: normalizedThreadId,
    sessionPath,
    fileExists,
  }
}

async function listThreadIdsByExactCwd(
  appServer: RpcExecutor,
  cwd: string,
  archived: boolean,
): Promise<string[]> {
  const threadIds: string[] = []
  let cursor: string | null = null

  do {
    const response = asRecord(await appServer.rpc('thread/list', {
      archived,
      cwd,
      limit: 100,
      sortKey: 'updated_at',
      modelProviders: [],
      cursor,
    }))
    const data = Array.isArray(response?.data) ? response.data : []
    for (const row of data) {
      const threadId = readNonEmptyString(asRecord(row)?.id)
      if (threadId && !threadIds.includes(threadId)) {
        threadIds.push(threadId)
      }
    }
    cursor = readNonEmptyString(response?.nextCursor) || null
  } while (cursor)

  return threadIds
}

async function removeThreadIdsFromSessionIndex(threadIds: Set<string>): Promise<void> {
  if (threadIds.size === 0) return

  const sessionIndexPath = getCodexSessionIndexPath()
  let raw = ''
  try {
    raw = await readFile(sessionIndexPath, 'utf8')
  } catch (error) {
    if ((error as NodeJS.ErrnoException)?.code === 'ENOENT') return
    throw error
  }

  const nextLines: string[] = []
  for (const line of raw.split('\n')) {
    if (!line.trim()) continue
    let shouldRemove = false
    try {
      const record = asRecord(JSON.parse(line) as unknown)
      shouldRemove =
        threadIds.has(readNonEmptyString(record?.id)) ||
        threadIds.has(readNonEmptyString(record?.session_id))
    } catch {
      shouldRemove = false
    }
    if (!shouldRemove) {
      nextLines.push(line)
    }
  }

  await writeFile(sessionIndexPath, nextLines.length > 0 ? `${nextLines.join('\n')}\n` : '', 'utf8')
  sessionIndexThreadTitleCacheState = {
    fileSignature: null,
    cache: EMPTY_THREAD_TITLE_CACHE,
  }
}

async function removeThreadIdsFromStateDatabase(threadIds: Set<string>): Promise<void> {
  await deleteThreadIdsFromSqliteTable(getCodexStateDatabasePath(), 'threads', 'id', threadIds)
}

async function removeThreadIdsFromLogsDatabase(threadIds: Set<string>): Promise<void> {
  try {
    await deleteThreadIdsFromSqliteTable(getCodexLogsDatabasePath(), 'logs', 'thread_id', threadIds)
  } catch {
    // 日志库不存在或结构漂移不应阻止会话本体删除。
  }
}

async function cleanupDeletedThreadMetadata(threadIds: Set<string>): Promise<void> {
  if (threadIds.size === 0) return

  const titleCache = await readThreadTitleCache()
  await writeThreadTitleCache(removeThreadIdsFromThreadTitleCache(titleCache, threadIds))

  const pinnedThreadIds = await readPinnedThreadIds()
  await writePinnedThreadIds(pinnedThreadIds.filter((threadId) => !threadIds.has(threadId)))

  await withThreadQueueStateUpdate((state) => {
    const nextState = { ...state }
    for (const threadId of threadIds) {
      delete nextState[threadId]
    }
    return { nextState, result: undefined }
  })

  await removeThreadIdsFromSessionIndex(threadIds)
}

async function deleteResolvedThreadSessions(targets: ThreadSessionDeletionTarget[]): Promise<DeletedThreadSessionsResult> {
  const deletedThreadIds = targets.map((target) => target.threadId)
  const deletedThreadIdSet = new Set(deletedThreadIds)
  await removeThreadIdsFromStateDatabase(deletedThreadIdSet)
  await removeThreadIdsFromLogsDatabase(deletedThreadIdSet)

  for (const target of targets) {
    if (target.fileExists && target.sessionPath) {
      await rm(target.sessionPath, { force: false })
    }
  }
  await cleanupDeletedThreadMetadata(deletedThreadIdSet)
  return { deletedThreadIds }
}

export async function deleteThreadSessionsById(
  appServer: RpcExecutor,
  threadIds: string[],
): Promise<DeletedThreadSessionsResult> {
  const normalizedThreadIds = [...new Set(threadIds.map((threadId) => threadId.trim()).filter(Boolean))]
  if (normalizedThreadIds.length === 0) {
    return { deletedThreadIds: [] }
  }

  const targets = await Promise.all(
    normalizedThreadIds.map((threadId) => resolveThreadSessionDeletionTarget(appServer, threadId)),
  )
  return deleteResolvedThreadSessions(targets)
}

export async function deleteThreadSessionsByExactCwd(
  appServer: RpcExecutor,
  cwd: string,
): Promise<DeletedThreadSessionsResult> {
  const normalizedCwd = cwd.trim()
  if (!normalizedCwd) {
    throw new Error('cwd is required')
  }

  const threadIds = [
    ...await listThreadIdsByExactCwd(appServer, normalizedCwd, false),
    ...await listThreadIdsByExactCwd(appServer, normalizedCwd, true),
  ]
  return deleteThreadSessionsById(appServer, threadIds)
}

async function readWorkspaceRootsState(): Promise<WorkspaceRootsState> {
  const statePath = getCodexGlobalStatePath()
  let payload: Record<string, unknown> = {}

  try {
    const raw = await readFile(statePath, 'utf8')
    const parsed = JSON.parse(raw) as unknown
    payload = asRecord(parsed) ?? {}
  } catch {
    payload = {}
  }

  return {
    order: normalizeStringArray(payload['electron-saved-workspace-roots']),
    labels: normalizeStringRecord(payload['electron-workspace-root-labels']),
    active: normalizeStringArray(payload['active-workspace-roots']),
    projectOrder: normalizeStringArray(payload['project-order']),
    remoteProjects: normalizeRemoteProjects(payload['remote-projects']),
  }
}

async function writeWorkspaceRootsState(nextState: WorkspaceRootsState): Promise<void> {
  const statePath = getCodexGlobalStatePath()
  let payload: Record<string, unknown> = {}
  try {
    const raw = await readFile(statePath, 'utf8')
    payload = asRecord(JSON.parse(raw)) ?? {}
  } catch {
    payload = {}
  }

  payload['electron-saved-workspace-roots'] = normalizeStringArray(nextState.order)
  payload['electron-workspace-root-labels'] = normalizeStringRecord(nextState.labels)
  payload['active-workspace-roots'] = normalizeStringArray(nextState.active)
  payload['project-order'] = normalizeStringArray(nextState.projectOrder)

  await writeFile(statePath, JSON.stringify(payload), 'utf8')
}

let workspaceRootsMutation: Promise<void> = Promise.resolve()

function queueWorkspaceRootsMutation<T>(mutation: () => Promise<T>): Promise<T> {
  const run = workspaceRootsMutation.catch(() => undefined).then(mutation)
  workspaceRootsMutation = run.then(
    () => undefined,
    () => undefined,
  )
  return run
}

function prependUniqueString(value: string, items: string[]): string[] {
  return [value, ...items.filter((item) => item !== value)]
}

async function updateWorkspaceRootsState(
  updater: (existingState: WorkspaceRootsState) => WorkspaceRootsState,
): Promise<void> {
  await queueWorkspaceRootsMutation(async () => {
    const existingState = await readWorkspaceRootsState()
    await writeWorkspaceRootsState(updater(existingState))
  })
}

async function persistWorkspaceRoot(workspaceRoot: string, label = ''): Promise<void> {
  const normalizedRoot = workspaceRoot.trim()
  if (!normalizedRoot) return

  await updateWorkspaceRootsState((existingState) => {
    const nextLabels = { ...existingState.labels }
    const trimmedLabel = label.trim()
    if (trimmedLabel.length > 0) {
      nextLabels[normalizedRoot] = trimmedLabel
    }
    return {
      order: prependUniqueString(normalizedRoot, existingState.order),
      labels: nextLabels,
      active: prependUniqueString(normalizedRoot, existingState.active),
      projectOrder: prependUniqueString(normalizedRoot, existingState.projectOrder),
      remoteProjects: existingState.remoteProjects,
    }
  })
}

async function rollbackCreatedWorktree(
  gitRoot: string,
  worktreeCwd: string,
  cleanupDirectory?: string,
  branchName?: string,
): Promise<void> {
  try {
    await runCommand('git', ['worktree', 'remove', '--force', worktreeCwd], { cwd: gitRoot })
  } catch {
    await rm(worktreeCwd, { recursive: true, force: true }).catch(() => undefined)
  }

  if (cleanupDirectory && cleanupDirectory !== worktreeCwd) {
    await rm(cleanupDirectory, { recursive: true, force: true }).catch(() => undefined)
  }

  if (branchName) {
    await runCommand('git', ['branch', '-D', branchName], { cwd: gitRoot }).catch(() => undefined)
  }
}

function normalizeTelegramBridgeConfig(value: unknown): TelegramBridgeConfigState {
  const record = asRecord(value)
  if (!record) return { botToken: '', chatIds: [], allowedUserIds: [] }
  const botToken = typeof record.botToken === 'string' ? record.botToken.trim() : ''
  const rawChatIds = Array.isArray(record.chatIds) ? record.chatIds : []
  const chatIds = Array.from(new Set(rawChatIds
    .filter((value): value is number => typeof value === 'number' && Number.isFinite(value))
    .map((value) => Math.trunc(value)))).slice(0, 50)
  const rawAllowedUserIds = Array.isArray(record.allowedUserIds) ? record.allowedUserIds : []
  const allowAllUsers = rawAllowedUserIds.some((value) => typeof value === 'string' && value.trim() === '*')
  const normalizedAllowedUserIds = Array.from(new Set(rawAllowedUserIds
    .map((value) => {
      if (typeof value === 'number' && Number.isFinite(value)) return Math.trunc(value)
      if (typeof value === 'string') {
        const normalized = value.trim().replace(/^(telegram|tg):/i, '').trim()
        if (/^-?\d+$/.test(normalized)) {
          return Number.parseInt(normalized, 10)
        }
      }
      return Number.NaN
    })
    .filter((value) => Number.isFinite(value)))).slice(0, 100)
  const allowedUserIds: Array<number | '*'> = allowAllUsers
    ? ['*' as const, ...normalizedAllowedUserIds]
    : normalizedAllowedUserIds
  return { botToken, chatIds, allowedUserIds }
}

async function readTelegramBridgeConfig(): Promise<TelegramBridgeConfigState> {
  const telegramConfigPath = getTelegramBridgeConfigPath()
  try {
    const raw = await readFile(telegramConfigPath, 'utf8')
    const payload = asRecord(JSON.parse(raw)) ?? {}
    return normalizeTelegramBridgeConfig(payload)
  } catch {
    return { botToken: '', chatIds: [], allowedUserIds: [] }
  }
}

async function writeTelegramBridgeConfig(nextState: TelegramBridgeConfigState): Promise<void> {
  const normalized = normalizeTelegramBridgeConfig(nextState)
  const telegramConfigPath = getTelegramBridgeConfigPath()
  await writeFile(telegramConfigPath, JSON.stringify({
    botToken: normalized.botToken,
    chatIds: normalized.chatIds,
    allowedUserIds: normalized.allowedUserIds,
  }), 'utf8')
}

let telegramBridgeConfigMutation: Promise<void> = Promise.resolve()

function rememberTelegramChatId(chatId: number): Promise<void> {
  const normalizedChatId = Math.trunc(chatId)
  if (!Number.isFinite(normalizedChatId)) return Promise.resolve()

  telegramBridgeConfigMutation = telegramBridgeConfigMutation.then(async () => {
    const current = await readTelegramBridgeConfig()
    if (current.chatIds.includes(normalizedChatId)) return
    const next = {
      ...current,
      chatIds: [normalizedChatId, ...current.chatIds].slice(0, 50),
    }
    await writeTelegramBridgeConfig(next)
  })
  return telegramBridgeConfigMutation
}

async function readJsonBody(req: IncomingMessage): Promise<unknown> {
  const raw = await readRawBody(req)
  if (raw.length === 0) return null
  const text = raw.toString('utf8').trim()
  if (text.length === 0) return null
  return JSON.parse(text) as unknown
}

async function readRawBody(req: IncomingMessage): Promise<Buffer> {
  const chunks: Uint8Array[] = []
  for await (const chunk of req) {
    chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk)
  }
  return Buffer.concat(chunks)
}

function bufferIndexOf(buf: Buffer, needle: Buffer, start = 0): number {
  for (let i = start; i <= buf.length - needle.length; i++) {
    let match = true
    for (let j = 0; j < needle.length; j++) {
      if (buf[i + j] !== needle[j]) { match = false; break }
    }
    if (match) return i
  }
  return -1
}

function handleFileUpload(req: IncomingMessage, res: ServerResponse): void {
  const chunks: Buffer[] = []
  req.on('data', (chunk: Buffer) => chunks.push(chunk))
  req.on('end', async () => {
    try {
      const body = Buffer.concat(chunks)
      const contentType = req.headers['content-type'] ?? ''
      const boundaryMatch = contentType.match(/boundary=(.+)/i)
      if (!boundaryMatch) { setJson(res, 400, { error: 'Missing multipart boundary' }); return }
      const boundary = boundaryMatch[1]
      const boundaryBuf = Buffer.from(`--${boundary}`)
      const parts: Buffer[] = []
      let searchStart = 0
      while (searchStart < body.length) {
        const idx = body.indexOf(boundaryBuf, searchStart)
        if (idx < 0) break
        if (searchStart > 0) parts.push(body.subarray(searchStart, idx))
        searchStart = idx + boundaryBuf.length
        if (body[searchStart] === 0x0d && body[searchStart + 1] === 0x0a) searchStart += 2
      }
      let fileName = 'uploaded-file'
      let fileData: Buffer | null = null
      const headerSep = Buffer.from('\r\n\r\n')
      for (const part of parts) {
        const headerEnd = bufferIndexOf(part, headerSep)
        if (headerEnd < 0) continue
        const headers = part.subarray(0, headerEnd).toString('utf8')
        const fnMatch = headers.match(/filename="([^"]+)"/i)
        if (!fnMatch) continue
        fileName = fnMatch[1].replace(/[/\\]/g, '_')
        let end = part.length
        if (end >= 2 && part[end - 2] === 0x0d && part[end - 1] === 0x0a) end -= 2
        fileData = part.subarray(headerEnd + 4, end)
        break
      }
      if (!fileData) { setJson(res, 400, { error: 'No file in request' }); return }
      const uploadDir = join(tmpdir(), 'codes-uploads')
      await mkdir(uploadDir, { recursive: true })
      const destDir = await mkdtemp(join(uploadDir, 'f-'))
      const destPath = join(destDir, fileName)
      await writeFile(destPath, fileData)
      setJson(res, 200, { path: destPath })
    } catch (err) {
      setJson(res, 500, { error: getErrorMessage(err, 'Upload failed') })
    }
  })
  req.on('error', (err: Error) => {
    setJson(res, 500, { error: getErrorMessage(err, 'Upload stream error') })
  })
}

function httpPost(
  url: string,
  headers: Record<string, string | number>,
  body: Buffer,
): Promise<{ status: number; body: string }> {
  const doRequest = url.startsWith('http://') ? httpRequest : httpsRequest
  return new Promise((resolve, reject) => {
    const req = doRequest(url, { method: 'POST', headers }, (res) => {
      const chunks: Buffer[] = []
      res.on('data', (c: Buffer) => chunks.push(c))
      res.on('end', () => resolve({ status: res.statusCode ?? 500, body: Buffer.concat(chunks).toString('utf8') }))
      res.on('error', reject)
    })
    req.on('error', reject)
    req.write(body)
    req.end()
  })
}

let curlImpersonateAvailable: boolean | null = null

function curlImpersonatePost(
  url: string,
  headers: Record<string, string | number>,
  body: Buffer,
): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const args = ['-s', '-w', '\n%{http_code}', '-X', 'POST', url]
    for (const [k, v] of Object.entries(headers)) {
      if (k.toLowerCase() === 'content-length') continue
      args.push('-H', `${k}: ${String(v)}`)
    }
    args.push('--data-binary', '@-')
    const proc = spawn('curl-impersonate-chrome', args, {
      env: { ...process.env, CURL_IMPERSONATE: 'chrome116' },
      stdio: ['pipe', 'pipe', 'pipe'],
    })
    const chunks: Buffer[] = []
    proc.stdout.on('data', (c: Buffer) => chunks.push(c))
    proc.on('error', (e) => {
      curlImpersonateAvailable = false
      reject(e)
    })
    proc.on('close', (code) => {
      const raw = Buffer.concat(chunks).toString('utf8')
      const lastNewline = raw.lastIndexOf('\n')
      const statusStr = lastNewline >= 0 ? raw.slice(lastNewline + 1).trim() : ''
      const responseBody = lastNewline >= 0 ? raw.slice(0, lastNewline) : raw
      const status = parseInt(statusStr, 10) || (code === 0 ? 200 : 500)
      curlImpersonateAvailable = true
      resolve({ status, body: responseBody })
    })
    proc.stdin.write(body)
    proc.stdin.end()
  })
}

async function proxyTranscribe(
  body: Buffer,
  contentType: string,
  authToken: string,
  accountId?: string,
): Promise<{ status: number; body: string }> {
  const chatgptHeaders: Record<string, string | number> = {
    'Content-Type': contentType,
    'Content-Length': body.length,
    Authorization: `Bearer ${authToken}`,
    originator: 'Codex Desktop',
    'User-Agent': `Codex Desktop/0.1.0 (${process.platform}; ${process.arch})`,
  }
  if (accountId) chatgptHeaders['ChatGPT-Account-Id'] = accountId

  const postFn = curlImpersonateAvailable !== false ? curlImpersonatePost : httpPost
  let result: { status: number; body: string }
  try {
    result = await postFn('https://chatgpt.com/backend-api/transcribe', chatgptHeaders, body)
  } catch {
    result = await httpPost('https://chatgpt.com/backend-api/transcribe', chatgptHeaders, body)
  }

  if (result.status === 403 && result.body.includes('cf_chl')) {
    if (curlImpersonateAvailable !== false && postFn !== curlImpersonatePost) {
      try {
        const ciResult = await curlImpersonatePost('https://chatgpt.com/backend-api/transcribe', chatgptHeaders, body)
        if (ciResult.status !== 403) return ciResult
      } catch {}
    }
    return { status: 503, body: JSON.stringify({ error: 'Transcription blocked by Cloudflare. Install curl-impersonate-chrome.' }) }
  }

  return result
}

const STREAM_EVENT_BUFFER_LIMIT = 400

type StreamEventFrame = {
  method: string
  params: unknown
  atIso: string
}

type CapturedItem = {
  id: string
  type: string
  turnId: string
  data: Record<string, unknown>
  completed: boolean
}

const MERGEABLE_ITEM_TYPES = new Set([
  'commandExecution',
  'fileChange',
])

class AppServerProcess {
  private process: ChildProcessWithoutNullStreams | null = null
  private initialized = false
  private initializePromise: Promise<void> | null = null
  private readBuffer = ''
  private nextId = 1
  private stopping = false
  private readonly pending = new Map<number, { resolve: (value: unknown) => void; reject: (reason?: unknown) => void }>()
  private readonly notificationListeners = new Set<(value: { method: string; params: unknown }) => void>()
  private readonly pendingServerRequests = new Map<number, PendingServerRequest>()
  private readonly appServerArgs = buildAppServerArgs()
  private readonly streamEventsByThreadId = new Map<string, StreamEventFrame[]>()
  private readonly lastThreadReadSnapshotByThreadId = new Map<string, unknown>()
  private readonly threadTurnPageReadCacheByThreadId = new Map<string, { result: unknown; expiresAt: number }>()
  private readonly threadTurnPageReadPromiseByThreadId = new Map<string, Promise<unknown>>()
  private readonly capturedItemsByThreadId = new Map<string, Map<string, CapturedItem>>()
  private readonly liveStateCache = new Map<string, { data: unknown; turnCount: number; sessionSize: number }>()
  private chatgptAuthRefreshPromise: Promise<ChatgptAuthTokensRefreshResponse> | null = null


  private getCodexCommand(): string {
    const codexCommand = resolveCodexCommand()
    if (!codexCommand) {
      throw new Error('Codex CLI is not available. Install @openai/codex or set CODES_CODEX_COMMAND.')
    }
    return codexCommand
  }

  private buildAppServerConfig(): { args: string[]; env: Record<string, string> } {
    const args = [
      'app-server',
      '-c', 'approval_policy="never"',
      '-c', 'sandbox_mode="danger-full-access"',
    ]
    return { args, env: {} }
  }

  private start(): void {
    if (this.process) return

    this.stopping = false
    const config = this.buildAppServerConfig()
    const invocation = getSpawnInvocation(this.getCodexCommand(), config.args)
    const spawnEnv = Object.keys(config.env).length > 0
      ? { ...process.env, ...config.env }
      : undefined
    const proc = spawn(invocation.command, invocation.args, { stdio: ['pipe', 'pipe', 'pipe'], ...(spawnEnv ? { env: spawnEnv } : {}) })
    this.process = proc

    proc.stdout.setEncoding('utf8')
    proc.stdout.on('data', (chunk: string) => {
      this.readBuffer += chunk

      let lineEnd = this.readBuffer.indexOf('\n')
      while (lineEnd !== -1) {
        const line = this.readBuffer.slice(0, lineEnd).trim()
        this.readBuffer = this.readBuffer.slice(lineEnd + 1)

        if (line.length > 0) {
          this.handleLine(line)
        }

        lineEnd = this.readBuffer.indexOf('\n')
      }
    })

    proc.stderr.setEncoding('utf8')
    proc.stderr.on('data', () => {
      // JSON-RPC errors are forwarded through responses.
    })

    proc.on('exit', () => {
      if (this.process !== proc) {
        return
      }

      const failure = new Error(this.stopping ? 'codex app-server stopped' : 'codex app-server exited unexpectedly')
      for (const request of this.pending.values()) {
        request.reject(failure)
      }

      this.pending.clear()
      this.pendingServerRequests.clear()
      this.process = null
      this.initialized = false
      this.initializePromise = null
      this.readBuffer = ''
    })
  }

  private sendLine(payload: Record<string, unknown>): void {
    if (!this.process) {
      throw new Error('codex app-server is not running')
    }

    this.process.stdin.write(`${JSON.stringify(payload)}\n`)
  }

  private handleLine(line: string): void {
    let message: JsonRpcResponse
    try {
      message = JSON.parse(line) as JsonRpcResponse
    } catch {
      return
    }

    if (typeof message.id === 'number' && this.pending.has(message.id)) {
      const pendingRequest = this.pending.get(message.id)
      this.pending.delete(message.id)

      if (!pendingRequest) return

      if (message.error) {
        pendingRequest.reject(new Error(message.error.message))
      } else {
        pendingRequest.resolve(message.result)
      }
      return
    }

    if (typeof message.method === 'string' && typeof message.id !== 'number') {
      this.emitNotification({
        method: message.method,
        params: message.params ?? null,
      })
      return
    }

    if (typeof message.id === 'number' && typeof message.method === 'string') {
      this.handleServerRequest(message.id, message.method, message.params ?? null)
    }
  }

  private emitNotification(notification: { method: string; params: unknown }): void {
    this.recordStreamEvent(notification)
    this.captureItemFromNotification(notification)
    const nThreadId = this.extractThreadIdFromParams(notification.params)
    if (nThreadId) {
      this.invalidateLiveStateCache(nThreadId)
      this.threadTurnPageReadCacheByThreadId.delete(nThreadId)
    }
    for (const listener of this.notificationListeners) {
      listener(notification)
    }
  }

  private extractThreadIdFromParams(params: unknown): string {
    const record = asRecord(params)
    if (!record) return ''
    const threadId =
      (typeof record.threadId === 'string' ? record.threadId : '') ||
      (typeof record.thread_id === 'string' ? record.thread_id : '') ||
      (typeof record.conversationId === 'string' ? record.conversationId : '') ||
      (typeof record.conversation_id === 'string' ? record.conversation_id : '')
    if (threadId) return threadId
    const thread = asRecord(record.thread)
    if (thread && typeof thread.id === 'string') return thread.id
    const turn = asRecord(record.turn)
    if (turn) {
      const turnThreadId =
        (typeof turn.threadId === 'string' ? turn.threadId : '') ||
        (typeof turn.thread_id === 'string' ? turn.thread_id : '')
      if (turnThreadId) return turnThreadId
    }
    return ''
  }

  private recordStreamEvent(notification: { method: string; params: unknown }): void {
    const threadId = this.extractThreadIdFromParams(notification.params)
    if (!threadId) return
    const frame: StreamEventFrame = {
      method: notification.method,
      params: notification.params,
      atIso: new Date().toISOString(),
    }
    let buffer = this.streamEventsByThreadId.get(threadId)
    if (!buffer) {
      buffer = []
      this.streamEventsByThreadId.set(threadId, buffer)
    }
    buffer.push(frame)
    if (buffer.length > STREAM_EVENT_BUFFER_LIMIT) {
      buffer.splice(0, buffer.length - STREAM_EVENT_BUFFER_LIMIT)
    }
  }

  getStreamEvents(threadId: string, limit: number): StreamEventFrame[] {
    const buffer = this.streamEventsByThreadId.get(threadId)
    if (!buffer || buffer.length === 0) return []
    return buffer.slice(-limit)
  }

  storeThreadReadSnapshot(threadId: string, snapshot: unknown): void {
    this.lastThreadReadSnapshotByThreadId.set(threadId, snapshot)
    this.threadTurnPageReadCacheByThreadId.delete(threadId)
  }

  getLastThreadReadSnapshot(threadId: string): unknown | null {
    return this.lastThreadReadSnapshotByThreadId.get(threadId) ?? null
  }

  async readThreadForTurnPage(threadId: string): Promise<unknown> {
    const now = Date.now()
    const cached = this.threadTurnPageReadCacheByThreadId.get(threadId)
    if (cached && cached.expiresAt > now) return cached.result
    if (cached) this.threadTurnPageReadCacheByThreadId.delete(threadId)

    const pending = this.threadTurnPageReadPromiseByThreadId.get(threadId)
    if (pending) return pending

    const promise = this.rpc('thread/read', {
      threadId,
      includeTurns: true,
    }).then((result) => {
      this.threadTurnPageReadCacheByThreadId.set(threadId, {
        result,
        expiresAt: Date.now() + THREAD_TURN_PAGE_READ_CACHE_TTL_MS,
      })
      return result
    }).finally(() => {
      this.threadTurnPageReadPromiseByThreadId.delete(threadId)
    })

    this.threadTurnPageReadPromiseByThreadId.set(threadId, promise)
    return promise
  }

  cacheLiveState(threadId: string, data: unknown, turnCount: number, sessionSize: number): void {
    this.liveStateCache.set(threadId, { data, turnCount, sessionSize })
  }

  getCachedLiveState(threadId: string, turnCount: number, sessionSize: number): unknown | null {
    const cached = this.liveStateCache.get(threadId)
    if (!cached) return null
    if (cached.turnCount !== turnCount || cached.sessionSize !== sessionSize) return null
    return cached.data
  }

  invalidateLiveStateCache(threadId: string): void {
    this.liveStateCache.delete(threadId)
  }

  clearDeletedThreadState(threadId: string): void {
    this.lastThreadReadSnapshotByThreadId.delete(threadId)
    this.threadTurnPageReadCacheByThreadId.delete(threadId)
    this.threadTurnPageReadPromiseByThreadId.delete(threadId)
    this.capturedItemsByThreadId.delete(threadId)
    this.liveStateCache.delete(threadId)
    this.streamEventsByThreadId.delete(threadId)
  }

  private captureItemFromNotification(notification: { method: string; params: unknown }): void {
    if (notification.method !== 'item/started' && notification.method !== 'item/completed') return

    const params = asRecord(notification.params)
    if (!params) return
    const item = asRecord(params.item)
    if (!item) return
    const itemType = typeof item.type === 'string' ? item.type : ''
    if (!MERGEABLE_ITEM_TYPES.has(itemType)) return

    const itemId = typeof item.id === 'string' ? item.id : ''
    if (!itemId) return

    const threadId = this.extractThreadIdFromParams(params)
    if (!threadId) return

    const turnId =
      (typeof params.turnId === 'string' ? params.turnId : '') ||
      (typeof params.turn_id === 'string' ? params.turn_id : '')
    if (!turnId) return

    let threadItems = this.capturedItemsByThreadId.get(threadId)
    if (!threadItems) {
      threadItems = new Map()
      this.capturedItemsByThreadId.set(threadId, threadItems)
    }

    const isCompleted = notification.method === 'item/completed'
    const existing = threadItems.get(itemId)

    if (existing && existing.completed && !isCompleted) return

    threadItems.set(itemId, {
      id: itemId,
      type: itemType,
      turnId,
      data: item as Record<string, unknown>,
      completed: isCompleted,
    })
  }

  mergeItemsIntoTurns(threadId: string, turns: unknown[]): unknown[] {
    const capturedMap = this.capturedItemsByThreadId.get(threadId)
    if (!capturedMap || capturedMap.size === 0) return turns

    const itemsByTurnId = new Map<string, CapturedItem[]>()
    for (const captured of capturedMap.values()) {
      let group = itemsByTurnId.get(captured.turnId)
      if (!group) {
        group = []
        itemsByTurnId.set(captured.turnId, group)
      }
      group.push(captured)
    }

    return turns.map((turn) => {
      const turnRecord = asRecord(turn)
      if (!turnRecord) return turn
      const turnId = typeof turnRecord.id === 'string' ? turnRecord.id : ''
      if (!turnId) return turn

      const captured = itemsByTurnId.get(turnId)
      if (!captured || captured.length === 0) return turn

      const existingItems = Array.isArray(turnRecord.items) ? (turnRecord.items as Record<string, unknown>[]) : []
      const existingIds = new Set(existingItems.map((it) => (typeof it.id === 'string' ? it.id : '')).filter(Boolean))

      const newItems = captured
        .filter((c) => !existingIds.has(c.id))
        .map((c) => c.data)

      if (newItems.length === 0) return turn

      return {
        ...turnRecord,
        items: [...existingItems, ...newItems],
      }
    })
  }

  private sendServerRequestReply(requestId: number, reply: ServerRequestReply): void {
    if (reply.error) {
      this.sendLine({
        jsonrpc: '2.0',
        id: requestId,
        error: reply.error,
      })
      return
    }

    this.sendLine({
      jsonrpc: '2.0',
      id: requestId,
      result: reply.result ?? {},
    })
  }

  private resolvePendingServerRequest(requestId: number, reply: ServerRequestReply): void {
    const pendingRequest = this.pendingServerRequests.get(requestId)
    if (!pendingRequest) {
      throw new Error(`No pending server request found for id ${String(requestId)}`)
    }
    this.pendingServerRequests.delete(requestId)

    this.sendServerRequestReply(requestId, reply)
    const requestParams = asRecord(pendingRequest.params)
    const threadId =
      typeof requestParams?.threadId === 'string' && requestParams.threadId.length > 0
        ? requestParams.threadId
        : ''
    this.emitNotification({
      method: 'server/request/resolved',
      params: {
        id: requestId,
        method: pendingRequest.method,
        threadId,
        mode: 'manual',
        resolvedAtIso: new Date().toISOString(),
      },
    })
  }

  private async refreshChatgptAuthTokens(params: ChatgptAuthTokensRefreshParams): Promise<ChatgptAuthTokensRefreshResponse> {
    if (!this.chatgptAuthRefreshPromise) {
      this.chatgptAuthRefreshPromise = refreshChatgptAuthTokensForExternalAuth(params).finally(() => {
        this.chatgptAuthRefreshPromise = null
      })
    }
    return await this.chatgptAuthRefreshPromise
  }

  private async handleChatgptAuthTokensRefreshRequest(requestId: number, params: unknown): Promise<void> {
    const requestParams = asRecord(params)
    const previousAccountId = readNonEmptyString(requestParams?.previousAccountId ?? requestParams?.previous_account_id)
    try {
      const result = await this.refreshChatgptAuthTokens({
        reason: readNonEmptyString(requestParams?.reason) || undefined,
        previousAccountId: previousAccountId || undefined,
      })
      this.sendServerRequestReply(requestId, { result })
      this.emitNotification({
        method: 'server/request/resolved',
        params: {
          id: requestId,
          method: 'account/chatgptAuthTokens/refresh',
          mode: 'automatic',
          resolvedAtIso: new Date().toISOString(),
        },
      })
    } catch (error) {
      this.sendServerRequestReply(requestId, {
        error: {
          code: -32001,
          message: getErrorMessage(error, 'Failed to refresh ChatGPT auth tokens'),
        },
      })
    }
  }

  private handleServerRequest(requestId: number, method: string, params: unknown): void {
    if (method === 'account/chatgptAuthTokens/refresh') {
      void this.handleChatgptAuthTokensRefreshRequest(requestId, params)
      return
    }

    const pendingRequest: PendingServerRequest = {
      id: requestId,
      method,
      params,
      receivedAtIso: new Date().toISOString(),
    }
    this.pendingServerRequests.set(requestId, pendingRequest)

    this.emitNotification({
      method: 'server/request',
      params: pendingRequest,
    })
  }

  private async call(method: string, params: unknown): Promise<unknown> {
    this.start()
    const id = this.nextId++

    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject })

      this.sendLine({
        jsonrpc: '2.0',
        id,
        method,
        params,
      } satisfies JsonRpcCall)
    })
  }

  private async ensureInitialized(): Promise<void> {
    if (this.initialized) return
    if (this.initializePromise) {
      await this.initializePromise
      return
    }

    this.initializePromise = this.call('initialize', {
      clientInfo: {
        name: 'CodeS',
        version: '0.1.0',
      },
      capabilities: {
        experimentalApi: true,
      },
    }).then(() => {
      this.sendLine({
        jsonrpc: '2.0',
        method: 'initialized',
      })
      this.initialized = true
    }).finally(() => {
      this.initializePromise = null
    })

    await this.initializePromise
  }

  async rpc(method: string, params: unknown): Promise<unknown> {
    await this.ensureInitialized()
    return this.call(method, params)
  }

  onNotification(listener: (value: { method: string; params: unknown }) => void): () => void {
    this.notificationListeners.add(listener)
    return () => {
      this.notificationListeners.delete(listener)
    }
  }

  async respondToServerRequest(payload: unknown): Promise<void> {
    await this.ensureInitialized()

    const body = asRecord(payload)
    if (!body) {
      throw new Error('Invalid response payload: expected object')
    }

    const id = body.id
    if (typeof id !== 'number' || !Number.isInteger(id)) {
      throw new Error('Invalid response payload: "id" must be an integer')
    }

    const rawError = asRecord(body.error)
    if (rawError) {
      const message = typeof rawError.message === 'string' && rawError.message.trim().length > 0
        ? rawError.message.trim()
        : 'Server request rejected by client'
      const code = typeof rawError.code === 'number' && Number.isFinite(rawError.code)
        ? Math.trunc(rawError.code)
        : -32000
      this.resolvePendingServerRequest(id, { error: { code, message } })
      return
    }

    if (!('result' in body)) {
      throw new Error('Invalid response payload: expected "result" or "error"')
    }

    this.resolvePendingServerRequest(id, { result: body.result })
  }

  listPendingServerRequests(): PendingServerRequest[] {
    return Array.from(this.pendingServerRequests.values())
  }

  dispose(): void {
    if (!this.process) return

    const proc = this.process
    this.stopping = true
    this.process = null
    this.initialized = false
    this.initializePromise = null
    this.readBuffer = ''

    const failure = new Error('codex app-server stopped')
    for (const request of this.pending.values()) {
      request.reject(failure)
    }
    this.pending.clear()
    this.pendingServerRequests.clear()

    try {
      proc.stdin.end()
    } catch {
      // ignore close errors on shutdown
    }

    try {
      proc.kill('SIGTERM')
    } catch {
      // ignore kill errors on shutdown
    }

    const forceKillTimer = setTimeout(() => {
      if (!proc.killed) {
        try {
          proc.kill('SIGKILL')
        } catch {
          // ignore kill errors on shutdown
        }
      }
    }, 1500)
    forceKillTimer.unref()
  }
}

export class BackendQueueProcessor {
  private readonly processingThreadIds = new Set<string>()
  private readonly queueDrainTimersByThreadId = new Map<string, ReturnType<typeof setTimeout>>()
  private readonly queueDrainDueAtByThreadId = new Map<string, number>()
  private readonly unsubscribe: () => void

  constructor(private readonly appServer: AppServerProcess) {
    this.unsubscribe = appServer.onNotification((notification) => {
      if (!isTurnCompletedNotification(notification)) return
      const threadId = extractThreadIdFromNotificationParams(notification.params)
      if (!threadId) return
      void this.processThreadQueue(threadId)
    })
    void this.scheduleAllQueuedThreads(1000)
  }

  dispose(): void {
    this.unsubscribe()
    for (const timer of this.queueDrainTimersByThreadId.values()) {
      clearTimeout(timer)
    }
    this.queueDrainTimersByThreadId.clear()
    this.queueDrainDueAtByThreadId.clear()
    this.processingThreadIds.clear()
  }

  async scheduleAllQueuedThreads(delayMs = 0): Promise<void> {
    try {
      const state = await readThreadQueueState()
      for (const threadId of Object.keys(state)) {
        this.scheduleThreadQueueDrain(threadId, delayMs)
      }
    } catch {
      // Queue recovery is best-effort; normal turn-completed events can still drain later.
    }
  }

  scheduleThreadQueueDrain(threadId: string, delayMs = 5000): void {
    if (!threadId) return
    const normalizedDelayMs = Math.max(0, delayMs)
    const nextDueAt = Date.now() + normalizedDelayMs
    const existingDueAt = this.queueDrainDueAtByThreadId.get(threadId)
    const existingTimer = this.queueDrainTimersByThreadId.get(threadId)
    if (existingTimer) {
      if (existingDueAt !== undefined && existingDueAt <= nextDueAt) return
      clearTimeout(existingTimer)
      this.queueDrainTimersByThreadId.delete(threadId)
      this.queueDrainDueAtByThreadId.delete(threadId)
    }
    const timer = setTimeout(() => {
      this.queueDrainTimersByThreadId.delete(threadId)
      this.queueDrainDueAtByThreadId.delete(threadId)
      void this.processThreadQueue(threadId)
    }, normalizedDelayMs)
    timer.unref?.()
    this.queueDrainTimersByThreadId.set(threadId, timer)
    this.queueDrainDueAtByThreadId.set(threadId, nextDueAt)
  }

  cancelThread(threadId: string): void {
    const timer = this.queueDrainTimersByThreadId.get(threadId)
    if (timer) clearTimeout(timer)
    this.queueDrainTimersByThreadId.delete(threadId)
    this.queueDrainDueAtByThreadId.delete(threadId)
    this.processingThreadIds.delete(threadId)
  }

  async processThreadQueue(threadId: string): Promise<void> {
    if (this.processingThreadIds.has(threadId)) return
    this.processingThreadIds.add(threadId)
    try {
      const canStart = await this.canStartQueuedTurn(threadId)
      if (!canStart) {
        if (await this.hasQueuedTurns(threadId)) {
          this.scheduleThreadQueueDrain(threadId)
        }
        return
      }
      const next = await this.popNextQueuedTurn(threadId)
      if (!next) return
      try {
        await this.startQueuedTurn(next)
        if (await this.hasQueuedTurns(threadId)) {
          this.scheduleThreadQueueDrain(threadId)
        }
      } catch {
        await this.restoreQueuedTurn(next)
        this.scheduleThreadQueueDrain(threadId)
      }
    } catch {
      // Queue processing is best-effort. Keep the bridge alive if app-server is unavailable.
      this.scheduleThreadQueueDrain(threadId)
    } finally {
      this.processingThreadIds.delete(threadId)
    }
  }

  private async hasQueuedTurns(threadId: string): Promise<boolean> {
    const state = await readThreadQueueState()
    const queue = state[threadId]
    return Array.isArray(queue) && queue.length > 0
  }

  private async canStartQueuedTurn(threadId: string): Promise<boolean> {
    const response = asRecord(await this.appServer.rpc('thread/read', { threadId, includeTurns: true }))
    const thread = asRecord(response?.thread)
    if (!thread) return false

    const status = asRecord(thread.status)
    const statusType = readNonEmptyString(status?.type)
    if (statusType === 'inProgress' || statusType === 'running' || statusType === 'active') return false

    const turns = Array.isArray(thread.turns) ? thread.turns : []
    return !turns.some((turn) => readNonEmptyString(asRecord(turn)?.status) === 'inProgress')
  }

  private async popNextQueuedTurn(threadId: string): Promise<BackendQueuedTurn | null> {
    return withThreadQueueStateUpdate((state) => {
      const queue = state[threadId]
      if (!queue || queue.length === 0) {
        return { nextState: state, result: null }
      }

      const [message, ...rest] = queue
      const nextState = { ...state }
      if (rest.length > 0) {
        nextState[threadId] = rest
      } else {
        delete nextState[threadId]
      }
      return { nextState, result: { threadId, message } }
    })
  }

  private async restoreQueuedTurn(turn: BackendQueuedTurn): Promise<void> {
    await withThreadQueueStateUpdate((state) => {
      const queue = state[turn.threadId] ?? []
      return {
        nextState: {
          ...state,
          [turn.threadId]: [turn.message, ...queue],
        },
        result: undefined,
      }
    })
  }

  private async resolveCollaborationModeSettings(mode: CollaborationModeKind): Promise<ResolvedCollaborationModeSettings> {
    let currentConfig: Record<string, unknown> | null = null
    try {
      const configPayload = asRecord(await this.appServer.rpc('config/read', {}))
      currentConfig = asRecord(configPayload?.config)
    } catch {
      currentConfig = null
    }

    const configuredModel = readNonEmptyString(currentConfig?.model)
    if (configuredModel) {
      return {
        model: configuredModel,
        reasoningEffort: normalizeCollaborationModeReasoningEffort(normalizeReasoningEffort(currentConfig?.model_reasoning_effort)),
      }
    }

    try {
      const modelsPayload = asRecord(await this.appServer.rpc('model/list', {}))
      const models = Array.isArray(modelsPayload?.data) ? modelsPayload.data : []
      for (const row of models) {
        const record = asRecord(row)
        const candidate = readNonEmptyString(record?.id) || readNonEmptyString(record?.model)
        if (candidate) {
          return {
            model: candidate,
            reasoningEffort: normalizeCollaborationModeReasoningEffort(normalizeReasoningEffort(currentConfig?.model_reasoning_effort)),
          }
        }
      }
    } catch {
      // Fall through to no collaboration-mode payload.
    }

    throw new Error(`${mode === 'plan' ? 'Plan' : 'Default'} mode requires an available model.`)
  }

  private async buildQueuedTurnParams(turn: BackendQueuedTurn): Promise<Record<string, unknown>> {
    const localImageAttachments: StoredQueuedMessage['fileAttachments'] = []
    for (const imageUrl of turn.message.imageUrls) {
      const localImagePath = extractLocalImagePathFromUrl(imageUrl.trim())
      if (!localImagePath) continue
      localImageAttachments.push({
        label: fileNameFromPath(localImagePath),
        path: localImagePath,
        fsPath: localImagePath,
      })
    }

    const allFileAttachments = [...turn.message.fileAttachments, ...localImageAttachments]
    const dedupedFileAttachments = allFileAttachments.filter((entry, index) =>
      allFileAttachments.findIndex((candidate) => candidate.fsPath === entry.fsPath) === index)

    const input: Array<Record<string, unknown>> = [{
      type: 'text',
      text: buildTextWithAttachments(turn.message.text, dedupedFileAttachments),
    }]

    for (const imageUrl of turn.message.imageUrls) {
      const normalizedUrl = imageUrl.trim()
      if (!normalizedUrl) continue
      const localImagePath = extractLocalImagePathFromUrl(normalizedUrl)
      if (localImagePath) {
        input.push({ type: 'localImage', path: localImagePath })
      } else {
        input.push({ type: 'image', url: normalizedUrl, image_url: normalizedUrl })
      }
    }

    for (const skill of turn.message.skills) {
      input.push({ type: 'skill', name: skill.name, path: skill.path })
    }

    const params: Record<string, unknown> = {
      threadId: turn.threadId,
      input,
    }
    if (dedupedFileAttachments.length > 0) {
      params.attachments = dedupedFileAttachments.map((f) => ({ label: f.label, path: f.path, fsPath: f.fsPath }))
    }

    try {
      const settings = await this.resolveCollaborationModeSettings(turn.message.collaborationMode)
      params.collaborationMode = {
        mode: turn.message.collaborationMode,
        settings: {
          model: settings.model,
          reasoning_effort: settings.reasoningEffort,
          developer_instructions: null,
        },
      }
    } catch {
      // Older app-server versions still accept a plain turn/start without collaborationMode.
    }

    return params
  }

  private async startQueuedTurn(turn: BackendQueuedTurn): Promise<void> {
    await this.appServer.rpc('thread/resume', { threadId: turn.threadId })
    await this.appServer.rpc('turn/start', await this.buildQueuedTurnParams(turn))
  }
}

class MethodCatalog {
  private methodCache: string[] | null = null
  private notificationCache: string[] | null = null

  private async runGenerateSchemaCommand(outDir: string): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      const codexCommand = resolveCodexCommand()
      if (!codexCommand) {
        reject(new Error('Codex CLI is not available. Install @openai/codex or set CODES_CODEX_COMMAND.'))
        return
      }

      const invocation = getSpawnInvocation(codexCommand, ['app-server', 'generate-json-schema', '--out', outDir])
      const process = spawn(invocation.command, invocation.args, {
        stdio: ['ignore', 'ignore', 'pipe'],
      })

      let stderr = ''

      process.stderr.setEncoding('utf8')
      process.stderr.on('data', (chunk: string) => {
        stderr += chunk
      })

      process.on('error', reject)
      process.on('exit', (code) => {
        if (code === 0) {
          resolve()
          return
        }

        reject(new Error(stderr.trim() || `generate-json-schema exited with code ${String(code)}`))
      })
    })
  }

  private extractMethodsFromClientRequest(payload: unknown): string[] {
    const root = asRecord(payload)
    const oneOf = Array.isArray(root?.oneOf) ? root.oneOf : []
    const methods = new Set<string>()

    for (const entry of oneOf) {
      const row = asRecord(entry)
      const properties = asRecord(row?.properties)
      const methodDef = asRecord(properties?.method)
      const methodEnum = Array.isArray(methodDef?.enum) ? methodDef.enum : []

      for (const item of methodEnum) {
        if (typeof item === 'string' && item.length > 0) {
          methods.add(item)
        }
      }
    }

    return Array.from(methods).sort((a, b) => a.localeCompare(b))
  }

  private extractMethodsFromServerNotification(payload: unknown): string[] {
    const root = asRecord(payload)
    const oneOf = Array.isArray(root?.oneOf) ? root.oneOf : []
    const methods = new Set<string>()

    for (const entry of oneOf) {
      const row = asRecord(entry)
      const properties = asRecord(row?.properties)
      const methodDef = asRecord(properties?.method)
      const methodEnum = Array.isArray(methodDef?.enum) ? methodDef.enum : []

      for (const item of methodEnum) {
        if (typeof item === 'string' && item.length > 0) {
          methods.add(item)
        }
      }
    }

    return Array.from(methods).sort((a, b) => a.localeCompare(b))
  }

  async listMethods(): Promise<string[]> {
    if (this.methodCache) {
      return this.methodCache
    }

    const outDir = await mkdtemp(join(tmpdir(), 'codes-schema-'))
    await this.runGenerateSchemaCommand(outDir)

    const clientRequestPath = join(outDir, 'ClientRequest.json')
    const raw = await readFile(clientRequestPath, 'utf8')
    const parsed = JSON.parse(raw) as unknown
    const methods = this.extractMethodsFromClientRequest(parsed)

    this.methodCache = methods
    return methods
  }

  async listNotificationMethods(): Promise<string[]> {
    if (this.notificationCache) {
      return this.notificationCache
    }

    const outDir = await mkdtemp(join(tmpdir(), 'codes-schema-'))
    await this.runGenerateSchemaCommand(outDir)

    const serverNotificationPath = join(outDir, 'ServerNotification.json')
    const raw = await readFile(serverNotificationPath, 'utf8')
    const parsed = JSON.parse(raw) as unknown
    const methods = this.extractMethodsFromServerNotification(parsed)

    this.notificationCache = methods
    return methods
  }
}

type CodexBridgeMiddleware = ((req: IncomingMessage, res: ServerResponse, next: () => void) => Promise<void>) & {
  dispose: () => void
  subscribeNotifications: (listener: (value: { method: string; params: unknown; atIso: string }) => void) => () => void
}

type BridgeNotification = {
  method: string
  params: unknown
  atIso: string
}

type SharedBridgeState = {
  version: string
  appServer: AppServerProcess
  methodCatalog: MethodCatalog
  telegramBridge: TelegramThreadBridge
  backendQueueProcessor: BackendQueueProcessor
}

const SHARED_BRIDGE_KEY = '__codexRemoteSharedBridge__'
const SHARED_BRIDGE_VERSION = 'experimental-api-v2'

function getSharedBridgeState(): SharedBridgeState {
  const globalScope = globalThis as typeof globalThis & {
    [SHARED_BRIDGE_KEY]?: SharedBridgeState
  }

  const existing = globalScope[SHARED_BRIDGE_KEY]
  if (existing) {
    if (existing.version === SHARED_BRIDGE_VERSION) {
      return existing
    }
    existing.appServer.dispose()
    existing.backendQueueProcessor?.dispose()
  }

  const appServer = new AppServerProcess()
  const backendQueueProcessor = new BackendQueueProcessor(appServer)
  const created: SharedBridgeState = {
    version: SHARED_BRIDGE_VERSION,
    appServer,
    methodCatalog: new MethodCatalog(),
    backendQueueProcessor,
    telegramBridge: new TelegramThreadBridge(appServer, {
      onChatSeen: (chatId) => {
        void rememberTelegramChatId(chatId).catch(() => {})
      },
    }),
  }
  globalScope[SHARED_BRIDGE_KEY] = created
  return created
}

async function loadAllThreadsForSearch(appServer: AppServerProcess): Promise<ThreadSearchDocument[]> {
  const threads: Array<{ id: string; title: string; preview: string }> = []
  let cursor: string | null = null

  do {
    const response = asRecord(await appServer.rpc('thread/list', {
      archived: false,
      limit: 100,
      sortKey: 'updated_at',
      modelProviders: [],
      cursor,
    }))
    const data = Array.isArray(response?.data) ? response.data : []
    for (const row of data) {
      const record = asRecord(row)
      const id = typeof record?.id === 'string' ? record.id : ''
      if (!id) continue
      const title = typeof record?.name === 'string' && record.name.trim().length > 0
        ? record.name.trim()
        : (typeof record?.preview === 'string' && record.preview.trim().length > 0 ? record.preview.trim() : 'Untitled thread')
      const preview = typeof record?.preview === 'string' ? record.preview : ''
      threads.push({ id, title, preview })
    }
    cursor = typeof response?.nextCursor === 'string' && response.nextCursor.length > 0 ? response.nextCursor : null
  } while (cursor)

  const docs: ThreadSearchDocument[] = threads.map((thread) => {
    const searchableText = [thread.title, thread.preview].filter(Boolean).join('\n')
    return {
      id: thread.id,
      title: thread.title,
      preview: thread.preview,
      messageText: '',
      searchableText,
    } satisfies ThreadSearchDocument
  })

  const docsById = new Map<string, ThreadSearchDocument>(docs.map((doc) => [doc.id, doc]))
  const fullTextThreads = threads.slice(0, THREAD_SEARCH_FULL_TEXT_THREAD_LIMIT)
  const concurrency = 4
  for (let offset = 0; offset < fullTextThreads.length; offset += concurrency) {
    const batch = fullTextThreads.slice(offset, offset + concurrency)
    const loaded = await Promise.all(batch.map(async (thread) => {
      try {
        const readResponse = await appServer.rpc('thread/read', {
          threadId: thread.id,
          includeTurns: true,
        })
        const messageText = extractThreadMessageText(readResponse)
        const searchableText = [thread.title, thread.preview, messageText].filter(Boolean).join('\n')
        return [thread.id, {
          id: thread.id,
          title: thread.title,
          preview: thread.preview,
          messageText,
          searchableText,
        } satisfies ThreadSearchDocument] as const
      } catch {
        return null
      }
    }))
    for (const row of loaded) {
      if (!row) continue
      docsById.set(row[0], row[1])
    }
  }

  return Array.from(docsById.values())
}

async function buildThreadSearchIndex(appServer: AppServerProcess): Promise<ThreadSearchIndex> {
  const docs = await loadAllThreadsForSearch(appServer)
  const docsById = new Map<string, ThreadSearchDocument>(docs.map((doc) => [doc.id, doc]))
  return { docsById }
}

export function createCodexBridgeMiddleware(): CodexBridgeMiddleware {
  const { appServer, methodCatalog, telegramBridge, backendQueueProcessor } = getSharedBridgeState()
  let threadSearchIndex: ThreadSearchIndex | null = null
  let threadSearchIndexPromise: Promise<ThreadSearchIndex> | null = null
  const bridgeNotificationListeners = new Set<(value: BridgeNotification) => void>()

  function emitBridgeNotification(method: string, params: unknown): void {
    const notification: BridgeNotification = {
      method,
      params,
      atIso: new Date().toISOString(),
    }
    for (const listener of bridgeNotificationListeners) {
      listener(notification)
    }
  }

  const stopModelCatalogWatcher = watchModelCatalogConfigFile((configPath) => {
    emitBridgeNotification('codes/modelCatalog/changed', { configPath })
  })

  async function getThreadSearchIndex(): Promise<ThreadSearchIndex> {
    if (threadSearchIndex) return threadSearchIndex
    if (!threadSearchIndexPromise) {
      threadSearchIndexPromise = buildThreadSearchIndex(appServer)
        .then((index) => {
          threadSearchIndex = index
          return index
        })
        .finally(() => {
          threadSearchIndexPromise = null
        })
    }
    return threadSearchIndexPromise
  }

  function clearDeletedThreadRuntimeState(threadIds: string[]): void {
    if (threadIds.length === 0) return
    threadSearchIndex = null
    threadSearchIndexPromise = null
    for (const threadId of threadIds) {
      appServer.clearDeletedThreadState(threadId)
      backendQueueProcessor.cancelThread(threadId)
    }
  }
  void readTelegramBridgeConfig()
    .then((config) => {
      if (!config.botToken) return
      telegramBridge.configureToken(config.botToken)
      telegramBridge.configureAllowedUserIds(config.allowedUserIds)
      telegramBridge.start()
    })
    .catch(() => {})

  const middleware = async (req: IncomingMessage, res: ServerResponse, next: () => void) => {
    const requestStartNs = process.hrtime.bigint()
    const rawUrl = req.url ?? ''
    const parsedRequestUrl = rawUrl ? new URL(rawUrl, 'http://localhost') : null
    const requestPath = parsedRequestUrl?.pathname ?? ''
    const requestMethod = req.method ?? 'UNKNOWN'
    const rawContentLength = Array.isArray(req.headers['content-length'])
      ? req.headers['content-length'][0]
      : req.headers['content-length']
    const parsedContentLength = rawContentLength ? Number.parseInt(rawContentLength, 10) : NaN
    let requestBodyBytes: number | null = Number.isFinite(parsedContentLength) && parsedContentLength >= 0
      ? parsedContentLength
      : null
    let responseBodyBytes = 0
    let rpcMethod: string | null = null
    const originalWrite = res.write.bind(res)
    const originalEnd = res.end.bind(res)
    res.write = ((chunk: unknown, encoding?: unknown, cb?: unknown) => {
      const resolvedEncoding = typeof encoding === 'string' ? encoding as BufferEncoding : undefined
      responseBodyBytes += getChunkByteLength(chunk, resolvedEncoding)
      return originalWrite(chunk as never, encoding as never, cb as never)
    }) as typeof res.write
    res.end = ((chunk?: unknown, encoding?: unknown, cb?: unknown) => {
      const resolvedEncoding = typeof encoding === 'string' ? encoding as BufferEncoding : undefined
      responseBodyBytes += getChunkByteLength(chunk, resolvedEncoding)
      return originalEnd(chunk as never, encoding as never, cb as never)
    }) as typeof res.end
    let didLog = false
    const logApiRequestDuration = () => {
      if (!API_PERF_LOGGING_ENABLED || didLog || !requestPath.startsWith('/codex-api/')) return
      const durationMs = Number((process.hrtime.bigint() - requestStartNs) / 1_000_000n)
      const requestBytes = requestBodyBytes ?? 0
      const bodyMbValue = (requestBytes + responseBodyBytes) / MB_DIVISOR
      const shouldLog = durationMs > API_PERF_MS_THRESHOLD || bodyMbValue > API_PERF_BODY_MB_THRESHOLD
      if (!shouldLog) return
      didLog = true
      const rpcPart = rpcMethod ? `, rpcMethod=${rpcMethod}` : ''
      console.info(`[codex-api-perf] ${requestMethod} ${requestPath} -> ${res.statusCode} (${durationMs}ms, bodyMB=${bodyMbValue.toFixed(1)}${rpcPart})`)
    }
    res.once('finish', logApiRequestDuration)
    res.once('close', logApiRequestDuration)

    try {
      if (!req.url) {
        next()
        return
      }

      const url = new URL(req.url, 'http://localhost')

      if (await handleAccountRoutes(req, res, url, { appServer })) {
        return
      }

      if (await handleSkillsRoutes(req, res, url, { appServer, readJsonBody })) {
        return
      }

      if (await handleReviewRoutes(req, res, url, { readJsonBody })) {
        return
      }

      if (await handleModelCatalogRoutes(req, res, url, {
        readJsonBody,
        readCodexModelIds: () => readCodexBackedModelIds(appServer),
        readProviderModelIds: async () => (await readProviderBackedModelIds(appServer)).data,
      })) {
        return
      }

      if (req.method === 'POST' && url.pathname === '/codex-api/upload-file') {
        handleFileUpload(req, res)
        return
      }

      if (req.method === 'POST' && url.pathname === '/codex-api/rpc') {
        const payload = await readJsonBody(req)
        const body = asRecord(payload) as RpcProxyRequest | null
        if (payload !== null && payload !== undefined) {
          requestBodyBytes = Buffer.byteLength(JSON.stringify(payload), 'utf8')
        }
        rpcMethod = body?.method && typeof body.method === 'string' ? body.method : null

	        if (!body || typeof body.method !== 'string' || body.method.length === 0) {
	          setJson(res, 400, { error: 'Invalid body: expected { method, params? }' })
	          return
	        }

	        if (body.method === 'generate-thread-title') {
	          setJson(res, 200, { result: { title: '' } })
	          return
	        }

	        if (body.method === 'account/rateLimits/read' && !(await hasUsableCodexAuth())) {
	          setJson(res, 200, { result: null })
	          return
	        }

        let rpcResult: unknown
        try {
          rpcResult = await callRpcWithArchiveRecovery(appServer, body.method, body.params ?? null)
        } catch (error) {
	          if (body.method === 'account/rateLimits/read' && isUnauthenticatedRateLimitError(error)) {
	            setJson(res, 200, { result: null })
	            return
	          }
	          if (body.method === 'thread/read' && isEmptyThreadReadError(error)) {
	            const params = asRecord(body.params)
	            const threadId = typeof params?.threadId === 'string' ? params.threadId.trim() : ''
	            const snapshot = threadId ? appServer.getLastThreadReadSnapshot(threadId) : null
	            if (snapshot) {
	              setJson(res, 200, { result: snapshot })
	              return
	            }
	          }
	          throw error
	        }
        const trimmedResult = trimThreadTurnsInRpcResult(body.method, rpcResult)
        const sanitizedResult = await sanitizeThreadTurnsInlinePayloads(body.method, trimmedResult)
        const result = THREAD_METHODS_WITH_TURNS.has(body.method)
          ? await mergeSessionSkillInputsIntoThreadResult(sanitizedResult)
          : sanitizedResult

	        if (THREAD_METHODS_WITH_THREAD_SNAPSHOT.has(body.method)) {
	          const rpcRecord = asRecord(result)
	          const rpcThread = asRecord(rpcRecord?.thread)
	          const rpcThreadId = typeof rpcThread?.id === 'string' ? rpcThread.id : ''
          if (rpcThreadId) {
            appServer.storeThreadReadSnapshot(rpcThreadId, result)
          }
        }

        setJson(res, 200, { result })
        return
      }

      if (req.method === 'DELETE' && url.pathname === '/codex-api/thread-session') {
        const threadId = url.searchParams.get('threadId')?.trim() ?? ''
        if (!threadId) {
          setJson(res, 400, { error: 'Missing threadId' })
          return
        }
        try {
          const result = await deleteThreadSessionsById(appServer, [threadId])
          clearDeletedThreadRuntimeState(result.deletedThreadIds)
          setJson(res, 200, { data: result })
        } catch (error) {
          const message = getErrorMessage(error, 'Failed to delete thread session')
          setJson(res, message.includes('still running') ? 409 : 400, { error: message })
        }
        return
      }

      if (req.method === 'DELETE' && url.pathname === '/codex-api/project-sessions') {
        const cwd = url.searchParams.get('cwd')?.trim() ?? ''
        if (!cwd) {
          setJson(res, 400, { error: 'Missing cwd' })
          return
        }
        try {
          const result = await deleteThreadSessionsByExactCwd(appServer, cwd)
          clearDeletedThreadRuntimeState(result.deletedThreadIds)
          setJson(res, 200, { data: result })
        } catch (error) {
          const message = getErrorMessage(error, 'Failed to delete project sessions')
          setJson(res, message.includes('still running') ? 409 : 400, { error: message })
        }
        return
      }

      if (req.method === 'GET' && url.pathname === '/codex-api/thread-turn-page') {
        try {
          const threadId = url.searchParams.get('threadId')?.trim() ?? ''
          const beforeTurnId = url.searchParams.get('beforeTurnId')?.trim() ?? ''
          const limitRaw = url.searchParams.get('limit')?.trim() ?? String(THREAD_RESPONSE_TURN_LIMIT)
          const limit = Math.max(1, Math.min(50, Number.parseInt(limitRaw, 10) || THREAD_RESPONSE_TURN_LIMIT))
          if (!threadId) {
            setJson(res, 400, { error: 'Missing threadId' })
            return
          }

          const threadReadResult = await appServer.readThreadForTurnPage(threadId)
          const record = asRecord(threadReadResult)
          const thread = asRecord(record?.thread)
          if (!record || !thread) {
            setJson(res, 502, { error: 'thread/read returned an invalid thread response' })
            return
          }

          const turns = Array.isArray(thread.turns) ? thread.turns : []
          const beforeIndex = beforeTurnId
            ? turns.findIndex((turn) => asRecord(turn)?.id === beforeTurnId)
            : turns.length
          if (beforeTurnId && beforeIndex < 0) {
            setJson(res, 200, {
              result: {
                ...record,
                thread: {
                  ...thread,
                  turns: [],
                },
              },
              startTurnIndex: 0,
              hasMoreOlder: false,
            })
            return
          }

          const endIndex = beforeIndex
          const startIndex = Math.max(0, endIndex - limit)
          const pageTurns = turns.slice(startIndex, endIndex)
          const pagedResult = {
            ...record,
            thread: {
              ...thread,
              turns: pageTurns,
            },
          }
          const sanitized = await sanitizeThreadTurnsInlinePayloads('thread/read', pagedResult)
          const result = await mergeSessionSkillInputsIntoThreadResult(sanitized)

          setJson(res, 200, {
            result,
            startTurnIndex: startIndex,
            hasMoreOlder: startIndex > 0,
          })
        } catch (error) {
          setJson(res, 500, { error: getErrorMessage(error, 'Failed to load earlier thread messages') })
        }
        return
      }

      if (req.method === 'GET' && url.pathname === '/codex-api/thread-file-change-fallback') {
        const threadId = url.searchParams.get('threadId')?.trim() ?? ''
        if (!threadId) {
          setJson(res, 400, { error: 'Missing threadId' })
          return
        }

        const threadReadResult = await appServer.rpc('thread/read', {
          threadId,
          includeTurns: true,
        })
        const threadReadRecord = asRecord(threadReadResult)
        const threadRecord = asRecord(threadReadRecord?.thread)
        const sessionPath = readNonEmptyString(threadRecord?.path)
        if (!sessionPath || !isAbsolute(sessionPath)) {
          setJson(res, 200, { data: [] })
          return
        }

        try {
          const sessionLogRaw = await readFile(sessionPath, 'utf8')
          setJson(res, 200, { data: buildSessionFileChangeFallback(threadReadResult, sessionLogRaw) })
        } catch {
          setJson(res, 200, { data: [] })
        }
        return
      }

      if (req.method === 'GET' && url.pathname === '/codex-api/thread-stream-events') {
        const threadId = url.searchParams.get('threadId')?.trim() ?? ''
        const limitRaw = url.searchParams.get('limit')?.trim() ?? '80'
        const limit = Math.max(1, Math.min(400, Number.parseInt(limitRaw, 10) || 80))
        if (!threadId) {
          setJson(res, 400, { error: 'Missing threadId' })
          return
        }
        const events = appServer.getStreamEvents(threadId, limit)
        setJson(res, 200, { events })
        return
      }

      if (req.method === 'GET' && url.pathname === '/codex-api/thread-live-state') {
        const threadId = url.searchParams.get('threadId')?.trim() ?? ''
        if (!threadId) {
          setJson(res, 400, { error: 'Missing threadId' })
          return
        }

        try {
          const threadReadResult = await appServer.rpc('thread/read', {
            threadId,
            includeTurns: true,
          })
          const sanitized = await sanitizeThreadTurnsInlinePayloads('thread/read', threadReadResult)
          appServer.storeThreadReadSnapshot(threadId, sanitized)

          const record = asRecord(sanitized)
          const thread = asRecord(record?.thread)
          const rawTurns = Array.isArray(thread?.turns) ? thread.turns : []

          const sessionPath = readNonEmptyString(thread?.path)
          let sessionSize = 0
          if (sessionPath && isAbsolute(sessionPath)) {
            try {
              const s = await stat(sessionPath)
              sessionSize = s.size
            } catch { /* missing */ }
          }

          const cached = appServer.getCachedLiveState(threadId, rawTurns.length, sessionSize)
          if (cached) {
            setJson(res, 200, cached)
            return
          }

          let turns = appServer.mergeItemsIntoTurns(threadId, rawTurns)

          if (sessionPath && isAbsolute(sessionPath) && sessionSize > 0) {
            try {
              const sessionLogRaw = await readFile(sessionPath, 'utf8')
              turns = mergeSessionCommandsIntoTurns(turns, sessionLogRaw)
            } catch {
              // Session log not available — continue without command recovery
            }
          }

          const lastTurn = turns.length > 0 ? asRecord(turns[turns.length - 1]) : null
          const isInProgress = lastTurn?.status === 'inProgress'

          const responseData = {
            threadId,
            conversationState: {
              turns,
            },
            ownerClientId: null,
            liveStateError: null,
            isInProgress,
          }

          if (!isInProgress) {
            appServer.cacheLiveState(threadId, responseData, rawTurns.length, sessionSize)
          }

          setJson(res, 200, responseData)
        } catch (error) {
          const snapshot = appServer.getLastThreadReadSnapshot(threadId)
          if (snapshot) {
            const record = asRecord(snapshot)
            const thread = asRecord(record?.thread)
            const rawTurns = Array.isArray(thread?.turns) ? thread.turns : []
            const turns = appServer.mergeItemsIntoTurns(threadId, rawTurns)
            setJson(res, 200, {
              threadId,
              conversationState: { turns },
              ownerClientId: null,
              liveStateError: {
                kind: 'readFailed',
                message: getErrorMessage(error, 'thread/read failed'),
              },
              isInProgress: false,
            })
          } else {
            setJson(res, 200, {
              threadId,
              conversationState: null,
              ownerClientId: null,
              liveStateError: {
                kind: 'readFailed',
                message: getErrorMessage(error, 'thread/read failed'),
              },
              isInProgress: false,
            })
          }
        }
        return
      }

      if (req.method === 'POST' && url.pathname === '/codex-api/thread/rollback-files') {
        try {
          const body = asRecord(await readJsonBody(req))
          const threadId = readNonEmptyString(body?.threadId)
          const turnId = readNonEmptyString(body?.turnId)
          const cwd = readNonEmptyString(body?.cwd)
          if (!threadId || !turnId || !cwd) {
            setJson(res, 400, { error: 'Missing threadId, turnId, or cwd' })
            return
          }

          const threadReadResult = await appServer.rpc('thread/read', { threadId, includeTurns: true })
          const record = asRecord(threadReadResult)
          const thread = asRecord(record?.thread)
          const turns = Array.isArray(thread?.turns) ? thread.turns : []
          const sessionPath = readNonEmptyString(thread?.path)

          if (!sessionPath || !isAbsolute(sessionPath)) {
            setJson(res, 200, { reverted: 0, errors: [], message: 'No session log available' })
            return
          }

          let foundTurnIndex = -1
          const turnIdsToRevert = new Set<string>()
          for (let i = 0; i < turns.length; i++) {
            const turnRecord = asRecord(turns[i])
            const id = readNonEmptyString(turnRecord?.id)
            if (id === turnId) {
              foundTurnIndex = i
            }
            if (foundTurnIndex >= 0 && id) {
              turnIdsToRevert.add(id)
            }
          }

          if (turnIdsToRevert.size === 0) {
            setJson(res, 200, { reverted: 0, errors: [], message: 'No turns to revert' })
            return
          }

          let sessionLogRaw: string
          try {
            sessionLogRaw = await readFile(sessionPath, 'utf8')
          } catch {
            setJson(res, 200, { reverted: 0, errors: ['Could not read session log'], message: 'Session log unreadable' })
            return
          }

          const turnInfos = collectFileChangesForTurns(sessionLogRaw, turnIdsToRevert, cwd)
          if (turnInfos.size === 0) {
            setJson(res, 200, { reverted: 0, errors: [], message: 'No file changes to revert' })
            return
          }

          const result = await revertTurnFileChanges(cwd, turnInfos)
          setJson(res, 200, { ...result, message: `Reverted ${result.reverted} file change(s)` })
        } catch (error) {
          setJson(res, 500, { error: getErrorMessage(error, 'Failed to revert file changes') })
        }
        return
      }

      if (req.method === 'POST' && url.pathname === '/codex-api/transcribe') {
        const auth = await readCodexAuth()
        if (!auth) {
          setJson(res, 401, { error: 'No auth token available for transcription' })
          return
        }

        const rawBody = await readRawBody(req)
        const incomingCt = req.headers['content-type'] ?? 'application/octet-stream'
        const upstream = await proxyTranscribe(rawBody, incomingCt, auth.accessToken, auth.accountId)

        res.statusCode = upstream.status
        res.setHeader('Content-Type', 'application/json; charset=utf-8')
        res.end(upstream.body)
        return
      }

      if (req.method === 'POST' && url.pathname === '/codex-api/server-requests/respond') {
        const payload = await readJsonBody(req)
        await appServer.respondToServerRequest(payload)
        setJson(res, 200, { ok: true })
        return
      }

      if (req.method === 'GET' && url.pathname === '/codex-api/server-requests/pending') {
        setJson(res, 200, { data: appServer.listPendingServerRequests() })
        return
      }

      if (req.method === 'GET' && url.pathname === '/codex-api/meta/methods') {
        const methods = await methodCatalog.listMethods()
        setJson(res, 200, { data: methods })
        return
      }

      if (req.method === 'GET' && url.pathname === '/codex-api/meta/notifications') {
        const methods = await methodCatalog.listNotificationMethods()
        setJson(res, 200, { data: methods })
        return
      }

      if (req.method === 'GET' && url.pathname === '/codex-api/provider-models') {
        const data = await readProviderBackedModelIds(appServer)
        setJson(res, 200, data)
        return
      }

      if (req.method === 'GET' && url.pathname === '/codex-api/workspace-roots-state') {
        const state = await readWorkspaceRootsState()
        setJson(res, 200, { data: state })
        return
      }

      if (req.method === 'GET' && url.pathname === '/codex-api/thread-queue-state') {
        const state = await readThreadQueueState()
        setJson(res, 200, { data: state })
        return
      }

      if (req.method === 'GET' && url.pathname === '/codex-api/home-directory') {
        setJson(res, 200, { data: { path: homedir() } })
        return
      }

      if (req.method === 'POST' && url.pathname === '/codex-api/worktree/create') {
        const payload = asRecord(await readJsonBody(req))
        const rawSourceCwd = typeof payload?.sourceCwd === 'string' ? payload.sourceCwd.trim() : ''
        const baseBranch = typeof payload?.baseBranch === 'string' ? payload.baseBranch.trim() : ''
        if (!rawSourceCwd) {
          setJson(res, 400, { error: 'Missing sourceCwd' })
          return
        }

        const sourceCwd = isAbsolute(rawSourceCwd) ? rawSourceCwd : resolve(rawSourceCwd)
        try {
          const sourceInfo = await stat(sourceCwd)
          if (!sourceInfo.isDirectory()) {
            setJson(res, 400, { error: 'sourceCwd is not a directory' })
            return
          }
        } catch {
          setJson(res, 404, { error: 'sourceCwd does not exist' })
          return
        }

        try {
          let gitRoot = ''
          try {
            gitRoot = await runCommandCapture('git', ['rev-parse', '--show-toplevel'], { cwd: sourceCwd })
          } catch (error) {
            if (!isNotGitRepositoryError(error)) throw error
            await runCommand('git', ['init'], { cwd: sourceCwd })
            gitRoot = await runCommandCapture('git', ['rev-parse', '--show-toplevel'], { cwd: sourceCwd })
          }
          const repoName = basename(gitRoot) || 'repo'
          const worktreesRoot = join(getCodexHomeDir(), 'worktrees')
          await mkdir(worktreesRoot, { recursive: true })

          // Match Codex desktop layout so project grouping resolves to repo name:
          // ~/.codex/worktrees/<id>/<repoName>
          let worktreeId = ''
          let worktreeParent = ''
          let worktreeCwd = ''
          for (let attempt = 0; attempt < 12; attempt += 1) {
            const candidate = randomBytes(2).toString('hex')
            const parent = join(worktreesRoot, candidate)
            try {
              await stat(parent)
              continue
            } catch {
              worktreeId = candidate
              worktreeParent = parent
              worktreeCwd = join(parent, repoName)
              break
            }
          }
          if (!worktreeId || !worktreeParent || !worktreeCwd) {
            throw new Error('Failed to allocate a unique worktree id')
          }
          const startPoint = baseBranch || 'HEAD'

          await mkdir(worktreeParent, { recursive: true })
          try {
            await runCommand('git', ['worktree', 'add', '--detach', worktreeCwd, startPoint], { cwd: gitRoot })
          } catch (error) {
            if (!isMissingHeadError(error)) throw error
            await ensureRepoHasInitialCommit(gitRoot)
            await runCommand('git', ['worktree', 'add', '--detach', worktreeCwd, startPoint], { cwd: gitRoot })
          }
          try {
            await persistWorkspaceRoot(worktreeCwd)
          } catch (error) {
            await rollbackCreatedWorktree(gitRoot, worktreeCwd, worktreeParent)
            throw error
          }

          setJson(res, 200, {
            data: {
              cwd: worktreeCwd,
              branch: null,
              gitRoot,
            },
          })
        } catch (error) {
          setJson(res, 500, { error: getErrorMessage(error, 'Failed to create worktree') })
        }
        return
      }

      if (req.method === 'POST' && url.pathname === '/codex-api/worktree/create-permanent') {
        const payload = asRecord(await readJsonBody(req))
        const rawSourceCwd = typeof payload?.sourceCwd === 'string' ? payload.sourceCwd.trim() : ''
        const rawWorktreeName = typeof payload?.worktreeName === 'string' ? payload.worktreeName.trim() : ''
        if (!rawSourceCwd) {
          setJson(res, 400, { error: 'Missing sourceCwd' })
          return
        }
        if (!rawWorktreeName) {
          setJson(res, 400, { error: 'Missing worktreeName' })
          return
        }
        if (rawWorktreeName.includes('/') || rawWorktreeName.includes('\\') || rawWorktreeName === '.' || rawWorktreeName === '..') {
          setJson(res, 400, { error: 'Worktree name must be a single folder name' })
          return
        }

        const sourceCwd = isAbsolute(rawSourceCwd) ? rawSourceCwd : resolve(rawSourceCwd)
        try {
          const sourceInfo = await stat(sourceCwd)
          if (!sourceInfo.isDirectory()) {
            setJson(res, 400, { error: 'sourceCwd is not a directory' })
            return
          }
        } catch {
          setJson(res, 404, { error: 'sourceCwd does not exist' })
          return
        }

        try {
          let gitRoot = ''
          try {
            gitRoot = await runCommandCapture('git', ['rev-parse', '--show-toplevel'], { cwd: sourceCwd })
          } catch (error) {
            if (!isNotGitRepositoryError(error)) throw error
            await runCommand('git', ['init'], { cwd: sourceCwd })
            gitRoot = await runCommandCapture('git', ['rev-parse', '--show-toplevel'], { cwd: sourceCwd })
          }
          const worktreeCwd = join(dirname(gitRoot), rawWorktreeName)
          try {
            await stat(worktreeCwd)
            setJson(res, 409, { error: 'Worktree folder already exists' })
            return
          } catch {
            // Expected for a new worktree path.
          }

          const branchName = await allocatePermanentWorktreeBranchName(gitRoot, rawWorktreeName)
          try {
            await runCommand('git', ['worktree', 'add', '-b', branchName, worktreeCwd, 'HEAD'], { cwd: gitRoot })
          } catch (error) {
            if (!isMissingHeadError(error)) throw error
            await ensureRepoHasInitialCommit(gitRoot)
            await runCommand('git', ['worktree', 'add', '-b', branchName, worktreeCwd, 'HEAD'], { cwd: gitRoot })
          }
          try {
            await persistWorkspaceRoot(worktreeCwd)
          } catch (error) {
            await rollbackCreatedWorktree(gitRoot, worktreeCwd, undefined, branchName)
            throw error
          }

          setJson(res, 200, {
            data: {
              cwd: worktreeCwd,
              branch: branchName,
              gitRoot,
            },
          })
        } catch (error) {
          setJson(res, 500, { error: getErrorMessage(error, 'Failed to create worktree') })
        }
        return
      }

      if (req.method === 'GET' && url.pathname === '/codex-api/worktree/branches') {
        const rawSourceCwd = (url.searchParams.get('sourceCwd') ?? '').trim()
        if (!rawSourceCwd) {
          setJson(res, 400, { error: 'Missing sourceCwd' })
          return
        }
        const sourceCwd = isAbsolute(rawSourceCwd) ? rawSourceCwd : resolve(rawSourceCwd)
        try {
          const sourceInfo = await stat(sourceCwd)
          if (!sourceInfo.isDirectory()) {
            setJson(res, 400, { error: 'sourceCwd is not a directory' })
            return
          }
        } catch {
          setJson(res, 404, { error: 'sourceCwd does not exist' })
          return
        }

        try {
          let gitRoot = ''
          try {
            gitRoot = await runCommandCapture('git', ['rev-parse', '--show-toplevel'], { cwd: sourceCwd })
          } catch (error) {
            if (!isNotGitRepositoryError(error)) throw error
            setJson(res, 200, { data: [] })
            return
          }
          const output = await runCommandCapture(
            'git',
            ['for-each-ref', '--format=%(committerdate:unix)\t%(refname)', 'refs/heads', 'refs/remotes'],
            { cwd: gitRoot },
          )
          const branchActivityByName = new Map<string, number>()
          for (const line of output.split('\n')) {
            const [rawTimestamp = '', rawRefName = ''] = line.split('\t')
            const normalized = normalizeBranchRefName(rawRefName)
            if (!normalized || normalized === 'origin/HEAD') continue
            const parsedTimestamp = Number.parseInt(rawTimestamp.trim(), 10)
            const timestamp = Number.isFinite(parsedTimestamp) ? parsedTimestamp : 0
            const current = branchActivityByName.get(normalized) ?? Number.MIN_SAFE_INTEGER
            if (timestamp > current) {
              branchActivityByName.set(normalized, timestamp)
            }
          }

          const branches = Array.from(branchActivityByName.entries())
            .map(([value]) => ({ value, label: value }))
            .sort((a, b) => {
              const aActivity = branchActivityByName.get(a.value) ?? 0
              const bActivity = branchActivityByName.get(b.value) ?? 0
              if (bActivity !== aActivity) return bActivity - aActivity
              return a.value.localeCompare(b.value)
            })
          setJson(res, 200, { data: branches })
        } catch (error) {
          setJson(res, 500, { error: getErrorMessage(error, 'Failed to list branches') })
        }
        return
      }

      if (req.method === 'GET' && url.pathname === '/codex-api/git/branches') {
        const rawCwd = (url.searchParams.get('cwd') ?? '').trim()
        if (!rawCwd) {
          setJson(res, 400, { error: 'Missing cwd' })
          return
        }
        const cwd = isAbsolute(rawCwd) ? rawCwd : resolve(rawCwd)
        try {
          const cwdInfo = await stat(cwd)
          if (!cwdInfo.isDirectory()) {
            setJson(res, 400, { error: 'cwd is not a directory' })
            return
          }
        } catch {
          setJson(res, 404, { error: 'cwd does not exist' })
          return
        }

        try {
          let gitRoot = ''
          try {
            gitRoot = await runCommandCapture('git', ['rev-parse', '--show-toplevel'], { cwd })
          } catch (error) {
            if (!isNotGitRepositoryError(error)) throw error
            setJson(res, 200, {
              data: {
                currentBranch: null,
                options: [],
              },
            })
            return
          }

          const state = await readGitHeaderState(gitRoot)
          const currentBranch = state.currentBranch
          const output = await runCommandCapture(
            'git',
            ['for-each-ref', '--format=%(committerdate:unix)\t%(refname)\t%(objectname)', 'refs/heads', 'refs/remotes'],
            { cwd: gitRoot },
          )
          const branchActivityByName = new Map<string, { timestamp: number; isRemote: boolean }>()
          for (const line of output.split('\n')) {
            const [rawTimestamp = '', rawRefName = ''] = line.split('\t')
            const normalized = normalizeBranchRefName(rawRefName)
            if (!normalized || normalized === 'origin/HEAD') continue
            const parsedTimestamp = Number.parseInt(rawTimestamp.trim(), 10)
            const timestamp = Number.isFinite(parsedTimestamp) ? parsedTimestamp : 0
            const isRemote = rawRefName.trim().startsWith('refs/remotes/')
            const current = branchActivityByName.get(normalized)
            if (!current || timestamp > current.timestamp) {
              branchActivityByName.set(normalized, { timestamp, isRemote })
            }
          }
          if (currentBranch && !branchActivityByName.has(currentBranch)) {
            branchActivityByName.set(currentBranch, { timestamp: Number.MAX_SAFE_INTEGER, isRemote: false })
          }
          const options = Array.from(branchActivityByName.entries())
            .map(([value, metadata]) => ({
              value,
              label: value,
              isCurrent: value === currentBranch,
              isRemote: metadata.isRemote,
            }))
            .sort((a, b) => {
              const aActivity = branchActivityByName.get(a.value)?.timestamp ?? 0
              const bActivity = branchActivityByName.get(b.value)?.timestamp ?? 0
              if (bActivity !== aActivity) return bActivity - aActivity
              return a.value.localeCompare(b.value)
            })
          setJson(res, 200, {
            data: {
              ...state,
              options,
            },
          })
        } catch (error) {
          setJson(res, 500, { error: getErrorMessage(error, 'Failed to read Git branches') })
        }
        return
      }

      if (req.method === 'GET' && url.pathname === '/codex-api/git/repository-status') {
        const rawCwd = (url.searchParams.get('cwd') ?? '').trim()
        if (!rawCwd) {
          setJson(res, 400, { error: 'Missing cwd' })
          return
        }
        const cwd = isAbsolute(rawCwd) ? rawCwd : resolve(rawCwd)
        try {
          const cwdInfo = await stat(cwd)
          if (!cwdInfo.isDirectory()) {
            setJson(res, 400, { error: 'cwd is not a directory' })
            return
          }
        } catch {
          setJson(res, 404, { error: 'cwd does not exist' })
          return
        }

        try {
          const gitRoot = await runCommandCapture('git', ['rev-parse', '--show-toplevel'], { cwd })
          setJson(res, 200, {
            data: {
              isGitRepo: true,
              gitRoot,
            },
          })
        } catch (error) {
          if (!isNotGitRepositoryError(error)) {
            setJson(res, 500, { error: getErrorMessage(error, 'Failed to read Git repository status') })
            return
          }
          setJson(res, 200, {
            data: {
              isGitRepo: false,
              gitRoot: '',
            },
          })
        }
        return
      }

      if (req.method === 'POST' && url.pathname === '/codex-api/git/checkout') {
        const payload = await readJsonBody(req)
        const record = asRecord(payload)
        if (!record) {
          setJson(res, 400, { error: 'Invalid body: expected object' })
          return
        }
        const rawCwd = readNonEmptyString(record.cwd)
        const targetBranch = readNonEmptyString(record.branch)
        if (!rawCwd) {
          setJson(res, 400, { error: 'Missing cwd' })
          return
        }
        if (!targetBranch) {
          setJson(res, 400, { error: 'Missing branch' })
          return
        }
        const cwd = isAbsolute(rawCwd) ? rawCwd : resolve(rawCwd)
        try {
          const cwdInfo = await stat(cwd)
          if (!cwdInfo.isDirectory()) {
            setJson(res, 400, { error: 'cwd is not a directory' })
            return
          }
        } catch {
          setJson(res, 404, { error: 'cwd does not exist' })
          return
        }
        try {
          const gitRoot = await runCommandCapture('git', ['rev-parse', '--show-toplevel'], { cwd })
          await assertNoTrackedGitChanges(gitRoot)
          await checkoutGitBranchWithWorktreeRecovery(gitRoot, targetBranch)
          setJson(res, 200, { data: await readGitHeaderState(gitRoot) })
        } catch (error) {
          setJson(res, 500, { error: getErrorMessage(error, 'Failed to switch branch') })
        }
        return
      }

      if (req.method === 'GET' && url.pathname === '/codex-api/git/branch-commits') {
        const rawCwd = (url.searchParams.get('cwd') ?? '').trim()
        const branch = (url.searchParams.get('branch') ?? '').trim()
        if (!rawCwd) {
          setJson(res, 400, { error: 'Missing cwd' })
          return
        }
        if (!branch) {
          setJson(res, 400, { error: 'Missing branch' })
          return
        }
        const cwd = isAbsolute(rawCwd) ? rawCwd : resolve(rawCwd)
        try {
          const gitRoot = await runCommandCapture('git', ['rev-parse', '--show-toplevel'], { cwd })
          await runCommandCapture('git', ['rev-parse', '--verify', `${branch}^{commit}`], { cwd: gitRoot })
          const resetHistoryRefPrefix = `refs/codex/header-git-reset-history/${branch}/`
          const resetHistoryRefsRaw = await runCommandCapture(
            'git',
            ['for-each-ref', '--sort=-creatordate', '--format=%(refname)', resetHistoryRefPrefix],
            { cwd: gitRoot },
          ).catch(() => '')
          const resetHistoryRefs = resetHistoryRefsRaw
            .split('\n')
            .map((entry) => entry.trim())
            .filter(Boolean)
            .slice(0, HEADER_GIT_RESET_HISTORY_REF_LIMIT)
          const output = await runCommandCapture(
            'git',
            ['log', '-n', '12', '--date=short', '--format=%H%x09%h%x09%cd%x09%s', branch, ...resetHistoryRefs],
            { cwd: gitRoot },
          )
          const commits = output.split('\n').flatMap((line) => {
            const [sha = '', shortSha = '', date = '', ...subjectParts] = line.split('\t')
            const subject = subjectParts.join('\t').trim()
            return sha.trim() && shortSha.trim()
              ? [{ sha: sha.trim(), shortSha: shortSha.trim(), date: date.trim(), subject: subject || shortSha.trim() }]
              : []
          })
          setJson(res, 200, { data: commits })
        } catch (error) {
          setJson(res, 500, { error: getErrorMessage(error, 'Failed to load branch commits') })
        }
        return
      }

      if (req.method === 'POST' && url.pathname === '/codex-api/git/reset-to-commit') {
        const payload = await readJsonBody(req)
        const record = asRecord(payload)
        if (!record) {
          setJson(res, 400, { error: 'Invalid body: expected object' })
          return
        }
        const rawCwd = readNonEmptyString(record.cwd)
        const branch = readNonEmptyString(record.branch)
        const sha = readNonEmptyString(record.sha)
        if (!rawCwd) {
          setJson(res, 400, { error: 'Missing cwd' })
          return
        }
        if (!branch) {
          setJson(res, 400, { error: 'Missing branch' })
          return
        }
        if (!sha) {
          setJson(res, 400, { error: 'Missing commit' })
          return
        }
        const cwd = isAbsolute(rawCwd) ? rawCwd : resolve(rawCwd)
        try {
          const gitRoot = await runCommandCapture('git', ['rev-parse', '--show-toplevel'], { cwd })
          await assertNoTrackedGitChanges(gitRoot)
          await assertLocalGitBranch(gitRoot, branch)
          const currentBranch = (await runCommandCapture('git', ['branch', '--show-current'], { cwd: gitRoot })).trim()
          if (currentBranch && currentBranch !== branch) {
            await checkoutGitBranchWithWorktreeRecovery(gitRoot, branch)
          } else if (!currentBranch) {
            await checkoutGitBranchWithWorktreeRecovery(gitRoot, branch)
          }
          const previousTip = await runCommandCapture('git', ['rev-parse', 'HEAD'], { cwd: gitRoot })
          const targetSha = await runCommandCapture('git', ['rev-parse', '--verify', `${sha}^{commit}`], { cwd: gitRoot })
          await runCommand('git', ['update-ref', toHeaderGitResetHistoryRef(branch, previousTip.trim()), previousTip.trim()], { cwd: gitRoot })
          await pruneHeaderGitResetHistoryRefs(gitRoot, branch)
          await runCommand('git', ['reset', '--hard', targetSha.trim()], { cwd: gitRoot })
          setJson(res, 200, { data: await readGitHeaderState(gitRoot) })
        } catch (error) {
          setJson(res, 500, { error: getErrorMessage(error, 'Failed to reset branch to commit') })
        }
        return
      }



      if (req.method === 'PUT' && url.pathname === '/codex-api/workspace-roots-state') {
        const payload = await readJsonBody(req)
        const record = asRecord(payload)
        if (!record) {
          setJson(res, 400, { error: 'Invalid body: expected object' })
          return
        }
        await updateWorkspaceRootsState((existingState) => ({
          order: normalizeStringArray(record.order),
          labels: normalizeStringRecord(record.labels),
          active: normalizeStringArray(record.active),
          projectOrder: Array.isArray(record.projectOrder)
            ? normalizeStringArray(record.projectOrder)
            : existingState.projectOrder,
          remoteProjects: existingState.remoteProjects,
        }))
        setJson(res, 200, { ok: true })
        return
      }

      if (req.method === 'PUT' && url.pathname === '/codex-api/thread-queue-state') {
        const payload = await readJsonBody(req)
        const record = asRecord(payload)
        if (!record) {
          setJson(res, 400, { error: 'Invalid body: expected object' })
          return
        }
        await writeThreadQueueState(normalizeThreadQueueState(record))
        void backendQueueProcessor.scheduleAllQueuedThreads()
        setJson(res, 200, { ok: true })
        return
      }

      if (req.method === 'POST' && url.pathname === '/codex-api/project-root') {
        const payload = asRecord(await readJsonBody(req))
        const rawPath = typeof payload?.path === 'string' ? payload.path.trim() : ''
        const createIfMissing = payload?.createIfMissing === true
        const label = typeof payload?.label === 'string' ? payload.label : ''
        if (!rawPath) {
          setJson(res, 400, { error: 'Missing path' })
          return
        }

        const normalizedPath = isAbsolute(rawPath) ? rawPath : resolve(rawPath)
        let pathExists = true
        try {
          const info = await stat(normalizedPath)
          if (!info.isDirectory()) {
            setJson(res, 400, { error: 'Path exists but is not a directory' })
            return
          }
        } catch {
          pathExists = false
        }

        if (!pathExists && createIfMissing) {
          await mkdir(normalizedPath, { recursive: true })
        } else if (!pathExists) {
          setJson(res, 404, { error: 'Directory does not exist' })
          return
        }

        await persistWorkspaceRoot(normalizedPath, label)
        setJson(res, 200, { data: { path: normalizedPath } })
        return
      }

      if (req.method === 'POST' && url.pathname === '/codex-api/local-directory') {
        const payload = asRecord(await readJsonBody(req))
        const rawPath = typeof payload?.path === 'string' ? payload.path.trim() : ''
        if (!rawPath) {
          setJson(res, 400, { error: 'Missing path' })
          return
        }

        const normalizedPath = isAbsolute(rawPath) ? rawPath : resolve(rawPath)
        try {
          const info = await stat(normalizedPath)
          if (!info.isDirectory()) {
            setJson(res, 400, { error: 'Path exists but is not a directory' })
            return
          }
        } catch {
          await mkdir(normalizedPath, { recursive: true })
        }

        setJson(res, 200, { data: { path: normalizedPath } })
        return
      }

      if (req.method === 'POST' && url.pathname === '/codex-api/github-clone') {
        const payload = asRecord(await readJsonBody(req))
        const repoUrl = typeof payload?.url === 'string' ? payload.url.trim() : ''
        const basePath = typeof payload?.basePath === 'string' ? payload.basePath.trim() : ''
        try {
          const clonedPath = await cloneGithubRepositoryIntoBase(repoUrl, basePath)
          setJson(res, 200, { data: { path: clonedPath } })
        } catch (error) {
          setJson(res, 400, { error: error instanceof Error ? error.message : 'Failed to clone GitHub repository' })
        }
        return
      }

      if (req.method === 'POST' && url.pathname === '/codex-api/projectless-thread-cwd') {
        const payload = asRecord(await readJsonBody(req))
        const prompt = typeof payload?.prompt === 'string' ? payload.prompt : null
        try {
          const directory = await createProjectlessThreadDirectory(prompt)
          setJson(res, 200, { data: directory })
        } catch (error) {
          setJson(res, 500, { error: error instanceof Error ? error.message : 'Failed to create new chat folder' })
        }
        return
      }

      if (req.method === 'GET' && url.pathname === '/codex-api/project-root-suggestion') {
        const basePath = url.searchParams.get('basePath')?.trim() ?? ''
        if (!basePath) {
          setJson(res, 400, { error: 'Missing basePath' })
          return
        }
        const normalizedBasePath = isAbsolute(basePath) ? basePath : resolve(basePath)
        try {
          const baseInfo = await stat(normalizedBasePath)
          if (!baseInfo.isDirectory()) {
            setJson(res, 400, { error: 'basePath is not a directory' })
            return
          }
        } catch {
          setJson(res, 404, { error: 'basePath does not exist' })
          return
        }

        let index = 1
        while (index < 100000) {
          const candidateName = `New Project (${String(index)})`
          const candidatePath = join(normalizedBasePath, candidateName)
          try {
            await stat(candidatePath)
            index += 1
            continue
          } catch {
            setJson(res, 200, { data: { name: candidateName, path: candidatePath } })
            return
          }
        }

        setJson(res, 500, { error: 'Failed to compute project name suggestion' })
        return
      }

      if (req.method === 'POST' && url.pathname === '/codex-api/composer-file-search') {
        const payload = asRecord(await readJsonBody(req))
        const rawCwd = typeof payload?.cwd === 'string' ? payload.cwd.trim() : ''
        const query = typeof payload?.query === 'string' ? payload.query.trim() : ''
        const limitRaw = typeof payload?.limit === 'number' ? payload.limit : 20
        const limit = Math.max(1, Math.min(100, Math.floor(limitRaw)))
        if (!rawCwd) {
          setJson(res, 400, { error: 'Missing cwd' })
          return
        }
        const cwd = isAbsolute(rawCwd) ? rawCwd : resolve(rawCwd)
        try {
          const info = await stat(cwd)
          if (!info.isDirectory()) {
            setJson(res, 400, { error: 'cwd is not a directory' })
            return
          }
        } catch {
          setJson(res, 404, { error: 'cwd does not exist' })
          return
        }

        try {
          const files = await listFilesWithRipgrep(cwd)
          const scored = files
            .map((path) => ({ path, score: scoreFileCandidate(path, query) }))
            .filter((row) => query.length === 0 || row.score < 10)
            .sort((a, b) => (a.score - b.score) || a.path.localeCompare(b.path))
            .slice(0, limit)
            .map((row) => ({ path: row.path }))
          setJson(res, 200, { data: scored })
        } catch (error) {
          setJson(res, 500, { error: getErrorMessage(error, 'Failed to search files') })
        }
        return
      }

      if (req.method === 'GET' && url.pathname === '/codex-api/prompts') {
        setJson(res, 200, { data: await listComposerPrompts() })
        return
      }

      if (req.method === 'POST' && url.pathname === '/codex-api/prompts') {
        const payload = asRecord(await readJsonBody(req))
        const name = typeof payload?.name === 'string' ? payload.name.trim() : ''
        const content = typeof payload?.content === 'string' ? payload.content : ''
        if (!name || !content.trim()) {
          setJson(res, 400, { error: 'Prompt name and content are required' })
          return
        }
        try {
          const prompt = await createComposerPromptFile(name, content)
          setJson(res, 200, { data: prompt })
        } catch (error) {
          setJson(res, 500, { error: getErrorMessage(error, 'Failed to create prompt') })
        }
        return
      }

      if (req.method === 'DELETE' && url.pathname === '/codex-api/prompts') {
        const promptPath = url.searchParams.get('path')?.trim() ?? ''
        if (!promptPath) {
          setJson(res, 400, { error: 'Missing path' })
          return
        }
        try {
          const removed = await removeComposerPromptFile(promptPath)
          setJson(res, 200, { data: { removed } })
        } catch (error) {
          setJson(res, 400, { error: getErrorMessage(error, 'Failed to remove prompt') })
        }
        return
      }

      if (req.method === 'GET' && url.pathname === '/codex-api/thread-titles') {
        const cache = await readMergedThreadTitleCache()
        setJson(res, 200, { data: cache })
        return
      }

      if (req.method === 'GET' && url.pathname === '/codex-api/thread-pins') {
        const threadIds = await readPinnedThreadIds()
        setJson(res, 200, { data: { threadIds } })
        return
      }

      if (req.method === 'POST' && url.pathname === '/codex-api/thread-search') {
        const payload = asRecord(await readJsonBody(req))
        const query = typeof payload?.query === 'string' ? payload.query.trim() : ''
        const limitRaw = typeof payload?.limit === 'number' ? payload.limit : 200
        const limit = Math.max(1, Math.min(1000, Math.floor(limitRaw)))
        if (!query) {
          setJson(res, 200, { data: { threadIds: [], indexedThreadCount: 0 } })
          return
        }

        const index = await getThreadSearchIndex()
        const matchedIds = Array.from(index.docsById.entries())
          .filter(([, doc]) => isExactPhraseMatch(query, doc))
          .slice(0, limit)
          .map(([id]) => id)

        setJson(res, 200, { data: { threadIds: matchedIds, indexedThreadCount: index.docsById.size } })
        return
      }

      if (req.method === 'PUT' && url.pathname === '/codex-api/thread-titles') {
        const payload = asRecord(await readJsonBody(req))
        const id = typeof payload?.id === 'string' ? payload.id : ''
        const title = typeof payload?.title === 'string' ? payload.title : ''
        if (!id) {
          setJson(res, 400, { error: 'Missing id' })
          return
        }
        const cache = await readThreadTitleCache()
        const next = title ? updateThreadTitleCache(cache, id, title) : removeFromThreadTitleCache(cache, id)
        await writeThreadTitleCache(next)
        setJson(res, 200, { ok: true })
        return
      }

      if (req.method === 'PUT' && url.pathname === '/codex-api/thread-pins') {
        const payload = asRecord(await readJsonBody(req))
        const threadIds = normalizePinnedThreadIds(payload?.threadIds)
        await writePinnedThreadIds(threadIds)
        setJson(res, 200, { ok: true })
        return
      }

      next()
    } catch (error) {
      const message = getErrorMessage(error, 'Unknown bridge error')
      setJson(res, 502, { error: message })
    }
  }

  middleware.dispose = () => {
    threadSearchIndex = null
    stopModelCatalogWatcher()
    bridgeNotificationListeners.clear()
    telegramBridge.stop()
    backendQueueProcessor.dispose()
    appServer.dispose()
  }
  middleware.subscribeNotifications = (
    listener: (value: BridgeNotification) => void,
  ) => {
    bridgeNotificationListeners.add(listener)
    const unsubscribeAppServer = appServer.onNotification((notification: { method: string; params: unknown }) => {
      listener({
        ...notification,
        atIso: new Date().toISOString(),
      })
    })
    return () => {
      bridgeNotificationListeners.delete(listener)
      unsubscribeAppServer()
    }
  }

  return middleware
}

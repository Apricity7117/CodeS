import { mkdirSync, watch, type FSWatcher } from 'node:fs'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import { ENV_KEYS, readTrimmedEnv } from '../config/env.js'
import type { ReasoningEffort, UiModelOption } from '../types/codex.js'

export type ModelCatalogConfigModel = {
  id: string
  label?: string
  hidden?: boolean
  reasoningEfforts?: ReasoningEffort[]
  defaultReasoningEffort?: ReasoningEffort
}

export type ModelCatalogConfig = {
  models: ModelCatalogConfigModel[]
  order: string[]
}

export type ModelCatalogSource = UiModelOption['source']

export type ModelCatalogBuildInput = {
  codexModelIds: string[]
  providerModelIds: string[]
  config: ModelCatalogConfig
}

export type ModelCatalogResponse = {
  data: UiModelOption[]
  configText: string
  configPath: string
  configError: string | null
}

type ModelCatalogRouteContext = {
  readJsonBody: (req: IncomingMessage) => Promise<unknown>
  readCodexModelIds: () => Promise<string[]>
  readProviderModelIds: () => Promise<string[]>
}

const MODEL_CATALOG_CONFIG_FILE = 'codes-model-catalog.json'
const DEFAULT_REASONING_EFFORTS: ReasoningEffort[] = ['low', 'medium', 'high', 'xhigh']
const ALLOWED_REASONING_EFFORTS = new Set<ReasoningEffort>(['none', 'minimal', 'low', 'medium', 'high', 'xhigh'])
const DEFAULT_CONFIG: ModelCatalogConfig = {
  models: [],
  order: [],
}

export function getModelCatalogConfigPath(): string {
  const codexHome = readTrimmedEnv(ENV_KEYS.codexHome[0])
  return join(codexHome || join(homedir(), '.codex'), MODEL_CATALOG_CONFIG_FILE)
}

export function watchModelCatalogConfigFile(onChange: (configPath: string) => void): () => void {
  const configPath = getModelCatalogConfigPath()
  const configDir = dirname(configPath)
  let watcher: FSWatcher | null = null
  let debounceTimer: NodeJS.Timeout | null = null

  const clearDebounceTimer = () => {
    if (!debounceTimer) return
    clearTimeout(debounceTimer)
    debounceTimer = null
  }

  const scheduleChange = () => {
    clearDebounceTimer()
    debounceTimer = setTimeout(() => {
      debounceTimer = null
      onChange(configPath)
    }, 100)
  }

  try {
    mkdirSync(configDir, { recursive: true })
    watcher = watch(configDir, { persistent: false }, (_event, filename) => {
      const changedFile = filename ? String(filename) : ''
      if (changedFile && changedFile !== MODEL_CATALOG_CONFIG_FILE) return
      scheduleChange()
    })
  } catch {
    return () => {}
  }

  return () => {
    clearDebounceTimer()
    watcher?.close()
  }
}

export function formatModelCatalogConfigText(config: ModelCatalogConfig = DEFAULT_CONFIG): string {
  return `${JSON.stringify(config, null, 2)}\n`
}

export function parseModelCatalogConfigText(text: string): ModelCatalogConfig {
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch (error) {
    throw new Error(`Invalid JSON: ${getErrorMessage(error, 'parse failed')}`)
  }
  return normalizeModelCatalogConfig(parsed)
}

export async function readModelCatalogConfigText(): Promise<{ config: ModelCatalogConfig; text: string; error: string | null }> {
  const configPath = getModelCatalogConfigPath()
  try {
    const text = await readFile(configPath, 'utf8')
    return {
      config: parseModelCatalogConfigText(text),
      text,
      error: null,
    }
  } catch (error) {
    const code = (error as NodeJS.ErrnoException)?.code
    if (code === 'ENOENT') {
      return {
        config: DEFAULT_CONFIG,
        text: formatModelCatalogConfigText(),
        error: null,
      }
    }
    return {
      config: DEFAULT_CONFIG,
      text: formatModelCatalogConfigText(),
      error: getErrorMessage(error, 'Failed to read model catalog config'),
    }
  }
}

export async function writeModelCatalogConfigText(text: string): Promise<ModelCatalogConfig> {
  const config = parseModelCatalogConfigText(text)
  const configPath = getModelCatalogConfigPath()
  await mkdir(dirname(configPath), { recursive: true })
  await writeFile(configPath, formatModelCatalogConfigText(config), 'utf8')
  return config
}

export function buildEffectiveModelCatalog(input: ModelCatalogBuildInput): UiModelOption[] {
  const optionsById = new Map<string, UiModelOption>()
  const discoveredOrder: string[] = []

  for (const id of input.codexModelIds) {
    addDiscoveredModel(optionsById, discoveredOrder, id, 'codex')
  }
  for (const id of input.providerModelIds) {
    addDiscoveredModel(optionsById, discoveredOrder, id, 'provider')
  }

  const configuredOrder: string[] = []
  for (const configModel of input.config.models) {
    const existing = optionsById.get(configModel.id)
    const reasoningEfforts = readEffectiveReasoningEfforts(configModel)
    const defaultReasoningEffort = readEffectiveDefaultReasoningEffort(configModel, reasoningEfforts)
    optionsById.set(configModel.id, {
      id: configModel.id,
      label: configModel.label?.trim() || existing?.label || configModel.id,
      source: existing?.source ?? 'custom',
      isHidden: configModel.hidden === true,
      isSelectable: configModel.hidden !== true,
      reasoningEfforts,
      defaultReasoningEffort,
    })
    configuredOrder.push(configModel.id)
  }

  const orderedIds: string[] = []
  for (const id of input.config.order) {
    appendUniqueExistingId(orderedIds, optionsById, id)
  }
  for (const id of discoveredOrder) {
    appendUniqueExistingId(orderedIds, optionsById, id)
  }
  for (const id of configuredOrder) {
    appendUniqueExistingId(orderedIds, optionsById, id)
  }

  return orderedIds.map((id) => optionsById.get(id)).filter((option): option is UiModelOption => Boolean(option))
}

export async function readModelCatalogResponse(context: ModelCatalogRouteContext): Promise<ModelCatalogResponse> {
  const [codexModelIds, providerModelIds, configState] = await Promise.all([
    context.readCodexModelIds(),
    context.readProviderModelIds(),
    readModelCatalogConfigText(),
  ])

  return {
    data: buildEffectiveModelCatalog({
      codexModelIds,
      providerModelIds,
      config: configState.config,
    }),
    configText: configState.text,
    configPath: getModelCatalogConfigPath(),
    configError: configState.error,
  }
}

export async function handleModelCatalogRoutes(
  req: IncomingMessage,
  res: ServerResponse,
  url: URL,
  context: ModelCatalogRouteContext,
): Promise<boolean> {
  if (url.pathname !== '/codex-api/model-catalog') {
    return false
  }

  if (req.method === 'GET') {
    setJson(res, 200, await readModelCatalogResponse(context))
    return true
  }

  if (req.method === 'PUT') {
    const payload = asRecord(await context.readJsonBody(req))
    const configText = typeof payload?.configText === 'string' ? payload.configText : ''
    if (!configText.trim()) {
      setJson(res, 400, { error: 'Missing model catalog config text' })
      return true
    }

    try {
      await writeModelCatalogConfigText(configText)
    } catch (error) {
      setJson(res, 400, { error: getErrorMessage(error, 'Invalid model catalog config') })
      return true
    }

    setJson(res, 200, await readModelCatalogResponse(context))
    return true
  }

  setJson(res, 405, { error: 'Method not allowed' })
  return true
}

function normalizeModelCatalogConfig(value: unknown): ModelCatalogConfig {
  const record = asRecord(value)
  if (!record) {
    throw new Error('Model catalog config must be a JSON object')
  }

  const models = normalizeConfigModels(record.models)
  return {
    models,
    order: normalizeOrder(record.order),
  }
}

function normalizeConfigModels(value: unknown): ModelCatalogConfigModel[] {
  if (value === undefined) return []
  if (!Array.isArray(value)) {
    throw new Error('models must be an array')
  }

  const ids = new Set<string>()
  return value.map((row, index) => {
    const record = asRecord(row)
    if (!record) {
      throw new Error(`models[${index}] must be an object`)
    }

    const id = readNonEmptyString(record.id)
    if (!id) {
      throw new Error(`models[${index}].id is required`)
    }
    if (ids.has(id)) {
      throw new Error(`models[${index}].id duplicates ${id}`)
    }
    ids.add(id)

    const label = readOptionalString(record.label, `models[${index}].label`)
    const hidden = readOptionalBoolean(record.hidden, `models[${index}].hidden`)
    const reasoningEfforts = readOptionalReasoningEfforts(record.reasoningEfforts, `models[${index}].reasoningEfforts`)
    const defaultReasoningEffort = readOptionalReasoningEffort(record.defaultReasoningEffort, `models[${index}].defaultReasoningEffort`)
    if (defaultReasoningEffort && reasoningEfforts && !reasoningEfforts.includes(defaultReasoningEffort)) {
      throw new Error(`models[${index}].defaultReasoningEffort must be included in reasoningEfforts`)
    }

    return {
      id,
      ...(label ? { label } : {}),
      ...(hidden !== null ? { hidden } : {}),
      ...(reasoningEfforts ? { reasoningEfforts } : {}),
      ...(defaultReasoningEffort ? { defaultReasoningEffort } : {}),
    }
  })
}

function normalizeOrder(value: unknown): string[] {
  if (value === undefined) return []
  if (!Array.isArray(value)) {
    throw new Error('order must be an array')
  }

  const orderedIds: string[] = []
  for (const [index, rawId] of value.entries()) {
    const id = readNonEmptyString(rawId)
    if (!id) {
      throw new Error(`order[${index}] must be a non-empty string`)
    }
    // order 可以提前列出自动发现模型；配置内模型也在这里去重。
    if (orderedIds.includes(id)) continue
    orderedIds.push(id)
  }
  return orderedIds
}

function addDiscoveredModel(
  optionsById: Map<string, UiModelOption>,
  discoveredOrder: string[],
  rawId: string,
  source: ModelCatalogSource,
): void {
  const id = rawId.trim()
  if (!id || optionsById.has(id)) return
  optionsById.set(id, {
    id,
    label: id,
    source,
    isHidden: false,
    isSelectable: true,
    reasoningEfforts: DEFAULT_REASONING_EFFORTS,
    defaultReasoningEffort: 'medium',
  })
  discoveredOrder.push(id)
}

function readEffectiveReasoningEfforts(configModel: ModelCatalogConfigModel): ReasoningEffort[] {
  const configured = configModel.reasoningEfforts
  if (configured && configured.length > 0) return configured
  if (configModel.defaultReasoningEffort && !DEFAULT_REASONING_EFFORTS.includes(configModel.defaultReasoningEffort)) {
    return [configModel.defaultReasoningEffort, ...DEFAULT_REASONING_EFFORTS]
  }
  return DEFAULT_REASONING_EFFORTS
}

function readEffectiveDefaultReasoningEffort(
  configModel: ModelCatalogConfigModel,
  reasoningEfforts: ReasoningEffort[],
): ReasoningEffort {
  if (configModel.defaultReasoningEffort && reasoningEfforts.includes(configModel.defaultReasoningEffort)) {
    return configModel.defaultReasoningEffort
  }
  return reasoningEfforts.includes('medium') ? 'medium' : reasoningEfforts[0] ?? 'medium'
}

function appendUniqueExistingId(ids: string[], optionsById: Map<string, UiModelOption>, id: string): void {
  if (!optionsById.has(id) || ids.includes(id)) return
  ids.push(id)
}

function readOptionalString(value: unknown, field: string): string | undefined {
  if (value === undefined) return undefined
  if (typeof value !== 'string') {
    throw new Error(`${field} must be a string`)
  }
  const normalized = value.trim()
  return normalized || undefined
}

function readOptionalBoolean(value: unknown, field: string): boolean | null {
  if (value === undefined) return null
  if (typeof value !== 'boolean') {
    throw new Error(`${field} must be a boolean`)
  }
  return value
}

function readOptionalReasoningEfforts(value: unknown, field: string): ReasoningEffort[] | undefined {
  if (value === undefined) return undefined
  if (!Array.isArray(value)) {
    throw new Error(`${field} must be an array`)
  }
  if (value.length === 0) {
    throw new Error(`${field} must not be empty`)
  }

  const efforts: ReasoningEffort[] = []
  for (const [index, rawEffort] of value.entries()) {
    const effort = readOptionalReasoningEffort(rawEffort, `${field}[${index}]`)
    if (!effort) {
      throw new Error(`${field}[${index}] must be a reasoning effort`)
    }
    if (!efforts.includes(effort)) efforts.push(effort)
  }
  return efforts
}

function readOptionalReasoningEffort(value: unknown, field: string): ReasoningEffort | undefined {
  if (value === undefined) return undefined
  if (typeof value !== 'string' || !ALLOWED_REASONING_EFFORTS.has(value as ReasoningEffort)) {
    throw new Error(`${field} must be one of none, minimal, low, medium, high, xhigh`)
  }
  return value as ReasoningEffort
}

function readNonEmptyString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null
}

function getErrorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback
}

function setJson(res: ServerResponse, status: number, payload: unknown): void {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.end(JSON.stringify(payload))
}

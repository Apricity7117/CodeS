import { mkdirSync, watch, type FSWatcher } from 'node:fs'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import { ENV_KEYS, readTrimmedEnv } from '../config/env.js'
import type { ReasoningEffort, UiModelOption } from '../types/codex.js'
import {
  DEFAULT_MODEL_REASONING_EFFORTS,
  isKnownReasoningEffort,
  KNOWN_REASONING_EFFORTS,
  normalizeReasoningEffort,
} from '../reasoningEffort.js'

export type ModelCatalogConfigModel = {
  id: string
  label?: string
  hidden?: boolean
  reasoningEfforts?: ReasoningEffort[]
  defaultReasoningEffort?: ReasoningEffort
}

export type ModelCatalogConfig = {
  defaultModel?: string
  models: ModelCatalogConfigModel[]
  order: string[]
}

export type ModelCatalogSource = UiModelOption['source']

export type ModelCatalogBuildInput = {
  codexModels: unknown[]
  providerModelIds: string[]
  config: ModelCatalogConfig
}

export type ModelCatalogResponse = {
  data: UiModelOption[]
  defaultModel: string
  configuredModelIds: string[]
  configText: string
  configPath: string
  configError: string | null
}

type ModelCatalogRouteContext = {
  readJsonBody: (req: IncomingMessage) => Promise<unknown>
  readCodexModels: () => Promise<unknown[]>
  readProviderModelIds: () => Promise<string[]>
}

const MODEL_CATALOG_CONFIG_FILE = 'codes-model-catalog.json'
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

  for (const rawModel of input.codexModels) {
    const option = normalizeCodexModelOption(rawModel)
    if (option) addDiscoveredModel(optionsById, discoveredOrder, option)
  }
  for (const id of input.providerModelIds) {
    const option = createFallbackModelOption(id, 'provider')
    if (option) addDiscoveredModel(optionsById, discoveredOrder, option)
  }

  const configuredOrder: string[] = []
  for (const configModel of input.config.models) {
    const existing = optionsById.get(configModel.id)
    const reasoningEfforts = readEffectiveReasoningEfforts(configModel, existing)
    const defaultReasoningEffort = readEffectiveDefaultReasoningEffort(configModel, reasoningEfforts, existing)
    const isHidden = configModel.hidden ?? existing?.isHidden ?? false
    optionsById.set(configModel.id, {
      id: configModel.id,
      label: configModel.label?.trim() || existing?.label || configModel.id,
      source: existing?.source ?? 'custom',
      isHidden,
      isSelectable: !isHidden,
      reasoningEfforts,
      defaultReasoningEffort,
    })
    configuredOrder.push(configModel.id)
  }

  const idsByLabel = buildIdsByLabel(optionsById)
  const orderedIds: string[] = []
  for (const orderEntry of input.config.order) {
    appendUniqueExistingId(orderedIds, optionsById, idsByLabel, orderEntry)
  }
  for (const id of discoveredOrder) {
    appendUniqueExistingId(orderedIds, optionsById, idsByLabel, id)
  }
  for (const id of configuredOrder) {
    appendUniqueExistingId(orderedIds, optionsById, idsByLabel, id)
  }

  return orderedIds.map((id) => optionsById.get(id)).filter((option): option is UiModelOption => Boolean(option))
}

export async function readModelCatalogResponse(context: ModelCatalogRouteContext): Promise<ModelCatalogResponse> {
  const [codexModels, providerModelIds, configState] = await Promise.all([
    context.readCodexModels(),
    context.readProviderModelIds(),
    readModelCatalogConfigText(),
  ])

  return {
    data: buildEffectiveModelCatalog({
      codexModels,
      providerModelIds,
      config: configState.config,
    }),
    defaultModel: configState.config.defaultModel ?? '',
    configuredModelIds: configState.config.models.map((model) => model.id),
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
  const defaultModel = readOptionalString(record.defaultModel, 'defaultModel')
  return {
    ...(defaultModel ? { defaultModel } : {}),
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
    // order 可按模型 id 或唯一 label 排序，也可以提前列出自动发现模型。
    if (orderedIds.includes(id)) continue
    orderedIds.push(id)
  }
  return orderedIds
}

function createFallbackModelOption(rawId: string, source: ModelCatalogSource): UiModelOption | null {
  const id = rawId.trim()
  if (!id) return null
  return {
    id,
    label: id,
    source,
    isHidden: false,
    isSelectable: true,
    reasoningEfforts: [...DEFAULT_MODEL_REASONING_EFFORTS],
    defaultReasoningEffort: 'medium',
  }
}

function normalizeCodexModelOption(value: unknown): UiModelOption | null {
  const record = asRecord(value)
  const id = readNonEmptyString(record?.id) || readNonEmptyString(record?.model)
  if (!id) return null

  const reasoningEfforts: ReasoningEffort[] = []
  const supportedEfforts = Array.isArray(record?.supportedReasoningEfforts)
    ? record.supportedReasoningEfforts
    : []
  for (const rawOption of supportedEfforts) {
    const option = asRecord(rawOption)
    const effort = normalizeReasoningEffort(option?.reasoningEffort ?? rawOption)
    if (effort && !reasoningEfforts.includes(effort)) reasoningEfforts.push(effort)
  }

  const defaultReasoningEffort = normalizeReasoningEffort(record?.defaultReasoningEffort)
  if (defaultReasoningEffort && !reasoningEfforts.includes(defaultReasoningEffort)) {
    reasoningEfforts.push(defaultReasoningEffort)
  }
  const effectiveReasoningEfforts = reasoningEfforts.length > 0
    ? reasoningEfforts
    : [...DEFAULT_MODEL_REASONING_EFFORTS]
  const isHidden = record?.hidden === true

  return {
    id,
    label: readNonEmptyString(record?.displayName) || id,
    source: 'codex',
    isHidden,
    isSelectable: !isHidden,
    reasoningEfforts: effectiveReasoningEfforts,
    defaultReasoningEffort: defaultReasoningEffort && effectiveReasoningEfforts.includes(defaultReasoningEffort)
      ? defaultReasoningEffort
      : effectiveReasoningEfforts.includes('medium') ? 'medium' : effectiveReasoningEfforts[0] ?? 'medium',
  }
}

function addDiscoveredModel(
  optionsById: Map<string, UiModelOption>,
  discoveredOrder: string[],
  option: UiModelOption,
): void {
  if (optionsById.has(option.id)) return
  optionsById.set(option.id, option)
  discoveredOrder.push(option.id)
}

function readEffectiveReasoningEfforts(
  configModel: ModelCatalogConfigModel,
  existing: UiModelOption | undefined,
): ReasoningEffort[] {
  const configured = configModel.reasoningEfforts
  if (configured && configured.length > 0) return configured
  const discovered = existing?.reasoningEfforts.length
    ? existing.reasoningEfforts
    : DEFAULT_MODEL_REASONING_EFFORTS
  if (configModel.defaultReasoningEffort && !discovered.includes(configModel.defaultReasoningEffort)) {
    return [configModel.defaultReasoningEffort, ...discovered]
  }
  return [...discovered]
}

function readEffectiveDefaultReasoningEffort(
  configModel: ModelCatalogConfigModel,
  reasoningEfforts: ReasoningEffort[],
  existing: UiModelOption | undefined,
): ReasoningEffort {
  if (configModel.defaultReasoningEffort && reasoningEfforts.includes(configModel.defaultReasoningEffort)) {
    return configModel.defaultReasoningEffort
  }
  if (existing?.defaultReasoningEffort && reasoningEfforts.includes(existing.defaultReasoningEffort)) {
    return existing.defaultReasoningEffort
  }
  return reasoningEfforts.includes('medium') ? 'medium' : reasoningEfforts[0] ?? 'medium'
}

function buildIdsByLabel(optionsById: Map<string, UiModelOption>): Map<string, string | null> {
  const idsByLabel = new Map<string, string | null>()
  for (const option of optionsById.values()) {
    const label = option.label.trim()
    if (!label) continue
    idsByLabel.set(label, idsByLabel.has(label) ? null : option.id)
  }
  return idsByLabel
}

function resolveOrderEntry(
  optionsById: Map<string, UiModelOption>,
  idsByLabel: Map<string, string | null>,
  entry: string,
): string | null {
  if (optionsById.has(entry)) return entry
  return idsByLabel.get(entry) ?? null
}

function appendUniqueExistingId(
  ids: string[],
  optionsById: Map<string, UiModelOption>,
  idsByLabel: Map<string, string | null>,
  entry: string,
): void {
  const id = resolveOrderEntry(optionsById, idsByLabel, entry)
  if (!id || !optionsById.has(id) || ids.includes(id)) return
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
  if (!isKnownReasoningEffort(value)) {
    throw new Error(`${field} must be one of ${KNOWN_REASONING_EFFORTS.join(', ')}`)
  }
  return value
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

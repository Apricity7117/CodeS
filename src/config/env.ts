import { readFileSync } from 'node:fs'
import runtimeDefaults from '../../configs/runtime_defaults.json'

type RuntimeDefaultsConfig = {
  envKeys: Record<string, string[]>
  defaults: {
    accountImport: {
      limit: number
    }
    cli: {
      host: string
      port: number
    }
    codexRuntime: {
      approvalPolicy: string
      sandboxMode: string
    }
    profile: {
      baseUrl: string
      headless: boolean
      route: string
      testChatBaseUrl: string
      testChatLabel: string
      testChatRoot: string
      testChatTimeoutMs: number
      threadLoadTimeoutMs: number
      waitMs: number
    }
    viteDevServer: {
      host: string
      port: number
    }
  }
}

export const PROJECT_CONFIG = runtimeDefaults as RuntimeDefaultsConfig
export const PROJECT_DEFAULTS = PROJECT_CONFIG.defaults

export const ENV_KEYS = PROJECT_CONFIG.envKeys

export function readTrimmedEnv(key: string): string {
  return process.env[key]?.trim() ?? ''
}

export function readFirstTrimmedEnv(keys: readonly string[]): string {
  for (const key of keys) {
    const value = readTrimmedEnv(key)
    if (value) return value
  }
  return ''
}

export function setEnvValues(keys: readonly string[], value: string): void {
  for (const key of keys) {
    process.env[key] = value
  }
}

export function readEnvValueFromFile(filePath: string, key: string): string {
  try {
    const content = readFileSync(filePath, 'utf8')
    const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const match = content.match(new RegExp(`^\\s*${escapedKey}\\s*=\\s*(.+)\\s*$`, 'm'))
    if (!match) return ''
    const rawValue = match[1]?.trim() ?? ''
    if (!rawValue) return ''
    if ((rawValue.startsWith('"') && rawValue.endsWith('"')) || (rawValue.startsWith('\'') && rawValue.endsWith('\''))) {
      return rawValue.slice(1, -1).trim()
    }
    return rawValue
  } catch {
    return ''
  }
}

export function parseBooleanEnvFlag(value: string | null | undefined): boolean | null {
  if (!value) return null
  const normalized = value.trim().toLowerCase()
  if (['1', 'true', 'yes', 'on'].includes(normalized)) return true
  if (['0', 'false', 'no', 'off'].includes(normalized)) return false
  return null
}

export function parseNumberEnvFlag(value: string | null | undefined): number | null {
  if (!value) return null
  const parsed = Number.parseFloat(value.trim())
  if (!Number.isFinite(parsed)) return null
  return parsed
}

export function readBooleanEnvConfig(
  keys: readonly string[],
  fallback: boolean,
  filePaths: readonly string[] = ['.env.local', '.env'],
): boolean {
  for (const key of keys) {
    const fromProcess = parseBooleanEnvFlag(process.env[key])
    if (fromProcess !== null) return fromProcess
  }
  for (const filePath of filePaths) {
    for (const key of keys) {
      const fromFile = parseBooleanEnvFlag(readEnvValueFromFile(filePath, key))
      if (fromFile !== null) return fromFile
    }
  }
  return fallback
}

export function readNumberEnvConfig(
  keys: readonly string[],
  fallback: number,
  filePaths: readonly string[] = ['.env.local', '.env'],
): number {
  for (const key of keys) {
    const fromProcess = parseNumberEnvFlag(process.env[key])
    if (fromProcess !== null) return fromProcess
  }
  for (const filePath of filePaths) {
    for (const key of keys) {
      const fromFile = parseNumberEnvFlag(readEnvValueFromFile(filePath, key))
      if (fromFile !== null) return fromFile
    }
  }
  return fallback
}

export function readIntegerEnv(keys: readonly string[]): number | null {
  const value = readFirstTrimmedEnv(keys)
  if (!value) return null
  const parsed = Number.parseInt(value, 10)
  return Number.isFinite(parsed) ? parsed : null
}

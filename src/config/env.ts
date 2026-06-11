import { readFileSync } from 'node:fs'

export const ENV_KEYS = {
  approvalPolicy: ['CODES_APPROVAL_POLICY', 'CODEXUI_APPROVAL_POLICY'],
  apiPerfBodyMbThreshold: ['CODES_API_PERF_BODY_MB_THRESHOLD', 'CODEXUI_API_PERF_BODY_MB_THRESHOLD'],
  apiPerfLogging: ['CODES_API_PERF_LOGGING', 'CODEXUI_API_PERF_LOGGING'],
  apiPerfMsThreshold: ['CODES_API_PERF_MS_THRESHOLD', 'CODEXUI_API_PERF_MS_THRESHOLD'],
  codexCommand: ['CODES_CODEX_COMMAND', 'CODEXUI_CODEX_COMMAND'],
  codexHome: ['CODEX_HOME'],
  rgCommand: ['CODES_RG_COMMAND', 'CODEXUI_RG_COMMAND'],
  sandboxMode: ['CODES_SANDBOX_MODE', 'CODEXUI_SANDBOX_MODE'],
  serverPort: ['CODES_SERVER_PORT', 'CODEXUI_SERVER_PORT'],
  skillsUpstreamOwner: ['CODES_SKILLS_UPSTREAM_OWNER'],
  skillsUpstreamRepo: ['CODES_SKILLS_UPSTREAM_REPO'],
} as const

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

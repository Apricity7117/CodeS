import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  ENV_KEYS,
  PROJECT_DEFAULTS,
  readBooleanEnvConfig,
  readEnvValueFromFile,
  readFirstTrimmedEnv,
  readIntegerEnv,
  readNumberEnvConfig,
  setEnvValues,
} from './env'

const touchedEnvKeys = new Set<string>()
const originalEnv = new Map<string, string | undefined>()
const tempDirs: string[] = []

function rememberEnv(key: string): void {
  if (!touchedEnvKeys.has(key)) {
    originalEnv.set(key, process.env[key])
    touchedEnvKeys.add(key)
  }
}

function setEnv(key: string, value: string | undefined): void {
  rememberEnv(key)
  if (value === undefined) {
    delete process.env[key]
    return
  }
  process.env[key] = value
}

afterEach(async () => {
  for (const key of touchedEnvKeys) {
    const original = originalEnv.get(key)
    if (original === undefined) {
      delete process.env[key]
    } else {
      process.env[key] = original
    }
  }
  touchedEnvKeys.clear()
  originalEnv.clear()
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop()
    if (dir) await rm(dir, { recursive: true, force: true })
  }
})

describe('env helpers', () => {
  it('loads shared env keys and defaults from root config', () => {
    expect(ENV_KEYS.sandboxMode).toContain('CODES_SANDBOX_MODE')
    expect(ENV_KEYS.serverPort).toContain('CODEXUI_SERVER_PORT')
    expect(PROJECT_DEFAULTS.cli.port).toBe(5900)
    expect(PROJECT_DEFAULTS.viteDevServer.port).toBe(5173)
  })

  it('prefers the first non-empty trimmed env value', () => {
    setEnv('PRIMARY_ENV', '   ')
    setEnv('LEGACY_ENV', ' legacy-value ')

    expect(readFirstTrimmedEnv(['PRIMARY_ENV', 'LEGACY_ENV'])).toBe('legacy-value')
  })

  it('sets every key in a compatibility group', () => {
    setEnv('PRIMARY_ENV', undefined)
    setEnv('LEGACY_ENV', undefined)

    setEnvValues(['PRIMARY_ENV', 'LEGACY_ENV'], 'shared-value')

    expect(process.env.PRIMARY_ENV).toBe('shared-value')
    expect(process.env.LEGACY_ENV).toBe('shared-value')
  })

  it('reads quoted env file values', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'codes-env-test-'))
    tempDirs.push(dir)
    const filePath = join(dir, '.env.local')
    await writeFile(filePath, 'CODES_VALUE="  file-value  "\n', 'utf8')

    expect(readEnvValueFromFile(filePath, 'CODES_VALUE')).toBe('file-value')
  })

  it('resolves boolean and number config from process before env files', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'codes-env-test-'))
    tempDirs.push(dir)
    const filePath = join(dir, '.env')
    await writeFile(filePath, 'CODES_FLAG=false\nCODES_LIMIT=12\n', 'utf8')
    setEnv('CODES_FLAG', 'yes')
    setEnv('CODES_LIMIT', '7.5')

    expect(readBooleanEnvConfig(['CODES_FLAG'], false, [filePath])).toBe(true)
    expect(readNumberEnvConfig(['CODES_LIMIT'], 0, [filePath])).toBe(7.5)
  })

  it('parses integer env values from compatibility groups', () => {
    setEnv('CODES_PORT', undefined)
    setEnv('LEGACY_PORT', ' 4173 ')

    expect(readIntegerEnv(['CODES_PORT', 'LEGACY_PORT'])).toBe(4173)
  })
})

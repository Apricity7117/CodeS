import { resolveCodexCommand } from '../commandResolution.js'
import { spawnSyncCommand } from '../utils/commandInvocation.js'

export const CODEX_TUI_CLIENT_NAME = 'codex-tui'

export type CodexClientInfo = {
  name: string
  version: string
}

export type CodexTuiRuntime = {
  command: string
  clientInfo: CodexClientInfo
}

export function parseCodexCliVersion(output: string): string | null {
  const match = output.trim().match(/^codex-cli\s+(\S+)$/mu)
  return match?.[1] ?? null
}

export function readCodexCliVersion(command: string): string | null {
  const result = spawnSyncCommand(command, ['--version'], {
    encoding: 'utf8',
    windowsHide: true,
  })
  if (result.error || result.status !== 0) return null
  return parseCodexCliVersion(String(result.stdout ?? ''))
}

export function createCodexTuiClientInfo(version: string): CodexClientInfo {
  return {
    name: CODEX_TUI_CLIENT_NAME,
    version,
  }
}

export function resolveCodexTuiRuntime(): CodexTuiRuntime | null {
  const command = resolveCodexCommand()
  if (!command) return null

  const version = readCodexCliVersion(command)
  if (!version) {
    throw new Error(`Unable to determine Codex CLI version from: ${command} --version`)
  }

  return {
    command,
    clientInfo: createCodexTuiClientInfo(version),
  }
}

export function createCodexUpstreamIdentityHeaders(userAgent: string): Record<string, string> {
  const normalizedUserAgent = userAgent.trim()
  if (!normalizedUserAgent) {
    throw new Error('Codex app-server initialize response did not include userAgent')
  }
  return {
    originator: CODEX_TUI_CLIENT_NAME,
    'User-Agent': normalizedUserAgent,
  }
}

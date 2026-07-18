import { describe, expect, it } from 'vitest'
import {
  createCodexTuiClientInfo,
  createCodexUpstreamIdentityHeaders,
  parseCodexCliVersion,
} from './codexClientInfo'

describe('Codex TUI client identity', () => {
  it('parses the installed Codex CLI version output', () => {
    expect(parseCodexCliVersion('codex-cli 0.144.1\n')).toBe('0.144.1')
    expect(parseCodexCliVersion('codex-cli 0.145.0-alpha.3\n')).toBe('0.145.0-alpha.3')
    expect(parseCodexCliVersion('codex 0.144.1\n')).toBeNull()
  })

  it('uses the official TUI client name with the CLI version', () => {
    expect(createCodexTuiClientInfo('0.144.1')).toEqual({
      name: 'codex-tui',
      version: '0.144.1',
    })
  })

  it('reuses the app-server user agent for direct upstream requests', () => {
    const userAgent = 'codex-tui/0.144.1 (Mac OS 15.7.7; arm64) iTerm.app/3.6.10 (codex-tui; 0.144.1)'
    expect(createCodexUpstreamIdentityHeaders(`  ${userAgent}  `)).toEqual({
      originator: 'codex-tui',
      'User-Agent': userAgent,
    })
    expect(() => createCodexUpstreamIdentityHeaders('  ')).toThrow(
      'Codex app-server initialize response did not include userAgent',
    )
  })
})

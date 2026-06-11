import { afterEach, describe, expect, it, vi } from 'vitest'
import type { UiAccountEntry, UiMessage } from '../types/codex'
import {
  formatAccountMeta,
  formatAccountQuota,
  isAccountUnavailable,
  shortAccountId,
} from './accountDisplay'
import {
  CHAT_WIDTH_KEY,
  DARK_MODE_KEY,
  DICTATION_LANGUAGE_KEY,
  IN_PROGRESS_SEND_MODE_KEY,
  INSPECTOR_PANEL_OPEN_STORAGE_KEY,
  SEND_WITH_ENTER_KEY,
  TERMINAL_QUICK_COMMAND_STORAGE_KEY,
} from './appConfig'
import { buildDirectoryTryPrompt, getDirectoryTryItemKey } from './directoryTry'
import {
  loadChatWidthPref,
  loadDarkModePref,
  loadDictationLanguagePref,
  loadInProgressSendModePref,
  loadInspectorPanelOpen,
  loadSendWithEnterPref,
  normalizeToWhisperLanguage,
  saveSendWithEnterPref,
} from './preferences'
import {
  compareTerminalQuickCommands,
  loadTerminalStoredQuickCommands,
  normalizeTerminalQuickCommandValue,
  saveTerminalStoredQuickCommands,
} from './terminalQuickCommands'
import { buildExportFileName, buildThreadMarkdown } from './threadExport'

function t(message: string): string {
  return message
}

function createAccount(overrides: Partial<UiAccountEntry> = {}): UiAccountEntry {
  return {
    accountId: 'workspace-1234567890',
    authMode: null,
    email: 'user@example.com',
    planType: 'Pro',
    lastRefreshedAtIso: '',
    lastActivatedAtIso: null,
    quotaSnapshot: null,
    quotaUpdatedAtIso: null,
    quotaStatus: 'idle',
    quotaError: null,
    unavailableReason: null,
    isActive: false,
    ...overrides,
  }
}

function createLocalStorage(seed: Record<string, string> = {}): Storage {
  const store = new Map(Object.entries(seed))
  return {
    get length() {
      return store.size
    },
    clear() {
      store.clear()
    },
    getItem(key: string) {
      return store.get(key) ?? null
    },
    key(index: number) {
      return Array.from(store.keys())[index] ?? null
    },
    removeItem(key: string) {
      store.delete(key)
    },
    setItem(key: string, value: string) {
      store.set(key, value)
    },
  }
}

function stubWindow(seed: Record<string, string> = {}, innerWidth = 1024): Storage {
  const localStorage = createLocalStorage(seed)
  vi.stubGlobal('window', { innerWidth, localStorage })
  return localStorage
}

describe('preferences', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('uses stable defaults when window is unavailable', () => {
    expect(loadSendWithEnterPref()).toBe(true)
    expect(loadDarkModePref()).toBe('system')
    expect(loadInProgressSendModePref()).toBe('steer')
    expect(loadChatWidthPref()).toBe('standard')
    expect(loadDictationLanguagePref()).toBe('auto')
  })

  it('normalizes stored preference values', () => {
    stubWindow({
      [SEND_WITH_ENTER_KEY]: '0',
      [DARK_MODE_KEY]: 'dark',
      [IN_PROGRESS_SEND_MODE_KEY]: 'invalid',
      [CHAT_WIDTH_KEY]: 'extra-wide',
      [DICTATION_LANGUAGE_KEY]: 'zh-CN',
    })

    expect(loadSendWithEnterPref()).toBe(false)
    expect(loadDarkModePref()).toBe('dark')
    expect(loadInProgressSendModePref()).toBe('queue')
    expect(loadChatWidthPref()).toBe('extra-wide')
    expect(loadDictationLanguagePref()).toBe('zh')
  })

  it('persists booleans as compact string flags', () => {
    const localStorage = stubWindow()

    saveSendWithEnterPref(false)

    expect(localStorage.getItem(SEND_WITH_ENTER_KEY)).toBe('0')
  })

  it('defaults inspector visibility from the viewport when no preference exists', () => {
    stubWindow({}, 800)
    expect(loadInspectorPanelOpen()).toBe(false)

    vi.unstubAllGlobals()
    stubWindow({ [INSPECTOR_PANEL_OPEN_STORAGE_KEY]: '1' }, 800)
    expect(loadInspectorPanelOpen()).toBe(true)
  })

  it('normalizes Whisper language tags', () => {
    expect(normalizeToWhisperLanguage('EN-US')).toBe('en')
    expect(normalizeToWhisperLanguage('auto')).toBe('')
    expect(normalizeToWhisperLanguage('unknown')).toBe('')
  })
})

describe('threadExport', () => {
  it('builds markdown with thread metadata and rich message sections', () => {
    const exportedAt = new Date('2026-06-11T01:02:03.000Z')
    const messages: UiMessage[] = [
      {
        id: 'm1',
        role: 'user',
        text: 'Run tests',
        fileAttachments: [{ label: 'package', path: 'package.json' }],
      },
      {
        id: 'm2',
        role: 'assistant',
        text: '',
        commandExecution: {
          command: 'pnpm test',
          cwd: '/repo',
          status: 'completed',
          aggregatedOutput: 'ok',
          exitCode: 0,
        },
      },
    ]

    expect(buildThreadMarkdown({ id: 'thread-1', title: 'Build & Test' }, messages, exportedAt)).toBe(
      [
        '# Build & Test',
        '',
        '- Exported: 2026-06-11T01:02:03.000Z',
        '- Thread ID: thread-1',
        '',
        '---',
        '',
        '## USER',
        '',
        'Run tests',
        '',
        'Attachments:',
        '- package.json',
        '',
        '## ASSISTANT',
        '',
        '```text',
        'command: pnpm test',
        'status: completed',
        'cwd: /repo',
        'exitCode: 0',
        'ok',
        '```',
        '',
      ].join('\n'),
    )
  })

  it('builds stable markdown export file names', () => {
    const exportedAt = new Date('2026-06-11T01:02:03.004Z')

    expect(buildExportFileName('Build & Test!', exportedAt)).toBe('build-test-2026-06-11T01-02-03-004Z.md')
  })
})

describe('accountDisplay', () => {
  it('formats account identity and weekly quota', () => {
    const account = createAccount({
      accountId: 'workspace-abcdef123456',
      authMode: 'chatgpt',
      quotaSnapshot: {
        limitId: null,
        limitName: null,
        planType: 'Pro',
        credits: null,
        primary: {
          usedPercent: 25,
          windowDurationMins: 10_080,
          windowMinutes: 10_080,
          resetsAt: Date.UTC(2026, 5, 12) / 1000,
        },
        secondary: null,
      },
      quotaStatus: 'ready',
    })

    expect(shortAccountId(account.accountId)).toBe('ef123456')
    expect(formatAccountMeta(account, t)).toBe('chatgpt · Pro')
    expect(formatAccountQuota(account, t)).toBe('75% weekly remaining · 6月12日')
  })

  it('detects unavailable accounts from payment errors', () => {
    const account = createAccount({ quotaError: '402 payment required' })

    expect(isAccountUnavailable(account)).toBe(true)
    expect(formatAccountQuota(account, t)).toBe('402 payment required')
  })
})

describe('terminalQuickCommands', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('normalizes, loads, and saves terminal quick commands', () => {
    const localStorage = stubWindow({
      [TERMINAL_QUICK_COMMAND_STORAGE_KEY]: JSON.stringify([
        { label: ' list ', value: ' pnpm   test ', custom: true, usageCount: '2', lastUsedAt: 10 },
        { label: 'duplicate', value: 'pnpm test', custom: true, usageCount: 9, lastUsedAt: 99 },
        { label: 'bad', value: '   ' },
      ]),
    })

    expect(normalizeTerminalQuickCommandValue(' pnpm   run   build ')).toBe('pnpm run build')
    expect(loadTerminalStoredQuickCommands()).toEqual([
      {
        label: ' list ',
        value: 'pnpm test',
        custom: true,
        usageCount: 2,
        lastUsedAt: 10,
      },
    ])

    saveTerminalStoredQuickCommands([
      { label: 'Build', value: 'pnpm build', custom: true, usageCount: 1, lastUsedAt: 2 },
    ])
    expect(localStorage.getItem(TERMINAL_QUICK_COMMAND_STORAGE_KEY)).toBe(
      '[{"label":"Build","value":"pnpm build","custom":true,"usageCount":1,"lastUsedAt":2}]',
    )
  })

  it('sorts by usage, recency, then source order', () => {
    const commands = [
      { label: 'A', value: 'a', usageCount: 1, lastUsedAt: 5, sourceIndex: 2 },
      { label: 'B', value: 'b', usageCount: 2, lastUsedAt: 1, sourceIndex: 1 },
      { label: 'C', value: 'c', usageCount: 1, lastUsedAt: 5, sourceIndex: 0 },
    ].sort(compareTerminalQuickCommands)

    expect(commands.map((command) => command.value)).toEqual(['b', 'c', 'a'])
  })
})

describe('directoryTry', () => {
  it('prefers explicit prompts and creates stable in-flight keys', () => {
    const payload = {
      kind: 'skill' as const,
      name: 'reviewer',
      displayName: 'Reviewer',
      skillPath: '/skills/reviewer/SKILL.md',
      prompt: 'Run a focused review',
    }

    expect(buildDirectoryTryPrompt(payload)).toBe('Run a focused review')
    expect(getDirectoryTryItemKey(payload)).toBe('skill:reviewer:/skills/reviewer/SKILL.md')
  })

  it('builds fallback prompts from item metadata', () => {
    expect(buildDirectoryTryPrompt({
      kind: 'composio',
      name: 'github',
      displayName: 'GitHub',
    })).toBe('Test GitHub Composio connector. Give me a list of what it can do and one useful example.')
  })
})

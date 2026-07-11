import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  buildWorkspaceRootsProjectOrderState,
  collectWorkspaceRootPathsForProjectRemoval,
  filterGroupsByWorkspaceRoots,
  findAdjacentThreadId,
  insertTurnSummaryMessages,
  removeThreadFromGroups,
  isThreadUnreadByLastRead,
  useDesktopState,
} from './useDesktopState'
import type { ReasoningEffort, UiMessage, UiModelOption, UiProjectGroup } from '../types/codex'
import type { WorkspaceRootsState } from '../api/codexGateway'

const gatewayMocks = vi.hoisted(() => ({
  archiveThread: vi.fn(),
  deleteProjectSessions: vi.fn(),
  deleteThreadSession: vi.fn(),
  forkThread: vi.fn(),
  getAccountRateLimits: vi.fn(),
  getAvailableCollaborationModes: vi.fn(),
  getAvailableModelIds: vi.fn(),
  getEffectiveModelCatalog: vi.fn(),
  getCurrentModelConfig: vi.fn(),
  getPendingServerRequests: vi.fn(),
  getSkillsList: vi.fn(),
  getThreadDetail: vi.fn(),
  getThreadGroupsPage: vi.fn(),
  getThreadQueueState: vi.fn(),
  getThreadTitleCache: vi.fn(),
  getWorkspaceRootsState: vi.fn(),
  generateThreadTitle: vi.fn(),
  interruptThreadTurn: vi.fn(),
  persistThreadTitle: vi.fn(),
  renameThread: vi.fn(),
  replyToServerRequest: vi.fn(),
  restartCodexCli: vi.fn(),
  resumeThread: vi.fn(),
  revertThreadFileChanges: vi.fn(),
  rollbackThread: vi.fn(),
  setCodexSpeedMode: vi.fn(),
  saveModelCatalogConfig: vi.fn(),
  setThreadQueueState: vi.fn(),
  setWorkspaceRootsState: vi.fn(),
  startThread: vi.fn(),
  startThreadTurn: vi.fn(),
  subscribeCodexNotifications: vi.fn(),
}))

vi.mock('../api/codexGateway', () => ({
  ...gatewayMocks,
  getBackgroundThreadListLimit: vi.fn(() => 100),
  pickCodexRateLimitSnapshot: vi.fn(() => null),
}))

function thread(id: string, cwd: string, options: { hasWorktree?: boolean } = {}) {
  return {
    id,
    title: id,
    projectName: cwd ? cwd.split('/').at(-1) || cwd : 'Projectless',
    cwd,
    hasWorktree: options.hasWorktree ?? false,
    createdAtIso: '2026-04-28T00:00:00.000Z',
    updatedAtIso: '2026-04-28T00:00:00.000Z',
    preview: '',
    unread: false,
    inProgress: false,
  }
}

function modelOption(
  id: string,
  options: Partial<Omit<UiModelOption, 'id'>> = {},
): UiModelOption {
  const reasoningEfforts = options.reasoningEfforts ?? ['low', 'medium', 'high', 'xhigh']
  return {
    id,
    label: options.label ?? id,
    source: options.source ?? 'codex',
    isHidden: options.isHidden ?? false,
    isSelectable: options.isSelectable ?? true,
    reasoningEfforts,
    defaultReasoningEffort: options.defaultReasoningEffort ?? (reasoningEfforts.includes('medium' as ReasoningEffort) ? 'medium' : reasoningEfforts[0]),
  }
}

function installTestWindow(initialStorage: Record<string, string> = {}) {
  const store = new Map(Object.entries(initialStorage))
  vi.stubGlobal('window', {
    localStorage: {
      getItem: vi.fn((key: string) => store.get(key) ?? null),
      setItem: vi.fn((key: string, value: string) => {
        store.set(key, value)
      }),
      removeItem: vi.fn((key: string) => {
        store.delete(key)
      }),
    },
    setTimeout: vi.fn(),
    clearTimeout: vi.fn(),
  })
}

function setupRefreshMocks(groups: UiProjectGroup[]): void {
  gatewayMocks.getThreadGroupsPage.mockResolvedValue({ groups, nextCursor: null })
  gatewayMocks.getAvailableCollaborationModes.mockResolvedValue([{ value: 'default', label: 'Default' }])
  gatewayMocks.getSkillsList.mockResolvedValue([])
  gatewayMocks.getAccountRateLimits.mockResolvedValue(null)
  gatewayMocks.getCurrentModelConfig.mockResolvedValue({
    model: 'gpt-5.4',
    providerId: 'codex',
    reasoningEffort: 'medium',
    speedMode: 'standard',
  })
  gatewayMocks.getEffectiveModelCatalog.mockResolvedValue({
    options: [modelOption('gpt-5.4')],
    configText: '{\n  "models": [],\n  "order": []\n}\n',
    configPath: '/tmp/codes-model-catalog.json',
    configError: '',
  })
  gatewayMocks.getAvailableModelIds.mockResolvedValue(['gpt-5.4'])
}

function uiMessage(overrides: Partial<UiMessage> & Pick<UiMessage, 'id' | 'role' | 'text'>): UiMessage {
  return {
    messageType: overrides.role === 'user' ? 'userMessage' : 'agentMessage',
    ...overrides,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  gatewayMocks.getThreadQueueState.mockResolvedValue({})
  gatewayMocks.getThreadTitleCache.mockResolvedValue({ titles: {} })
  gatewayMocks.getWorkspaceRootsState.mockRejectedValue(new Error('no workspace roots state'))
  gatewayMocks.getEffectiveModelCatalog.mockResolvedValue({
    options: [modelOption('gpt-5.4')],
    configText: '{\n  "models": [],\n  "order": []\n}\n',
    configPath: '/tmp/codes-model-catalog.json',
    configError: '',
  })
  gatewayMocks.saveModelCatalogConfig.mockResolvedValue({
    options: [modelOption('gpt-5.4')],
    configText: '{\n  "models": [],\n  "order": []\n}\n',
    configPath: '/tmp/codes-model-catalog.json',
    configError: '',
  })
  gatewayMocks.restartCodexCli.mockResolvedValue(undefined)
  gatewayMocks.setThreadQueueState.mockResolvedValue(undefined)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('filterGroupsByWorkspaceRoots', () => {
  it('keeps all historical projects visible when workspace roots are configured', () => {
    const groups: UiProjectGroup[] = [
      {
        projectName: 'Projectless',
        threads: [thread('projectless-chat', '')],
      },
      {
        projectName: 'allowed-project',
        threads: [thread('allowed-chat', '/tmp/allowed-project')],
      },
      {
        projectName: 'other-project',
        threads: [thread('other-chat', '/tmp/other-project')],
      },
    ]
    const rootsState: WorkspaceRootsState = {
      order: ['/tmp/allowed-project'],
      labels: {},
      active: ['/tmp/allowed-project'],
      projectOrder: [],
    }

    expect(filterGroupsByWorkspaceRoots(groups, rootsState).map((group) => group.projectName)).toEqual([
      'Projectless',
      '/tmp/allowed-project',
      '/tmp/other-project',
    ])
  })

  it('keeps workspace roots with the same folder name as separate projects', () => {
    const groups: UiProjectGroup[] = [
      {
        projectName: 'api',
        threads: [
          thread('first-api-chat', '/tmp/first/api'),
          thread('second-api-chat', '/tmp/second/api'),
        ],
      },
    ]
    const rootsState: WorkspaceRootsState = {
      order: ['/tmp/first/api', '/tmp/second/api'],
      labels: {},
      active: ['/tmp/first/api', '/tmp/second/api'],
      projectOrder: [],
    }

    expect(filterGroupsByWorkspaceRoots(groups, rootsState).map((group) => group.projectName)).toEqual([
      '/tmp/first/api',
      '/tmp/second/api',
    ])
  })

  it('uses Codex project-order without changing cwd project identity', () => {
    const groups: UiProjectGroup[] = [
      {
        projectName: 'alpha',
        threads: [thread('alpha-chat', '/tmp/alpha')],
      },
      {
        projectName: 'beta',
        threads: [thread('beta-chat', '/tmp/beta')],
      },
    ]
    const rootsState: WorkspaceRootsState = {
      order: ['/tmp/alpha', '/tmp/beta'],
      labels: {},
      active: ['/tmp/alpha'],
      projectOrder: ['/tmp/beta', '/tmp/alpha'],
    }

    expect(filterGroupsByWorkspaceRoots(groups, rootsState).map((group) => group.projectName)).toEqual([
      '/tmp/beta',
      '/tmp/alpha',
    ])
  })

  it('does not create empty workspace-root placeholder projects', () => {
    const groups: UiProjectGroup[] = [
      {
        projectName: 'TestChat',
        threads: [thread('testchat-chat', '/Users/igor/temp/TestChat')],
      },
    ]
    const rootsState: WorkspaceRootsState = {
      order: ['/Users/igor/Documents/New project 2/TestChat', '/Users/igor/temp/TestChat'],
      labels: {},
      active: ['/Users/igor/Documents/New project 2/TestChat', '/Users/igor/temp/TestChat'],
      projectOrder: ['/Users/igor/Documents/New project 2/TestChat', '/Users/igor/temp/TestChat'],
    }

    expect(filterGroupsByWorkspaceRoots(groups, rootsState).map((group) => [group.projectName, group.threads.length])).toEqual([
      ['/Users/igor/temp/TestChat', 1],
    ])
  })

  it('does not show remote projects without historical threads', () => {
    const groups: UiProjectGroup[] = []
    const rootsState: WorkspaceRootsState = {
      order: ['/tmp/local-project'],
      labels: {},
      active: ['/tmp/local-project'],
      projectOrder: ['remote-project-id', '/tmp/local-project'],
      remoteProjects: [{
        id: 'remote-project-id',
        hostId: 'remote-ssh-discovered:a1',
        remotePath: '/home/ubuntu',
        label: 'ubuntu',
      }],
    }

    expect(filterGroupsByWorkspaceRoots(groups, rootsState)).toEqual([])
  })

  it('keeps managed worktree threads as separate cwd projects', () => {
    const groups: UiProjectGroup[] = [
      {
        projectName: 'codex-web-local',
        threads: [
          thread('main-chat', '/Users/igor/Git-projects/codex-web-local'),
          thread('worktree-chat', '/Users/igor/.codex/worktrees/53e7/codex-web-local', { hasWorktree: true }),
        ],
      },
    ]
    const rootsState: WorkspaceRootsState = {
      order: ['/Users/igor/Git-projects/codex-web-local'],
      labels: {},
      active: ['/Users/igor/Git-projects/codex-web-local'],
      projectOrder: ['/Users/igor/Git-projects/codex-web-local'],
    }

    expect(filterGroupsByWorkspaceRoots(groups, rootsState).map((group) => [group.projectName, group.threads.map((row) => row.id)])).toEqual([
      ['/Users/igor/Git-projects/codex-web-local', ['main-chat']],
      ['/Users/igor/.codex/worktrees/53e7/codex-web-local', ['worktree-chat']],
    ])
  })

  it('keeps unregistered managed worktrees as their own cwd projects', () => {
    const groups: UiProjectGroup[] = [
      {
        projectName: 'codex-web-local',
        threads: [
          thread('main-chat', '/Users/igor/Git-projects/codex-web-local'),
          thread('registered-worktree-chat', '/Users/igor/.codex/worktrees/a77f/codex-web-local', { hasWorktree: true }),
          thread('unregistered-worktree-chat', '/Users/igor/.codex/worktrees/53e7/codex-web-local', { hasWorktree: true }),
        ],
      },
    ]
    const rootsState: WorkspaceRootsState = {
      order: [
        '/Users/igor/Git-projects/codex-web-local',
        '/Users/igor/.codex/worktrees/a77f/codex-web-local',
      ],
      labels: {
        '/Users/igor/.codex/worktrees/a77f/codex-web-local': 'codex-web-local2',
      },
      active: ['/Users/igor/Git-projects/codex-web-local'],
      projectOrder: ['/Users/igor/Git-projects/codex-web-local'],
    }

    expect(filterGroupsByWorkspaceRoots(groups, rootsState).map((group) => [group.projectName, group.threads.map((row) => row.id)])).toEqual([
      ['/Users/igor/Git-projects/codex-web-local', ['main-chat']],
      ['/Users/igor/.codex/worktrees/a77f/codex-web-local', ['registered-worktree-chat']],
      ['/Users/igor/.codex/worktrees/53e7/codex-web-local', ['unregistered-worktree-chat']],
    ])
  })

  it('keeps unrelated git worktrees visible as separate cwd projects', () => {
    const groups: UiProjectGroup[] = [
      {
        projectName: 'codex-web-local',
        threads: [
          thread('main-chat', '/Users/igor/Git-projects/codex-web-local'),
          thread('other-git-worktree-chat', '/tmp/other/.git/worktrees/codex-web-local', { hasWorktree: true }),
        ],
      },
    ]
    const rootsState: WorkspaceRootsState = {
      order: ['/Users/igor/Git-projects/codex-web-local'],
      labels: {},
      active: ['/Users/igor/Git-projects/codex-web-local'],
      projectOrder: ['/Users/igor/Git-projects/codex-web-local'],
    }

    expect(filterGroupsByWorkspaceRoots(groups, rootsState).map((group) => [group.projectName, group.threads.map((row) => row.id)])).toEqual([
      ['/Users/igor/Git-projects/codex-web-local', ['main-chat']],
      ['/tmp/other/.git/worktrees/codex-web-local', ['other-git-worktree-chat']],
    ])
  })
})

describe('removeThreadFromGroups', () => {
  it('removes an archived thread and drops the now-empty project group', () => {
    const groups: UiProjectGroup[] = [
      {
        projectName: 'alpha',
        threads: [thread('keep-alpha', '/tmp/alpha')],
      },
      {
        projectName: 'archived-project',
        threads: [thread('archive-me', '/tmp/archived-project')],
      },
      {
        projectName: 'beta',
        threads: [thread('keep-beta', '/tmp/beta')],
      },
      {
        projectName: 'empty-workspace-root',
        threads: [],
      },
    ]

    expect(removeThreadFromGroups(groups, 'archive-me').map((group) => [
      group.projectName,
      group.threads.map((row) => row.id),
    ])).toEqual([
      ['alpha', ['keep-alpha']],
      ['beta', ['keep-beta']],
      ['empty-workspace-root', []],
    ])
  })

  it('preserves referential identity when the thread is absent', () => {
    const groups: UiProjectGroup[] = [
      {
        projectName: 'alpha',
        threads: [thread('keep-alpha', '/tmp/alpha')],
      },
    ]

    expect(removeThreadFromGroups(groups, 'missing-thread')).toBe(groups)
  })
})

describe('destructive session deletion state', () => {
  it('deletes a thread session and removes it from loaded groups', async () => {
    installTestWindow()
    const initialGroups: UiProjectGroup[] = [
      {
        projectName: 'alpha',
        threads: [
          thread('keep-alpha', '/tmp/alpha'),
          thread('delete-alpha', '/tmp/alpha'),
        ],
      },
    ]
    const nextGroups: UiProjectGroup[] = [
      {
        projectName: 'alpha',
        threads: [thread('keep-alpha', '/tmp/alpha')],
      },
    ]
    setupRefreshMocks(initialGroups)
    gatewayMocks.getThreadGroupsPage
      .mockResolvedValueOnce({ groups: initialGroups, nextCursor: null })
      .mockResolvedValue({ groups: nextGroups, nextCursor: null })
    gatewayMocks.deleteThreadSession.mockResolvedValue({ deletedThreadIds: ['delete-alpha'] })

    const state = useDesktopState()
    await state.refreshAll({ includeSelectedThreadMessages: false, awaitAncillaryRefreshes: true })

    await state.deleteThreadSessionById('delete-alpha')

    expect(gatewayMocks.deleteThreadSession).toHaveBeenCalledWith('delete-alpha')
    expect(state.projectGroups.value.map((group) => [group.projectName, group.threads.map((row) => row.id)])).toEqual([
      ['/tmp/alpha', ['keep-alpha']],
    ])
  })

  it('deletes exact-cwd project sessions and hides the project row', async () => {
    installTestWindow()
    const initialGroups: UiProjectGroup[] = [
      {
        projectName: 'alpha',
        threads: [thread('delete-alpha', '/tmp/alpha')],
      },
      {
        projectName: 'beta',
        threads: [thread('keep-beta', '/tmp/beta')],
      },
    ]
    const nextGroups: UiProjectGroup[] = [
      {
        projectName: 'beta',
        threads: [thread('keep-beta', '/tmp/beta')],
      },
    ]
    setupRefreshMocks(initialGroups)
    gatewayMocks.getThreadGroupsPage
      .mockResolvedValueOnce({ groups: initialGroups, nextCursor: null })
      .mockResolvedValue({ groups: nextGroups, nextCursor: null })
    gatewayMocks.deleteProjectSessions.mockResolvedValue({ deletedThreadIds: ['delete-alpha'] })

    const state = useDesktopState()
    await state.refreshAll({ includeSelectedThreadMessages: false, awaitAncillaryRefreshes: true })

    await state.deleteProjectSessionsByCwd('alpha', '/tmp/alpha')

    expect(gatewayMocks.deleteProjectSessions).toHaveBeenCalledWith('/tmp/alpha')
    expect(state.projectGroups.value.map((group) => [group.projectName, group.threads.map((row) => row.id)])).toEqual([
      ['/tmp/beta', ['keep-beta']],
    ])
  })
})

describe('thread history hydration', () => {
  it('loads existing thread messages without resuming the thread', async () => {
    installTestWindow()
    gatewayMocks.getThreadDetail.mockResolvedValue({
      messages: [
        uiMessage({
          id: 'message-a',
          role: 'assistant',
          text: 'loaded',
          turnId: 'turn-1',
        }),
      ],
      inProgress: false,
      activeTurnId: '',
      hasMoreOlder: false,
      turnIndexByTurnId: { 'turn-1': 0 },
    })

    const state = useDesktopState()
    state.primeSelectedThread('thread-a')
    await state.loadMessages('thread-a')

    expect(gatewayMocks.getThreadDetail).toHaveBeenCalledWith('thread-a')
    expect(gatewayMocks.resumeThread).not.toHaveBeenCalled()
    expect(state.messages.value.map((message) => message.text)).toEqual(['loaded'])
  })

  it('inserts searched thread summaries as separate cwd projects', () => {
    installTestWindow()
    const state = useDesktopState()

    state.insertThreadSummaries([
      thread('main-chat', '/Users/igor/Git-projects/codex-web-local'),
      thread('worktree-chat', '/Users/igor/.codex/worktrees/53e7/codex-web-local', { hasWorktree: true }),
    ])

    expect(state.projectGroups.value.map((group) => [group.projectName, group.threads.map((row) => row.id)])).toEqual([
      ['/Users/igor/Git-projects/codex-web-local', ['main-chat']],
      ['/Users/igor/.codex/worktrees/53e7/codex-web-local', ['worktree-chat']],
    ])
  })

  it('loads remaining thread history pages on demand', async () => {
    installTestWindow()
    setupRefreshMocks([])
    gatewayMocks.getThreadGroupsPage.mockReset()
    gatewayMocks.getThreadGroupsPage
      .mockResolvedValueOnce({
        groups: [
          {
            projectName: '/tmp/alpha',
            threads: [thread('alpha-chat', '/tmp/alpha')],
          },
        ],
        nextCursor: 'cursor-1',
      })
      .mockResolvedValueOnce({
        groups: [
          {
            projectName: '/tmp/beta',
            threads: [thread('beta-chat', '/tmp/beta')],
          },
        ],
        nextCursor: null,
      })

    const state = useDesktopState()
    await state.refreshAll({ includeSelectedThreadMessages: false, awaitAncillaryRefreshes: true })

    expect(state.hasMoreThreadHistory.value).toBe(true)
    await state.loadMoreThreadHistory()

    expect(gatewayMocks.getThreadGroupsPage).toHaveBeenLastCalledWith('cursor-1', 100)
    expect(state.hasMoreThreadHistory.value).toBe(false)
    expect(state.projectGroups.value.map((group) => [group.projectName, group.threads.map((row) => row.id)])).toEqual([
      ['/tmp/alpha', ['alpha-chat']],
      ['/tmp/beta', ['beta-chat']],
    ])
  })

  it('keeps manual history loading available after the source configured auto-load threshold', async () => {
    installTestWindow()
    setupRefreshMocks([])
    gatewayMocks.getThreadGroupsPage.mockReset()
    gatewayMocks.getThreadGroupsPage
      .mockResolvedValueOnce({
        groups: [
          {
            projectName: '/tmp/alpha',
            threads: Array.from({ length: 1000 }, (_value, index) => thread(`alpha-chat-${index}`, '/tmp/alpha')),
          },
        ],
        nextCursor: 'cursor-1',
      })
      .mockResolvedValueOnce({
        groups: [
          {
            projectName: '/tmp/beta',
            threads: [thread('beta-chat', '/tmp/beta')],
          },
        ],
        nextCursor: null,
      })

    const state = useDesktopState()
    await state.refreshAll({ includeSelectedThreadMessages: false, awaitAncillaryRefreshes: true })

    expect(window.setTimeout).not.toHaveBeenCalled()
    expect(state.hasMoreThreadHistory.value).toBe(true)

    await state.loadMoreThreadHistory()

    expect(gatewayMocks.getThreadGroupsPage).toHaveBeenLastCalledWith('cursor-1', 100)
    expect(state.hasMoreThreadHistory.value).toBe(false)
    expect(state.projectGroups.value.some((group) => group.projectName === '/tmp/beta')).toBe(true)
  })
})

describe('workspace roots project persistence helpers', () => {
  it('collects duplicate-path project roots by full path when removing a project', () => {
    const rootsState: WorkspaceRootsState = {
      order: ['/tmp/first/api', '/tmp/second/api'],
      labels: {
        '/tmp/first/api': 'First API',
        '/tmp/second/api': 'Second API',
      },
      active: ['/tmp/first/api'],
      projectOrder: ['/tmp/first/api', '/tmp/second/api'],
    }

    expect([...collectWorkspaceRootPathsForProjectRemoval(rootsState, '/tmp/first/api')]).toEqual([
      '/tmp/first/api',
    ])
  })

  it('preserves remote project ids in explicit project order when persisting workspace roots', () => {
    const groups: UiProjectGroup[] = [
      {
        projectName: 'local-project',
        threads: [thread('local-chat', '/tmp/local-project')],
      },
    ]
    const rootsState: WorkspaceRootsState = {
      order: ['/tmp/local-project'],
      labels: {},
      active: ['/tmp/local-project'],
      projectOrder: ['remote-project-id', '/tmp/local-project'],
      remoteProjects: [{
        id: 'remote-project-id',
        hostId: 'remote-ssh-discovered:a1',
        remotePath: '/home/ubuntu',
        label: 'ubuntu',
      }],
    }

    expect(buildWorkspaceRootsProjectOrderState(rootsState, ['remote-project-id', 'local-project'], groups)).toEqual({
      order: ['/tmp/local-project'],
      active: ['/tmp/local-project'],
      projectOrder: ['remote-project-id', '/tmp/local-project'],
    })
  })
})

describe('thread unread state helpers', () => {
  const cutoffIso = '2026-05-01T12:00:00.000Z'

  it('uses the initialization cutoff when a thread has no read state', () => {
    expect(isThreadUnreadByLastRead('2026-05-01T11:59:59.000Z', undefined, cutoffIso)).toBe(false)
    expect(isThreadUnreadByLastRead('2026-05-01T12:00:01.000Z', undefined, cutoffIso)).toBe(true)
  })

  it('uses per-thread read state instead of the global cutoff after a thread is read', () => {
    expect(isThreadUnreadByLastRead(
      '2026-05-01T12:30:00.000Z',
      '2026-05-01T12:45:00.000Z',
      cutoffIso,
    )).toBe(false)
    expect(isThreadUnreadByLastRead(
      '2026-05-01T12:50:00.000Z',
      '2026-05-01T12:45:00.000Z',
      cutoffIso,
    )).toBe(true)
  })
})

describe('runtime worked summaries', () => {
  it('inserts a runtime worked summary inside its own turn when a newer turn is already visible', () => {
    const messages: UiMessage[] = [
      uiMessage({
        id: 'assistant-process',
        role: 'assistant',
        text: 'I will inspect the files.',
        turnId: 'turn-1',
        turnIndex: 0,
      }),
      uiMessage({
        id: 'assistant-final',
        role: 'assistant',
        text: 'Done.',
        turnId: 'turn-1',
        turnIndex: 0,
      }),
      uiMessage({
        id: 'user-next',
        role: 'user',
        text: 'next request',
        turnId: 'turn-2',
        turnIndex: 1,
      }),
      uiMessage({
        id: 'assistant-next-live',
        role: 'assistant',
        text: 'Thinking...',
        messageType: 'agentMessage.live',
        turnId: 'turn-2',
        turnIndex: 1,
      }),
    ]

    expect(insertTurnSummaryMessages(messages, [{ turnId: 'turn-1', durationMs: 61_000 }]).map((message) => message.id)).toEqual([
      'assistant-process',
      'turn-summary:turn-1',
      'assistant-final',
      'user-next',
      'assistant-next-live',
    ])
  })

  it('does not duplicate a worked summary that is already persisted for the same turn', () => {
    const messages: UiMessage[] = [
      uiMessage({
        id: 'turn-summary:turn-1',
        role: 'system',
        text: 'Worked for 1m 1s',
        messageType: 'worked',
        turnId: 'turn-1',
      }),
      uiMessage({
        id: 'assistant-final',
        role: 'assistant',
        text: 'Done.',
        turnId: 'turn-1',
      }),
    ]

    expect(insertTurnSummaryMessages(messages, [{ turnId: 'turn-1', durationMs: 61_000 }])).toBe(messages)
  })
})

describe('collaboration mode selection', () => {
  it('does not carry plan mode from new chats into existing threads', () => {
    installTestWindow({
      'codex-web-local.collaboration-mode.v1': 'plan',
    })

    const state = useDesktopState()

    expect(state.selectedCollaborationMode.value).toBe('default')

    state.setSelectedCollaborationMode('plan')

    expect(state.selectedCollaborationMode.value).toBe('plan')
    expect(window.localStorage.getItem('codex-web-local.collaboration-mode-by-context.v1')).toBe(null)

    state.primeSelectedThread('thread-a')

    expect(state.selectedCollaborationMode.value).toBe('default')

    state.setSelectedCollaborationMode('plan')
    state.primeSelectedThread('thread-b')

    expect(state.selectedCollaborationMode.value).toBe('default')

    state.primeSelectedThread('thread-a')

    expect(state.selectedCollaborationMode.value).toBe('plan')
  })
})

describe('optimistic submitted user messages', () => {
  it('keeps the previous worked summary visible while submitting the next turn', async () => {
    installTestWindow()

    const previousMessages: UiMessage[] = [
      uiMessage({
        id: 'assistant-process',
        role: 'assistant',
        text: 'I will inspect the files.',
        turnId: 'turn-1',
        turnIndex: 0,
      }),
      uiMessage({
        id: 'assistant-final',
        role: 'assistant',
        text: 'Done.',
        turnId: 'turn-1',
        turnIndex: 0,
      }),
    ]
    let emitNotification: (notification: { method: string; params?: unknown; atIso?: string }) => void = () => {}

    gatewayMocks.getPendingServerRequests.mockResolvedValue([])
    gatewayMocks.subscribeCodexNotifications.mockImplementation((callback) => {
      emitNotification = callback
      return vi.fn()
    })
    gatewayMocks.resumeThread.mockResolvedValue({
      model: 'gpt-5.4',
      messages: previousMessages,
      inProgress: false,
      activeTurnId: '',
      hasMoreOlder: false,
      turnIndexByTurnId: { 'turn-1': 0 },
    })
    gatewayMocks.getThreadDetail.mockResolvedValue({
      messages: previousMessages,
      inProgress: false,
      activeTurnId: '',
      hasMoreOlder: false,
      turnIndexByTurnId: { 'turn-1': 0 },
    })
    gatewayMocks.startThreadTurn.mockResolvedValue('turn-2')

    const state = useDesktopState()
    state.primeSelectedThread('thread-a')
    await state.loadMessages('thread-a')
    state.startPolling()

    emitNotification({
      method: 'turn/completed',
      params: {
        threadId: 'thread-a',
        turnId: 'turn-1',
        durationMs: 61_000,
      },
      atIso: '2026-06-20T10:00:00.000Z',
    })

    expect(state.messages.value.map((message) => message.id)).toEqual([
      'assistant-process',
      'turn-summary:turn-1',
      'assistant-final',
    ])

    await state.sendMessageToSelectedThread('next request')

    expect(state.messages.value.slice(0, 3).map((message) => message.id)).toEqual([
      'assistant-process',
      'turn-summary:turn-1',
      'assistant-final',
    ])
    expect(state.messages.value[3]).toMatchObject({
      role: 'user',
      text: 'next request',
      messageType: 'userMessage.optimistic',
    })
  })

  it('marks the selected thread in progress even before a thread summary is available', async () => {
    installTestWindow()

    let resolveTurnStart: (turnId: string) => void = () => {}
    gatewayMocks.resumeThread.mockResolvedValue({ model: 'gpt-5.4' })
    gatewayMocks.startThreadTurn.mockImplementation(() => new Promise<string>((resolve) => {
      resolveTurnStart = resolve
    }))
    gatewayMocks.getThreadDetail.mockResolvedValue({
      messages: [],
      inProgress: true,
      activeTurnId: 'turn-1',
      hasMoreOlder: false,
      turnIndexByTurnId: { 'turn-1': 0 },
    })

    const state = useDesktopState()
    state.primeSelectedThread('thread-without-summary')

    const sendPromise = state.sendMessageToSelectedThread('make stop visible')
    await Promise.resolve()

    expect(state.selectedThread.value).toBe(null)
    expect(state.selectedThreadInProgress.value).toBe(true)

    for (let attempt = 0; attempt < 5 && gatewayMocks.startThreadTurn.mock.calls.length === 0; attempt += 1) {
      await Promise.resolve()
    }
    expect(gatewayMocks.startThreadTurn).toHaveBeenCalled()
    resolveTurnStart('turn-1')
    await sendPromise
  })

  it('shows the submitted user message before thread detail refresh and removes it after persistence', async () => {
    installTestWindow()

    const persistedUserMessage: UiMessage = {
      id: 'real-user-message',
      role: 'user',
      text: 'hello optimistic',
      skills: [{ name: 'demo-skill', path: '/tmp/demo-skill/SKILL.md' }],
      fileAttachments: [{ label: 'note.md', path: '/tmp/note.md' }],
      messageType: 'userMessage',
      turnId: 'turn-1',
      turnIndex: 0,
    }
    let resolveTurnStart: (turnId: string) => void = () => {}
    gatewayMocks.resumeThread.mockResolvedValue({ model: 'gpt-5.4' })
    gatewayMocks.startThreadTurn.mockImplementation(() => new Promise<string>((resolve) => {
      resolveTurnStart = resolve
    }))
    gatewayMocks.getThreadDetail.mockResolvedValue({
      messages: [persistedUserMessage],
      inProgress: true,
      activeTurnId: 'turn-1',
      hasMoreOlder: false,
      turnIndexByTurnId: { 'turn-1': 0 },
    })

    const state = useDesktopState()
    state.primeSelectedThread('thread-a')

    const sendPromise = state.sendMessageToSelectedThread(
      'hello optimistic',
      [],
      [{ name: 'demo-skill', path: '/tmp/demo-skill/SKILL.md' }],
      'steer',
      [{ label: 'note.md', path: '/tmp/note.md', fsPath: '/tmp/note.md' }],
    )
    await Promise.resolve()

    expect(state.messages.value).toHaveLength(1)
    expect(state.messages.value[0]).toMatchObject({
      role: 'user',
      text: 'hello optimistic',
      skills: [{ name: 'demo-skill', path: '/tmp/demo-skill/SKILL.md' }],
      fileAttachments: [{ label: 'note.md', path: '/tmp/note.md' }],
      messageType: 'userMessage.optimistic',
    })

    for (let attempt = 0; attempt < 5 && gatewayMocks.startThreadTurn.mock.calls.length === 0; attempt += 1) {
      await Promise.resolve()
    }
    expect(gatewayMocks.startThreadTurn).toHaveBeenCalled()
    resolveTurnStart('turn-1')
    await sendPromise

    expect(state.messages.value).toHaveLength(1)
    expect(state.messages.value[0]).toStrictEqual(persistedUserMessage)
  })

  it('removes an optimistic image message when persistence adds image-derived file attachments', async () => {
    installTestWindow()

    const imageUrl = '/codex-local-image?path=%2Ftmp%2Fimage.png'
    const persistedUserMessage: UiMessage = {
      id: 'real-user-image-message',
      role: 'user',
      text: 'look at this image',
      images: [imageUrl],
      fileAttachments: [{ label: 'image.png', path: '/tmp/image.png' }],
      messageType: 'userMessage',
      turnId: 'turn-1',
      turnIndex: 0,
    }
    let resolveTurnStart: (turnId: string) => void = () => {}
    gatewayMocks.resumeThread.mockResolvedValue({ model: 'gpt-5.4' })
    gatewayMocks.startThreadTurn.mockImplementation(() => new Promise<string>((resolve) => {
      resolveTurnStart = resolve
    }))
    gatewayMocks.getThreadDetail.mockResolvedValue({
      messages: [persistedUserMessage],
      inProgress: true,
      activeTurnId: 'turn-1',
      hasMoreOlder: false,
      turnIndexByTurnId: { 'turn-1': 0 },
    })

    const state = useDesktopState()
    state.primeSelectedThread('thread-with-image')

    const sendPromise = state.sendMessageToSelectedThread(
      'look at this image',
      [imageUrl],
    )
    await Promise.resolve()

    expect(state.messages.value).toHaveLength(1)
    expect(state.messages.value[0]).toMatchObject({
      role: 'user',
      text: 'look at this image',
      images: [imageUrl],
      messageType: 'userMessage.optimistic',
    })
    expect(state.messages.value[0]?.fileAttachments).toBeUndefined()

    for (let attempt = 0; attempt < 5 && gatewayMocks.startThreadTurn.mock.calls.length === 0; attempt += 1) {
      await Promise.resolve()
    }
    expect(gatewayMocks.startThreadTurn).toHaveBeenCalled()
    resolveTurnStart('turn-1')
    await sendPromise

    expect(state.messages.value).toStrictEqual([persistedUserMessage])
  })

  it('keeps a repeated submitted message visible until the matching new persisted message arrives', async () => {
    installTestWindow()
    const nowSpy = vi.spyOn(Date, 'now').mockReturnValue(1_000)

    const historyUserMessage: UiMessage = {
      id: 'history-user-message',
      role: 'user',
      text: 'repeat me',
      messageType: 'userMessage',
      turnId: 'turn-0',
      turnIndex: 0,
    }
    const persistedRepeatedUserMessage: UiMessage = {
      id: 'real-repeated-user-message',
      role: 'user',
      text: 'repeat me',
      messageType: 'userMessage',
      turnId: 'turn-1',
      turnIndex: 1,
    }
    let resolveTurnStart: (turnId: string) => void = () => {}
    gatewayMocks.resumeThread.mockResolvedValue({
      model: 'gpt-5.4',
      messages: [historyUserMessage],
      inProgress: false,
      activeTurnId: '',
      hasMoreOlder: false,
      turnIndexByTurnId: { 'turn-0': 0 },
    })
    gatewayMocks.startThreadTurn.mockImplementation(() => new Promise<string>((resolve) => {
      resolveTurnStart = resolve
    }))
    gatewayMocks.getThreadDetail
      .mockResolvedValueOnce({
        messages: [historyUserMessage],
        inProgress: false,
        activeTurnId: '',
        hasMoreOlder: false,
        turnIndexByTurnId: { 'turn-0': 0 },
      })
      .mockResolvedValue({
        messages: [historyUserMessage, persistedRepeatedUserMessage],
        inProgress: true,
        activeTurnId: 'turn-1',
        hasMoreOlder: false,
        turnIndexByTurnId: { 'turn-0': 0, 'turn-1': 1 },
      })

    const state = useDesktopState()
    state.primeSelectedThread('thread-a')
    await state.loadMessages('thread-a')

    nowSpy.mockReturnValue(4_000)
    const sendPromise = state.sendMessageToSelectedThread('repeat me')
    await Promise.resolve()

    expect(state.messages.value).toHaveLength(2)
    expect(state.messages.value[0]).toStrictEqual(historyUserMessage)
    expect(state.messages.value[1]).toMatchObject({
      role: 'user',
      text: 'repeat me',
      messageType: 'userMessage.optimistic',
    })

    for (let attempt = 0; attempt < 5 && gatewayMocks.startThreadTurn.mock.calls.length === 0; attempt += 1) {
      await Promise.resolve()
    }
    expect(gatewayMocks.startThreadTurn).toHaveBeenCalled()
    resolveTurnStart('turn-1')
    await sendPromise
    await state.loadMessages('thread-a')
    nowSpy.mockRestore()

    expect(state.messages.value).toStrictEqual([
      historyUserMessage,
      persistedRepeatedUserMessage,
    ])
  })
})

describe('history message editing', () => {
  it('resumes a previously restored thread again after rollback before sending the edited turn', async () => {
    installTestWindow()
    const historyMessages: UiMessage[] = [
      uiMessage({
        id: 'user-turn-1',
        role: 'user',
        text: 'first prompt',
        turnId: 'turn-1',
        turnIndex: 0,
      }),
      uiMessage({
        id: 'assistant-turn-1',
        role: 'assistant',
        text: 'first answer',
        turnId: 'turn-1',
        turnIndex: 0,
      }),
      uiMessage({
        id: 'user-turn-2',
        role: 'user',
        text: 'old prompt',
        turnId: 'turn-2',
        turnIndex: 1,
      }),
      uiMessage({
        id: 'assistant-turn-2',
        role: 'assistant',
        text: 'old answer',
        turnId: 'turn-2',
        turnIndex: 1,
      }),
    ]
    let emitNotification: (notification: { method: string; params?: unknown; atIso?: string }) => void = () => {}

    setupRefreshMocks([
      {
        projectName: 'alpha',
        threads: [thread('thread-a', '/tmp/alpha')],
      },
    ])
    gatewayMocks.getPendingServerRequests.mockResolvedValue([])
    gatewayMocks.subscribeCodexNotifications.mockImplementation((callback) => {
      emitNotification = callback
      return vi.fn()
    })
    gatewayMocks.getThreadDetail.mockResolvedValue({
      messages: historyMessages,
      inProgress: false,
      activeTurnId: '',
      hasMoreOlder: false,
      turnIndexByTurnId: { 'turn-1': 0, 'turn-2': 1 },
    })
    gatewayMocks.resumeThread.mockResolvedValue({ model: 'gpt-5.4' })
    gatewayMocks.startThreadTurn
      .mockResolvedValueOnce('turn-3')
      .mockResolvedValueOnce('turn-4')
    gatewayMocks.rollbackThread.mockResolvedValue(historyMessages.slice(0, 2))

    const state = useDesktopState()
    state.primeSelectedThread('thread-a')
    await state.refreshAll({ includeSelectedThreadMessages: true, awaitAncillaryRefreshes: true })
    state.startPolling()

    await state.sendMessageToSelectedThread('warm up restore state')
    expect(gatewayMocks.resumeThread).toHaveBeenCalledTimes(1)

    emitNotification({
      method: 'turn/completed',
      params: {
        threadId: 'thread-a',
        turnId: 'turn-3',
        turn: { id: 'turn-3', status: 'completed' },
      },
      atIso: '2026-07-07T10:00:00.000Z',
    })

    await expect(state.rollbackSelectedThread('turn-2')).resolves.toBe(true)
    await state.sendMessageToSelectedThread('edited prompt')

    expect(gatewayMocks.rollbackThread).toHaveBeenCalledWith('thread-a', 1)
    expect(gatewayMocks.resumeThread).toHaveBeenCalledTimes(2)
    expect(gatewayMocks.startThreadTurn).toHaveBeenLastCalledWith(
      'thread-a',
      'edited prompt',
      [],
      'gpt-5.4',
      'medium',
      undefined,
      [],
      'default',
    )
  })

  it('restores an unresumed latest thread before rollback, then clears stale in-progress state before sending the edited turn', async () => {
    installTestWindow()
    const latestThreadMessages: UiMessage[] = [
      uiMessage({
        id: 'latest-user-turn',
        role: 'user',
        text: 'old latest prompt',
        turnId: 'turn-latest',
        turnIndex: 0,
      }),
      uiMessage({
        id: 'latest-assistant-turn',
        role: 'assistant',
        text: 'old latest answer',
        turnId: 'turn-latest',
        turnIndex: 0,
      }),
    ]

    setupRefreshMocks([
      {
        projectName: 'alpha',
        threads: [thread('thread-latest', '/tmp/alpha')],
      },
    ])
    gatewayMocks.getPendingServerRequests.mockResolvedValue([])
    gatewayMocks.getThreadDetail.mockResolvedValue({
      messages: latestThreadMessages,
      inProgress: true,
      activeTurnId: 'turn-latest',
      hasMoreOlder: false,
      turnIndexByTurnId: { 'turn-latest': 0 },
    })
    gatewayMocks.rollbackThread.mockResolvedValue([])
    gatewayMocks.resumeThread.mockResolvedValue({ model: 'gpt-5.4' })
    gatewayMocks.startThreadTurn.mockResolvedValue('turn-edited')

    const state = useDesktopState()
    state.primeSelectedThread('thread-latest')
    await state.refreshAll({ includeSelectedThreadMessages: true, awaitAncillaryRefreshes: true })

    expect(state.selectedThreadInProgress.value).toBe(true)

    await expect(state.rollbackSelectedThread('turn-latest')).resolves.toBe(true)

    expect(state.selectedThreadInProgress.value).toBe(false)

    await state.sendMessageToSelectedThread('edited latest prompt')

    expect(gatewayMocks.resumeThread).toHaveBeenCalledTimes(2)
    expect(gatewayMocks.resumeThread.mock.invocationCallOrder[0]).toBeLessThan(
      gatewayMocks.rollbackThread.mock.invocationCallOrder[0],
    )
    expect(gatewayMocks.rollbackThread.mock.invocationCallOrder[0]).toBeLessThan(
      gatewayMocks.resumeThread.mock.invocationCallOrder[1],
    )
    expect(gatewayMocks.startThreadTurn).toHaveBeenLastCalledWith(
      'thread-latest',
      'edited latest prompt',
      [],
      'gpt-5.4',
      'medium',
      undefined,
      [],
      'default',
    )
  })

  it('shows restoring thread activity while rollback restores an unresumed history thread', async () => {
    installTestWindow()
    const historyMessages: UiMessage[] = [
      uiMessage({
        id: 'history-user-turn',
        role: 'user',
        text: 'old prompt',
        turnId: 'history-turn',
        turnIndex: 0,
      }),
      uiMessage({
        id: 'history-assistant-turn',
        role: 'assistant',
        text: 'old answer',
        turnId: 'history-turn',
        turnIndex: 0,
      }),
    ]
    let resolveResumeThread: (value: {
      model: string
      messages: UiMessage[]
      inProgress: boolean
      activeTurnId: string
      hasMoreOlder: boolean
      turnIndexByTurnId: Record<string, number>
    }) => void = () => {}

    setupRefreshMocks([
      {
        projectName: 'alpha',
        threads: [thread('thread-history-wait', '/tmp/alpha')],
      },
    ])
    gatewayMocks.getPendingServerRequests.mockResolvedValue([])
    gatewayMocks.getThreadDetail.mockResolvedValue({
      messages: historyMessages,
      inProgress: false,
      activeTurnId: '',
      hasMoreOlder: false,
      turnIndexByTurnId: { 'history-turn': 0 },
    })
    gatewayMocks.resumeThread.mockImplementation(() => new Promise((resolve) => {
      resolveResumeThread = resolve
    }))
    gatewayMocks.rollbackThread.mockResolvedValue([])

    const state = useDesktopState()
    state.primeSelectedThread('thread-history-wait')
    await state.refreshAll({ includeSelectedThreadMessages: true, awaitAncillaryRefreshes: true })

    const rollbackPromise = state.rollbackSelectedThread('history-turn')
    await Promise.resolve()

    expect(state.selectedThreadInProgress.value).toBe(false)
    expect(state.selectedLiveOverlay.value).toMatchObject({
      activityLabel: 'Restoring thread',
      reasoningText: '',
      errorText: '',
    })

    resolveResumeThread({
      model: 'gpt-5.4',
      messages: historyMessages,
      inProgress: false,
      activeTurnId: '',
      hasMoreOlder: false,
      turnIndexByTurnId: { 'history-turn': 0 },
    })
    await expect(rollbackPromise).resolves.toBe(true)

    expect(state.selectedLiveOverlay.value).toBe(null)
  })

  it('restores each selected old thread before rollback when editing multiple history threads in sequence', async () => {
    installTestWindow()
    const firstThreadMessages: UiMessage[] = [
      uiMessage({
        id: 'first-user-turn',
        role: 'user',
        text: 'first old prompt',
        turnId: 'first-turn',
        turnIndex: 0,
      }),
      uiMessage({
        id: 'first-assistant-turn',
        role: 'assistant',
        text: 'first old answer',
        turnId: 'first-turn',
        turnIndex: 0,
      }),
    ]
    const secondThreadMessages: UiMessage[] = [
      uiMessage({
        id: 'second-user-turn-1',
        role: 'user',
        text: 'second first prompt',
        turnId: 'second-turn-1',
        turnIndex: 0,
      }),
      uiMessage({
        id: 'second-assistant-turn-1',
        role: 'assistant',
        text: 'second first answer',
        turnId: 'second-turn-1',
        turnIndex: 0,
      }),
      uiMessage({
        id: 'second-user-turn-2',
        role: 'user',
        text: 'second old prompt',
        turnId: 'second-turn-2',
        turnIndex: 1,
      }),
      uiMessage({
        id: 'second-assistant-turn-2',
        role: 'assistant',
        text: 'second old answer',
        turnId: 'second-turn-2',
        turnIndex: 1,
      }),
    ]

    setupRefreshMocks([
      {
        projectName: 'alpha',
        threads: [
          thread('thread-first-old', '/tmp/alpha'),
          thread('thread-second-old', '/tmp/alpha'),
        ],
      },
    ])
    gatewayMocks.getPendingServerRequests.mockResolvedValue([])
    gatewayMocks.getThreadDetail.mockImplementation(async (threadId: string) => {
      if (threadId === 'thread-second-old') {
        return {
          messages: secondThreadMessages,
          inProgress: false,
          activeTurnId: '',
          hasMoreOlder: false,
          turnIndexByTurnId: { 'second-turn-1': 0, 'second-turn-2': 1 },
        }
      }
      return {
        messages: firstThreadMessages,
        inProgress: false,
        activeTurnId: '',
        hasMoreOlder: false,
        turnIndexByTurnId: { 'first-turn': 0 },
      }
    })
    gatewayMocks.resumeThread.mockImplementation(async (threadId: string) => ({
      model: 'gpt-5.4',
      messages: threadId === 'thread-second-old' ? secondThreadMessages : firstThreadMessages,
      inProgress: false,
      activeTurnId: '',
      hasMoreOlder: false,
      turnIndexByTurnId: threadId === 'thread-second-old'
        ? { 'second-turn-1': 0, 'second-turn-2': 1 }
        : { 'first-turn': 0 },
    }))
    gatewayMocks.rollbackThread.mockImplementation(async (threadId: string) => (
      threadId === 'thread-second-old' ? secondThreadMessages.slice(0, 2) : []
    ))
    gatewayMocks.startThreadTurn.mockImplementation(async (threadId: string) => (
      threadId === 'thread-second-old' ? 'second-edited-turn' : 'first-edited-turn'
    ))

    const state = useDesktopState()
    state.primeSelectedThread('thread-first-old')
    await state.refreshAll({ includeSelectedThreadMessages: true, awaitAncillaryRefreshes: true })

    await expect(state.rollbackSelectedThread('first-turn')).resolves.toBe(true)
    await state.sendMessageToSelectedThread('first edited prompt')

    await state.selectThread('thread-second-old')
    await expect(state.rollbackSelectedThread('second-turn-2')).resolves.toBe(true)
    await state.sendMessageToSelectedThread('second edited prompt')

    expect(gatewayMocks.resumeThread).toHaveBeenCalledTimes(4)
    expect(gatewayMocks.rollbackThread).toHaveBeenNthCalledWith(2, 'thread-second-old', 1)
    expect(gatewayMocks.startThreadTurn).toHaveBeenCalledTimes(2)
    expect(gatewayMocks.resumeThread.mock.invocationCallOrder[2]).toBeLessThan(
      gatewayMocks.rollbackThread.mock.invocationCallOrder[1],
    )
    expect(gatewayMocks.rollbackThread.mock.invocationCallOrder[1]).toBeLessThan(
      gatewayMocks.resumeThread.mock.invocationCallOrder[3],
    )
    expect(gatewayMocks.resumeThread.mock.invocationCallOrder[3]).toBeLessThan(
      gatewayMocks.startThreadTurn.mock.invocationCallOrder[1],
    )
    expect(gatewayMocks.startThreadTurn).toHaveBeenLastCalledWith(
      'thread-second-old',
      'second edited prompt',
      [],
      'gpt-5.4',
      'medium',
      undefined,
      [],
      'default',
    )
  })
})

describe('new thread activity', () => {
  it('shows starting thread activity while the first new-thread request is creating the thread', async () => {
    installTestWindow()
    let resolveStartThread: (value: { threadId: string; model: string }) => void = () => {}

    setupRefreshMocks([])
    gatewayMocks.startThread.mockImplementation(() => new Promise((resolve) => {
      resolveStartThread = resolve
    }))
    gatewayMocks.startThreadTurn.mockImplementation(() => new Promise(() => {}))

    const state = useDesktopState()

    const sendPromise = state.sendMessageToNewThread('start a new task', '/tmp/alpha')
    await Promise.resolve()

    expect(state.newThreadLiveOverlay.value).toMatchObject({
      activityLabel: 'Starting thread',
      reasoningText: '',
      errorText: '',
    })

    resolveStartThread({ threadId: 'thread-new', model: 'gpt-5.4' })

    await expect(sendPromise).resolves.toBe('thread-new')

    expect(state.newThreadLiveOverlay.value).toBe(null)
    expect(state.selectedLiveOverlay.value).toMatchObject({
      activityLabel: 'Thinking',
      errorText: '',
    })
  })
})

describe('Codex CLI restart state', () => {
  it('requires inline confirmation before restarting and refreshing app-server backed state', async () => {
    installTestWindow()
    setupRefreshMocks([])

    const state = useDesktopState()

    await state.restartCodexCliFromSettings()

    expect(state.isCodexCliRestartConfirming.value).toBe(true)
    expect(state.codexCliRestartMessage.value).toBe('Click again to restart Codex CLI. Running turns and pending requests will be interrupted.')
    expect(gatewayMocks.restartCodexCli).not.toHaveBeenCalled()

    await state.restartCodexCliFromSettings()

    expect(gatewayMocks.restartCodexCli).toHaveBeenCalledTimes(1)
    expect(gatewayMocks.getThreadGroupsPage).toHaveBeenCalled()
    expect(gatewayMocks.getCurrentModelConfig).toHaveBeenCalled()
    expect(gatewayMocks.getEffectiveModelCatalog).toHaveBeenCalled()
    expect(gatewayMocks.getAvailableCollaborationModes).toHaveBeenCalled()
    expect(gatewayMocks.getSkillsList).toHaveBeenCalled()
    expect(gatewayMocks.getAccountRateLimits).toHaveBeenCalled()
    expect(state.isCodexCliRestartConfirming.value).toBe(false)
    expect(state.isRestartingCodexCli.value).toBe(false)
    expect(state.codexCliRestartMessage.value).toBe('Codex CLI restarted.')
    expect(state.codexCliRestartError.value).toBe('')
  })

  it('keeps confirmation available and surfaces restart failures', async () => {
    installTestWindow()
    gatewayMocks.restartCodexCli.mockRejectedValue(new Error('restart failed'))

    const state = useDesktopState()

    await state.restartCodexCliFromSettings()
    await state.restartCodexCliFromSettings()

    expect(gatewayMocks.restartCodexCli).toHaveBeenCalledTimes(1)
    expect(state.isCodexCliRestartConfirming.value).toBe(false)
    expect(state.isRestartingCodexCli.value).toBe(false)
    expect(state.codexCliRestartError.value).toBe('restart failed')
    expect(state.codexCliRestartMessage.value).toBe('')
  })

  it('reloads the selected thread messages after clearing restart runtime state', async () => {
    installTestWindow({
      'codex-web-local.selected-thread-id.v1': 'thread-a',
    })
    const groups: UiProjectGroup[] = [
      {
        projectName: 'alpha',
        threads: [thread('thread-a', '/tmp/alpha')],
      },
    ]
    setupRefreshMocks(groups)
    gatewayMocks.resumeThread.mockResolvedValue(null)
    gatewayMocks.getThreadDetail.mockResolvedValue({
      messages: [
        uiMessage({
          id: 'message-a',
          role: 'assistant',
          text: 'loaded',
          turnId: 'turn-1',
        }),
      ],
      inProgress: false,
      activeTurnId: '',
      hasMoreOlder: false,
      turnIndexByTurnId: { 'turn-1': 0 },
    })

    const state = useDesktopState()
    state.primeSelectedThread('thread-a')
    await state.refreshAll({ includeSelectedThreadMessages: true, awaitAncillaryRefreshes: true })
    expect(gatewayMocks.getThreadDetail).toHaveBeenCalledTimes(1)

    await state.restartCodexCliFromSettings()
    await state.restartCodexCliFromSettings()

    expect(gatewayMocks.getThreadDetail).toHaveBeenCalledTimes(2)
    expect(state.messages.value).toHaveLength(1)
    expect(state.messages.value[0]?.text).toBe('loaded')
  })
})

describe('Codex CLI availability', () => {
  it('surfaces a chat runtime error when the app-server bridge cannot find Codex CLI', async () => {
    installTestWindow()
    gatewayMocks.getThreadGroupsPage.mockRejectedValue(new Error('Codex CLI is not available. Install @openai/codex or set CODES_CODEX_COMMAND.'))

    const state = useDesktopState()

    await state.refreshAll({ awaitAncillaryRefreshes: true })

    expect(state.codexCliMissingError.value).toBe('Codex CLI not found. Install @openai/codex or set CODES_CODEX_COMMAND.')
  })

  it('clears a previous Codex CLI missing banner when a later refresh fails for another reason', async () => {
    installTestWindow()
    gatewayMocks.getThreadGroupsPage
      .mockRejectedValueOnce(new Error('Codex CLI is not available. Install @openai/codex or set CODES_CODEX_COMMAND.'))
      .mockRejectedValueOnce(new Error('Connection lost'))

    const state = useDesktopState()

    await state.refreshAll({ awaitAncillaryRefreshes: true })
    expect(state.codexCliMissingError.value).toBe('Codex CLI not found. Install @openai/codex or set CODES_CODEX_COMMAND.')

    await state.refreshAll({ awaitAncillaryRefreshes: true })
    expect(state.error.value).toBe('Connection lost')
    expect(state.codexCliMissingError.value).toBe('')
  })
})

describe('model selection', () => {
  it('falls back to the configured Codex model when the stored model is unavailable', async () => {
    installTestWindow({
      'codex-web-local.selected-model-by-context.v1': JSON.stringify({
        '__new-thread__': 'gpt-5.5',
      }),
      'codex-web-local.selected-model-id.v1': 'gpt-5.5',
    })
    gatewayMocks.getThreadGroupsPage.mockResolvedValue({ groups: [], nextCursor: null })
    gatewayMocks.getAvailableCollaborationModes.mockResolvedValue([{ value: 'default', label: 'Default' }])
    gatewayMocks.getSkillsList.mockResolvedValue([])
    gatewayMocks.getAccountRateLimits.mockResolvedValue(null)
    gatewayMocks.getCurrentModelConfig.mockResolvedValue({
      model: 'big-pickle',
      providerId: 'codex',
      reasoningEffort: 'medium',
      speedMode: 'standard',
    })
    gatewayMocks.getEffectiveModelCatalog.mockResolvedValue({
      options: [
        modelOption('big-pickle'),
        modelOption('deepseek-v4-flash-free'),
        modelOption('ring-2.6-1t-free'),
      ],
      configText: '{\n  "models": [],\n  "order": []\n}\n',
      configPath: '/tmp/codes-model-catalog.json',
      configError: '',
    })

    const state = useDesktopState()
    await state.refreshAll({ includeSelectedThreadMessages: false, awaitAncillaryRefreshes: true })

    expect(gatewayMocks.getEffectiveModelCatalog).toHaveBeenCalled()
    expect(state.availableModelIds.value).toEqual([
      'big-pickle',
      'deepseek-v4-flash-free',
      'ring-2.6-1t-free',
    ])
    expect(state.selectedModelId.value).toBe('big-pickle')
    expect(state.readModelIdForThread('').trim()).toBe('big-pickle')
    expect(window.localStorage.getItem('codex-web-local.selected-model-by-context.v1')).toBe(null)
    expect(window.localStorage.getItem('codex-web-local.selected-model-id.v1')).toBe(null)
  })

  it('uses the Codex config model instead of a persisted new-thread model', async () => {
    installTestWindow({
      'codex-web-local.selected-model-by-context.v1': JSON.stringify({
        '__new-thread__': 'ring-2.6-1t-free',
      }),
    })
    gatewayMocks.getThreadGroupsPage.mockResolvedValue({ groups: [], nextCursor: null })
    gatewayMocks.getAvailableCollaborationModes.mockResolvedValue([{ value: 'default', label: 'Default' }])
    gatewayMocks.getSkillsList.mockResolvedValue([])
    gatewayMocks.getAccountRateLimits.mockResolvedValue(null)
    gatewayMocks.getCurrentModelConfig.mockResolvedValue({
      model: 'big-pickle',
      providerId: 'codex',
      reasoningEffort: 'medium',
      speedMode: 'standard',
    })
    gatewayMocks.getEffectiveModelCatalog.mockResolvedValue({
      options: [
        modelOption('big-pickle'),
        modelOption('deepseek-v4-flash-free'),
        modelOption('ring-2.6-1t-free'),
      ],
      configText: '{\n  "models": [],\n  "order": []\n}\n',
      configPath: '/tmp/codes-model-catalog.json',
      configError: '',
    })

    const state = useDesktopState()
    await state.refreshAll({ includeSelectedThreadMessages: false, awaitAncillaryRefreshes: true })

    expect(state.availableModelIds.value).toEqual([
      'big-pickle',
      'deepseek-v4-flash-free',
      'ring-2.6-1t-free',
    ])
    expect(state.selectedModelId.value).toBe('big-pickle')
    expect(state.readModelIdForThread('').trim()).toBe('big-pickle')
    expect(window.localStorage.getItem('codex-web-local.selected-model-by-context.v1')).toBe(null)
  })

  it('preserves a hidden selected thread model and blocks sends until a selectable model is chosen', async () => {
    installTestWindow({
      'codex-web-local.selected-thread-id.v1': 'thread-1',
      'codex-web-local.selected-model-by-context.v1': JSON.stringify({
        'thread-1': 'retired-model',
      }),
    })
    gatewayMocks.getThreadGroupsPage.mockResolvedValue({
      groups: [
        {
          projectName: 'project',
          threads: [thread('thread-1', '/tmp/project')],
        },
      ],
      nextCursor: null,
    })
    gatewayMocks.getAvailableCollaborationModes.mockResolvedValue([{ value: 'default', label: 'Default' }])
    gatewayMocks.getSkillsList.mockResolvedValue([])
    gatewayMocks.getAccountRateLimits.mockResolvedValue(null)
    gatewayMocks.getCurrentModelConfig.mockResolvedValue({
      model: 'big-pickle',
      providerId: 'codex',
      reasoningEffort: 'medium',
      speedMode: 'standard',
    })
    gatewayMocks.getEffectiveModelCatalog.mockResolvedValue({
      options: [
        modelOption('retired-model', { isHidden: true, isSelectable: false }),
        modelOption('big-pickle'),
      ],
      configText: '{\n  "models": [],\n  "order": []\n}\n',
      configPath: '/tmp/codes-model-catalog.json',
      configError: '',
    })

    const state = useDesktopState()
    await state.refreshAll({ includeSelectedThreadMessages: false, awaitAncillaryRefreshes: true })

    expect(state.selectedModelId.value).toBe('retired-model')
    expect(state.availableModelIds.value).toEqual(['big-pickle'])
    expect(state.isModelSelectableForThread('thread-1')).toBe(false)
    await expect(state.sendMessageToSelectedThread('hello')).resolves.toBeUndefined()
    expect(gatewayMocks.startThreadTurn).not.toHaveBeenCalled()
    expect(state.error.value).toBe('Selected model is hidden. Choose an available model before sending.')
  })

  it('uses a model default reasoning effort when the current effort is not allowed', async () => {
    installTestWindow({
      'codex-web-local.selected-model-by-context.v1': JSON.stringify({
        '__new-thread__': 'fast-only',
      }),
    })
    gatewayMocks.getThreadGroupsPage.mockResolvedValue({ groups: [], nextCursor: null })
    gatewayMocks.getAvailableCollaborationModes.mockResolvedValue([{ value: 'default', label: 'Default' }])
    gatewayMocks.getSkillsList.mockResolvedValue([])
    gatewayMocks.getAccountRateLimits.mockResolvedValue(null)
    gatewayMocks.getCurrentModelConfig.mockResolvedValue({
      model: 'fast-only',
      providerId: 'codex',
      reasoningEffort: 'high',
      speedMode: 'standard',
    })
    gatewayMocks.getEffectiveModelCatalog.mockResolvedValue({
      options: [
        modelOption('fast-only', {
          reasoningEfforts: ['minimal', 'low'],
          defaultReasoningEffort: 'minimal',
        }),
      ],
      configText: '{\n  "models": [],\n  "order": []\n}\n',
      configPath: '/tmp/codes-model-catalog.json',
      configError: '',
    })

    const state = useDesktopState()
    await state.refreshAll({ includeSelectedThreadMessages: false, awaitAncillaryRefreshes: true })

    expect(state.selectedReasoningEffort.value).toBe('minimal')
  })

  it('keeps ultra when the selected model reports it as supported', async () => {
    installTestWindow()
    gatewayMocks.getThreadGroupsPage.mockResolvedValue({ groups: [], nextCursor: null })
    gatewayMocks.getAvailableCollaborationModes.mockResolvedValue([{ value: 'default', label: 'Default' }])
    gatewayMocks.getSkillsList.mockResolvedValue([])
    gatewayMocks.getAccountRateLimits.mockResolvedValue(null)
    gatewayMocks.getCurrentModelConfig.mockResolvedValue({
      model: 'gpt-5.6',
      providerId: 'codex',
      reasoningEffort: 'ultra',
      speedMode: 'standard',
    })
    gatewayMocks.getEffectiveModelCatalog.mockResolvedValue({
      options: [
        modelOption('gpt-5.6', {
          reasoningEfforts: ['high', 'max', 'ultra'],
          defaultReasoningEffort: 'max',
        }),
      ],
      configText: '{\n  "models": [],\n  "order": []\n}\n',
      configPath: '/tmp/codes-model-catalog.json',
      configError: '',
    })

    const state = useDesktopState()
    await state.refreshAll({ includeSelectedThreadMessages: false, awaitAncillaryRefreshes: true })

    expect(state.selectedReasoningEffort.value).toBe('ultra')
    state.setSelectedReasoningEffort('max')
    expect(state.selectedReasoningEffort.value).toBe('max')
  })

  it('refreshes model options when a model catalog change notification arrives', async () => {
    installTestWindow()
    const notificationCallbacks: Array<(notification: { method: string; params: unknown; atIso: string }) => void> = []
    gatewayMocks.subscribeCodexNotifications.mockImplementation((callback) => {
      notificationCallbacks.push(callback)
      return vi.fn()
    })
    gatewayMocks.getCurrentModelConfig.mockResolvedValue({
      model: 'big-pickle',
      providerId: 'codex',
      reasoningEffort: 'medium',
      speedMode: 'standard',
    })
    gatewayMocks.getEffectiveModelCatalog.mockResolvedValue({
      options: [modelOption('big-pickle')],
      configText: '{\n  "models": [],\n  "order": []\n}\n',
      configPath: '/tmp/codes-model-catalog.json',
      configError: '',
    })

    const state = useDesktopState()
    await state.refreshAll({ includeSelectedThreadMessages: false, awaitAncillaryRefreshes: true })
    expect(state.availableModelIds.value).toEqual(['big-pickle'])

    let refreshed = false
    gatewayMocks.getCurrentModelConfig.mockResolvedValue({
      model: 'ring-2.6-1t-free',
      providerId: 'codex',
      reasoningEffort: 'medium',
      speedMode: 'standard',
    })
    gatewayMocks.getEffectiveModelCatalog.mockImplementation(async () => {
      refreshed = true
      return {
        options: [modelOption('ring-2.6-1t-free')],
        configText: '{\n  "models": [{ "id": "ring-2.6-1t-free" }],\n  "order": []\n}\n',
        configPath: '/tmp/codes-model-catalog.json',
        configError: '',
      }
    })

    state.startPolling()
    const emitNotification = notificationCallbacks[0]
    if (!emitNotification) throw new Error('missing notification callback')
    emitNotification({ method: 'codes/modelCatalog/changed', params: {}, atIso: '2026-07-05T00:00:00.000Z' })
    await Promise.resolve()
    await Promise.resolve()

    expect(refreshed).toBe(true)
    expect(state.availableModelIds.value).toEqual(['ring-2.6-1t-free'])
  })

  it('resets new-thread model and reasoning to the Codex config defaults', async () => {
    installTestWindow()
    gatewayMocks.getThreadGroupsPage.mockResolvedValue({ groups: [], nextCursor: null })
    gatewayMocks.getAvailableCollaborationModes.mockResolvedValue([{ value: 'default', label: 'Default' }])
    gatewayMocks.getSkillsList.mockResolvedValue([])
    gatewayMocks.getAccountRateLimits.mockResolvedValue(null)
    gatewayMocks.getCurrentModelConfig.mockResolvedValue({
      model: 'big-pickle',
      providerId: 'codex',
      reasoningEffort: 'low',
      speedMode: 'standard',
    })
    gatewayMocks.getEffectiveModelCatalog.mockResolvedValue({
      options: [
        modelOption('big-pickle', { reasoningEfforts: ['low', 'medium'], defaultReasoningEffort: 'low' }),
        modelOption('ring-2.6-1t-free', { reasoningEfforts: ['high'], defaultReasoningEffort: 'high' }),
      ],
      configText: '{\n  "models": [],\n  "order": []\n}\n',
      configPath: '/tmp/codes-model-catalog.json',
      configError: '',
    })

    const state = useDesktopState()
    await state.refreshAll({ includeSelectedThreadMessages: false, awaitAncillaryRefreshes: true })
    state.setSelectedModelIdForThread('__new-thread__', 'ring-2.6-1t-free')
    state.setSelectedReasoningEffort('high')

    expect(state.readModelIdForThread('__new-thread__')).toBe('ring-2.6-1t-free')

    state.resetNewThreadRunConfig()

    expect(state.readModelIdForThread('__new-thread__')).toBe('big-pickle')
    expect(state.selectedReasoningEffort.value).toBe('low')
    expect(window.localStorage.getItem('codex-web-local.selected-model-by-context.v1')).toBe(null)
  })
})

describe('findAdjacentThreadId', () => {
  it('selects the next thread after the archived thread', () => {
    const threads = [
      thread('first-thread', '/tmp/project'),
      thread('selected-thread', '/tmp/project'),
      thread('next-thread', '/tmp/project'),
    ]

    expect(findAdjacentThreadId(threads, 'selected-thread')).toBe('next-thread')
  })

  it('falls back to the previous thread when the last thread is archived', () => {
    const threads = [
      thread('previous-thread', '/tmp/project'),
      thread('selected-thread', '/tmp/project'),
    ]

    expect(findAdjacentThreadId(threads, 'selected-thread')).toBe('previous-thread')
  })

  it('returns no fallback when there is no adjacent thread', () => {
    expect(findAdjacentThreadId([thread('selected-thread', '/tmp/project')], 'selected-thread')).toBe('')
  })
})

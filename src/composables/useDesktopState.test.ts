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
  gatewayMocks.setThreadQueueState.mockResolvedValue(undefined)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('filterGroupsByWorkspaceRoots', () => {
  it('keeps projectless chats visible when workspace roots are configured', () => {
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
      'allowed-project',
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

  it('uses Codex project-order when workspace roots are hydrated', () => {
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
      'beta',
      'alpha',
    ])
  })

  it('keeps empty duplicate workspace roots visible in Codex project order', () => {
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
      ['/Users/igor/Documents/New project 2/TestChat', 0],
      ['/Users/igor/temp/TestChat', 1],
    ])
  })

  it('keeps remote projects from Codex project order visible as empty project rows', () => {
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

    expect(filterGroupsByWorkspaceRoots(groups, rootsState).map((group) => [group.projectName, group.threads.length])).toEqual([
      ['remote-project-id', 0],
      ['local-project', 0],
    ])
  })

  it('keeps managed worktree threads under the matching workspace root project', () => {
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
      ['codex-web-local', ['main-chat', 'worktree-chat']],
    ])
  })

  it('keeps unregistered managed worktrees under the main root when another managed worktree root is registered', () => {
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
      ['/Users/igor/Git-projects/codex-web-local', ['main-chat', 'unregistered-worktree-chat']],
      ['/Users/igor/.codex/worktrees/a77f/codex-web-local', ['registered-worktree-chat']],
    ])
  })

  it('does not group unrelated git worktrees under a same-leaf workspace root project', () => {
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
      ['alpha', ['keep-alpha']],
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
      ['beta', ['keep-beta']],
    ])
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
    gatewayMocks.getThreadDetail.mockResolvedValue({
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
    expect(JSON.parse(window.localStorage.getItem('codex-web-local.selected-model-by-context.v1') ?? '{}')).toEqual({
      '__new-thread__': 'big-pickle',
    })
    expect(window.localStorage.getItem('codex-web-local.selected-model-id.v1')).toBe(null)
  })

  it('restores a valid new-thread selected model from localStorage', async () => {
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
    expect(state.selectedModelId.value).toBe('ring-2.6-1t-free')
    expect(state.readModelIdForThread('').trim()).toBe('ring-2.6-1t-free')
    expect(JSON.parse(window.localStorage.getItem('codex-web-local.selected-model-by-context.v1') ?? '{}')).toEqual({
      '__new-thread__': 'ring-2.6-1t-free',
    })
  })

  it('preserves a hidden selected model and blocks new sends until a selectable model is chosen', async () => {
    installTestWindow({
      'codex-web-local.selected-model-by-context.v1': JSON.stringify({
        '__new-thread__': 'retired-model',
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
    expect(state.isModelSelectableForThread('')).toBe(false)
    await expect(state.sendMessageToNewThread('hello', '/tmp/project')).resolves.toBe('')
    expect(gatewayMocks.startThread).not.toHaveBeenCalled()
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

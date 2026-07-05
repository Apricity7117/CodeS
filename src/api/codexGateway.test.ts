import { afterEach, describe, expect, it, vi } from 'vitest'
import { deleteProjectSessions, deleteThreadSession, getEffectiveModelCatalog, restartCodexCli, saveModelCatalogConfig, startThreadTurn } from './codexGateway'

function mockRpcFetch(): { requests: Array<{ method: string, params: Record<string, unknown> }> } {
  const requests: Array<{ method: string, params: Record<string, unknown> }> = []

  vi.stubGlobal('fetch', vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
    const body = typeof init?.body === 'string'
      ? JSON.parse(init.body) as { method: string, params: Record<string, unknown> }
      : { method: '', params: {} }

    requests.push(body)

    return new Response(JSON.stringify({
      result: {
        turn: {
          id: `turn-${requests.length}`,
        },
      },
    }), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
      },
    })
  }))

  return { requests }
}

describe('startThreadTurn collaboration mode payloads', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('sends default collaboration mode explicitly after a plan turn', async () => {
    const { requests } = mockRpcFetch()

    await startThreadTurn('thread-1', 'make a plan', [], 'gpt-5.4', 'medium', undefined, [], 'plan')
    await startThreadTurn('thread-1', 'implement it', [], 'gpt-5.4', 'medium', undefined, [], 'default')

    expect(requests).toHaveLength(2)
    expect(requests[0].method).toBe('turn/start')
    expect(requests[0].params.collaborationMode).toEqual({
      mode: 'plan',
      settings: {
        model: 'gpt-5.4',
        reasoning_effort: 'medium',
        developer_instructions: null,
      },
    })
    expect(requests[1].method).toBe('turn/start')
    expect(requests[1].params.collaborationMode).toEqual({
      mode: 'default',
      settings: {
        model: 'gpt-5.4',
        reasoning_effort: 'medium',
        developer_instructions: null,
      },
    })
  })
})

describe('destructive session deletion endpoints', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('deletes a single thread session through the local bridge', async () => {
    const requests: Array<{ url: string; method: string }> = []
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      requests.push({ url: String(input), method: init?.method ?? 'GET' })
      return new Response(JSON.stringify({ data: { deletedThreadIds: ['thread-1'] } }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    }))

    await expect(deleteThreadSession('thread-1')).resolves.toEqual({ deletedThreadIds: ['thread-1'] })
    expect(requests).toEqual([
      { url: '/codex-api/thread-session?threadId=thread-1', method: 'DELETE' },
    ])
  })

  it('deletes project sessions by exact cwd through the local bridge', async () => {
    const requests: Array<{ url: string; method: string }> = []
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      requests.push({ url: String(input), method: init?.method ?? 'GET' })
      return new Response(JSON.stringify({ data: { deletedThreadIds: ['thread-1', 'thread-2'] } }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    }))

    await expect(deleteProjectSessions('/tmp/project one')).resolves.toEqual({ deletedThreadIds: ['thread-1', 'thread-2'] })
    expect(requests).toEqual([
      { url: '/codex-api/project-sessions?cwd=%2Ftmp%2Fproject+one', method: 'DELETE' },
    ])
  })
})

describe('model catalog endpoints', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('loads and normalizes the effective model catalog', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
      data: [
        {
          id: 'gpt-5.4',
          label: 'GPT 5.4',
          source: 'provider',
          isHidden: false,
          isSelectable: true,
          reasoningEfforts: ['minimal', 'low'],
          defaultReasoningEffort: 'minimal',
        },
      ],
      configText: '{}\n',
      configPath: '/tmp/codes-model-catalog.json',
      configError: null,
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })))

    await expect(getEffectiveModelCatalog()).resolves.toEqual({
      options: [
        {
          id: 'gpt-5.4',
          label: 'GPT 5.4',
          source: 'provider',
          isHidden: false,
          isSelectable: true,
          reasoningEfforts: ['minimal', 'low'],
          defaultReasoningEffort: 'minimal',
        },
      ],
      configText: '{}\n',
      configPath: '/tmp/codes-model-catalog.json',
      configError: '',
    })
  })

  it('sends catalog config text and surfaces validation errors', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
      error: 'models[0].id is required',
    }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    })))

    await expect(saveModelCatalogConfig('{ "models": [{}] }')).rejects.toThrow('models[0].id is required')
  })
})

describe('Codex CLI restart endpoint', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('restarts Codex CLI through the local bridge', async () => {
    const requests: Array<{ url: string; method: string }> = []
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      requests.push({ url: String(input), method: init?.method ?? 'GET' })
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    }))

    await expect(restartCodexCli()).resolves.toBeUndefined()
    expect(requests).toEqual([
      { url: '/codex-api/app-server/restart', method: 'POST' },
    ])
  })

  it('surfaces restart errors from the local bridge', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
      error: 'Codex CLI is not available',
    }), {
      status: 502,
      headers: { 'Content-Type': 'application/json' },
    })))

    await expect(restartCodexCli()).rejects.toThrow('Codex CLI is not available')
  })
})

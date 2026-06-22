import { spawnSync } from 'node:child_process'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  callRpcWithArchiveRecovery,
  deleteThreadSessionsByExactCwd,
  deleteThreadSessionsById,
  hasUsableCodexAuth,
  isEmptyThreadReadError,
  isUnauthenticatedRateLimitError,
} from './codexAppServerBridge'

const originalCodexHome = process.env.CODEX_HOME
const hasSqlite3 = spawnSync('sqlite3', ['--version'], { stdio: 'ignore' }).status === 0
const sqliteIt = hasSqlite3 ? it : it.skip

function runSqliteScript(databasePath: string, script: string): string {
  const result = spawnSync('sqlite3', [databasePath], {
    input: `${script.trim()}\n`,
    encoding: 'utf8',
  })
  if (result.error) throw result.error
  if (result.status !== 0) {
    throw new Error([result.stderr, result.stdout].filter(Boolean).join('\n') || `sqlite3 exited with ${String(result.status)}`)
  }
  return result.stdout.trim()
}

function readSqliteRows(databasePath: string, query: string): string[] {
  return runSqliteScript(databasePath, query)
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter(Boolean)
}

afterEach(() => {
  if (originalCodexHome === undefined) {
    delete process.env.CODEX_HOME
  } else {
    process.env.CODEX_HOME = originalCodexHome
  }
})

describe('callRpcWithArchiveRecovery', () => {
  it('sets a fallback name and retries archive when Codex has not materialized a rollout', async () => {
    const calls: Array<{ method: string; params: unknown }> = []
    let archiveCalls = 0
    const appServer = {
      async rpc(method: string, params: unknown): Promise<unknown> {
        calls.push({ method, params })
        if (method === 'thread/archive') {
          archiveCalls += 1
          if (archiveCalls === 1) {
            throw new Error('no rollout found for thread test-thread')
          }
          return { ok: true }
        }
        if (method === 'thread/read') {
          return {
            thread: {
              id: 'test-thread',
              preview: 'Preview title',
              path: '/home/user/.codex/sessions/rollout-test-thread.jsonl',
            },
          }
        }
        return { ok: true }
      },
    }

    await expect(callRpcWithArchiveRecovery(appServer, 'thread/archive', { threadId: 'test-thread' })).resolves.toEqual({ ok: true })
    expect(calls).toEqual([
      { method: 'thread/archive', params: { threadId: 'test-thread' } },
      { method: 'thread/read', params: { threadId: 'test-thread', includeTurns: false } },
      { method: 'thread/name/set', params: { threadId: 'test-thread', name: 'Preview title' } },
      { method: 'thread/archive', params: { threadId: 'test-thread' } },
    ])
  })

  it('treats no-rollout archive of an already archived thread as successful', async () => {
    const calls: Array<{ method: string; params: unknown }> = []
    const appServer = {
      async rpc(method: string, params: unknown): Promise<unknown> {
        calls.push({ method, params })
        if (method === 'thread/archive') {
          throw new Error('no rollout found for thread archived-thread')
        }
        if (method === 'thread/read') {
          return {
            thread: {
              id: 'archived-thread',
              path: '/home/user/.codex/archived_sessions/rollout-archived-thread.jsonl',
            },
          }
        }
        throw new Error(`unexpected method ${method}`)
      },
    }

    await expect(callRpcWithArchiveRecovery(appServer, 'thread/archive', { threadId: 'archived-thread' })).resolves.toBeNull()
    expect(calls).toEqual([
      { method: 'thread/archive', params: { threadId: 'archived-thread' } },
      { method: 'thread/read', params: { threadId: 'archived-thread', includeTurns: false } },
    ])
  })

  it('does not recover unrelated RPC failures', async () => {
    const appServer = {
      async rpc(): Promise<unknown> {
        throw new Error('network failed')
      },
    }

    await expect(callRpcWithArchiveRecovery(appServer, 'thread/archive', { threadId: 'test-thread' })).rejects.toThrow('network failed')
    await expect(callRpcWithArchiveRecovery(appServer, 'thread/read', { threadId: 'test-thread' })).rejects.toThrow('network failed')
  })
})

describe('destructive thread session deletion', () => {
  it('removes a session file and thread metadata by id', async () => {
    const codexHome = await mkdtemp(join(tmpdir(), 'codex-home-delete-thread-'))
    process.env.CODEX_HOME = codexHome
    try {
      const sessionsDir = join(codexHome, 'sessions')
      await mkdir(sessionsDir, { recursive: true })
      const sessionPath = join(sessionsDir, 'rollout-thread-1.jsonl')
      await writeFile(sessionPath, '{}\n', 'utf8')
      await writeFile(join(codexHome, 'session_index.jsonl'), [
        JSON.stringify({ id: 'thread-1', thread_name: 'Old', updated_at: '2026-06-01T00:00:00.000Z' }),
        JSON.stringify({ id: 'thread-2', thread_name: 'Keep', updated_at: '2026-06-01T00:00:00.000Z' }),
        JSON.stringify({ session_id: 'thread-1', thread_name: 'Session id legacy row', updated_at: '2026-06-01T12:00:00.000Z' }),
        JSON.stringify({ id: 'thread-1', thread_name: 'New', updated_at: '2026-06-02T00:00:00.000Z' }),
      ].join('\n'), 'utf8')
      await writeFile(join(codexHome, '.codex-global-state.json'), JSON.stringify({
        'thread-titles': {
          titles: { 'thread-1': 'Delete me', 'thread-2': 'Keep me' },
          order: ['thread-1', 'thread-2'],
        },
        'pinned-thread-ids': ['thread-1', 'thread-2'],
        'thread-queue-state': {
          'thread-1': [{ id: 'queued-1', text: 'delete', imageUrls: [], skills: [], fileAttachments: [], collaborationMode: 'default' }],
          'thread-2': [{ id: 'queued-2', text: 'keep', imageUrls: [], skills: [], fileAttachments: [], collaborationMode: 'default' }],
        },
      }), 'utf8')

      const appServer = {
        async rpc(method: string, params: unknown): Promise<unknown> {
          expect(method).toBe('thread/read')
          expect(params).toEqual({ threadId: 'thread-1', includeTurns: true })
          return {
            thread: {
              id: 'thread-1',
              path: sessionPath,
              turns: [],
            },
          }
        },
      }

      await expect(deleteThreadSessionsById(appServer, ['thread-1'])).resolves.toEqual({ deletedThreadIds: ['thread-1'] })
      await expect(readFile(sessionPath, 'utf8')).rejects.toThrow()

      const sessionIndex = await readFile(join(codexHome, 'session_index.jsonl'), 'utf8')
      expect(sessionIndex).not.toContain('thread-1')
      expect(sessionIndex).toContain('thread-2')

      const globalState = JSON.parse(await readFile(join(codexHome, '.codex-global-state.json'), 'utf8')) as Record<string, unknown>
      expect(globalState['thread-titles']).toEqual({
        titles: { 'thread-2': 'Keep me' },
        order: ['thread-2'],
      })
      expect(globalState['pinned-thread-ids']).toEqual(['thread-2'])
      expect(globalState['thread-queue-state']).toEqual({
        'thread-2': [{ id: 'queued-2', text: 'keep', imageUrls: [], skills: [], fileAttachments: [], collaborationMode: 'default' }],
      })
    } finally {
      await rm(codexHome, { recursive: true, force: true })
    }
  })

  sqliteIt('removes deleted threads from Codex state and log databases', async () => {
    const codexHome = await mkdtemp(join(tmpdir(), 'codex-home-delete-thread-db-'))
    process.env.CODEX_HOME = codexHome
    try {
      const sessionsDir = join(codexHome, 'sessions')
      await mkdir(sessionsDir, { recursive: true })
      const sessionPath = join(sessionsDir, 'rollout-thread-1.jsonl')
      await writeFile(sessionPath, '{}\n', 'utf8')

      const stateDbPath = join(codexHome, 'state_5.sqlite')
      runSqliteScript(stateDbPath, `
        CREATE TABLE threads (id TEXT PRIMARY KEY, rollout_path TEXT);
        INSERT INTO threads (id, rollout_path) VALUES ('thread-1', '${sessionPath.replace(/'/g, "''")}');
        INSERT INTO threads (id, rollout_path) VALUES ('thread-2', '/tmp/keep.jsonl');
      `)
      const logsDbPath = join(codexHome, 'logs_2.sqlite')
      runSqliteScript(logsDbPath, `
        CREATE TABLE logs (thread_id TEXT, message TEXT);
        INSERT INTO logs (thread_id, message) VALUES ('thread-1', 'delete');
        INSERT INTO logs (thread_id, message) VALUES ('thread-2', 'keep');
      `)

      const appServer = {
        async rpc(): Promise<unknown> {
          return {
            thread: {
              id: 'thread-1',
              path: sessionPath,
              turns: [],
            },
          }
        },
      }

      await expect(deleteThreadSessionsById(appServer, ['thread-1'])).resolves.toEqual({ deletedThreadIds: ['thread-1'] })
      expect(readSqliteRows(stateDbPath, 'SELECT id FROM threads ORDER BY id;')).toEqual(['thread-2'])
      expect(readSqliteRows(logsDbPath, 'SELECT thread_id FROM logs ORDER BY thread_id;')).toEqual(['thread-2'])
      await expect(readFile(sessionPath, 'utf8')).rejects.toThrow()
    } finally {
      await rm(codexHome, { recursive: true, force: true })
    }
  })

  sqliteIt('removes stale state rows when thread/read fails after the rollout file was already deleted', async () => {
    const codexHome = await mkdtemp(join(tmpdir(), 'codex-home-delete-thread-stale-db-'))
    process.env.CODEX_HOME = codexHome
    try {
      const sessionPath = join(codexHome, 'sessions', 'rollout-thread-1.jsonl')
      await mkdir(join(codexHome, 'sessions'), { recursive: true })
      const stateDbPath = join(codexHome, 'state_5.sqlite')
      runSqliteScript(stateDbPath, `
        CREATE TABLE threads (id TEXT PRIMARY KEY, rollout_path TEXT);
        INSERT INTO threads (id, rollout_path) VALUES ('thread-1', '${sessionPath.replace(/'/g, "''")}');
      `)

      const appServer = {
        async rpc(): Promise<unknown> {
          throw new Error('ENOENT: no such file or directory, open rollout-thread-1.jsonl')
        },
      }

      await expect(deleteThreadSessionsById(appServer, ['thread-1'])).resolves.toEqual({ deletedThreadIds: ['thread-1'] })
      expect(readSqliteRows(stateDbPath, 'SELECT id FROM threads ORDER BY id;')).toEqual([])
    } finally {
      await rm(codexHome, { recursive: true, force: true })
    }
  })

  it('deletes project sessions by exact cwd across active and archived lists', async () => {
    const codexHome = await mkdtemp(join(tmpdir(), 'codex-home-delete-project-'))
    process.env.CODEX_HOME = codexHome
    try {
      const sessionsDir = join(codexHome, 'sessions')
      const archivedDir = join(codexHome, 'archived_sessions')
      await mkdir(sessionsDir, { recursive: true })
      await mkdir(archivedDir, { recursive: true })
      const activePath = join(sessionsDir, 'rollout-active.jsonl')
      const archivedPath = join(archivedDir, 'rollout-archived.jsonl')
      await writeFile(activePath, '{}\n', 'utf8')
      await writeFile(archivedPath, '{}\n', 'utf8')

      const calls: Array<{ method: string; params: unknown }> = []
      const appServer = {
        async rpc(method: string, params: unknown): Promise<unknown> {
          calls.push({ method, params })
          if (method === 'thread/list') {
            const archived = (params as { archived?: boolean }).archived === true
            return {
              data: archived ? [{ id: 'archived-thread' }] : [{ id: 'active-thread' }],
              nextCursor: null,
            }
          }
          if (method === 'thread/read') {
            const threadId = (params as { threadId?: string }).threadId
            return {
              thread: {
                id: threadId,
                path: threadId === 'archived-thread' ? archivedPath : activePath,
                turns: [],
              },
            }
          }
          throw new Error(`unexpected method ${method}`)
        },
      }

      await expect(deleteThreadSessionsByExactCwd(appServer, '/tmp/project')).resolves.toEqual({
        deletedThreadIds: ['active-thread', 'archived-thread'],
      })
      expect(calls.filter((call) => call.method === 'thread/list').map((call) => call.params)).toEqual([
        { archived: false, cwd: '/tmp/project', limit: 100, sortKey: 'updated_at', modelProviders: [], cursor: null },
        { archived: true, cwd: '/tmp/project', limit: 100, sortKey: 'updated_at', modelProviders: [], cursor: null },
      ])
      await expect(readFile(activePath, 'utf8')).rejects.toThrow()
      await expect(readFile(archivedPath, 'utf8')).rejects.toThrow()
    } finally {
      await rm(codexHome, { recursive: true, force: true })
    }
  })

  it('rejects running threads without deleting the session file', async () => {
    const codexHome = await mkdtemp(join(tmpdir(), 'codex-home-delete-running-'))
    process.env.CODEX_HOME = codexHome
    try {
      const sessionsDir = join(codexHome, 'sessions')
      await mkdir(sessionsDir, { recursive: true })
      const sessionPath = join(sessionsDir, 'rollout-running.jsonl')
      await writeFile(sessionPath, '{}\n', 'utf8')
      const appServer = {
        async rpc(): Promise<unknown> {
          return {
            thread: {
              id: 'running-thread',
              path: sessionPath,
              turns: [{ id: 'turn-1', status: 'inProgress', items: [] }],
            },
          }
        },
      }

      await expect(deleteThreadSessionsById(appServer, ['running-thread'])).rejects.toThrow('Thread is still running')
      await expect(readFile(sessionPath, 'utf8')).resolves.toBe('{}\n')
    } finally {
      await rm(codexHome, { recursive: true, force: true })
    }
  })

  it('rejects session paths outside Codex session directories', async () => {
    const codexHome = await mkdtemp(join(tmpdir(), 'codex-home-delete-unsafe-'))
    process.env.CODEX_HOME = codexHome
    try {
      const outsidePath = join(codexHome, 'not-sessions', 'rollout-thread.jsonl')
      const appServer = {
        async rpc(): Promise<unknown> {
          return {
            thread: {
              id: 'thread-1',
              path: outsidePath,
              turns: [],
            },
          }
        },
      }

      await expect(deleteThreadSessionsById(appServer, ['thread-1'])).rejects.toThrow('outside allowed Codex session directories')
    } finally {
      await rm(codexHome, { recursive: true, force: true })
    }
  })
})

describe('isUnauthenticatedRateLimitError', () => {
  it('matches unauthenticated rate-limit failures from a fresh Codex home', () => {
    expect(isUnauthenticatedRateLimitError(new Error('codex account authentication required to read rate limits'))).toBe(true)
  })

  it('does not match unrelated authentication failures', () => {
    expect(isUnauthenticatedRateLimitError(new Error('codex account authentication required to send messages'))).toBe(false)
    expect(isUnauthenticatedRateLimitError(new Error('failed to read rate limits'))).toBe(false)
  })
})

describe('isEmptyThreadReadError', () => {
  it('matches Codex empty rollout read failures during immediate thread startup', () => {
    expect(isEmptyThreadReadError(new Error(
      'failed to read thread: thread-store internal error: failed to read thread /tmp/codex-home/sessions/rollout-test.jsonl: rollout at /tmp/codex-home/sessions/rollout-test.jsonl is empty',
    ))).toBe(true)
  })

  it('does not match unrelated thread read failures', () => {
    expect(isEmptyThreadReadError(new Error('failed to read thread: permission denied'))).toBe(false)
    expect(isEmptyThreadReadError(new Error('rollout is empty'))).toBe(false)
  })
})

describe('hasUsableCodexAuth', () => {
  it('returns false when auth.json is missing or does not contain usable tokens', async () => {
    const codexHome = await mkdtemp(join(tmpdir(), 'codex-home-no-token-'))
    process.env.CODEX_HOME = codexHome
    try {
      await expect(hasUsableCodexAuth()).resolves.toBe(false)
      await writeFile(join(codexHome, 'auth.json'), JSON.stringify({ tokens: {} }))
      await expect(hasUsableCodexAuth()).resolves.toBe(false)
    } finally {
      await rm(codexHome, { recursive: true, force: true })
    }
  })

  it('returns true when auth.json contains an access token or refresh token', async () => {
    const codexHome = await mkdtemp(join(tmpdir(), 'codex-home-with-token-'))
    process.env.CODEX_HOME = codexHome
    try {
      await writeFile(join(codexHome, 'auth.json'), JSON.stringify({ tokens: { access_token: 'access-token' } }))
      await expect(hasUsableCodexAuth()).resolves.toBe(true)
      await writeFile(join(codexHome, 'auth.json'), JSON.stringify({ tokens: { refresh_token: 'refresh-token' } }))
      await expect(hasUsableCodexAuth()).resolves.toBe(true)
    } finally {
      await rm(codexHome, { recursive: true, force: true })
    }
  })

  it('warns when auth.json exists but cannot be parsed', async () => {
    const codexHome = await mkdtemp(join(tmpdir(), 'codex-home-invalid-auth-'))
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    process.env.CODEX_HOME = codexHome
    try {
      await writeFile(join(codexHome, 'auth.json'), '{')
      await expect(hasUsableCodexAuth()).resolves.toBe(false)
      expect(warn).toHaveBeenCalledWith(
        '[codex-auth] Unable to read Codex auth state',
        expect.objectContaining({ path: join(codexHome, 'auth.json') }),
      )
    } finally {
      warn.mockRestore()
      await rm(codexHome, { recursive: true, force: true })
    }
  })
})

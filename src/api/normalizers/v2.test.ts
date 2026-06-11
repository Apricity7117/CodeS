import { describe, expect, it } from 'vitest'
import { normalizeThreadMessagesV2 } from './v2'
import type { ThreadReadResponse } from '../appServerDtos'

function threadReadResponseWithContent(
  content: ThreadReadResponse['thread']['turns'][number]['items'][number][],
  turnOverride: Record<string, unknown> = {},
): ThreadReadResponse {
  return {
    thread: {
      id: 'thread-1',
      preview: 'Use a skill',
      modelProvider: 'openai',
      createdAt: 1,
      updatedAt: 2,
      path: null,
      cwd: '/tmp/project',
      cliVersion: 'test',
      source: 'appServer',
      gitInfo: null,
      turns: [{
        id: 'turn-1',
        status: 'completed',
        error: null,
        ...turnOverride,
        items: content,
      } as ThreadReadResponse['thread']['turns'][number]],
    },
  }
}

describe('normalizeThreadMessagesV2', () => {
  it('preserves selected skill inputs on the rendered user message', () => {
    const messages = normalizeThreadMessagesV2(threadReadResponseWithContent([{
      type: 'userMessage',
      id: 'user-1',
      content: [
        { type: 'text', text: 'Use the browser skill', text_elements: [] },
        { type: 'skill', name: 'browser-use:browser', path: '/Users/igor/.codex/skills/browser/SKILL.md' },
      ],
    }]))

    expect(messages).toHaveLength(1)
    expect(messages[0]).toMatchObject({
      id: 'user-1',
      role: 'user',
      text: 'Use the browser skill',
      skills: [{ name: 'browser-use:browser', path: '/Users/igor/.codex/skills/browser/SKILL.md' }],
    })
  })

  it('renders skill-only user messages instead of dropping them as raw blocks', () => {
    const messages = normalizeThreadMessagesV2(threadReadResponseWithContent([{
      type: 'userMessage',
      id: 'user-2',
      content: [
        { type: 'skill', name: 'composio-cli', path: '/Users/igor/.codex/skills/composio-cli/SKILL.md' },
      ],
    }]))

    expect(messages).toHaveLength(1)
    expect(messages[0]).toMatchObject({
      id: 'user-2',
      role: 'user',
      text: '',
      skills: [{ name: 'composio-cli', path: '/Users/igor/.codex/skills/composio-cli/SKILL.md' }],
    })
    expect(messages[0].isUnhandled).toBeUndefined()
  })

  it('decodes escaped heartbeat instructions without exposing raw XML', () => {
    const messages = normalizeThreadMessagesV2(threadReadResponseWithContent([{
      type: 'userMessage',
      id: 'automation-user-1',
      content: [{
        type: 'text',
        text: `<heartbeat>
<automation_id>automation-1</automation_id>
<current_time_iso>2026-05-09T00:00:00.000Z</current_time_iso>
<instructions>
Reply with &lt;/instructions&gt; and A &amp; B
</instructions>
</heartbeat>`,
        text_elements: [],
      }],
    }]))

    expect(messages).toHaveLength(1)
    expect(messages[0]).toMatchObject({
      id: 'automation-user-1',
      role: 'user',
      text: 'Reply with </instructions> and A & B',
      isAutomationRun: true,
      automationDisplayName: 'automation-1',
    })
  })

  it('applies a base turn index for paged thread slices', () => {
    const messages = normalizeThreadMessagesV2(threadReadResponseWithContent([{
      type: 'userMessage',
      id: 'user-3',
      content: [{ type: 'text', text: 'Paged message', text_elements: [] }],
    }]), 12)

    expect(messages).toHaveLength(1)
    expect(messages[0]).toMatchObject({
      id: 'user-3',
      turnId: 'turn-1',
      turnIndex: 12,
    })
  })

  it('reads message time from UUIDv7 item ids when no explicit timestamp exists', () => {
    const messages = normalizeThreadMessagesV2(threadReadResponseWithContent([{
      type: 'userMessage',
      id: '019da7c0-4e12-7a91-837c-f7c11cc8ab6c',
      content: [{ type: 'text', text: 'Timed message', text_elements: [] }],
    }]))

    expect(messages).toHaveLength(1)
    expect(messages[0]).toMatchObject({
      id: '019da7c0-4e12-7a91-837c-f7c11cc8ab6c',
      sentAtIso: '2026-04-19T21:58:11.218Z',
    })
  })

  it('inserts a worked separator before the final assistant result for historical completed turns', () => {
    const messages = normalizeThreadMessagesV2(threadReadResponseWithContent([
      {
        type: 'agentMessage',
        id: 'assistant-process-1',
        text: 'I will inspect the relevant files first.',
      },
      {
        type: 'commandExecution',
        id: 'cmd-2',
        command: 'rg -n worked src',
        cwd: '/tmp/project',
        processId: null,
        status: 'completed',
        aggregatedOutput: 'src/App.vue:1:worked',
        exitCode: 0,
        durationMs: 15,
      } as ThreadReadResponse['thread']['turns'][number]['items'][number],
      {
        type: 'agentMessage',
        id: 'assistant-final-1',
        text: 'Implemented and verified.',
      },
    ], { durationMs: 61_000 }))

    expect(messages.map((message) => message.id)).toEqual([
      'assistant-process-1',
      'cmd-2',
      'turn-summary:turn-1',
      'assistant-final-1',
    ])
    expect(messages[2]).toMatchObject({
      role: 'system',
      text: 'Worked for 1m 1s',
      messageType: 'worked',
      turnId: 'turn-1',
      turnIndex: 0,
    })
    expect(messages[2]?.sentAtIso).toBeUndefined()
  })

  it('does not insert a worked separator when a completed turn has no final assistant result', () => {
    const messages = normalizeThreadMessagesV2(threadReadResponseWithContent([{
      type: 'commandExecution',
      id: 'cmd-without-final',
      command: 'pnpm test',
      cwd: '/tmp/project',
      processId: null,
      status: 'completed',
      aggregatedOutput: '',
      exitCode: 0,
      durationMs: 2_000,
    } as ThreadReadResponse['thread']['turns'][number]['items'][number]], { durationMs: 2_000 }))

    expect(messages.map((message) => message.id)).toEqual(['cmd-without-final'])
  })
})

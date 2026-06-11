import { describe, expect, it } from 'vitest'
import type { UiMessage } from '../../types/codex'
import { buildWorkedTurnGroups } from './threadWorkedGrouping'

function assistantMessage(id: string, text: string, turnId = 'turn-1'): UiMessage {
  return {
    id,
    role: 'assistant',
    text,
    messageType: 'agentMessage',
    turnId,
    turnIndex: 0,
    sentAtIso: '2026-06-09T07:55:00.000Z',
  }
}

function workedMessage(turnId = 'turn-1'): UiMessage {
  return {
    id: `turn-summary:${turnId}`,
    role: 'system',
    text: 'Worked for 1m 1s',
    messageType: 'worked',
    turnId,
    turnIndex: 0,
  }
}

function commandMessage(id: string, turnId = 'turn-1'): UiMessage {
  return {
    id,
    role: 'system',
    text: 'rg -n worked src',
    messageType: 'commandExecution',
    turnId,
    turnIndex: 0,
    commandExecution: {
      command: 'rg -n worked src',
      cwd: '/tmp/project',
      status: 'completed',
      aggregatedOutput: 'src/App.vue:1:worked',
      exitCode: 0,
    },
  }
}

function fileChangeMessage(id: string, turnId = 'turn-1'): UiMessage {
  return {
    id,
    role: 'system',
    text: '',
    messageType: 'fileChange',
    turnId,
    turnIndex: 0,
    fileChangeStatus: 'completed',
    fileChanges: [{
      path: 'src/App.vue',
      operation: 'update',
      movedToPath: null,
      diff: '@@ -1 +1 @@\n-old\n+new',
      addedLineCount: 1,
      removedLineCount: 1,
    }],
  }
}

describe('buildWorkedTurnGroups', () => {
  it('hides process messages from the same turn while keeping the final assistant result visible', () => {
    const messages: UiMessage[] = [
      {
        id: 'user-1',
        role: 'user',
        text: 'Implement',
        messageType: 'userMessage',
        turnId: 'turn-1',
        turnIndex: 0,
      },
      assistantMessage('assistant-process-before', 'I will inspect the files first.'),
      workedMessage(),
      assistantMessage('assistant-process-after', 'I found the renderer issue.'),
      commandMessage('cmd-1'),
      fileChangeMessage('file-change-1'),
      assistantMessage('assistant-final', 'Implemented and verified.'),
    ]

    const groups = buildWorkedTurnGroups(messages)

    expect(groups.processMessagesByWorkedId['turn-summary:turn-1']?.map((message) => message.id)).toEqual([
      'assistant-process-before',
      'assistant-process-after',
      'cmd-1',
      'file-change-1',
    ])
    expect(Array.from(groups.hiddenProcessIds)).toEqual([
      'assistant-process-before',
      'assistant-process-after',
      'cmd-1',
      'file-change-1',
    ])
    expect(groups.hiddenProcessIds.has('assistant-final')).toBe(false)
  })

  it('does not hide process-looking messages when the turn has no final assistant result', () => {
    const messages: UiMessage[] = [
      workedMessage(),
      commandMessage('cmd-2'),
      fileChangeMessage('file-change-2'),
    ]

    const groups = buildWorkedTurnGroups(messages)

    expect(groups.processMessagesByWorkedId['turn-summary:turn-1']).toBeUndefined()
    expect(groups.hiddenProcessIds.size).toBe(0)
  })

  it('does not group messages from a different turn into the worked details', () => {
    const messages: UiMessage[] = [
      assistantMessage('assistant-process', 'I will inspect the files first.', 'turn-1'),
      workedMessage('turn-1'),
      assistantMessage('assistant-final', 'Implemented and verified.', 'turn-1'),
      assistantMessage('assistant-other-turn', 'Different turn process.', 'turn-2'),
      commandMessage('cmd-other-turn', 'turn-2'),
    ]

    const groups = buildWorkedTurnGroups(messages)

    expect(groups.processMessagesByWorkedId['turn-summary:turn-1']?.map((message) => message.id)).toEqual([
      'assistant-process',
    ])
    expect(groups.hiddenProcessIds.has('assistant-other-turn')).toBe(false)
    expect(groups.hiddenProcessIds.has('cmd-other-turn')).toBe(false)
  })

  it('keeps non-text assistant outputs visible instead of treating them as the final text result', () => {
    const messages: UiMessage[] = [
      assistantMessage('assistant-process', 'I will generate an image.', 'turn-1'),
      workedMessage('turn-1'),
      assistantMessage('assistant-final', 'Done.', 'turn-1'),
      {
        id: 'image-output',
        role: 'assistant',
        text: '',
        images: ['/codex-local-image?path=%2Ftmp%2Fimage.png'],
        messageType: 'imageView',
        turnId: 'turn-1',
        turnIndex: 0,
      },
    ]

    const groups = buildWorkedTurnGroups(messages)

    expect(groups.processMessagesByWorkedId['turn-summary:turn-1']?.map((message) => message.id)).toEqual([
      'assistant-process',
    ])
    expect(groups.hiddenProcessIds.has('assistant-final')).toBe(false)
    expect(groups.hiddenProcessIds.has('image-output')).toBe(false)
  })
})

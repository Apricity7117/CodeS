import { describe, expect, it } from 'vitest'
import type { UiMessage } from '../../types/codex'
import {
  buildCopyableMessageContent,
  buildCopyableMessageContentByAnchorId,
  buildCopyableResponseContentByAnchorId,
  buildForkableTurnIndexByAnchorId,
} from './threadMessageActions'

function message(options: Partial<UiMessage> = {}): UiMessage {
  return {
    id: 'message-1',
    role: 'assistant',
    text: '',
    ...options,
  }
}

describe('thread message action utilities', () => {
  it('builds copyable text from plain text, plan fallback, files, and images', () => {
    expect(buildCopyableMessageContent(message({
      text: '  Hello  ',
      fileAttachments: [
        { label: 'empty', path: ' ' },
        { label: 'app', path: ' src/App.vue ' },
      ],
      images: [' ', 'file:///tmp/image.png'],
    }))).toBe([
      'Hello',
      '',
      'Files:',
      'src/App.vue',
      '',
      'Images:',
      'file:///tmp/image.png',
    ].join('\n'))

    expect(buildCopyableMessageContent(message({
      messageType: 'plan',
      plan: {
        explanation: 'Need a plan',
        steps: [{ step: 'Verify', status: 'pending' }],
      },
    }))).toBe('Plan\nNeed a plan\n\n- [ ] Verify')
  })

  it('groups assistant response copy text by turn and anchors it to the latest response part', () => {
    const messages = [
      message({ id: 'a1', text: 'First', turnIndex: 0 }),
      message({ id: 'a2', text: 'Second', turnIndex: 0 }),
      message({ id: 'worked', text: 'Hidden', turnIndex: 0, messageType: 'worked' }),
      message({ id: 'solo', text: 'Solo' }),
      message({ id: 'empty', text: '  ', turnIndex: 1 }),
    ]

    const byAnchor = buildCopyableResponseContentByAnchorId(
      messages,
      (candidate) => candidate.role === 'assistant' && candidate.messageType !== 'worked',
      { a2: 'Modified files:\n- Edited: src/App.vue', missing: 'Detached file change' },
    )

    expect(byAnchor).toEqual({
      a2: 'First\n\nSecond\n\nModified files:\n- Edited: src/App.vue',
      solo: 'Solo',
      missing: 'Detached file change',
    })
  })

  it('copies only the plain text of user messages, excluding attachments', () => {
    const messages = [
      message({ id: 'assistant-anchor', text: 'Assistant answer' }),
      message({
        id: 'user-1',
        role: 'user',
        text: '  User prompt  ',
        fileAttachments: [{ label: 'readme', path: 'README.md' }],
        images: ['file:///tmp/image.png'],
      }),
    ]

    expect(buildCopyableMessageContentByAnchorId(messages, {
      'assistant-anchor': 'Assistant answer',
    })).toEqual({
      'assistant-anchor': 'Assistant answer',
      'user-1': 'User prompt',
    })
  })

  it('anchors forkable turns to the latest visible assistant response in each turn', () => {
    const messages = [
      message({ id: 'a1', text: 'First', turnIndex: 0 }),
      message({ id: 'a2', text: 'Second', turnIndex: 0 }),
      message({ id: 'hidden', text: 'Hidden', turnIndex: 1, messageType: 'worked' }),
      message({ id: 'a3', text: 'Third', turnIndex: 2 }),
      message({ id: 'no-turn', text: 'No turn index' }),
    ]

    expect(buildForkableTurnIndexByAnchorId(
      messages,
      (candidate) => candidate.role === 'assistant' && candidate.messageType !== 'worked',
    )).toEqual({
      a2: 0,
      a3: 2,
    })
  })
})

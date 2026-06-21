import { describe, expect, it } from 'vitest'
import type { UiMessage, UiPlanStep } from '../../types/codex'
import {
  buildPlanCopyText,
  buildPlanMessageText,
  isPlanMessage,
  parsePlanFromMessageText,
  planCardTitle,
  planStepCopyMarker,
  planStepStatusIcon,
  readPlanData,
  readPlanMarkdown,
  showMessageInThread,
  showPlanCardInThread,
  showImplementPlanButton,
} from './threadPlanUtils'

function planMessage(options: Partial<UiMessage> = {}): UiMessage {
  return {
    id: 'plan-1',
    role: 'assistant',
    messageType: 'plan',
    text: '',
    turnId: 'turn-1',
    ...options,
  }
}

describe('thread plan utilities', () => {
  it('parses markdown task-list plan text', () => {
    expect(parsePlanFromMessageText([
      'I will do this in order.',
      '',
      '- [x] Read the code',
      '- [~] Extract pure helpers',
      '- [ ] Run tests',
    ].join('\n'))).toEqual({
      explanation: 'I will do this in order.',
      steps: [
        { step: 'Read the code', status: 'completed' },
        { step: 'Extract pure helpers', status: 'inProgress' },
        { step: 'Run tests', status: 'pending' },
      ],
    })
  })

  it('prefers structured plan data over text fallback', () => {
    const steps: UiPlanStep[] = [{ step: 'Structured step', status: 'pending' }]

    expect(readPlanData(planMessage({
      text: '- [x] Text step',
      plan: { explanation: 'Structured explanation', steps },
    }))).toEqual({
      explanation: 'Structured explanation',
      steps,
    })
  })

  it('builds markdown from structured plans when message text is empty', () => {
    expect(readPlanMarkdown(planMessage({
      plan: {
        explanation: 'Plan explanation',
        steps: [
          { step: 'One', status: 'completed' },
          { step: 'Two', status: 'inProgress' },
          { step: 'Three', status: 'pending' },
        ],
      },
    }))).toBe([
      'Plan explanation',
      '- [x] One',
      '- [~] Two',
      '- [ ] Three',
    ].join('\n'))

    expect(buildPlanMessageText('', [{ step: 'Only', status: 'pending' }])).toBe('- [ ] Only')
  })

  it('keeps plan card labels and implement button rules', () => {
    expect(isPlanMessage(planMessage())).toBe(true)
    expect(planCardTitle(planMessage({ messageType: 'plan.live' }))).toBe('Writing plan')
    expect(showPlanCardInThread(planMessage({
      messageType: 'plan.live',
      plan: { steps: [{ step: 'Dock only', status: 'inProgress' }], presentation: 'dock' },
    }))).toBe(false)
    expect(showPlanCardInThread(planMessage({
      messageType: 'plan.live',
      plan: { steps: [{ step: 'Inline plan', status: 'inProgress' }], presentation: 'inline' },
    }))).toBe(true)
    expect(showMessageInThread(planMessage({
      messageType: 'plan.live',
      plan: { steps: [{ step: 'Dock only', status: 'inProgress' }], presentation: 'dock' },
    }))).toBe(false)
    expect(showMessageInThread(planMessage({ messageType: 'agentMessage' }))).toBe(true)
    expect(showImplementPlanButton(planMessage())).toBe(true)
    expect(showImplementPlanButton(planMessage({ messageType: 'plan.live' }))).toBe(false)
    expect(showImplementPlanButton(planMessage({ role: 'user' }))).toBe(false)
    expect(showImplementPlanButton(planMessage({ turnId: '' }))).toBe(false)
  })

  it('builds copy text and status markers', () => {
    expect(planStepStatusIcon('completed')).toBe('✓')
    expect(planStepStatusIcon('inProgress')).toBe('•')
    expect(planStepStatusIcon('pending')).toBe('○')
    expect(planStepCopyMarker('completed')).toBe('[x]')
    expect(planStepCopyMarker('inProgress')).toBe('[~]')
    expect(planStepCopyMarker('pending')).toBe('[ ]')
    expect(buildPlanCopyText(planMessage({
      plan: {
        explanation: 'Copy this',
        steps: [{ step: 'Verify', status: 'completed' }],
      },
    }))).toBe('Copy this\n\n- [x] Verify')
  })
})

import { describe, expect, it } from 'vitest'
import type { UiMessage, UiPlanStep } from '../../types/codex'
import { buildInspectorPlanProgress } from './inspectorProgress'

function message(id: string, steps?: UiPlanStep[]): UiMessage {
  return {
    id,
    role: 'assistant',
    text: '',
    plan: steps ? { steps } : undefined,
  }
}

describe('buildInspectorPlanProgress', () => {
  it('returns null when no plan steps exist', () => {
    expect(buildInspectorPlanProgress([message('one')])).toBeNull()
  })

  it('uses the latest message with plan steps', () => {
    const progress = buildInspectorPlanProgress([
      message('older', [{ step: 'Read code', status: 'completed' }]),
      message('newer', [{ step: 'Patch UI', status: 'inProgress' }]),
    ])

    expect(progress?.messageId).toBe('newer')
    expect(progress?.items).toEqual([{ label: 'Patch UI', status: 'inProgress' }])
  })

  it('keeps pending, in-progress, and completed statuses', () => {
    const progress = buildInspectorPlanProgress([
      message('plan', [
        { step: 'One', status: 'completed' },
        { step: 'Two', status: 'inProgress' },
        { step: 'Three', status: 'pending' },
      ]),
    ])

    expect(progress?.items.map((item) => item.status)).toEqual(['completed', 'inProgress', 'pending'])
    expect(progress?.isComplete).toBe(false)
  })

  it('keeps dock-presented plan steps for the inspector progress section', () => {
    const progress = buildInspectorPlanProgress([
      {
        ...message('plan', [{ step: 'Inspector only', status: 'inProgress' }]),
        plan: {
          steps: [{ step: 'Inspector only', status: 'inProgress' }],
          presentation: 'dock',
        },
      },
    ])

    expect(progress?.items).toEqual([{ label: 'Inspector only', status: 'inProgress' }])
  })

  it('marks complete only when every step is completed', () => {
    expect(buildInspectorPlanProgress([
      message('plan', [
        { step: 'One', status: 'completed' },
        { step: 'Two', status: 'completed' },
      ]),
    ])?.isComplete).toBe(true)

    expect(buildInspectorPlanProgress([
      message('plan', [
        { step: 'One', status: 'completed' },
        { step: 'Two', status: 'pending' },
      ]),
    ])?.isComplete).toBe(false)
  })
})

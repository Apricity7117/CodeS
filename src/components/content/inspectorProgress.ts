import type { UiMessage, UiPlanStepStatus } from '../../types/codex'

export type InspectorPlanProgressItem = {
  label: string
  status: UiPlanStepStatus
}

export type InspectorPlanProgress = {
  messageId: string
  items: InspectorPlanProgressItem[]
  isComplete: boolean
}

export function buildInspectorPlanProgress(messages: UiMessage[]): InspectorPlanProgress | null {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index]
    const items = (message.plan?.steps ?? [])
      .map((step) => ({
        label: step.step.trim(),
        status: step.status,
      }))
      .filter((step) => step.label.length > 0)

    if (items.length === 0) continue

    return {
      messageId: message.id,
      items,
      isComplete: items.every((item) => item.status === 'completed'),
    }
  }

  return null
}

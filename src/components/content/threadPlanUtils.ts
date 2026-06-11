import type { UiMessage, UiPlanStep } from '../../types/codex'

export type ThreadPlanData = {
  explanation: string
  steps: UiPlanStep[]
}

export function parsePlanFromMessageText(text: string): ThreadPlanData | null {
  const normalized = text.replace(/\r\n/g, '\n').trim()
  if (!normalized) return null

  const steps: UiPlanStep[] = []
  const explanationLines: string[] = []

  for (const line of normalized.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed) {
      if (steps.length === 0) explanationLines.push('')
      continue
    }

    const match = trimmed.match(/^[-*]\s+\[([ xX~>|-])\]\s+(.+)$/)
    if (match) {
      const marker = (match[1] ?? ' ').toLowerCase()
      let status: UiPlanStep['status'] = 'pending'
      if (marker === 'x') status = 'completed'
      if (marker === '~' || marker === '>' || marker === '-') status = 'inProgress'
      steps.push({
        step: match[2]?.trim() ?? '',
        status,
      })
      continue
    }

    explanationLines.push(trimmed)
  }

  if (steps.length === 0) return null
  return {
    explanation: explanationLines.join('\n').trim(),
    steps: steps.filter((step) => step.step.length > 0),
  }
}

export function readPlanData(message: UiMessage): ThreadPlanData | null {
  if (message.plan && message.plan.steps.length > 0) {
    return {
      explanation: message.plan.explanation?.trim() ?? '',
      steps: message.plan.steps,
    }
  }
  return parsePlanFromMessageText(message.text)
}

export function isPlanMessage(message: UiMessage): boolean {
  return message.messageType === 'plan' || message.messageType === 'plan.live'
}

export function planCardTitle(message: UiMessage): string {
  return message.messageType === 'plan.live' ? 'Writing plan' : 'Plan'
}

export function buildPlanMessageText(explanation: string, steps: UiPlanStep[]): string {
  const lines: string[] = []
  if (explanation.trim()) {
    lines.push(explanation.trim())
  }
  for (const step of steps) {
    const marker = step.status === 'completed' ? 'x' : step.status === 'inProgress' ? '~' : ' '
    lines.push(`- [${marker}] ${step.step}`)
  }
  return lines.join('\n').trim()
}

export function readPlanMarkdown(message: UiMessage): string {
  const text = message.text.trim()
  if (text) return text
  const planData = readPlanData(message)
  if (!planData) return ''
  return buildPlanMessageText(planData.explanation, planData.steps)
}

export function showImplementPlanButton(message: UiMessage): boolean {
  return isPlanMessage(message)
    && message.messageType !== 'plan.live'
    && message.role === 'assistant'
    && Boolean(message.turnId)
}

export function readPlanExplanation(message: UiMessage): string {
  return readPlanData(message)?.explanation ?? ''
}

export function readPlanSteps(message: UiMessage): UiPlanStep[] {
  return readPlanData(message)?.steps ?? []
}

export function planStepStatusIcon(status: UiPlanStep['status']): string {
  switch (status) {
    case 'completed':
      return '✓'
    case 'inProgress':
      return '•'
    default:
      return '○'
  }
}

export function planStepCopyMarker(status: UiPlanStep['status']): string {
  switch (status) {
    case 'completed':
      return '[x]'
    case 'inProgress':
      return '[~]'
    default:
      return '[ ]'
  }
}

export function buildPlanCopyText(message: UiMessage): string {
  const planData = readPlanData(message)
  if (!planData) return ''

  const sections: string[] = []
  if (planData.explanation?.trim()) {
    sections.push(planData.explanation.trim())
  }

  if (planData.steps.length > 0) {
    sections.push(planData.steps.map((step) => `- ${planStepCopyMarker(step.status)} ${step.step}`.trim()).join('\n'))
  }

  return sections.join('\n\n').trim()
}

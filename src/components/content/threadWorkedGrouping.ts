import type { UiMessage } from '../../types/codex'

export type WorkedTurnGroups = {
  processMessagesByWorkedId: Record<string, UiMessage[]>
  hiddenProcessIds: Set<string>
}

function turnKey(message: UiMessage): string {
  const turnId = message.turnId?.trim() ?? ''
  if (turnId) return `id:${turnId}`
  return typeof message.turnIndex === 'number' ? `index:${message.turnIndex}` : ''
}

function isWorkedMessage(message: UiMessage): boolean {
  return message.messageType === 'worked'
}

function isLiveAssistantMessage(message: UiMessage): boolean {
  return message.role === 'assistant' && message.messageType === 'agentMessage.live'
}

function isFinalAssistantCandidate(message: UiMessage): boolean {
  return message.role === 'assistant'
    && !isWorkedMessage(message)
    && !isLiveAssistantMessage(message)
    && message.text.trim().length > 0
}

function isWorkedProcessCandidate(message: UiMessage): boolean {
  if (message.role === 'system') {
    return message.messageType === 'commandExecution'
      || message.messageType === 'fileChange'
  }

  return message.role === 'assistant'
    && !isWorkedMessage(message)
    && !isLiveAssistantMessage(message)
    && message.text.trim().length > 0
}

function findFinalAssistant(messages: UiMessage[]): UiMessage | null {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index]
    if (isFinalAssistantCandidate(message)) return message
  }
  return null
}

export function buildWorkedTurnGroups(messages: UiMessage[]): WorkedTurnGroups {
  const messagesByTurn = new Map<string, UiMessage[]>()
  for (const message of messages) {
    const key = turnKey(message)
    if (!key) continue
    const rows = messagesByTurn.get(key)
    if (rows) rows.push(message)
    else messagesByTurn.set(key, [message])
  }

  const processMessagesByWorkedId: Record<string, UiMessage[]> = {}
  const hiddenProcessIds = new Set<string>()

  for (const message of messages) {
    if (!isWorkedMessage(message)) continue
    const key = turnKey(message)
    if (!key) continue

    const turnMessages = messagesByTurn.get(key) ?? []
    const finalAssistant = findFinalAssistant(turnMessages)
    if (!finalAssistant) continue

    const processMessages = turnMessages.filter((turnMessage) =>
      turnMessage.id !== message.id
      && turnMessage.id !== finalAssistant.id
      && isWorkedProcessCandidate(turnMessage),
    )
    if (processMessages.length === 0) continue

    processMessagesByWorkedId[message.id] = processMessages
    for (const processMessage of processMessages) {
      hiddenProcessIds.add(processMessage.id)
    }
  }

  return { processMessagesByWorkedId, hiddenProcessIds }
}

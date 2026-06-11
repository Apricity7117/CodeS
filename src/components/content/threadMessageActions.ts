import type { UiMessage } from '../../types/codex'
import { buildPlanCopyText, isPlanMessage } from './threadPlanUtils'

export type CopyableAssistantMessagePredicate = (message: UiMessage) => boolean

function responseGroupKey(message: UiMessage): string {
  return typeof message.turnIndex === 'number'
    ? `turn:${message.turnIndex}`
    : `message:${message.id}`
}

export function buildCopyableMessageContent(message: UiMessage): string {
  const sections: string[] = []
  const rawTextContent = message.text.trim() || buildPlanCopyText(message)
  const textContent = isPlanMessage(message) && rawTextContent
    ? `Plan\n${rawTextContent}`
    : rawTextContent
  if (textContent) {
    sections.push(textContent)
  }

  const attachmentLines = (message.fileAttachments ?? [])
    .map((attachment) => attachment.path.trim())
    .filter((pathValue) => pathValue.length > 0)
  if (attachmentLines.length > 0) {
    sections.push(`Files:\n${attachmentLines.join('\n')}`)
  }

  const imageLines = (message.images ?? [])
    .map((imageUrl) => imageUrl.trim())
    .filter((imageUrl) => imageUrl.length > 0)
  if (imageLines.length > 0) {
    sections.push(`Images:\n${imageLines.join('\n')}`)
  }

  return sections.join('\n\n').trim()
}

export function buildCopyableResponseContentByAnchorId(
  messages: UiMessage[],
  isCopyableAssistantMessage: CopyableAssistantMessagePredicate,
  fileChangeCopyByAnchorId: Record<string, string> = {},
): Record<string, string> {
  const groupedResponses = new Map<string, { anchorMessageId: string; parts: string[] }>()

  for (const message of messages) {
    if (!isCopyableAssistantMessage(message)) continue

    const content = buildCopyableMessageContent(message)
    if (!content) continue

    const responseKey = responseGroupKey(message)
    const existing = groupedResponses.get(responseKey)
    if (existing) {
      existing.anchorMessageId = message.id
      existing.parts.push(content)
      continue
    }

    groupedResponses.set(responseKey, {
      anchorMessageId: message.id,
      parts: [content],
    })
  }

  const next: Record<string, string> = {}
  for (const response of groupedResponses.values()) {
    const content = response.parts.join('\n\n').trim()
    if (!content) continue
    next[response.anchorMessageId] = content
  }

  for (const [anchorMessageId, fileChangeCopyRaw] of Object.entries(fileChangeCopyByAnchorId)) {
    const fileChangeCopy = fileChangeCopyRaw.trim()
    if (!fileChangeCopy) continue
    const existing = next[anchorMessageId]?.trim()
    next[anchorMessageId] = existing ? `${existing}\n\n${fileChangeCopy}` : fileChangeCopy
  }

  return next
}

export function buildCopyableMessageContentByAnchorId(
  messages: UiMessage[],
  responseContentByAnchorId: Record<string, string>,
): Record<string, string> {
  const next: Record<string, string> = { ...responseContentByAnchorId }
  for (const message of messages) {
    if (message.role !== 'user') continue
    const content = buildCopyableMessageContent(message)
    if (content) next[message.id] = content
  }
  return next
}

export function buildForkableTurnIndexByAnchorId(
  messages: UiMessage[],
  isCopyableAssistantMessage: CopyableAssistantMessagePredicate,
): Record<string, number> {
  const groupedTurns = new Map<string, { anchorMessageId: string; turnIndex: number }>()

  for (const message of messages) {
    if (!isCopyableAssistantMessage(message) || typeof message.turnIndex !== 'number') continue

    const responseKey = `turn:${message.turnIndex}`
    const existing = groupedTurns.get(responseKey)
    if (existing) {
      existing.anchorMessageId = message.id
      existing.turnIndex = message.turnIndex
      continue
    }

    groupedTurns.set(responseKey, {
      anchorMessageId: message.id,
      turnIndex: message.turnIndex,
    })
  }

  const next: Record<string, number> = {}
  for (const groupedTurn of groupedTurns.values()) {
    next[groupedTurn.anchorMessageId] = groupedTurn.turnIndex
  }
  return next
}

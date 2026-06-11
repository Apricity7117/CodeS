import type { DirectoryTryItemPayload } from './appTypes'

export function buildDirectoryTryPrompt(payload: DirectoryTryItemPayload): string {
  if (payload.prompt?.trim()) return payload.prompt.trim()
  const label = payload.displayName.trim() || payload.name.trim()
  return `Test ${label} skill. Give me a list of what it can do and one useful example.`
}

export function getDirectoryTryItemKey(payload: DirectoryTryItemPayload): string {
  return `${payload.kind}:${payload.name}:${payload.skillPath ?? ''}`
}

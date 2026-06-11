import { TERMINAL_QUICK_COMMAND_STORAGE_KEY } from './appConfig'
import type { TerminalHeaderQuickCommand } from './appTypes'

export function normalizeTerminalQuickCommandValue(value: string): string {
  return value.trim().replace(/\s+/g, ' ')
}

export function compareTerminalQuickCommands(first: TerminalHeaderQuickCommand, second: TerminalHeaderQuickCommand): number {
  if (second.usageCount !== first.usageCount) return second.usageCount - first.usageCount
  if (second.lastUsedAt !== first.lastUsedAt) return second.lastUsedAt - first.lastUsedAt
  const firstSource = typeof first.sourceIndex === 'number' ? first.sourceIndex : Number.MAX_SAFE_INTEGER
  const secondSource = typeof second.sourceIndex === 'number' ? second.sourceIndex : Number.MAX_SAFE_INTEGER
  return firstSource - secondSource
}

export function loadTerminalStoredQuickCommands(): TerminalHeaderQuickCommand[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = window.localStorage.getItem(TERMINAL_QUICK_COMMAND_STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return []
    const seen = new Set<string>()
    const commands: TerminalHeaderQuickCommand[] = []
    for (const row of parsed) {
      const record = row !== null && typeof row === 'object' && !Array.isArray(row)
        ? row as Record<string, unknown>
        : null
      const value = normalizeTerminalQuickCommandValue(readTerminalString(record?.value))
      if (!value || seen.has(value)) continue
      seen.add(value)
      commands.push({
        label: readTerminalString(record?.label) || value,
        value,
        custom: record?.custom !== false,
        usageCount: readTerminalPositiveInteger(record?.usageCount),
        lastUsedAt: readTerminalPositiveInteger(record?.lastUsedAt),
      })
    }
    return commands
  } catch {
    return []
  }
}

export function saveTerminalStoredQuickCommands(commands: TerminalHeaderQuickCommand[]): void {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(
    TERMINAL_QUICK_COMMAND_STORAGE_KEY,
    JSON.stringify(commands.map((command) => ({
      label: command.label,
      value: command.value,
      custom: command.custom === true,
      usageCount: command.usageCount,
      lastUsedAt: command.lastUsedAt,
    }))),
  )
}

function readTerminalString(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

function readTerminalPositiveInteger(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) return Math.max(0, Math.trunc(value))
  if (typeof value === 'string') {
    const parsed = Number(value)
    if (Number.isFinite(parsed)) return Math.max(0, Math.trunc(parsed))
  }
  return 0
}

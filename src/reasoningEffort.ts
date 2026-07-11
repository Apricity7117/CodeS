import type { ReasoningEffort } from './types/codex.js'

export const KNOWN_REASONING_EFFORTS = [
  'none',
  'minimal',
  'low',
  'medium',
  'high',
  'xhigh',
  'max',
  'ultra',
] as const
export type KnownReasoningEffort = (typeof KNOWN_REASONING_EFFORTS)[number]

export const DEFAULT_MODEL_REASONING_EFFORTS: readonly ReasoningEffort[] = [
  'low',
  'medium',
  'high',
  'xhigh',
]

const KNOWN_REASONING_EFFORT_SET = new Set<string>(KNOWN_REASONING_EFFORTS)

export function normalizeReasoningEffort(value: unknown): ReasoningEffort | '' {
  return typeof value === 'string' ? value.trim() : ''
}

export function isKnownReasoningEffort(value: unknown): value is KnownReasoningEffort {
  return typeof value === 'string' && KNOWN_REASONING_EFFORT_SET.has(value)
}

export type TranslateFunction = (message: string, params?: Record<string, string | number>) => string

export type ChatWidthMode = 'standard' | 'wide' | 'extra-wide'
export type DarkModePreference = 'system' | 'light' | 'dark'
export type InProgressSendMode = 'steer' | 'queue'
export type InspectorProgressDotState = 'done' | 'active' | 'idle'

export type InspectorSourceItem = {
  label: string
  mark?: string
}

export type DirectoryTryItemPayload = {
  kind: 'skill'
  name: string
  displayName: string
  skillPath?: string
  prompt?: string
  attachedSkills?: Array<{ name: string; path: string }>
}

export type ChatWidthPreset = {
  label: string
  columnMax: string
  cardMax: string
}

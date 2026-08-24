import {
  ACCOUNTS_SECTION_COLLAPSED_STORAGE_KEY,
  CHAT_WIDTH_KEY,
  CODE_BLOCK_SCROLLBARS_ENABLED_KEY,
  DARK_MODE_KEY,
  DICTATION_AUTO_SEND_KEY,
  DICTATION_CLICK_TO_TOGGLE_KEY,
  DICTATION_ENABLED_KEY,
  DICTATION_LANGUAGE_KEY,
  IN_PROGRESS_SEND_MODE_KEY,
  INSPECTOR_PANEL_OPEN_STORAGE_KEY,
  LIVE_REASONING_TEXT_ENABLED_KEY,
  SEND_WITH_ENTER_KEY,
  SIDEBAR_COLLAPSED_STORAGE_KEY,
  TEXT_ANIMATIONS_ENABLED_KEY,
  WHISPER_LANGUAGES,
} from './appConfig'
import type { ChatWidthMode, DarkModePreference, InProgressSendMode } from './appTypes'

function loadBoolPref(key: string, fallback: boolean): boolean {
  if (typeof window === 'undefined') return fallback
  const value = window.localStorage.getItem(key)
  if (value === null) return fallback
  return value === '1'
}

function saveBoolPref(key: string, value: boolean): void {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(key, value ? '1' : '0')
}

function saveStringPref(key: string, value: string): void {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(key, value)
}

export function loadSendWithEnterPref(): boolean {
  return loadBoolPref(SEND_WITH_ENTER_KEY, true)
}

export function saveSendWithEnterPref(value: boolean): void {
  saveBoolPref(SEND_WITH_ENTER_KEY, value)
}

export function loadTextAnimationsPref(): boolean {
  return loadBoolPref(TEXT_ANIMATIONS_ENABLED_KEY, true)
}

export function saveTextAnimationsPref(value: boolean): void {
  saveBoolPref(TEXT_ANIMATIONS_ENABLED_KEY, value)
}

export function loadLiveReasoningTextPref(): boolean {
  return loadBoolPref(LIVE_REASONING_TEXT_ENABLED_KEY, true)
}

export function saveLiveReasoningTextPref(value: boolean): void {
  saveBoolPref(LIVE_REASONING_TEXT_ENABLED_KEY, value)
}

export function loadCodeBlockScrollbarsPref(): boolean {
  return loadBoolPref(CODE_BLOCK_SCROLLBARS_ENABLED_KEY, true)
}

export function saveCodeBlockScrollbarsPref(value: boolean): void {
  saveBoolPref(CODE_BLOCK_SCROLLBARS_ENABLED_KEY, value)
}

export function loadDictationEnabledPref(): boolean {
  return loadBoolPref(DICTATION_ENABLED_KEY, true)
}

export function saveDictationEnabledPref(value: boolean): void {
  saveBoolPref(DICTATION_ENABLED_KEY, value)
}

export function loadDictationClickToTogglePref(): boolean {
  return loadBoolPref(DICTATION_CLICK_TO_TOGGLE_KEY, false)
}

export function saveDictationClickToTogglePref(value: boolean): void {
  saveBoolPref(DICTATION_CLICK_TO_TOGGLE_KEY, value)
}

export function loadDictationAutoSendPref(): boolean {
  return loadBoolPref(DICTATION_AUTO_SEND_KEY, true)
}

export function saveDictationAutoSendPref(value: boolean): void {
  saveBoolPref(DICTATION_AUTO_SEND_KEY, value)
}

export function loadDarkModePref(): DarkModePreference {
  if (typeof window === 'undefined') return 'system'
  const value = window.localStorage.getItem(DARK_MODE_KEY)
  if (value === 'light' || value === 'dark') return value
  return 'system'
}

export function saveDarkModePref(value: DarkModePreference): void {
  saveStringPref(DARK_MODE_KEY, value)
}

export function loadInProgressSendModePref(): InProgressSendMode {
  if (typeof window === 'undefined') return 'steer'
  const value = window.localStorage.getItem(IN_PROGRESS_SEND_MODE_KEY)
  if (value === 'steer' || value === 'queue') return value
  return 'queue'
}

export function saveInProgressSendModePref(value: InProgressSendMode): void {
  saveStringPref(IN_PROGRESS_SEND_MODE_KEY, value)
}

export function loadChatWidthPref(): ChatWidthMode {
  if (typeof window === 'undefined') return 'standard'
  const value = window.localStorage.getItem(CHAT_WIDTH_KEY)
  return value === 'standard' || value === 'wide' || value === 'extra-wide' ? value : 'standard'
}

export function saveChatWidthPref(value: ChatWidthMode): void {
  saveStringPref(CHAT_WIDTH_KEY, value)
}

export function normalizeToWhisperLanguage(raw: string): string {
  const value = raw.trim().toLowerCase()
  if (!value || value === 'auto') return ''
  if (value in WHISPER_LANGUAGES) return value
  const base = value.split('-')[0] ?? value
  if (base in WHISPER_LANGUAGES) return base
  return ''
}

export function loadDictationLanguagePref(): string {
  if (typeof window === 'undefined') return 'auto'
  const value = window.localStorage.getItem(DICTATION_LANGUAGE_KEY)?.trim() || 'auto'
  const normalized = normalizeToWhisperLanguage(value)
  return normalized || 'auto'
}

export function saveDictationLanguagePref(value: string): void {
  saveStringPref(DICTATION_LANGUAGE_KEY, value)
}

export function loadSidebarCollapsed(): boolean {
  if (typeof window === 'undefined') return false
  return window.localStorage.getItem(SIDEBAR_COLLAPSED_STORAGE_KEY) === '1'
}

export function saveSidebarCollapsed(value: boolean): void {
  saveBoolPref(SIDEBAR_COLLAPSED_STORAGE_KEY, value)
}

export function loadInspectorPanelOpen(): boolean {
  if (typeof window === 'undefined') return true
  const value = window.localStorage.getItem(INSPECTOR_PANEL_OPEN_STORAGE_KEY)
  if (value === null) return window.innerWidth >= 920
  return value === '1'
}

export function saveInspectorPanelOpen(value: boolean): void {
  saveBoolPref(INSPECTOR_PANEL_OPEN_STORAGE_KEY, value)
}

export function loadAccountsSectionCollapsed(): boolean {
  if (typeof window === 'undefined') return true
  const value = window.localStorage.getItem(ACCOUNTS_SECTION_COLLAPSED_STORAGE_KEY)
  if (value === null) return true
  return value === '1'
}

export function saveAccountsSectionCollapsed(value: boolean): void {
  saveBoolPref(ACCOUNTS_SECTION_COLLAPSED_STORAGE_KEY, value)
}

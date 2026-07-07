import { computed, onMounted, onUnmounted, ref } from 'vue'
import { CHAT_WIDTH_PRESETS, WHISPER_LANGUAGES } from '../app/appConfig'
import {
  loadChatWidthPref,
  loadDarkModePref,
  loadDictationAutoSendPref,
  loadDictationClickToTogglePref,
  loadDictationEnabledPref,
  loadDictationLanguagePref,
  loadInProgressSendModePref,
  loadLiveReasoningTextPref,
  loadSendWithEnterPref,
  loadTextAnimationsPref,
  normalizeToWhisperLanguage,
  saveChatWidthPref,
  saveDarkModePref,
  saveDictationAutoSendPref,
  saveDictationClickToTogglePref,
  saveDictationEnabledPref,
  saveDictationLanguagePref,
  saveInProgressSendModePref,
  saveLiveReasoningTextPref,
  saveSendWithEnterPref,
  saveTextAnimationsPref,
} from '../app/preferences'
import type { ChatWidthMode, DarkModePreference, InProgressSendMode } from '../app/appTypes'
import { applyPwaThemeColor, resolvePwaThemeColor } from '../utils/pwaTheme'
import { t } from './useUiLanguage'

/**
 * 用户偏好设置：发送方式、外观、聊天宽度、动画、语音听写等。
 * 状态读写均落地到 localStorage；暗色模式的系统主题监听在此自管。
 */
export function usePreferences() {
  const sendWithEnter = ref(loadSendWithEnterPref())
  const inProgressSendMode = ref<InProgressSendMode>(loadInProgressSendModePref())
  const darkMode = ref<DarkModePreference>(loadDarkModePref())
  const chatWidth = ref<ChatWidthMode>(loadChatWidthPref())
  const textAnimationsEnabled = ref(loadTextAnimationsPref())
  const liveReasoningTextEnabled = ref(loadLiveReasoningTextPref())
  const dictationEnabled = ref(loadDictationEnabledPref())
  const dictationClickToToggle = ref(loadDictationClickToTogglePref())
  const dictationAutoSend = ref(loadDictationAutoSendPref())
  const dictationLanguage = ref(loadDictationLanguagePref())

  const darkModeMediaQuery = typeof window !== 'undefined' ? window.matchMedia('(prefers-color-scheme: dark)') : null
  const chatWidthLabel = computed(() => t(CHAT_WIDTH_PRESETS[chatWidth.value].label))
  const dictationLanguageOptions = computed(() => buildDictationLanguageOptions())

  function toggleSendWithEnter(): void {
    sendWithEnter.value = !sendWithEnter.value
    saveSendWithEnterPref(sendWithEnter.value)
  }

  function cycleInProgressSendMode(): void {
    inProgressSendMode.value = inProgressSendMode.value === 'steer' ? 'queue' : 'steer'
    saveInProgressSendModePref(inProgressSendMode.value)
  }

  function cycleDarkMode(): void {
    const order: DarkModePreference[] = ['system', 'light', 'dark']
    const idx = order.indexOf(darkMode.value)
    darkMode.value = order[(idx + 1) % order.length]
    saveDarkModePref(darkMode.value)
    applyDarkMode()
  }

  function cycleChatWidth(): void {
    const order: ChatWidthMode[] = ['standard', 'wide', 'extra-wide']
    const idx = order.indexOf(chatWidth.value)
    chatWidth.value = order[(idx + 1) % order.length]
    saveChatWidthPref(chatWidth.value)
  }

  function toggleTextAnimations(): void {
    textAnimationsEnabled.value = !textAnimationsEnabled.value
    saveTextAnimationsPref(textAnimationsEnabled.value)
  }

  function toggleLiveReasoningText(): void {
    liveReasoningTextEnabled.value = !liveReasoningTextEnabled.value
    saveLiveReasoningTextPref(liveReasoningTextEnabled.value)
  }

  function toggleDictationEnabled(): void {
    dictationEnabled.value = !dictationEnabled.value
    saveDictationEnabledPref(dictationEnabled.value)
  }

  function toggleDictationClickToToggle(): void {
    dictationClickToToggle.value = !dictationClickToToggle.value
    saveDictationClickToTogglePref(dictationClickToToggle.value)
  }

  function toggleDictationAutoSend(): void {
    dictationAutoSend.value = !dictationAutoSend.value
    saveDictationAutoSendPref(dictationAutoSend.value)
  }

  function onDictationLanguageChange(nextValue: string): void {
    const normalized = normalizeToWhisperLanguage(nextValue.trim())
    const value = normalized || 'auto'
    dictationLanguage.value = value
    saveDictationLanguagePref(value)
  }

  function buildDictationLanguageOptions(): Array<{ value: string; label: string }> {
    const options: Array<{ value: string; label: string }> = [{ value: 'auto', label: t('Auto-detect') }]
    const seen = new Set<string>(['auto'])
    function formatLanguageLabel(value: string): string {
      const languageName = WHISPER_LANGUAGES[value] || value
      const title = languageName.charAt(0).toUpperCase() + languageName.slice(1)
      return `${title} (${value})`
    }

    for (const raw of typeof navigator !== 'undefined' ? (navigator.languages ?? []) : []) {
      const value = normalizeToWhisperLanguage(raw)
      if (!value || seen.has(value)) continue
      seen.add(value)
      options.push({
        value,
        label: `Preferred: ${formatLanguageLabel(value)}`,
      })
    }

    for (const value of Object.keys(WHISPER_LANGUAGES)) {
      if (seen.has(value)) continue
      seen.add(value)
      options.push({
        value,
        label: formatLanguageLabel(value),
      })
    }

    const current = dictationLanguage.value.trim()
    if (current && !seen.has(current)) {
      options.push({
        value: current,
        label: formatLanguageLabel(current),
      })
    }

    return options
  }

  function applyDarkMode(): void {
    const root = document.documentElement
    const prefersDark = darkModeMediaQuery?.matches ?? false
    if (darkMode.value === 'dark') {
      root.classList.add('dark')
    } else if (darkMode.value === 'light') {
      root.classList.remove('dark')
    } else {
      root.classList.toggle('dark', prefersDark)
    }
    applyPwaThemeColor(document, resolvePwaThemeColor(darkMode.value, prefersDark))
  }

  onMounted(() => {
    applyDarkMode()
    darkModeMediaQuery?.addEventListener('change', applyDarkMode)
  })

  onUnmounted(() => {
    darkModeMediaQuery?.removeEventListener('change', applyDarkMode)
  })

  return {
    sendWithEnter,
    inProgressSendMode,
    darkMode,
    chatWidth,
    textAnimationsEnabled,
    liveReasoningTextEnabled,
    dictationEnabled,
    dictationClickToToggle,
    dictationAutoSend,
    dictationLanguage,
    chatWidthLabel,
    dictationLanguageOptions,
    toggleSendWithEnter,
    cycleInProgressSendMode,
    cycleDarkMode,
    cycleChatWidth,
    toggleTextAnimations,
    toggleLiveReasoningText,
    toggleDictationEnabled,
    toggleDictationClickToToggle,
    toggleDictationAutoSend,
    onDictationLanguageChange,
    applyDarkMode,
  }
}

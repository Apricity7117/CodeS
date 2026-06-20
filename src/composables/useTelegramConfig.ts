import { computed, onMounted, ref } from 'vue'
import { configureTelegramBot, getTelegramConfig, getTelegramStatus } from '../api/codexGateway'
import type { TelegramStatus } from '../api/codexGateway'
import { t } from './useUiLanguage'

/**
 * Telegram 配置管理：Bot Token、允许的用户 ID、状态查询、保存配置。
 */
export function useTelegramConfig() {
  const isTelegramConfigOpen = ref(false)
  const telegramBotTokenDraft = ref('')
  const telegramAllowedUserIdsDraft = ref('')
  const telegramConfigError = ref('')
  const isTelegramSaving = ref(false)
  const telegramStatus = ref<TelegramStatus>({
    configured: false,
    active: false,
    mappedChats: 0,
    mappedThreads: 0,
    allowedUsers: 0,
    allowAllUsers: false,
    lastError: '',
  })

  const telegramStatusText = computed(() => {
    if (!telegramStatus.value.configured) return t('Not configured')
    const base = telegramStatus.value.active ? t('Online') : t('Configured (offline)')
    const allowlist = telegramStatus.value.allowAllUsers
      ? t('allow all users')
      : `${telegramStatus.value.allowedUsers} ${t('allowed user(s)')}`
    const mapped = `${telegramStatus.value.mappedChats} ${t('chat(s)')}, ${telegramStatus.value.mappedThreads} ${t('thread(s)')}, ${allowlist}`
    const error = telegramStatus.value.lastError ? `, ${t('error')}: ${telegramStatus.value.lastError}` : ''
    return `${base}, ${mapped}${error}`
  })

  onMounted(() => {
    void refreshTelegramConfig()
    void refreshTelegramStatus()
  })

  async function refreshTelegramStatus(): Promise<void> {
    try {
      telegramStatus.value = await getTelegramStatus()
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to load Telegram status'
      telegramStatus.value = {
        configured: false,
        active: false,
        mappedChats: 0,
        mappedThreads: 0,
        allowedUsers: 0,
        allowAllUsers: false,
        lastError: message,
      }
    }
  }

  async function refreshTelegramConfig(): Promise<void> {
    try {
      const config = await getTelegramConfig()
      telegramBotTokenDraft.value = config.botToken
      telegramAllowedUserIdsDraft.value = config.allowedUserIds.map((value) => String(value)).join('\n')
      telegramConfigError.value = ''
    } catch (error) {
      telegramConfigError.value = error instanceof Error ? error.message : 'Failed to load Telegram configuration'
    }
  }

  function parseTelegramAllowedUserIdsInput(value: string): Array<number | '*'> {
    const rawEntries = value
      .split(/[\n,]/)
      .map((entry) => entry.trim().replace(/^(telegram|tg):/i, '').trim())
      .filter(Boolean)
    const allowAllUsers = rawEntries.includes('*')
    const normalizedUserIds = Array.from(new Set(rawEntries
      .filter((entry) => /^-?\d+$/.test(entry))
      .map((entry) => Number.parseInt(entry, 10))))
    return allowAllUsers ? ['*', ...normalizedUserIds] : normalizedUserIds
  }

  async function saveTelegramConfig(): Promise<void> {
    const botToken = telegramBotTokenDraft.value.trim()
    const allowedUserIds = parseTelegramAllowedUserIdsInput(telegramAllowedUserIdsDraft.value)
    if (!botToken) {
      telegramConfigError.value = t('Telegram bot token is required.')
      return
    }
    if (allowedUserIds.length === 0) {
      telegramConfigError.value = t('At least one allowed Telegram user ID or * is required.')
      return
    }

    isTelegramSaving.value = true
    telegramConfigError.value = ''
    try {
      await configureTelegramBot(botToken, allowedUserIds)
      telegramAllowedUserIdsDraft.value = allowedUserIds.map((value) => String(value)).join('\n')
      await Promise.all([
        refreshTelegramConfig(),
        refreshTelegramStatus(),
      ])
      window.alert(t('Telegram bot configured. Only allowlisted Telegram users can use the bridge.'))
    } catch (error) {
      telegramConfigError.value = error instanceof Error ? error.message : t('Failed to connect Telegram bot')
      void refreshTelegramStatus()
    } finally {
      isTelegramSaving.value = false
    }
  }

  return {
    isTelegramConfigOpen,
    telegramBotTokenDraft,
    telegramAllowedUserIdsDraft,
    telegramConfigError,
    isTelegramSaving,
    telegramStatus,
    telegramStatusText,
    saveTelegramConfig,
  }
}

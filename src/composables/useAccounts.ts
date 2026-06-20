import { onUnmounted, ref, watch, type Ref } from 'vue'
import {
  getAccounts,
  completeCodexLogin,
  removeAccount,
  refreshAccountsFromAuth,
  startCodexLogin,
  switchAccount,
} from '../api/codexGateway'
import type { UiAccountEntry } from '../types/codex'
import { t } from './useUiLanguage'

/**
 * 账号管理：账号列表、切换、移除、Codex 登录流程、账号状态轮询。
 *
 * @param isAccountSwitchBlocked - computed，指示当前是否可切换账号（线程进行中时阻止）
 * @param onAccountsChange - 回调，账号切换/刷新后触发（用于重新拉取线程等）
 */
export function useAccounts(
  isAccountSwitchBlocked: Ref<boolean>,
  onAccountsChange: () => void,
) {
  const accounts = ref<UiAccountEntry[]>([])
  const isRefreshingAccounts = ref(false)
  const isSwitchingAccounts = ref(false)
  const isStartingCodexLogin = ref(false)
  const isCompletingCodexLogin = ref(false)
  const isCodexLoginModalOpen = ref(false)
  const codexLoginUrl = ref('')
  const codexLoginCallbackUrl = ref('')
  const removingAccountId = ref('')
  const confirmingRemoveAccountId = ref('')
  const hoveredAccountId = ref('')
  const accountActionError = ref('')

  let accountStatePollTimer: number | null = null
  let isAccountStatePollInFlight = false

  // 轮询：当有账号的 quotaStatus 为 'loading' 时，每 1.5s 刷新
  watch(accounts, () => {
    if (typeof window === 'undefined') return
    const shouldPoll = accounts.value.some((account) => account.quotaStatus === 'loading')
    if (!shouldPoll) {
      if (accountStatePollTimer !== null) {
        window.clearInterval(accountStatePollTimer)
        accountStatePollTimer = null
      }
      return
    }
    if (accountStatePollTimer !== null) return
    accountStatePollTimer = window.setInterval(() => {
      if (isAccountStatePollInFlight) return
      isAccountStatePollInFlight = true
      void loadAccountsState({ silent: true }).finally(() => {
        isAccountStatePollInFlight = false
      })
    }, 1500)
  }, { deep: true })

  onUnmounted(() => {
    if (accountStatePollTimer !== null) {
      window.clearInterval(accountStatePollTimer)
      accountStatePollTimer = null
    }
  })

  function onAccountCardPointerEnter(accountId: string): void {
    hoveredAccountId.value = accountId
  }

  function onAccountCardPointerLeave(accountId: string): void {
    if (hoveredAccountId.value === accountId) {
      hoveredAccountId.value = ''
    }
    if (removingAccountId.value === accountId) return
    if (confirmingRemoveAccountId.value === accountId) {
      confirmingRemoveAccountId.value = ''
    }
  }

  async function loadAccountsState(options: { silent?: boolean } = {}): Promise<void> {
    try {
      const result = await getAccounts()
      accounts.value = result.accounts
      if (!result.accounts.some((account) => account.accountId === hoveredAccountId.value)) {
        hoveredAccountId.value = ''
      }
      if (!result.accounts.some((account) => account.accountId === confirmingRemoveAccountId.value)) {
        confirmingRemoveAccountId.value = ''
      }
    } catch (error) {
      if (options.silent === true) return
      accountActionError.value = error instanceof Error ? error.message : t('Failed to load accounts')
    }
  }

  async function onRefreshAccounts(): Promise<void> {
    if (isRefreshingAccounts.value || isSwitchingAccounts.value || isStartingCodexLogin.value || isCompletingCodexLogin.value) return
    accountActionError.value = ''
    hoveredAccountId.value = ''
    confirmingRemoveAccountId.value = ''
    isRefreshingAccounts.value = true
    try {
      const result = await refreshAccountsFromAuth()
      accounts.value = result.accounts
      onAccountsChange()
    } catch (error) {
      accountActionError.value = error instanceof Error ? error.message : t('Failed to refresh accounts')
    } finally {
      isRefreshingAccounts.value = false
    }
  }

  async function onStartCodexLogin(): Promise<void> {
    if (isRefreshingAccounts.value || isSwitchingAccounts.value || isStartingCodexLogin.value || isCompletingCodexLogin.value) return
    accountActionError.value = ''
    codexLoginCallbackUrl.value = ''
    isStartingCodexLogin.value = true
    try {
      const loginUrl = await startCodexLogin()
      codexLoginUrl.value = loginUrl
      isCodexLoginModalOpen.value = true
      window.open(loginUrl, '_blank', 'noopener,noreferrer')
    } catch (error) {
      accountActionError.value = error instanceof Error ? error.message : t('Failed to start Codex login')
    } finally {
      isStartingCodexLogin.value = false
    }
  }

  function onCancelCodexLoginModal(): void {
    if (isCompletingCodexLogin.value) return
    isCodexLoginModalOpen.value = false
    codexLoginCallbackUrl.value = ''
  }

  async function onSubmitCodexLoginCallback(): Promise<void> {
    const callbackUrl = codexLoginCallbackUrl.value.trim()
    if (!callbackUrl) return
    await completeCodexLoginFromCallback(callbackUrl)
  }

  async function completeCodexLoginFromCallback(callbackUrl: string): Promise<void> {
    if (isCompletingCodexLogin.value || callbackUrl.length === 0) return
    accountActionError.value = ''
    isCompletingCodexLogin.value = true
    try {
      const result = await completeCodexLogin(callbackUrl)
      accounts.value = result.accounts
      codexLoginUrl.value = ''
      codexLoginCallbackUrl.value = ''
      isCodexLoginModalOpen.value = false
      onAccountsChange()
    } catch (error) {
      accountActionError.value = error instanceof Error ? error.message : t('Failed to complete Codex login')
    } finally {
      isCompletingCodexLogin.value = false
    }
  }

  async function onSwitchAccount(accountId: string): Promise<void> {
    if (isSwitchingAccounts.value || isRefreshingAccounts.value || isStartingCodexLogin.value || isCompletingCodexLogin.value) return
    if (isAccountSwitchBlocked.value) {
      accountActionError.value = t('Finish the current turn and pending requests before switching accounts.')
      return
    }
    accountActionError.value = ''
    hoveredAccountId.value = ''
    confirmingRemoveAccountId.value = ''
    isSwitchingAccounts.value = true
    try {
      const nextActiveAccount = await switchAccount(accountId)
      accounts.value = accounts.value.map((account) => (
        account.accountId === accountId
          ? nextActiveAccount
          : { ...account, isActive: false }
      ))
      onAccountsChange()
      void loadAccountsState({ silent: true })
    } catch (error) {
      accountActionError.value = error instanceof Error ? error.message : t('Failed to switch account')
    } finally {
      isSwitchingAccounts.value = false
    }
  }

  async function onRemoveAccount(accountId: string): Promise<void> {
    if (isRefreshingAccounts.value || isSwitchingAccounts.value || isStartingCodexLogin.value || isCompletingCodexLogin.value || removingAccountId.value.length > 0) return
    const targetAccount = accounts.value.find((account) => account.accountId === accountId) ?? null
    if (!targetAccount) return
    if (confirmingRemoveAccountId.value !== accountId) {
      confirmingRemoveAccountId.value = accountId
      return
    }
    if (targetAccount.isActive && isAccountSwitchBlocked.value) {
      accountActionError.value = t('Finish the current turn and pending requests before removing the active account.')
      return
    }

    const removedWasActive = targetAccount.isActive
    accountActionError.value = ''
    confirmingRemoveAccountId.value = ''
    removingAccountId.value = accountId
    try {
      const result = await removeAccount(accountId)
      accounts.value = result.accounts
      if (removedWasActive) {
        onAccountsChange()
      }
      void loadAccountsState({ silent: true })
    } catch (error) {
      accountActionError.value = error instanceof Error ? error.message : t('Failed to remove account')
    } finally {
      removingAccountId.value = ''
    }
  }

  return {
    accounts,
    isRefreshingAccounts,
    isSwitchingAccounts,
    isStartingCodexLogin,
    isCompletingCodexLogin,
    isCodexLoginModalOpen,
    codexLoginUrl,
    codexLoginCallbackUrl,
    removingAccountId,
    confirmingRemoveAccountId,
    hoveredAccountId,
    accountActionError,
    loadAccountsState,
    onRefreshAccounts,
    onStartCodexLogin,
    onCancelCodexLoginModal,
    onSubmitCodexLoginCallback,
    onSwitchAccount,
    onRemoveAccount,
    onAccountCardPointerEnter,
    onAccountCardPointerLeave,
  }
}

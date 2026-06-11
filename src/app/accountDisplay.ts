import type { UiAccountEntry, UiRateLimitWindow } from '../types/codex'
import type { TranslateFunction } from './appTypes'

export function shortAccountId(accountId: string): string {
  return accountId.length > 8 ? accountId.slice(-8) : accountId
}

export function formatAccountMeta(account: UiAccountEntry, t: TranslateFunction): string {
  const segments = [account.planType || t('unknown')]
  if (account.authMode) {
    segments.unshift(account.authMode)
  }
  return segments.join(' · ')
}

export function isPaymentRequiredErrorMessage(value: string | null): boolean {
  if (!value) return false
  const normalized = value.toLowerCase()
  return normalized.includes('payment required') || /\b402\b/.test(normalized)
}

export function isAccountUnavailable(account: UiAccountEntry): boolean {
  return account.unavailableReason === 'payment_required' || isPaymentRequiredErrorMessage(account.quotaError)
}

function pickWeeklyQuotaWindow(account: UiAccountEntry): UiRateLimitWindow | null {
  const quota = account.quotaSnapshot
  if (!quota) return null
  const windows = [quota?.primary, quota?.secondary].filter((quotaWindow): quotaWindow is UiRateLimitWindow => quotaWindow !== null)
  const exactWeekly = windows.find((quotaWindow) => quotaWindow.windowMinutes === 7 * 24 * 60)
  if (exactWeekly) return exactWeekly
  const longerWindow = windows
    .filter((quotaWindow) => typeof quotaWindow.windowMinutes === 'number' && quotaWindow.windowMinutes >= 7 * 24 * 60)
    .sort((first, second) => (first.windowMinutes ?? 0) - (second.windowMinutes ?? 0))[0] ?? null
  if (longerWindow) return longerWindow
  return quota.secondary ?? null
}

function formatResetDateCompact(resetsAt: number | null): string {
  if (typeof resetsAt !== 'number' || !Number.isFinite(resetsAt)) return ''
  const date = new Date(resetsAt * 1000)
  return `${date.getMonth() + 1}月${date.getDate()}日`
}

export function formatAccountQuota(account: UiAccountEntry, t: TranslateFunction): string {
  if (isAccountUnavailable(account)) {
    return account.quotaError || t('402 Payment Required')
  }
  const quota = account.quotaSnapshot
  const window = pickWeeklyQuotaWindow(account)
  const fallbackWindow = quota?.primary ?? quota?.secondary ?? null
  const displayWindow = window ?? fallbackWindow
  if (displayWindow) {
    const remainingPercent = Math.max(0, Math.min(100, 100 - Math.round(displayWindow.usedPercent)))
    const refreshDate = formatResetDateCompact(displayWindow.resetsAt)
    return refreshDate
      ? `${remainingPercent}% ${t('weekly remaining')} · ${refreshDate}`
      : `${remainingPercent}% ${t('weekly remaining')}`
  }
  if (quota?.credits?.unlimited) {
    return t('Unlimited credits')
  }
  if (quota?.credits?.hasCredits && quota.credits.balance) {
    return `${quota.credits.balance} ${t('credits')}`
  }
  if (account.quotaStatus === 'loading') {
    return t('Loading quota…')
  }
  if (account.quotaStatus === 'error') {
    return account.quotaError || t('Quota unavailable')
  }
  if (account.quotaStatus === 'ready' || account.quotaStatus === 'idle') {
    return t('Quota unavailable')
  }
  return t('Fetching account details…')
}

export function buildAccountTitle(account: UiAccountEntry, t: TranslateFunction): string {
  return [
    account.email || t('Account'),
    formatAccountMeta(account, t),
    isAccountUnavailable(account) ? t('Unavailable account') : null,
    formatAccountQuota(account, t),
    `${t('Workspace')} ${account.accountId}`,
  ].filter(Boolean).join('\n')
}

<template>
  <section class="sidebar-root">
    <div v-if="!isSidebarCollapsed" class="sidebar-nav-sticky">
      <SidebarThreadControls
        class="sidebar-thread-controls-host"
        :is-sidebar-collapsed="isSidebarCollapsed"
        :show-new-thread-button="false"
        @toggle-sidebar="$emit('set-sidebar-collapsed', !isSidebarCollapsed)"
        @start-new-thread="$emit('start-new-thread-toolbar')"
      />

      <SidebarMenuRow
        class="sidebar-primary-link"
        as="button"
        type="button"
        @click="$emit('start-new-thread-toolbar')"
      >
        <template #left>
          <IconCodexCompose class="sidebar-primary-link-icon" aria-hidden="true" />
        </template>
        <span class="sidebar-primary-link-title">{{ t('New conversation') }}</span>
      </SidebarMenuRow>

      <SidebarMenuRow
        class="sidebar-primary-link"
        :class="{ 'is-active': isSearchVisible }"
        as="button"
        type="button"
        @click="toggleSidebarSearch"
      >
        <template #left>
          <IconCodexSearch class="sidebar-primary-link-icon" aria-hidden="true" />
        </template>
        <span class="sidebar-primary-link-title">{{ t('Search') }}</span>
      </SidebarMenuRow>

      <div v-if="isSearchVisible" class="sidebar-search-bar">
        <IconCodexSearch class="sidebar-search-bar-icon" />
        <input
          ref="sidebarSearchInputRef"
          class="sidebar-search-input"
          type="text"
          :value="searchQuery"
          :placeholder="t('Filter threads...')"
          @input="$emit('update:searchQuery', ($event.target as HTMLInputElement).value)"
          @keydown="onSidebarSearchKeydown"
        />
        <button
          v-if="searchQuery.length > 0"
          class="sidebar-search-clear"
          type="button"
          :aria-label="t('Clear search')"
          @click="clearSidebarSearch"
        >
          <IconCodexX class="sidebar-search-clear-icon" />
        </button>
      </div>
    </div>

    <div class="sidebar-scrollable">
      <SidebarThreadTree
        v-if="!isSidebarCollapsed"
        :groups="groups"
        :project-display-name-by-id="projectDisplayNameById"
        :project-git-repo-by-name="projectGitRepoByName"
        :project-cwd-by-name="projectCwdByName"
        :selected-thread-id="selectedThreadId"
        :is-loading="isLoadingThreads"
        :is-thread-list-fully-loaded="isThreadListFullyLoaded"
        :has-more-thread-history="hasMoreThreadHistory"
        :is-loading-more-thread-history="isLoadingMoreThreadHistory"
        :search-query="searchQuery"
        :search-matched-thread-ids="searchMatchedThreadIds"
        @select="$emit('select-thread', $event)"
        @archive="$emit('archive-thread', $event)"
        @start-new-thread="$emit('start-new-thread', $event)"
        @rename-project="$emit('rename-project', $event)"
        @browse-thread-files="$emit('browse-thread-files', $event)"
        @browse-project-files="$emit('browse-project-files', $event)"
        @request-project-git-status="$emit('request-project-git-status', $event)"
        @create-project-worktree="$emit('create-project-worktree', $event)"
        @rename-thread="$emit('rename-thread', $event)"
        @fork-thread="$emit('fork-thread', $event)"
        @delete-thread="$emit('delete-thread', $event)"
        @hide-project="$emit('hide-project', $event)"
        @delete-project="$emit('delete-project', $event)"
        @reorder-project="$emit('reorder-project', $event)"
        @load-more-thread-history="$emit('load-more-thread-history')"
        @export-thread="$emit('export-thread', $event)"
        @start-new-chat="$emit('start-new-thread-toolbar')"
      />
    </div>

    <div
      v-if="!isSidebarCollapsed"
      class="sidebar-settings-area"
      @click="onSettingsAreaClick"
    >
      <Transition name="settings-panel">
        <div
          v-if="isSettingsOpen"
          ref="settingsPanelRef"
          class="sidebar-settings-panel"
          @click.stop
        >
          <div class="sidebar-settings-account-section">
            <div class="sidebar-settings-account-header">
              <div class="sidebar-settings-account-header-main">
                <button
                  class="sidebar-settings-account-collapse"
                  type="button"
                  :aria-expanded="!isAccountsSectionCollapsed"
                  :title="isAccountsSectionCollapsed ? t('Expand accounts') : t('Collapse accounts')"
                  @click="$emit('toggle-accounts-section')"
                >
                  <span class="sidebar-settings-account-collapse-icon">{{ isAccountsSectionCollapsed ? '▸' : '▾' }}</span>
                </button>
                <span class="sidebar-settings-account-title">{{ t('Accounts') }}</span>
                <span class="sidebar-settings-account-count">{{ accounts.length }}</span>
              </div>
              <button
                class="sidebar-settings-account-refresh"
                type="button"
                :disabled="isAccountOperationBusy"
                @click="$emit('refresh-accounts')"
              >
                {{ isRefreshingAccounts ? t('Reloading…') : t('Reload') }}
              </button>
            </div>
            <template v-if="!isAccountsSectionCollapsed">
              <div v-if="accountActionError" class="sidebar-settings-account-error">
                <span>{{ accountActionError }}</span>
              </div>
              <div class="sidebar-settings-account-login">
                <button
                  class="sidebar-settings-account-login-button"
                  type="button"
                  :disabled="isAccountOperationBusy"
                  @click="$emit('start-codex-login')"
                >
                  {{ isStartingCodexLogin ? t('Starting login…') : t('Login') }}
                </button>
                <a
                  v-if="codexLoginUrl"
                  class="sidebar-settings-account-login-link"
                  :href="codexLoginUrl"
                  target="_blank"
                  rel="noreferrer"
                >
                  {{ t('Open login URL') }}
                </a>
              </div>
              <p v-if="accounts.length === 0" class="sidebar-settings-account-empty">
                {{ t('Click Login, or run `codex login`, then click reload.') }}
              </p>
              <div v-else class="sidebar-settings-account-list">
                <article
                  v-for="account in accounts"
                  :key="account.accountId"
                  class="sidebar-settings-account-item"
                  :class="{
                    'is-active': account.isActive,
                    'is-unavailable': isAccountUnavailable(account),
                    'is-confirming-remove': isRemoveConfirmationActive(account),
                    'is-remove-visible': isRemoveVisible(account),
                  }"
                  :title="buildAccountTitle(account, t)"
                  @mouseenter="$emit('account-pointer-enter', account.accountId)"
                  @mouseleave="$emit('account-pointer-leave', account.accountId)"
                >
                  <div class="sidebar-settings-account-main">
                    <p class="sidebar-settings-account-email">{{ account.email || t('Account') }}</p>
                    <p class="sidebar-settings-account-meta">
                      {{ formatAccountMeta(account, t) }}
                    </p>
                    <p class="sidebar-settings-account-quota">
                      {{ formatAccountQuota(account, t) }}
                    </p>
                    <p class="sidebar-settings-account-id">
                      Workspace {{ shortAccountId(account.accountId) }}
                    </p>
                  </div>
                  <div class="sidebar-settings-account-actions">
                    <button
                      class="sidebar-settings-account-switch"
                      type="button"
                      :disabled="isAccountActionDisabled(account) || account.isActive || isAccountUnavailable(account)"
                      @click="$emit('switch-account', account.accountId)"
                    >
                      {{ getAccountSwitchLabel(account) }}
                    </button>
                    <button
                      class="sidebar-settings-account-remove"
                      :class="{
                        'is-visible': isRemoveVisible(account),
                        'is-confirming': isRemoveConfirmationActive(account),
                      }"
                      type="button"
                      :disabled="isAccountActionDisabled(account)"
                      @click="$emit('remove-account', account.accountId)"
                    >
                      {{ getAccountRemoveLabel(account) }}
                    </button>
                  </div>
                </article>
              </div>
            </template>
          </div>
          <div class="sidebar-settings-model-catalog">
            <button
              class="sidebar-settings-account-header sidebar-settings-model-catalog-toggle"
              type="button"
              :aria-expanded="isModelCatalogOpen"
              @click="isModelCatalogOpen = !isModelCatalogOpen"
            >
              <span class="sidebar-settings-account-header-main">
                <span class="sidebar-settings-account-collapse-icon">{{ isModelCatalogOpen ? '▾' : '▸' }}</span>
                <span class="sidebar-settings-account-title">{{ t('Model catalog') }}</span>
              </span>
              <span class="sidebar-settings-value">{{ modelCatalogStatusText }}</span>
            </button>
            <div v-if="isModelCatalogOpen" class="sidebar-settings-model-catalog-panel">
              <label class="sidebar-settings-field">
                <span class="sidebar-settings-field-label">{{ t('Catalog JSON') }}</span>
                <textarea
                  class="sidebar-settings-textarea sidebar-settings-model-catalog-textarea"
                  rows="8"
                  :value="modelCatalogConfigText"
                  spellcheck="false"
                  @input="$emit('update:modelCatalogConfigText', ($event.target as HTMLTextAreaElement).value)"
                />
              </label>
              <div v-if="modelCatalogConfigPath" class="sidebar-settings-model-catalog-path" :title="modelCatalogConfigPath">
                {{ modelCatalogConfigPath }}
              </div>
              <div v-if="modelCatalogConfigError" class="sidebar-settings-telegram-error">
                <span>{{ modelCatalogConfigError }}</span>
              </div>
              <div class="sidebar-settings-model-catalog-actions">
                <button
                  class="sidebar-settings-telegram-save"
                  type="button"
                  :disabled="isModelCatalogSaving"
                  @click="$emit('save-model-catalog-config')"
                >
                  {{ isModelCatalogSaving ? t('Saving…') : t('Save catalog') }}
                </button>
              </div>
              <div class="sidebar-settings-model-catalog-preview">
                <div
                  v-for="option in modelCatalogVisibleOptions"
                  :key="option.id"
                  class="sidebar-settings-model-catalog-item"
                  :class="{ 'is-hidden': option.isHidden }"
                >
                  <span class="sidebar-settings-model-catalog-label">{{ option.label }}</span>
                  <span class="sidebar-settings-model-catalog-meta">
                    {{ option.id }} · {{ option.source }}{{ option.isHidden ? ` · ${t('hidden')}` : '' }}
                  </span>
                </div>
                <div v-if="modelCatalogOptions.length > modelCatalogVisibleOptions.length" class="sidebar-settings-model-catalog-more">
                  {{ t('{count} more', { count: modelCatalogOptions.length - modelCatalogVisibleOptions.length }) }}
                </div>
              </div>
            </div>
          </div>
          <div class="sidebar-settings-codex-cli">
            <div class="sidebar-settings-account-header">
              <span class="sidebar-settings-account-title">{{ t('Codex CLI') }}</span>
              <button
                class="sidebar-settings-codex-cli-restart"
                :class="{ 'is-confirming': isCodexCliRestartConfirming }"
                type="button"
                :disabled="isRestartingCodexCli"
                @click="$emit('restart-codex-cli')"
              >
                {{ isRestartingCodexCli ? t('Restarting…') : isCodexCliRestartConfirming ? t('Confirm restart') : t('Restart Codex CLI') }}
              </button>
            </div>
            <div
              v-if="codexCliRestartError || codexCliRestartMessage"
              class="sidebar-settings-codex-cli-message"
              :data-state="codexCliRestartError ? 'error' : isCodexCliRestartConfirming ? 'warning' : 'success'"
            >
              {{ t(codexCliRestartError || codexCliRestartMessage) }}
            </div>
          </div>
          <div class="sidebar-settings-row sidebar-settings-row--switch" :title="settingsHelp.sendWithEnter">
            <span class="sidebar-settings-label">{{ t('Require ⌘ + enter to send') }}</span>
            <CodexSwitch
              :checked="!sendWithEnter"
              :ariaLabel="t('Require ⌘ + enter to send')"
              @update:checked="$emit('toggle-send-with-enter')"
            />
          </div>
          <button class="sidebar-settings-row" type="button" :title="settingsHelp.inProgressSendMode" @click="$emit('cycle-in-progress-send-mode')">
            <span class="sidebar-settings-label">{{ t('When busy, send as') }}</span>
            <span class="sidebar-settings-value">{{ inProgressSendMode === 'steer' ? t('Steer') : t('Queue') }}</span>
          </button>
          <button class="sidebar-settings-row" type="button" :title="settingsHelp.appearance" @click="$emit('cycle-dark-mode')">
            <span class="sidebar-settings-label">{{ t('Appearance') }}</span>
            <span class="sidebar-settings-value">{{ darkMode === 'system' ? t('System') : darkMode === 'dark' ? t('Dark') : t('Light') }}</span>
          </button>
          <div class="sidebar-settings-row sidebar-settings-row--select" :title="t('Choose the interface language for the app.')">
            <span class="sidebar-settings-label">{{ t('UI language') }}</span>
            <select
              class="sidebar-settings-language-select"
              :value="uiLanguage"
              @change="$emit('set-ui-language', ($event.target as HTMLSelectElement).value as UiLanguage)"
            >
              <option v-for="option in uiLanguageOptions" :key="option.value" :value="option.value">{{ option.label }}</option>
            </select>
          </div>
          <button class="sidebar-settings-row" type="button" :title="settingsHelp.chatWidth" @click="$emit('cycle-chat-width')">
            <span class="sidebar-settings-label">{{ t('Chat width') }}</span>
            <span class="sidebar-settings-value">{{ chatWidthLabel }}</span>
          </button>
          <div class="sidebar-settings-row sidebar-settings-row--switch" :title="settingsHelp.textAnimations">
            <span class="sidebar-settings-label">{{ t('Text shimmer animations') }}</span>
            <CodexSwitch
              :checked="textAnimationsEnabled"
              :ariaLabel="t('Text shimmer animations')"
              @update:checked="$emit('toggle-text-animations')"
            />
          </div>
          <div class="sidebar-settings-row sidebar-settings-row--switch" :title="settingsHelp.liveReasoningText">
            <span class="sidebar-settings-label">{{ t('Live reasoning summary') }}</span>
            <CodexSwitch
              :checked="liveReasoningTextEnabled"
              :ariaLabel="t('Live reasoning summary')"
              @update:checked="$emit('toggle-live-reasoning-text')"
            />
          </div>
          <div class="sidebar-settings-row sidebar-settings-row--switch" :title="settingsHelp.dictationEnabled">
            <span class="sidebar-settings-label">{{ t('Voice input') }}</span>
            <CodexSwitch
              :checked="dictationEnabled"
              :ariaLabel="t('Voice input')"
              @update:checked="$emit('toggle-dictation-enabled')"
            />
          </div>
          <div class="sidebar-settings-row sidebar-settings-row--switch" :title="settingsHelp.dictationClickToToggle">
            <span class="sidebar-settings-label">{{ t('Click to toggle dictation') }}</span>
            <CodexSwitch
              :checked="dictationClickToToggle"
              :ariaLabel="t('Click to toggle dictation')"
              @update:checked="$emit('toggle-dictation-click-to-toggle')"
            />
          </div>
          <div class="sidebar-settings-row sidebar-settings-row--switch" :title="settingsHelp.dictationAutoSend">
            <span class="sidebar-settings-label">{{ t('Auto send dictation') }}</span>
            <CodexSwitch
              :checked="dictationAutoSend"
              :ariaLabel="t('Auto send dictation')"
              @update:checked="$emit('toggle-dictation-auto-send')"
            />
          </div>
          <div class="sidebar-settings-row sidebar-settings-row--select" :title="settingsHelp.dictationLanguage">
            <span class="sidebar-settings-label">{{ t('Dictation language') }}</span>
            <ComposerDropdown
              class="sidebar-settings-language-dropdown"
              :model-value="dictationLanguage"
              :options="dictationLanguageOptions"
              :placeholder="t('Auto-detect')"
              open-direction="up"
              :enable-search="true"
              :search-placeholder="t('Search language...')"
              @update:model-value="$emit('update:dictationLanguage', $event)"
            />
          </div>
          <button class="sidebar-settings-row" type="button" aria-live="polite" @click="$emit('update:isTelegramConfigOpen', !isTelegramConfigOpen)">
            <span class="sidebar-settings-label">{{ t('Telegram') }}</span>
            <span class="sidebar-settings-value">{{ telegramStatusText }}</span>
          </button>
          <div v-if="isTelegramConfigOpen" class="sidebar-settings-telegram-panel">
            <label class="sidebar-settings-field">
              <span class="sidebar-settings-field-label">{{ t('Bot token') }}</span>
              <input
                class="sidebar-settings-input"
                type="password"
                :value="telegramBotTokenDraft"
                placeholder="123456:ABCDEF"
                autocomplete="off"
                spellcheck="false"
                @input="$emit('update:telegramBotTokenDraft', ($event.target as HTMLInputElement).value)"
              >
            </label>
            <label class="sidebar-settings-field">
              <span class="sidebar-settings-field-label">{{ t('Allowed Telegram user IDs') }}</span>
              <textarea
                class="sidebar-settings-textarea"
                rows="3"
                :value="telegramAllowedUserIdsDraft"
                placeholder="123456789&#10;987654321"
                spellcheck="false"
                @input="$emit('update:telegramAllowedUserIdsDraft', ($event.target as HTMLTextAreaElement).value)"
              />
            </label>
            <div class="sidebar-settings-field-help">
              {{ t('Put one Telegram user ID per line or separate them with commas. Use `*` to allow all Telegram users. Unauthorized users will see their own ID in the rejection message so they can copy it here.') }}
            </div>
            <div v-if="telegramConfigError" class="sidebar-settings-telegram-error">
              <span>{{ telegramConfigError }}</span>
            </div>
            <div class="sidebar-settings-telegram-actions">
              <button
                class="sidebar-settings-telegram-save"
                type="button"
                :disabled="isTelegramSaving"
                @click="$emit('save-telegram-config')"
              >
                {{ isTelegramSaving ? t('Saving…') : t('Save Telegram config') }}
              </button>
            </div>
          </div>
          <div
            v-if="showThreadContextBadge"
            class="sidebar-settings-row sidebar-settings-context-row"
            :data-state="threadContextBadgeState"
            :title="threadContextTooltip"
          >
            <span class="sidebar-settings-label">{{ t('Context') }}</span>
            <span class="sidebar-settings-context-value" :data-state="threadContextBadgeState">
              {{ threadContextPrimaryText }}
              <span class="sidebar-settings-context-meta">{{ threadContextSecondaryText }}</span>
            </span>
          </div>
          <div class="sidebar-settings-rate-limits">
            <RateLimitStatus :snapshots="accountRateLimitSnapshots" />
          </div>
          <div class="sidebar-settings-build-label" :aria-label="t('Worktree name and version')">
            WT {{ worktreeName }} · v{{ appVersion }}
          </div>
        </div>
      </Transition>
      <button
        ref="settingsButtonRef"
        class="sidebar-settings-button"
        type="button"
        @click.stop="$emit('update:isSettingsOpen', !isSettingsOpen)"
      >
        <IconCodexSettingsCog class="sidebar-settings-icon" />
        <span>{{ t('Settings') }}</span>
      </button>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref } from 'vue'
import type { buildSettingsHelp } from '../../app/appConfig'
import type { DarkModePreference, InProgressSendMode } from '../../app/appTypes'
import type { UiLanguage } from '../../composables/useUiLanguage'
import { useUiLanguage } from '../../composables/useUiLanguage'
import type { UiAccountEntry, UiModelOption, UiProjectGroup, UiRateLimitSnapshot } from '../../types/codex'
import {
  buildAccountTitle,
  formatAccountMeta,
  formatAccountQuota,
  isAccountUnavailable,
  shortAccountId,
} from '../../app/accountDisplay'
import ComposerDropdown from '../content/ComposerDropdown.vue'
import RateLimitStatus from '../content/RateLimitStatus.vue'
import {
  IconCodexCompose,
  IconCodexSearch,
  IconCodexSettingsCog,
  IconCodexX,
} from '../icons/codex'
import CodexSwitch from '../ui/CodexSwitch.vue'
import SidebarMenuRow from './SidebarMenuRow.vue'
import SidebarThreadControls from './SidebarThreadControls.vue'
import SidebarThreadTree from './SidebarThreadTree.vue'

const props = defineProps<{
  isSidebarCollapsed: boolean
  groups: UiProjectGroup[]
  projectDisplayNameById: Record<string, string>
  projectGitRepoByName: Record<string, boolean>
  projectCwdByName: Record<string, string>
  selectedThreadId: string
  isLoadingThreads: boolean
  isThreadListFullyLoaded: boolean
  hasMoreThreadHistory: boolean
  isLoadingMoreThreadHistory: boolean
  searchQuery: string
  isSearchVisible: boolean
  searchMatchedThreadIds: string[] | null
  isSettingsOpen: boolean
  accounts: UiAccountEntry[]
  isAccountsSectionCollapsed: boolean
  isRefreshingAccounts: boolean
  isSwitchingAccounts: boolean
  isStartingCodexLogin: boolean
  isCompletingCodexLogin: boolean
  isAccountSwitchBlocked: boolean
  removingAccountId: string
  confirmingRemoveAccountId: string
  hoveredAccountId: string
  accountActionError: string
  codexLoginUrl: string
  settingsHelp: ReturnType<typeof buildSettingsHelp>
  sendWithEnter: boolean
  inProgressSendMode: InProgressSendMode
  darkMode: DarkModePreference
  uiLanguage: UiLanguage
  uiLanguageOptions: Array<{ value: UiLanguage; label: string }>
  chatWidthLabel: string
  textAnimationsEnabled: boolean
  liveReasoningTextEnabled: boolean
  dictationEnabled: boolean
  dictationClickToToggle: boolean
  dictationAutoSend: boolean
  dictationLanguage: string
  dictationLanguageOptions: Array<{ value: string; label: string }>
  isTelegramConfigOpen: boolean
  telegramBotTokenDraft: string
  telegramAllowedUserIdsDraft: string
  telegramConfigError: string
  isTelegramSaving: boolean
  telegramStatusText: string
  modelCatalogConfigText: string
  modelCatalogConfigPath: string
  modelCatalogConfigError: string
  modelCatalogOptions: UiModelOption[]
  isModelCatalogSaving: boolean
  isCodexCliRestartConfirming: boolean
  isRestartingCodexCli: boolean
  codexCliRestartMessage: string
  codexCliRestartError: string
  showThreadContextBadge: boolean
  threadContextBadgeState: string
  threadContextTooltip: string
  threadContextPrimaryText: string
  threadContextSecondaryText: string
  accountRateLimitSnapshots: UiRateLimitSnapshot[]
  worktreeName: string
  appVersion: string
}>()

const emit = defineEmits<{
  'set-sidebar-collapsed': [value: boolean]
  'start-new-thread-toolbar': []
  'update:searchQuery': [value: string]
  'update:isSearchVisible': [value: boolean]
  'select-thread': [threadId: string]
  'archive-thread': [threadId: string]
  'start-new-thread': [projectName: string]
  'rename-project': [payload: { projectName: string; displayName: string }]
  'browse-thread-files': [threadId: string]
  'browse-project-files': [projectName: string]
  'request-project-git-status': [projectName: string]
  'create-project-worktree': [projectName: string]
  'rename-thread': [payload: { threadId: string; title: string }]
  'fork-thread': [threadId: string]
  'delete-thread': [threadId: string]
  'hide-project': [projectName: string]
  'delete-project': [projectName: string]
  'reorder-project': [payload: { projectName: string; toIndex: number }]
  'load-more-thread-history': []
  'export-thread': [threadId: string]
  'update:isSettingsOpen': [value: boolean]
  'toggle-accounts-section': []
  'refresh-accounts': []
  'start-codex-login': []
  'account-pointer-enter': [accountId: string]
  'account-pointer-leave': [accountId: string]
  'switch-account': [accountId: string]
  'remove-account': [accountId: string]
  'toggle-send-with-enter': []
  'cycle-in-progress-send-mode': []
  'cycle-dark-mode': []
  'set-ui-language': [value: UiLanguage]
  'cycle-chat-width': []
  'toggle-text-animations': []
  'toggle-live-reasoning-text': []
  'toggle-dictation-enabled': []
  'toggle-dictation-click-to-toggle': []
  'toggle-dictation-auto-send': []
  'update:dictationLanguage': [value: string]
  'update:isTelegramConfigOpen': [value: boolean]
  'update:telegramBotTokenDraft': [value: string]
  'update:telegramAllowedUserIdsDraft': [value: string]
  'update:modelCatalogConfigText': [value: string]
  'save-model-catalog-config': []
  'restart-codex-cli': []
  'save-telegram-config': []
}>()

const { t } = useUiLanguage()
const sidebarSearchInputRef = ref<HTMLInputElement | null>(null)
const settingsPanelRef = ref<HTMLElement | null>(null)
const settingsButtonRef = ref<HTMLElement | null>(null)
const isModelCatalogOpen = ref(false)

const isAccountOperationBusy = computed(() =>
  props.isRefreshingAccounts
    || props.isSwitchingAccounts
    || props.isStartingCodexLogin
    || props.isCompletingCodexLogin,
)
const modelCatalogVisibleOptions = computed(() => props.modelCatalogOptions.slice(0, 8))
const modelCatalogHiddenCount = computed(() => props.modelCatalogOptions.filter((option) => option.isHidden).length)
const modelCatalogStatusText = computed(() =>
  `${props.modelCatalogOptions.length} ${t('models')}${modelCatalogHiddenCount.value > 0 ? `, ${modelCatalogHiddenCount.value} ${t('hidden')}` : ''}`,
)

onMounted(() => {
  document.addEventListener('pointerdown', onDocumentPointerDown)
})

onUnmounted(() => {
  document.removeEventListener('pointerdown', onDocumentPointerDown)
})

function toggleSidebarSearch(): void {
  const nextValue = !props.isSearchVisible
  emit('update:isSearchVisible', nextValue)
  if (nextValue) {
    void nextTick(() => sidebarSearchInputRef.value?.focus())
  } else {
    emit('update:searchQuery', '')
  }
}

function clearSidebarSearch(): void {
  emit('update:searchQuery', '')
  sidebarSearchInputRef.value?.focus()
}

function onSidebarSearchKeydown(event: KeyboardEvent): void {
  if (event.key === 'Escape') {
    emit('update:isSearchVisible', false)
    emit('update:searchQuery', '')
  }
}

function onDocumentPointerDown(event: PointerEvent): void {
  const target = event.target
  if (!(target instanceof Node)) return
  if (!props.isSettingsOpen) return
  if (settingsPanelRef.value?.contains(target)) return
  if (settingsButtonRef.value?.contains(target)) return
  if (isSettingsPortalTarget(target)) return
  emit('update:isSettingsOpen', false)
}

function onSettingsAreaClick(event: MouseEvent): void {
  if (!props.isSettingsOpen) return
  const target = event.target
  if (!(target instanceof Node)) return
  if (settingsPanelRef.value?.contains(target)) return
  if (settingsButtonRef.value?.contains(target)) return
  emit('update:isSettingsOpen', false)
}

function isSettingsPortalTarget(target: Node): boolean {
  const targetElement = target instanceof Element ? target : target.parentElement
  return Boolean(targetElement?.closest('.composer-dropdown-menu-wrap'))
}

function isAccountActionDisabled(account: UiAccountEntry): boolean {
  return isAccountOperationBusy.value || props.removingAccountId.length > 0
    || (account.isActive && props.removingAccountId !== account.accountId && props.isAccountSwitchBlocked)
}

function isRemoveConfirmationActive(account: UiAccountEntry): boolean {
  return props.confirmingRemoveAccountId === account.accountId
}

function isRemoveVisible(account: UiAccountEntry): boolean {
  return props.hoveredAccountId === account.accountId || isRemoveConfirmationActive(account)
}

function getAccountSwitchLabel(account: UiAccountEntry): string {
  if (isAccountUnavailable(account)) return t('Unavailable')
  if (account.isActive) return t('Active')
  if (props.isSwitchingAccounts) return t('Switching…')
  return t('Switch')
}

function getAccountRemoveLabel(account: UiAccountEntry): string {
  if (props.removingAccountId === account.accountId) return t('Removing…')
  if (isRemoveConfirmationActive(account)) return t('Click again to remove')
  return t('Remove')
}
</script>

<style scoped>
@reference "tailwindcss";

.sidebar-root {
  @apply h-full flex flex-col select-none transition-colors;
  background-color: transparent;
}

.sidebar-root input,
.sidebar-root textarea {
  @apply select-text;
}

.sidebar-nav-sticky {
  @apply shrink-0 px-2 pt-4 pb-2 flex flex-col gap-2;
}

.sidebar-scrollable {
  @apply flex-1 min-h-0 overflow-y-auto px-2 pb-4 flex flex-col gap-2;
  background-color: transparent;
}

.sidebar-thread-controls-host {
  @apply mt-1 -translate-y-px px-2 pb-1;
}

.sidebar-search-bar {
  @apply flex items-center gap-1.5 mx-2 px-2 py-1 rounded-md border border-zinc-200 bg-white transition-colors focus-within:border-zinc-400;
}

.sidebar-search-bar-icon {
  @apply w-3.5 h-3.5 text-zinc-400 shrink-0;
}

.sidebar-search-input {
  @apply flex-1 min-w-0 bg-transparent text-sm text-zinc-800 placeholder-zinc-400 outline-none border-none p-0;
}

.sidebar-search-clear {
  @apply w-4 h-4 rounded text-zinc-400 flex items-center justify-center transition hover:text-zinc-600;
}

.sidebar-search-clear-icon {
  @apply w-3.5 h-3.5;
}

.sidebar-primary-link {
  @apply mx-2 min-h-8 rounded-lg border border-transparent px-2 py-1 text-left transition cursor-pointer;
  background-color: transparent;
  color: var(--codex-muted-text);
}

.sidebar-primary-link:hover {
  background-color: var(--codex-control-hover);
  color: var(--codex-text);
}

.sidebar-primary-link.is-active {
  @apply border-transparent;
  background-color: var(--codex-control-hover);
  color: var(--codex-text);
}

.sidebar-primary-link-icon {
  @apply h-4 w-4 shrink-0;
  color: var(--codex-muted-text);
}

.sidebar-primary-link:hover .sidebar-primary-link-icon,
.sidebar-primary-link.is-active .sidebar-primary-link-icon {
  color: var(--codex-text);
}

.sidebar-primary-link-title {
  @apply truncate text-sm font-normal leading-5;
  color: currentColor;
}

.sidebar-settings-area {
  @apply shrink-0 pt-2 px-2 pb-2;
  background-color: transparent;
}

.sidebar-settings-button {
  @apply flex items-center gap-2 w-full rounded-lg border-0 bg-transparent px-2 py-2 text-sm transition cursor-pointer;
  color: var(--codex-muted-text);
}

.sidebar-settings-button:hover {
  background-color: var(--codex-control-hover);
  color: var(--codex-text);
}

.sidebar-settings-icon {
  @apply w-4.5 h-4.5;
}

.sidebar-settings-panel {
  @apply mb-1 max-h-[min(70vh,36rem)] overflow-y-auto rounded-lg border;
  border-color: var(--codex-border-heavy);
  background-color: var(--codex-panel-surface);
}

.sidebar-settings-row {
  @apply flex items-center justify-between w-full px-3 py-2.5 text-sm border-0 bg-transparent transition cursor-pointer;
  color: var(--codex-text);
}

.sidebar-settings-row:hover {
  background-color: var(--codex-control-hover);
}

.sidebar-settings-row--select {
  @apply cursor-default items-center gap-2;
}

.sidebar-settings-row--switch {
  @apply cursor-default;
}

.sidebar-settings-language-dropdown {
  @apply min-w-0 max-w-52;
}

.sidebar-settings-language-dropdown :deep(.composer-dropdown-trigger) {
  @apply h-auto rounded-md border px-2 py-1 text-xs;
  border-color: var(--codex-border-heavy);
  background-color: var(--codex-control-bg);
  color: var(--codex-text);
}

.sidebar-settings-language-dropdown :deep(.composer-dropdown-value) {
  @apply max-w-32;
}

.sidebar-settings-row + .sidebar-settings-row {
  @apply border-t;
  border-color: var(--codex-border);
}

.sidebar-settings-telegram-panel {
  @apply border-t px-3 py-3;
  border-color: var(--codex-border);
  background-color: var(--codex-surface);
}

.sidebar-settings-field {
  @apply flex flex-col gap-1.5;
}

.sidebar-settings-field + .sidebar-settings-field {
  @apply mt-3;
}

.sidebar-settings-field-label {
  @apply text-xs font-medium;
  color: var(--codex-text);
}

.sidebar-settings-input,
.sidebar-settings-textarea {
  @apply w-full rounded-md border px-2.5 py-2 text-sm outline-none transition;
  color-scheme: light dark;
  border-color: var(--codex-border-heavy);
  background-color: var(--codex-control-bg);
  color: var(--codex-text);
}

.sidebar-settings-input:focus,
.sidebar-settings-textarea:focus {
  border-color: var(--codex-border-heavy);
  box-shadow: 0 0 0 2px var(--codex-focus-ring);
}

.sidebar-settings-textarea {
  @apply min-h-20 resize-y font-mono text-xs;
}

.sidebar-settings-field-help {
  @apply mt-2 text-xs leading-5;
  color: var(--codex-muted-text);
}

.sidebar-settings-telegram-error {
  @apply mt-2 rounded-md bg-rose-50 px-2.5 py-2 text-xs text-zinc-700;
}

.sidebar-settings-telegram-actions {
  @apply mt-3 flex items-center justify-end;
}

.sidebar-settings-model-catalog {
  @apply border-t px-3 py-3;
  border-color: var(--codex-border);
  background-color: var(--codex-surface);
}

.sidebar-settings-model-catalog-toggle {
  @apply mb-0 w-full border-0 bg-transparent p-0 text-left cursor-pointer;
}

.sidebar-settings-model-catalog-panel {
  @apply mt-3;
}

.sidebar-settings-model-catalog-textarea {
  @apply min-h-36;
}

.sidebar-settings-model-catalog-path {
  @apply mt-2 truncate text-[11px];
  color: var(--codex-muted-text);
}

.sidebar-settings-model-catalog-actions {
  @apply mt-3 flex items-center justify-end;
}

.sidebar-settings-model-catalog-preview {
  @apply mt-3 flex flex-col gap-1.5;
}

.sidebar-settings-model-catalog-item {
  @apply min-w-0 rounded-md border px-2 py-1.5;
  border-color: var(--codex-border);
  background-color: var(--codex-panel-surface);
}

.sidebar-settings-model-catalog-item.is-hidden {
  @apply opacity-75;
  border-color: var(--codex-border);
  background-color: var(--codex-subtle-surface);
}

.sidebar-settings-codex-cli {
  @apply border-t px-3 py-3;
  border-color: var(--codex-border);
  background-color: var(--codex-surface);
}

.sidebar-settings-codex-cli-restart {
  @apply shrink-0 rounded-full border px-3 py-1.5 text-xs font-medium transition disabled:cursor-default disabled:opacity-60;
  border-color: var(--codex-border-heavy);
  background-color: var(--codex-control-bg);
  color: var(--codex-text);
}

.sidebar-settings-codex-cli-restart:hover {
  background-color: var(--codex-control-hover);
}

.sidebar-settings-codex-cli-restart.is-confirming {
  @apply border-amber-300 bg-amber-50 text-amber-800 hover:bg-amber-100;
}

.sidebar-settings-codex-cli-message {
  @apply rounded-md px-2.5 py-2 text-xs leading-5 text-zinc-700;
}

.sidebar-settings-codex-cli-message[data-state='success'] {
  background-color: var(--codex-success-bg);
  color: var(--codex-success-fg);
}

.sidebar-settings-codex-cli-message[data-state='warning'] {
  @apply bg-amber-50 text-amber-800;
}

.sidebar-settings-codex-cli-message[data-state='error'] {
  @apply bg-rose-50 text-zinc-700;
}

.sidebar-settings-model-catalog-label {
  @apply block truncate text-xs font-medium;
  color: var(--codex-text);
}

.sidebar-settings-model-catalog-meta,
.sidebar-settings-model-catalog-more {
  @apply block truncate text-[11px];
  color: var(--codex-muted-text);
}

.sidebar-settings-telegram-save {
  @apply rounded-full border px-3 py-1.5 text-xs font-medium transition disabled:cursor-default disabled:opacity-60;
  border-color: var(--codex-border-heavy);
  background-color: var(--codex-control-bg);
  color: var(--codex-text);
}

.sidebar-settings-telegram-save:hover {
  background-color: var(--codex-control-hover);
}

.sidebar-settings-account-section {
  @apply border-t px-3 py-3;
  border-color: var(--codex-border);
  background-color: var(--codex-surface);
}

.sidebar-settings-account-header {
  @apply mb-2 flex items-center justify-between gap-2;
}

.sidebar-settings-account-header-main {
  @apply flex items-center gap-2;
}

.sidebar-settings-account-collapse {
  @apply inline-flex h-5 w-5 items-center justify-center rounded border transition;
  border-color: var(--codex-border-heavy);
  background-color: var(--codex-control-bg);
  color: var(--codex-text);
}

.sidebar-settings-account-collapse:hover {
  background-color: var(--codex-control-hover);
}

.sidebar-settings-account-collapse-icon {
  @apply text-[11px] leading-none;
}

.sidebar-settings-account-title {
  @apply text-sm font-medium;
  color: var(--codex-text);
}

.sidebar-settings-account-count {
  @apply rounded px-1.5 py-0.5 text-[11px];
  background-color: var(--codex-subtle-surface);
  color: var(--codex-text);
}

.sidebar-settings-account-error {
  @apply mb-2 rounded-md bg-rose-50 px-2 py-1.5 text-xs text-zinc-700;
}

.sidebar-settings-account-refresh {
  @apply shrink-0 rounded-full border px-2.5 py-1 text-xs transition disabled:cursor-default disabled:opacity-60;
  border-color: var(--codex-border-heavy);
  background-color: var(--codex-control-bg);
  color: var(--codex-text);
}

.sidebar-settings-account-refresh:hover {
  background-color: var(--codex-control-hover);
}

.sidebar-settings-account-login {
  @apply mb-2 flex items-center gap-2;
}

.sidebar-settings-account-login-button {
  @apply shrink-0 rounded-full border px-3 py-1 text-xs font-medium transition disabled:cursor-default disabled:opacity-60;
  border-color: var(--codex-border-heavy);
  background-color: var(--codex-control-bg);
  color: var(--codex-text);
}

.sidebar-settings-account-login-button:hover {
  background-color: var(--codex-control-hover);
}

.sidebar-settings-account-login-link {
  @apply min-w-0 truncate text-xs text-blue-600 hover:text-blue-700 hover:underline;
}

.sidebar-settings-account-empty {
  @apply text-xs;
  color: var(--codex-muted-text);
}

.sidebar-settings-account-list {
  @apply flex flex-col gap-2;
}

.sidebar-settings-account-item {
  @apply flex items-center gap-2 rounded-lg border px-2.5 py-2;
  border-color: var(--codex-border);
  background-color: var(--codex-surface);
}

.sidebar-settings-account-item.is-active {
  border-color: var(--codex-selected-border);
  background-color: var(--codex-selected-surface);
}

.sidebar-settings-account-item.is-unavailable {
  @apply border-rose-200 bg-rose-50;
}

.sidebar-settings-account-main {
  @apply min-w-0 flex-1;
}

.sidebar-settings-account-actions {
  @apply flex w-24 shrink-0 flex-col items-end gap-1.5;
}

.sidebar-settings-account-email {
  @apply truncate text-sm;
  color: var(--codex-text);
}

.sidebar-settings-account-meta {
  @apply truncate text-[11px];
  color: var(--codex-muted-text);
}

.sidebar-settings-account-quota {
  @apply truncate text-[11px];
  color: var(--codex-text);
}

.sidebar-settings-account-id {
  @apply mt-1 inline-flex max-w-full rounded-full px-2 py-0.5 font-mono text-[11px];
  background-color: var(--codex-subtle-surface);
  color: var(--codex-text);
}

.sidebar-settings-account-item.is-active .sidebar-settings-account-id {
  background-color: var(--codex-primary-subtle-bg);
  color: var(--codex-primary-subtle-fg);
}

.sidebar-settings-account-item.is-unavailable .sidebar-settings-account-id {
  @apply bg-rose-100 text-zinc-700;
}

.sidebar-settings-account-switch {
  @apply min-w-[4.75rem] shrink-0 rounded-full border px-2.5 py-1 text-center text-xs transition disabled:cursor-default disabled:opacity-60;
  border-color: var(--codex-border-heavy);
  background-color: var(--codex-control-bg);
  color: var(--codex-text);
}

.sidebar-settings-account-switch:hover {
  background-color: var(--codex-control-hover);
}

.sidebar-settings-account-remove {
  @apply invisible shrink-0 rounded-full border border-amber-200 bg-white px-2 py-0.5 text-[10px] leading-4 text-zinc-500 opacity-0 pointer-events-none transition-colors hover:bg-amber-50 disabled:cursor-default disabled:opacity-60;
}

.sidebar-settings-account-remove.is-visible {
  @apply visible opacity-100 pointer-events-auto;
}

.sidebar-settings-account-remove.is-confirming {
  @apply border-amber-300 bg-amber-50 text-amber-700 font-medium;
}

.sidebar-settings-label {
  @apply text-left;
}

.sidebar-settings-value {
  @apply text-xs rounded px-1.5 py-0.5;
  background-color: var(--codex-subtle-surface);
  color: var(--codex-muted-text);
}

.sidebar-settings-language-select {
  @apply min-w-0 max-w-40 rounded-md border px-2 py-1 text-xs outline-none transition-colors cursor-pointer;
  color-scheme: light dark;
  border-color: var(--codex-border-heavy);
  background-color: var(--codex-control-bg);
  color: var(--codex-text);
}

.sidebar-settings-language-select:focus {
  border-color: var(--codex-border-heavy);
  box-shadow: 0 0 0 2px var(--codex-focus-ring);
}

.sidebar-settings-language-select option {
  background-color: var(--codex-popover-surface);
  color: var(--codex-text);
}

.settings-panel-enter-active,
.settings-panel-leave-active {
  transition: all 150ms ease;
}

.settings-panel-enter-from,
.settings-panel-leave-to {
  opacity: 0;
  transform: translateY(8px);
}

.sidebar-settings-context-row {
  @apply cursor-default;
}

.sidebar-settings-context-value {
  @apply text-xs font-semibold text-right;
  color: var(--codex-text);
}

.sidebar-settings-context-value[data-state='ok'] {
  color: var(--codex-success-fg);
}

.sidebar-settings-context-value[data-state='warning'] {
  @apply text-amber-700;
}

.sidebar-settings-context-value[data-state='danger'] {
  @apply text-zinc-700;
}

.sidebar-settings-context-meta {
  @apply block text-[11px] font-normal;
  color: var(--codex-muted-text);
}

.sidebar-settings-rate-limits {
  @apply border-t px-2 pt-2;
  border-color: var(--codex-border);
}

.sidebar-settings-build-label {
  @apply border-t px-3 py-2 text-[11px];
  border-color: var(--codex-border);
  color: var(--codex-muted-text);
}
</style>

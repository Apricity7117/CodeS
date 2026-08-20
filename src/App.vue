<template>
  <DesktopLayout :is-sidebar-collapsed="isSidebarCollapsed" @close-sidebar="setSidebarCollapsed(true)">
    <template #sidebar>
      <AppSidebar
        v-model:search-query="sidebarSearchQuery"
        v-model:is-search-visible="isSidebarSearchVisible"
        v-model:is-settings-open="isSettingsOpen"
        v-model:dictation-language="dictationLanguage"
        v-model:is-telegram-config-open="isTelegramConfigOpen"
        v-model:telegram-bot-token-draft="telegramBotTokenDraft"
        v-model:telegram-allowed-user-ids-draft="telegramAllowedUserIdsDraft"
        :is-sidebar-collapsed="isSidebarCollapsed"
        :groups="projectGroups"
        :project-display-name-by-id="projectDisplayNameById"
        :project-git-repo-by-name="projectGitRepoByName"
        :project-cwd-by-name="projectCwdByName"
        :selected-thread-id="selectedThreadId"
        :is-loading-threads="isLoadingThreads"
        :is-thread-list-fully-loaded="isThreadListFullyLoaded"
        :has-more-thread-history="hasMoreThreadHistory"
        :is-loading-more-thread-history="isLoadingMoreThreadHistory"
        :search-matched-thread-ids="serverMatchedThreadIds"
        :accounts="accounts"
        :is-accounts-section-collapsed="isAccountsSectionCollapsed"
        :is-refreshing-accounts="isRefreshingAccounts"
        :is-switching-accounts="isSwitchingAccounts"
        :is-starting-codex-login="isStartingCodexLogin"
        :is-completing-codex-login="isCompletingCodexLogin"
        :is-account-switch-blocked="isAccountSwitchBlocked"
        :removing-account-id="removingAccountId"
        :confirming-remove-account-id="confirmingRemoveAccountId"
        :hovered-account-id="hoveredAccountId"
        :account-action-error="accountActionError"
        :codex-login-url="codexLoginUrl"
        :settings-help="SETTINGS_HELP"
        :send-with-enter="sendWithEnter"
        :in-progress-send-mode="inProgressSendMode"
        :dark-mode="darkMode"
        :ui-language="uiLanguage"
        :ui-language-options="uiLanguageOptions"
        :chat-width-label="chatWidthLabel"
        :text-animations-enabled="textAnimationsEnabled"
        :live-reasoning-text-enabled="liveReasoningTextEnabled"
        :dictation-enabled="dictationEnabled"
        :dictation-click-to-toggle="dictationClickToToggle"
        :dictation-auto-send="dictationAutoSend"
        :dictation-language-options="dictationLanguageOptions"
        :telegram-config-error="telegramConfigError"
        :is-telegram-saving="isTelegramSaving"
        :telegram-status-text="telegramStatusText"
        :model-catalog-config-text="modelCatalogConfigText"
        :model-catalog-config-path="modelCatalogConfigPath"
        :model-catalog-config-error="modelCatalogConfigError"
        :model-catalog-options="availableModelOptions"
        :is-model-catalog-saving="isModelCatalogSaving"
        :is-codex-cli-restart-confirming="isCodexCliRestartConfirming"
        :is-restarting-codex-cli="isRestartingCodexCli"
        :codex-cli-restart-message="codexCliRestartMessage"
        :codex-cli-restart-error="codexCliRestartError"
        :show-thread-context-badge="showThreadContextBadge"
        :thread-context-badge-state="threadContextBadgeState"
        :thread-context-tooltip="threadContextTooltip"
        :thread-context-primary-text="threadContextPrimaryText"
        :thread-context-secondary-text="threadContextSecondaryText"
        :account-rate-limit-snapshots="accountRateLimitSnapshots"
        :worktree-name="worktreeName"
        :app-version="appVersion"
        @set-sidebar-collapsed="setSidebarCollapsed"
        @start-new-thread-toolbar="onStartNewThreadFromToolbar"
        @select-thread="onSelectThread"
        @archive-thread="onArchiveThread"
        @start-new-thread="onStartNewThread"
        @rename-project="onRenameProject"
        @browse-project-files="onBrowseProjectFiles"
        @request-project-git-status="onRequestProjectGitStatus"
        @create-project-worktree="onCreateProjectWorktree"
        @rename-thread="onRenameThread"
        @fork-thread="onForkThread"
        @delete-thread="onDeleteThread"
        @hide-project="onHideProject"
        @delete-project="onDeleteProject"
        @load-more-thread-history="loadMoreThreadHistory"
        @export-thread="onExportThread"
        @toggle-accounts-section="toggleAccountsSectionCollapsed"
        @refresh-accounts="onRefreshAccounts"
        @start-codex-login="onStartCodexLogin"
        @account-pointer-enter="onAccountCardPointerEnter"
        @account-pointer-leave="onAccountCardPointerLeave"
        @switch-account="onSwitchAccount"
        @remove-account="onRemoveAccount"
        @toggle-send-with-enter="toggleSendWithEnter"
        @cycle-in-progress-send-mode="cycleInProgressSendMode"
        @cycle-dark-mode="cycleDarkMode"
        @set-ui-language="setUiLanguage"
        @cycle-chat-width="cycleChatWidth"
        @toggle-text-animations="toggleTextAnimations"
        @toggle-live-reasoning-text="toggleLiveReasoningText"
        @toggle-dictation-enabled="toggleDictationEnabled"
        @toggle-dictation-click-to-toggle="toggleDictationClickToToggle"
        @toggle-dictation-auto-send="toggleDictationAutoSend"
        @update:modelCatalogConfigText="setModelCatalogConfigText"
        @save-model-catalog-config="saveModelCatalogConfigText"
        @restart-codex-cli="restartCodexCliFromSettings"
        @save-telegram-config="saveTelegramConfig"
      />
    </template>

    <template #content>
      <section
        class="content-root"
        :class="{
          'is-virtual-keyboard-open': isVirtualKeyboardOpen,
        }"
        :style="contentStyle"
      >
        <span v-if="isVirtualKeyboardOpen" class="content-keyboard-spacer" aria-hidden="true" />
        <ContentHeader :title="contentTitle" :accent="isSkillsRoute">
          <template #leading>
            <SidebarThreadControls
              v-if="isSidebarCollapsed || isMobile"
              class="sidebar-thread-controls-header-host"
              :is-sidebar-collapsed="isSidebarCollapsed"
              :show-new-thread-button="true"
              @toggle-sidebar="setSidebarCollapsed(!isSidebarCollapsed)"
              @start-new-thread="onStartNewThreadFromToolbar"
            />
            <span v-if="isSkillsRoute" class="skills-route-header-icon" aria-hidden="true">
              <IconCodexSkills />
            </span>
          </template>
          <template #actions>
            <button
              class="content-header-inspector-toggle"
              :class="{ 'is-active': showInspectorPanel }"
              type="button"
              :aria-label="showInspectorPanel ? t('Hide inspector') : t('Show inspector')"
              :title="showInspectorPanel ? t('Hide inspector') : t('Show inspector')"
              :aria-pressed="showInspectorPanel"
              @click="toggleInspectorPanel"
            >
              <IconTablerLayoutSidebarFilled v-if="showInspectorPanel" class="content-header-inspector-toggle-icon" />
              <IconTablerLayoutSidebar v-else class="content-header-inspector-toggle-icon" />
            </button>
          </template>
        </ContentHeader>

        <div class="content-workspace" :class="{ 'is-inspector-open': showInspectorPanel }">
        <section class="content-body">
          <template v-if="isSkillsRoute">
            <SkillsHub
              :try-in-flight-key="directoryTryInFlightKey"
              @skills-changed="onSkillsChanged"
              @try-item="onTryDirectoryItem"
            />
          </template>
          <template v-else-if="isHomeRoute">
            <div class="content-grid content-grid-home">
              <div class="new-thread-empty">
                <p class="new-thread-hero">{{ t("Let's build") }}</p>
                <ComposerDropdown class="new-thread-folder-dropdown" :model-value="newThreadCwd"
                  :options="newThreadFolderOptions" :placeholder="t('Choose folder')"
                  :enable-search="true"
                  :search-placeholder="t('Quick search project')"
                  :disabled="false" @update:model-value="onSelectNewThreadFolder" />
                <p v-if="newThreadCwd" class="new-thread-folder-selected" :title="newThreadCwd">
                  {{ t('Selected folder') }}: {{ newThreadCwd }}
                </p>
                <div class="new-thread-folder-actions">
                  <button class="new-thread-folder-action new-thread-folder-action-primary" type="button" @click="onOpenExistingFolder">
                    {{ t('Select folder') }}
                  </button>
                  <button class="new-thread-folder-action" type="button" @click="onOpenProjectSetupModal">
                    {{ t('Create Project') }}
                  </button>
                </div>
                <Teleport to="body">
                  <div v-if="isExistingFolderPickerOpen" class="new-thread-open-folder-overlay" @click.self="onCloseExistingFolderPanel">
                    <div class="new-thread-open-folder" role="dialog" aria-modal="true" :aria-label="t('Select folder')" @keydown.esc.prevent="onCloseExistingFolderPanel">
                      <div class="new-thread-open-folder-header">
                        <p class="new-thread-open-folder-title">{{ t('Select folder') }}</p>
                        <button class="new-thread-open-folder-close" type="button" @click="onCloseExistingFolderPanel">
                          {{ t('Cancel') }}
                        </button>
                      </div>
                      <p class="new-thread-open-folder-label">{{ t('Current folder') }}</p>
                      <div class="new-thread-open-folder-current">
                        <input
                          ref="existingFolderPathInputRef"
                          v-model="existingFolderPathDraft"
                          class="new-thread-open-folder-path"
                          type="text"
                          :placeholder="t('Current folder')"
                          :title="existingFolderPathDraft || t('Unavailable')"
                          :disabled="isExistingFolderLoading || isOpeningExistingFolder"
                          @blur="onExistingFolderPathBlur"
                          @keydown="onExistingFolderPathKeydown"
                        />
                        <button
                          class="new-thread-folder-action new-thread-folder-action-primary"
                          type="button"
                          :disabled="!resolvedExistingFolderPath || isExistingFolderLoading || isOpeningExistingFolder"
                          @click="onConfirmExistingFolder()"
                        >
                          {{ isOpeningExistingFolder ? t('Opening…') : t('Open') }}
                        </button>
                      </div>
                      <div class="new-thread-open-folder-actions">
                        <label class="new-thread-open-folder-toggle">
                          <input
                            v-model="showHiddenFolders"
                            class="new-thread-open-folder-toggle-input"
                            type="checkbox"
                            @change="onToggleHiddenFolders"
                          />
                          <span>{{ t('Show hidden folders') }}</span>
                        </label>
                        <button
                          class="new-thread-folder-action"
                          :class="{ 'new-thread-folder-action-primary': isCreateFolderOpen }"
                          type="button"
                          :aria-pressed="isCreateFolderOpen"
                          :disabled="!existingFolderBrowsePath || isExistingFolderLoading || isOpeningExistingFolder || isCreatingFolder || (!!existingFolderError && !isCreateFolderOpen)"
                          @click="onOpenCreateFolderPanel"
                        >
                          {{ t('New folder') }}
                        </button>
                      </div>
                      <div v-if="isCreateFolderOpen" class="new-thread-open-folder-create">
                        <div class="new-thread-open-folder-create-composer">
                          <input
                            ref="createFolderInputRef"
                            v-model="createFolderDraft"
                            class="new-thread-open-folder-create-input"
                            type="text"
                            :placeholder="t('Folder name')"
                            @keydown="onCreateFolderInputKeydown"
                          />
                          <button
                            class="new-thread-folder-action new-thread-folder-action-primary new-thread-open-folder-create-submit"
                            type="button"
                            :disabled="!canCreateFolder || isCreatingFolder"
                            @click="onCreateFolder"
                          >
                            {{ createFolderSubmitLabel }}
                          </button>
                        </div>
                        <div v-if="createFolderError" class="new-thread-open-folder-error">
                          <span>{{ createFolderError }}</span>
                        </div>
                      </div>
                      <input
                        ref="existingFolderFilterInputRef"
                        v-model="existingFolderFilter"
                        class="new-thread-open-folder-filter"
                        type="text"
                        :placeholder="t('Filter folders...')"
                        @keydown.esc.prevent="onCloseExistingFolderPanel"
                      />
                      <div v-if="existingFolderError" class="new-thread-open-folder-error-actions">
                        <div class="new-thread-open-folder-error">
                          <span>{{ existingFolderError }}</span>
                        </div>
                        <button
                          class="new-thread-folder-action"
                          type="button"
                          :disabled="isExistingFolderLoading || isOpeningExistingFolder"
                          @click="onRetryExistingFolderBrowse"
                        >
                          {{ t('Retry') }}
                        </button>
                      </div>
                      <p v-if="isExistingFolderLoading" class="new-thread-open-folder-status">{{ t('Loading folders…') }}</p>
                      <p v-else-if="!existingFolderError && existingFolderFilteredEntries.length === 0" class="new-thread-open-folder-status">
                        {{ existingFolderFilter.trim() ? t('No folders match this filter.') : t('No subfolders found here.') }}
                      </p>
                      <ul v-else-if="existingFolderFilteredEntries.length > 0" class="new-thread-open-folder-list">
                        <li v-for="entry in existingFolderFilteredEntries" :key="entry.key" class="new-thread-open-folder-item">
                          <button
                            class="new-thread-open-folder-item-main"
                            type="button"
                            :title="entry.path"
                            :disabled="isExistingFolderLoading || isOpeningExistingFolder"
                            @click="onBrowseExistingFolder(entry.path)"
                          >
                            <span class="new-thread-open-folder-item-name">{{ entry.name }}</span>
                          </button>
                          <button
                            v-if="entry.kind === 'directory'"
                            class="new-thread-open-folder-item-open"
                            type="button"
                            :disabled="isExistingFolderLoading || isOpeningExistingFolder"
                            @click="onConfirmExistingFolder(entry.path)"
                          >
                            {{ t('Open') }}
                          </button>
                        </li>
                      </ul>
                    </div>
                  </div>
                </Teleport>
                <Teleport to="body">
                  <div v-if="isProjectSetupModalOpen" class="new-thread-open-folder-overlay" @click.self="onCloseProjectSetupModal">
                    <div class="new-thread-project-modal" role="dialog" aria-modal="true" :aria-label="t('Create or clone project')" @keydown.esc.prevent="onCloseProjectSetupModal">
                      <div class="new-thread-open-folder-header">
                        <p class="new-thread-open-folder-title">{{ t('Create or clone project') }}</p>
                        <button class="new-thread-open-folder-close" type="button" :disabled="isProjectSetupSubmitting" @click="onCloseProjectSetupModal">
                          {{ t('Cancel') }}
                        </button>
                      </div>
                      <div class="new-thread-project-mode-tabs" role="tablist" :aria-label="t('Project source')">
                        <button
                          class="new-thread-project-mode-tab"
                          :class="{ 'is-active': projectSetupMode === 'create' }"
                          type="button"
                          role="tab"
                          :aria-selected="projectSetupMode === 'create'"
                          :disabled="isProjectSetupSubmitting"
                          @click="projectSetupMode = 'create'"
                        >
                          {{ t('New project') }}
                        </button>
                        <button
                          class="new-thread-project-mode-tab"
                          :class="{ 'is-active': projectSetupMode === 'clone' }"
                          type="button"
                          role="tab"
                          :aria-selected="projectSetupMode === 'clone'"
                          :disabled="isProjectSetupSubmitting"
                          @click="projectSetupMode = 'clone'"
                        >
                          {{ t('Clone from GitHub') }}
                        </button>
                      </div>
                      <label class="new-thread-project-field">
                        <span class="new-thread-open-folder-label">{{ t('Destination folder') }}</span>
                        <input
                          v-model="projectSetupBaseDir"
                          class="new-thread-open-folder-path"
                          type="text"
                          :disabled="isProjectSetupSubmitting"
                          :placeholder="t('Destination folder')"
                        />
                      </label>
                      <label v-if="projectSetupMode === 'create'" class="new-thread-project-field">
                        <span class="new-thread-open-folder-label">{{ t('Project name') }}</span>
                        <input
                          ref="projectSetupPrimaryInputRef"
                          v-model="projectNameDraft"
                          class="new-thread-open-folder-create-input"
                          type="text"
                          :disabled="isProjectSetupSubmitting"
                          :placeholder="t('Project name')"
                          @keydown="onProjectSetupInputKeydown"
                        />
                      </label>
                      <label v-else class="new-thread-project-field">
                        <span class="new-thread-open-folder-label">{{ t('GitHub repository URL') }}</span>
                        <input
                          ref="projectSetupPrimaryInputRef"
                          v-model="githubCloneUrlDraft"
                          class="new-thread-open-folder-create-input"
                          type="url"
                          :disabled="isProjectSetupSubmitting"
                          placeholder="https://github.com/owner/repo"
                          @keydown="onProjectSetupInputKeydown"
                        />
                      </label>
                      <div v-if="projectSetupError" class="new-thread-open-folder-error">
                        <span>{{ projectSetupError }}</span>
                      </div>
                      <div class="new-thread-project-modal-actions">
                        <button class="new-thread-folder-action" type="button" :disabled="isProjectSetupSubmitting" @click="onCloseProjectSetupModal">
                          {{ t('Cancel') }}
                        </button>
                        <button
                          class="new-thread-folder-action new-thread-folder-action-primary"
                          type="button"
                          :disabled="!canSubmitProjectSetup || isProjectSetupSubmitting"
                          @click="onSubmitProjectSetup"
                        >
                          {{ projectSetupSubmitLabel }}
                        </button>
                      </div>
                    </div>
                  </div>
                </Teleport>
                <ComposerRuntimeDropdown
                  v-if="isNewThreadCwdGitRepo"
                  class="new-thread-runtime-dropdown"
                  v-model="newThreadRuntime"
                />
                <div v-if="newThreadRuntime === 'worktree'" class="new-thread-branch-select">
                  <p class="new-thread-branch-select-label">{{ t('Base branch') }}</p>
                  <ComposerDropdown
                    class="new-thread-branch-dropdown"
                    :model-value="newWorktreeBaseBranch"
                    :options="newWorktreeBranchDropdownOptions"
                    :placeholder="t('Select branch')"
                    :enable-search="true"
                    :search-placeholder="t('Search branches...')"
                    :disabled="isLoadingWorktreeBranches || newWorktreeBranchDropdownOptions.length === 0"
                    @update:model-value="onSelectNewWorktreeBranch"
                  />
                  <p class="new-thread-branch-select-help">
                    {{
                      isLoadingWorktreeBranches
                        ? t('Loading branches…')
                        : selectedWorktreeBranchLabel
                          ? t('New worktree branch will start from {branch}.', { branch: selectedWorktreeBranchLabel })
                          : t('No Git branches found for this folder.')
                    }}
                  </p>
                </div>
                <p v-if="isNewThreadCwdGitRepo" class="new-thread-runtime-help">
                  {{ t('Local project uses the selected folder directly. New worktree creates an isolated Git worktree before the first prompt.') }}
                </p>
                <div
                  v-if="worktreeInitStatus.phase !== 'idle'"
                  class="worktree-init-status"
                  :class="{
                    'is-running': worktreeInitStatus.phase === 'running',
                    'is-error': worktreeInitStatus.phase === 'error',
                  }"
                >
                  <strong class="worktree-init-status-title">{{ worktreeInitStatus.title }}</strong>
                  <span class="worktree-init-status-message">{{ worktreeInitStatus.message }}</span>
                </div>
              </div>

              <div class="composer-with-queue">
                <div v-if="homeLiveOverlay" class="new-thread-live-overlay" aria-live="polite">
                  <p class="new-thread-live-overlay-label">
                    <ThinkingShimmer :message="homeLiveOverlayDisplayLabel" :active="textAnimationsEnabled" />
                  </p>
                </div>
                <div v-if="codexCliMissingError" class="composer-runtime-error" role="alert">
                  <span>{{ t(codexCliMissingError) }}</span>
                </div>
                <ThreadComposer ref="homeThreadComposerRef" :active-thread-id="composerThreadContextId"
                  :cwd="composerCwd"
                  :collaboration-modes="availableCollaborationModes"
                  :selected-collaboration-mode="selectedCollaborationMode"
                  :models="availableModelOptions" :selected-model="composerSelectedModelId"
                  :is-selected-model-selectable="composerSelectedModelIsSelectable"
                  :selected-reasoning-effort="selectedReasoningEffort"
                  :selected-speed-mode="selectedSpeedMode"
                  :is-updating-speed-mode="isUpdatingSpeedMode"
                  :skills="installedSkills"
                  :thread-token-usage="selectedThreadTokenUsage"
                  :codex-quota="codexQuota"
                  :is-turn-in-progress="false"
                  :is-stop-pending="false"
                  :is-interrupting-turn="false" :send-with-enter="sendWithEnter" :in-progress-submit-mode="inProgressSendMode"
                  :dictation-enabled="dictationEnabled"
                  :dictation-click-to-toggle="dictationClickToToggle" :dictation-auto-send="dictationAutoSend"
                  :dictation-language="dictationLanguage"
                  @submit="onSubmitThreadMessage"
                  @update:selected-collaboration-mode="onSelectCollaborationMode"
                  @update:selected-model="onSelectModel"
                  @update:selected-reasoning-effort="onSelectReasoningEffort"
                  @update:selected-speed-mode="onSelectSpeedMode" />
              </div>
            </div>
          </template>
          <template v-else>
            <div class="content-grid">
              <ReviewPane
                v-if="isReviewPaneOpen && selectedThreadId && composerCwd"
                :thread-id="selectedThreadId"
                :cwd="composerCwd"
                :is-thread-in-progress="isSelectedThreadInProgress"
                @close="isReviewPaneOpen = false"
              />

              <template v-else>
                <div class="content-thread">
                  <ThreadConversation ref="threadConversationRef" :messages="filteredMessages" :is-loading="isLoadingMessages"
                    :active-thread-id="composerThreadContextId" :cwd="composerCwd"
                    :live-overlay="liveOverlay"
                    :pending-requests="selectedThreadServerRequests"
                    :has-more-persisted-above="hasMoreOlderMessages"
                    :is-loading-persisted-above="isLoadingOlderMessages"
                    :load-earlier-messages="loadOlderMessages"
                    :text-animations-enabled="textAnimationsEnabled"
                    :live-reasoning-text-enabled="liveReasoningTextEnabled"
                    @fork-thread="onForkThreadFromMessage"
                    @edit-history-message="onEditHistoryMessage"
                    @implement-plan="onImplementPlan"
                    @respond-server-request="onRespondServerRequest" />
                </div>

                <div class="composer-with-queue">
                  <div v-if="codexCliMissingError" class="composer-runtime-error" role="alert">
                    <span>{{ t(codexCliMissingError) }}</span>
                  </div>
                  <QueuedMessages
                    :messages="selectedThreadQueuedMessages"
                    @edit="onEditQueuedMessage"
                    @steer="steerQueuedMessage"
                    @delete="removeQueuedMessage"
                    @reorder="onReorderQueuedMessage"
                  />
                  <ThreadPendingRequestPanel
                    v-if="selectedThreadPendingRequest"
                    :request="selectedThreadPendingRequest"
                    :request-count="selectedThreadServerRequests.length"
                    :has-queue-above="selectedThreadQueuedMessages.length > 0"
                    @respond-server-request="onRespondServerRequest"
                  />
                  <div
                    v-else
                    class="history-edit-composer-stack"
                    :class="{ 'is-editing-history': isEditingHistoryMessage }"
                  >
                    <div
                      v-if="isEditingHistoryMessage"
                      class="history-edit-banner"
                      role="status"
                      aria-live="polite"
                    >
                      <span class="history-edit-banner-text">{{ t('Editing message') }}</span>
                      <button
                        class="history-edit-banner-cancel"
                        type="button"
                        @click="onCancelHistoryMessageEdit"
                      >
                        <IconCodexX class="history-edit-banner-cancel-icon" />
                        <span>{{ t('Cancel') }}</span>
                      </button>
                    </div>
                    <ThreadComposer
                      ref="threadComposerRef"
                      :active-thread-id="composerThreadContextId"
                      :cwd="composerCwd"
                      :collaboration-modes="availableCollaborationModes"
                      :selected-collaboration-mode="selectedCollaborationMode"
                      :models="availableModelOptions"
                      :selected-model="composerSelectedModelId"
                      :is-selected-model-selectable="composerSelectedModelIsSelectable"
                      :selected-reasoning-effort="selectedReasoningEffort"
                      :selected-speed-mode="selectedSpeedMode"
                      :is-updating-speed-mode="isUpdatingSpeedMode"
                      :skills="installedSkills"
                      :thread-token-usage="selectedThreadTokenUsage"
                      :codex-quota="codexQuota"
                      :is-turn-in-progress="isSelectedThreadInProgress"
                      :is-stop-pending="isSelectedThreadInterruptPending"
                      :is-interrupting-turn="isInterruptingTurn"
                      :has-queue-above="selectedThreadQueuedMessages.length > 0 || isEditingHistoryMessage"
                      :send-with-enter="sendWithEnter" :in-progress-submit-mode="inProgressSendMode"
                      :dictation-enabled="dictationEnabled"
                      :dictation-click-to-toggle="dictationClickToToggle" :dictation-auto-send="dictationAutoSend"
                      :dictation-language="dictationLanguage"
                      @update:selected-collaboration-mode="onSelectCollaborationMode"
                      @submit="onSubmitThreadMessage" @update:selected-model="onSelectModel"
                      @update:selected-reasoning-effort="onSelectReasoningEffort"
                      @update:selected-speed-mode="onSelectSpeedMode"
                      @interrupt="onInterruptTurn" />
                  </div>
                </div>
              </template>
            </div>
          </template>
        </section>
        <ContentInspectorPanel
          v-if="hasLoadedInspectorPanel"
          :visible="showInspectorPanel"
          :git-status-text="inspectorGitStatusText"
          :commit-text="inspectorCommitText"
          :can-show-branch-status="canShowInspectorBranchStatus"
          :current-branch="currentThreadBranch"
          :head-sha="currentThreadHeadSha"
          :head-subject="currentThreadHeadSubject"
          :loading-branches="isLoadingThreadBranches"
          :show-progress-section="showInspectorProgressSection"
          :progress-toggle-label="inspectorProgressToggleLabel"
          :progress-expanded="isInspectorProgressExpanded"
          :progress-items="inspectorProgressItems"
          @toggle-progress="toggleInspectorProgress"
        />
        </div>
      </section>
    </template>
  </DesktopLayout>
  <CodexLoginModal
    v-if="isCodexLoginModalOpen"
    v-model:callback-url="codexLoginCallbackUrl"
    :error="accountActionError"
    :is-completing="isCompletingCodexLogin"
    :login-url="codexLoginUrl"
    @cancel="onCancelCodexLoginModal"
    @submit="onSubmitCodexLoginCallback"
  />
</template>

<script setup lang="ts">
import { computed, defineAsyncComponent, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import DesktopLayout from './components/layout/DesktopLayout.vue'
import AppSidebar from './components/sidebar/AppSidebar.vue'
import ContentHeader from './components/content/ContentHeader.vue'
import ThreadComposer from './components/content/ThreadComposer.vue'
import ThreadPendingRequestPanel from './components/content/ThreadPendingRequestPanel.vue'
import QueuedMessages from './components/content/QueuedMessages.vue'
import ThinkingShimmer from './components/content/ThinkingShimmer.vue'
import ComposerDropdown from './components/content/ComposerDropdown.vue'
import ComposerRuntimeDropdown from './components/content/ComposerRuntimeDropdown.vue'
import SidebarThreadControls from './components/sidebar/SidebarThreadControls.vue'
import IconTablerLayoutSidebar from './components/icons/IconTablerLayoutSidebar.vue'
import IconTablerLayoutSidebarFilled from './components/icons/IconTablerLayoutSidebarFilled.vue'
import {
  IconCodexSkills,
  IconCodexX,
} from './components/icons/codex'
import { buildInspectorPlanProgress } from './components/content/inspectorProgress'
import {
  CHAT_WIDTH_PRESETS,
  MOBILE_RESUME_RELOAD_MIN_HIDDEN_MS,
  buildSettingsHelp,
} from './app/appConfig'
import { buildDirectoryTryPrompt, getDirectoryTryItemKey } from './app/directoryTry'
import {
  loadAccountsSectionCollapsed,
  loadInspectorPanelOpen,
  loadSidebarCollapsed,
  saveAccountsSectionCollapsed,
  saveInspectorPanelOpen,
  saveSidebarCollapsed,
} from './app/preferences'
import {
  buildExportFileName,
  buildThreadMarkdown,
} from './app/threadExport'
import { useDesktopState } from './composables/useDesktopState'
import { useMobile } from './composables/useMobile'
import { useAccounts } from './composables/useAccounts'
import { usePreferences } from './composables/usePreferences'
import { useTelegramConfig } from './composables/useTelegramConfig'
import { useHomeDirectory } from './composables/useHomeDirectory'
import { useUiLanguage } from './composables/useUiLanguage'
import {
  cloneGithubRepository,
  createPermanentWorktree,
  createWorktree,
  createProjectlessThreadDirectory,
  getGitBranchState,
  getGitRepositoryStatus,
  getWorktreeBranchOptions,
  createLocalDirectory,
  getProjectRootSuggestion,
  getWorkspaceRootsState,
  listLocalDirectories,
  openProjectRoot,
  searchThreads,
} from './api/codexGateway'
import type { ReasoningEffort, SpeedMode, UiLiveOverlay, UiServerRequest, UiServerRequestReply, UiThreadTokenUsage } from './types/codex'
import type { ComposerDraftPayload, ThreadComposerExposed } from './components/content/ThreadComposer.vue'
import type { LocalDirectoryEntry, WorktreeBranchOption } from './api/codexGateway'
import type {
  DirectoryTryItemPayload,
} from './app/appTypes'
import { getPathLeafName, getPathParent, isProjectlessChatPath, normalizePathForUi } from './pathUtils.js'
import { isImeComposingKeydown, shouldHandleEnterKeydown } from './utils/keyboard'
import { formatLiveOverlayDuration } from './utils/liveOverlay'
import { hasDuplicateFolderLeaf, isWorktreePath, joinPath, normalizeAbsolutePath } from './utils/pathHelpers'

const ThreadConversation = defineAsyncComponent(() => import('./components/content/ThreadConversation.vue'))
const ReviewPane = defineAsyncComponent(() => import('./components/content/ReviewPane.vue'))
const SkillsHub = defineAsyncComponent(() => import('./components/content/SkillsHub.vue'))
const ContentInspectorPanel = defineAsyncComponent(() => import('./components/content/ContentInspectorPanel.vue'))
const CodexLoginModal = defineAsyncComponent(() => import('./components/content/CodexLoginModal.vue'))
const { t, uiLanguage, uiLanguageOptions, setUiLanguage } = useUiLanguage()

const worktreeName = import.meta.env.VITE_WORKTREE_NAME ?? 'unknown'
const appVersion = import.meta.env.VITE_APP_VERSION ?? 'unknown'
const SETTINGS_HELP = buildSettingsHelp(t)

const {
  projectGroups,
  projectDisplayNameById,
  selectedThread,
  selectedThreadInProgress,
  selectedThreadTokenUsage,
  selectedThreadServerRequests,
  selectedLiveOverlay,
  newThreadLiveOverlay,
  codexQuota,
  selectedThreadId,
  availableCollaborationModes,
  availableModelOptions,
  selectedCollaborationMode,
  selectedModelId,
  selectedReasoningEffort,
  selectedSpeedMode,
  modelCatalogConfigText,
  modelCatalogConfigPath,
  modelCatalogConfigError,
  codexCliMissingError,
  isCodexCliRestartConfirming,
  isRestartingCodexCli,
  codexCliRestartMessage,
  codexCliRestartError,
  installedSkills,
  accountRateLimitSnapshots,
  messages,
  hasMoreOlderMessages,
  isLoadingThreads,
  isThreadListFullyLoaded,
  hasMoreThreadHistory,
  isLoadingMessages,
  isLoadingOlderMessages,
  isLoadingMoreThreadHistory,
  isSendingMessage,
  isInterruptingTurn,
  isSelectedThreadInterruptPending,
  isUpdatingSpeedMode,
  isModelCatalogSaving,
  error: desktopError,
  refreshAll,
  refreshSkills,
  selectThread,
  ensureThreadMessagesLoaded,
  loadOlderMessages,
  loadMoreThreadHistory,
  insertThreadSummaries,
  archiveThreadById,
  deleteThreadSessionById,
  forkThreadById,
  renameThreadById,
  forkThreadFromTurn,
  sendMessageToThread,
  sendMessageToSelectedThread,
  sendMessageToNewThread,
  interruptSelectedThreadTurn,
  selectedThreadQueuedMessages,
  removeQueuedMessage,
  reorderQueuedMessage,
  steerQueuedMessage,
  setSelectedCollaborationMode,
  readModelIdForThread,
  isModelSelectableForThread,
  setSelectedModelIdForThread,
  resetNewThreadRunConfig,

  setSelectedReasoningEffort,
  updateSelectedSpeedMode,
  setModelCatalogConfigText,
  saveModelCatalogConfigText,
  restartCodexCliFromSettings,
  respondToPendingServerRequest,
  renameProject,
  removeProject,
  deleteProjectSessionsByCwd,
  pinProjectToTop,
  startPolling,
  stopPolling,
  primeSelectedThread,
  rollbackSelectedThread,
} = useDesktopState()

const route = useRoute()
const router = useRouter()
const { isMobile } = useMobile()
const {
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
} = usePreferences()
type HistoryMessageEditState = {
  threadId: string
  turnId: string
  previousDraft: ComposerDraftPayload
}
type ThreadSubmitPayload = {
  text: string
  imageUrls: string[]
  fileAttachments: Array<{ label: string; path: string; fsPath: string }>
  skills: Array<{ name: string; path: string }>
  mode: 'steer' | 'queue'
}
type ThreadRunConfigSnapshot = {
  reasoningEffort: ReasoningEffort | ''
  collaborationMode: 'default' | 'plan'
}
function captureThreadRunConfig(): ThreadRunConfigSnapshot {
  return {
    reasoningEffort: selectedReasoningEffort.value,
    collaborationMode: selectedCollaborationMode.value,
  }
}
function captureNewThreadSendOptions() {
  return {
    modelId: readModelIdForThread('__new-thread__'),
    ...captureThreadRunConfig(),
    selectCreatedThread: false,
  } as const
}
const homeThreadComposerRef = ref<ThreadComposerExposed | null>(null)
const threadComposerRef = ref<ThreadComposerExposed | null>(null)
const threadConversationRef = ref<{ jumpToLatest: () => void } | null>(null)
const editingQueuedMessageState = ref<{ threadId: string; queueIndex: number } | null>(null)
const editingHistoryMessageState = ref<HistoryMessageEditState | null>(null)
const isRouteSyncInProgress = ref(false)
const directoryTryInFlightKey = ref('')
let hasPendingRouteSync = false
const hasInitialized = ref(false)
const newThreadCwd = ref('')
const newThreadRuntime = ref<'local' | 'worktree'>('local')
const gitRepoStatusByCwd = ref<Record<string, boolean>>({})
const gitRepoStatusRequestByCwd = new Map<string, Promise<boolean>>()
const newWorktreeBaseBranch = ref('')
const worktreeBranchOptions = ref<WorktreeBranchOption[]>([])
const isLoadingWorktreeBranches = ref(false)
const workspaceRootOptionsState = ref<{ order: string[]; labels: Record<string, string>; projectOrder: string[] }>({
  order: [],
  labels: {},
  projectOrder: [],
})
const worktreeInitStatus = ref<{ phase: 'idle' | 'running' | 'error'; title: string; message: string }>({
  phase: 'idle',
  title: '',
  message: '',
})
const isSidebarCollapsed = ref(loadSidebarCollapsed())
const sidebarSearchQuery = ref('')
const isSidebarSearchVisible = ref(false)
const serverMatchedThreadIds = ref<string[] | null>(null)
let threadSearchTimer: ReturnType<typeof setTimeout> | null = null
let threadBranchesRequestId = 0
const defaultNewProjectName = ref('New Project (1)')
const isSettingsOpen = ref(false)
const isAccountsSectionCollapsed = ref(loadAccountsSectionCollapsed())
const isReviewPaneOpen = ref(false)
const currentThreadBranch = ref<string | null>(null)
const currentThreadHeadSha = ref<string | null>(null)
const currentThreadHeadSubject = ref<string | null>(null)
const isThreadDetachedHead = ref(false)
const isThreadWorktreeDirty = ref(false)
const isLoadingThreadBranches = ref(false)
const createFolderInputRef = ref<HTMLInputElement | null>(null)
const isCreateFolderOpen = ref(false)
const createFolderDraft = ref('')
const createFolderError = ref('')
const isCreatingFolder = ref(false)
const isProjectSetupModalOpen = ref(false)
const projectSetupMode = ref<'create' | 'clone'>('create')
const projectSetupBaseDir = ref('')
const projectNameDraft = ref('')
const githubCloneUrlDraft = ref('')
const projectSetupError = ref('')
const isProjectSetupSubmitting = ref(false)
const projectSetupPrimaryInputRef = ref<HTMLInputElement | null>(null)
const isExistingFolderPickerOpen = ref(false)
const existingFolderPathInputRef = ref<HTMLInputElement | null>(null)
const existingFolderFilterInputRef = ref<HTMLInputElement | null>(null)
const existingFolderPathDraft = ref('')
const existingFolderBrowsePath = ref('')
const existingFolderParentPath = ref('')
const existingFolderEntries = ref<LocalDirectoryEntry[]>([])
const existingFolderError = ref('')
const isExistingFolderLoading = ref(false)
const isOpeningExistingFolder = ref(false)
const showHiddenFolders = ref(false)
const existingFolderFilter = ref('')
const mobileHiddenAtMs = ref<number | null>(null)
const mobileResumeReloadTriggered = ref(false)
const mobileResumeSyncInProgress = ref(false)
const visualViewportHeight = ref(typeof window !== 'undefined' ? window.visualViewport?.height ?? window.innerHeight : 0)
const visualViewportOffsetTop = ref(typeof window !== 'undefined' ? window.visualViewport?.offsetTop ?? 0 : 0)
const layoutViewportHeight = ref(typeof window !== 'undefined' ? window.innerHeight : 0)
let existingFolderBrowseRequestId = 0
const isInspectorPanelOpen = ref(loadInspectorPanelOpen())
const hasLoadedInspectorPanel = ref(isInspectorPanelOpen.value)

const routeThreadId = computed(() => {
  const rawThreadId = route.params.threadId
  return typeof rawThreadId === 'string' ? rawThreadId : ''
})

const isHomeRoute = computed(() => route.name === 'home')
const isSkillsRoute = computed(() => route.name === 'skills')
const contentTitle = computed(() => {
  if (isSkillsRoute.value) return t('Skills')
  if (isHomeRoute.value) return t('Start new thread')
  return selectedThread.value?.title ?? t('Choose a thread')
})
const pageTitle = computed(() => {
  const threadTitle = selectedThread.value?.title?.trim() ?? ''
  return threadTitle || 'CodeS'
})
const filteredMessages = computed(() =>
  messages.value.filter((message) => {
    const type = normalizeMessageType(message.messageType, message.role)
    if (type === 'worked') return true
    if (type === 'turnActivity.live' || type === 'turnError.live' || type === 'agentReasoning.live') return false
    return true
  }),
)
const latestUserTurnId = computed(() => {
  for (let index = messages.value.length - 1; index >= 0; index -= 1) {
    const message = messages.value[index]
    if (message.role !== 'user') continue
    const turnId = message.turnId?.trim() ?? ''
    if (turnId.length > 0) return turnId
  }
  return ''
})
const isEditingHistoryMessage = computed(() => {
  const state = editingHistoryMessageState.value
  return Boolean(state && state.threadId === selectedThreadId.value)
})
const liveOverlay = computed(() => selectedLiveOverlay.value)
const homeLiveOverlay = computed(() => (isHomeRoute.value ? newThreadLiveOverlay.value : null))
const composerThreadContextId = computed(() => (isHomeRoute.value ? '__new-thread__' : selectedThreadId.value))
const composerSelectedModelId = computed(() => readModelIdForThread(composerThreadContextId.value))
const composerSelectedModelIsSelectable = computed(() => isModelSelectableForThread(composerThreadContextId.value))
const selectedThreadPendingRequest = computed<UiServerRequest | null>(() => {
  const rows = selectedThreadServerRequests.value
  return rows.length > 0 ? rows[rows.length - 1] : null
})
const composerCwd = computed(() => {
  if (isHomeRoute.value) return newThreadCwd.value.trim()
  return selectedThread.value?.cwd?.trim() ?? ''
})
const canShowInspectorBranchStatus = computed(() => (
  (route.name === 'thread' && selectedThreadId.value.length > 0) ||
  (isHomeRoute.value && isNewThreadCwdGitRepo.value)
))
const isVirtualKeyboardOpen = computed(() => {
  if (!isMobile.value) return false
  if (visualViewportHeight.value <= 0 || layoutViewportHeight.value <= 0) return false
  return layoutViewportHeight.value - visualViewportHeight.value > 120
})
const isSelectedThreadInProgress = computed(() => !isHomeRoute.value && selectedThreadInProgress.value)
const showThreadContextBadge = computed(() => !isHomeRoute.value && !isSkillsRoute.value && selectedThreadId.value.trim().length > 0)
const isAccountSwitchBlocked = computed(() =>
  isSendingMessage.value ||
  isInterruptingTurn.value ||
  isSelectedThreadInProgress.value ||
  selectedThreadServerRequests.value.length > 0,
)
const homeLiveOverlayNowMs = ref(Date.now())
let homeLiveOverlayTimer: number | undefined
const homeLiveOverlayDisplayLabel = computed(() => {
  const overlay = homeLiveOverlay.value
  return formatLiveOverlayDisplayLabel(overlay, homeLiveOverlayNowMs.value)
})

function formatLiveOverlayDisplayLabel(overlay: UiLiveOverlay | null, nowMs: number): string {
  const baseLabel = overlay?.activityLabel?.trim() || 'Thinking'
  const startedAtMs = overlay?.activityStartedAtMs
  if (typeof startedAtMs !== 'number' || !Number.isFinite(startedAtMs)) return t(baseLabel)

  const elapsedMs = Math.max(0, nowMs - startedAtMs)
  if (elapsedMs < 1000) return t(baseLabel)

  const time = formatLiveOverlayDuration(elapsedMs)
  if (baseLabel === 'Thinking') {
    return t('Thinking for {time}', { time })
  }
  return t('{label} for {time}', { label: t(baseLabel), time })
}

function clearHomeLiveOverlayTimer(): void {
  if (homeLiveOverlayTimer === undefined) return
  window.clearInterval(homeLiveOverlayTimer)
  homeLiveOverlayTimer = undefined
}

function syncHomeLiveOverlayTimer(): void {
  clearHomeLiveOverlayTimer()
  const startedAtMs = homeLiveOverlay.value?.activityStartedAtMs
  if (typeof startedAtMs !== 'number' || !Number.isFinite(startedAtMs)) return
  homeLiveOverlayNowMs.value = Date.now()
  homeLiveOverlayTimer = window.setInterval(() => {
    homeLiveOverlayNowMs.value = Date.now()
  }, 1000)
}
const {
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
} = useAccounts(isAccountSwitchBlocked, () => {
  stopPolling()
  startPolling()
  void refreshAll({
    includeSelectedThreadMessages: true,
  })
})
const {
  isTelegramConfigOpen,
  telegramBotTokenDraft,
  telegramAllowedUserIdsDraft,
  telegramConfigError,
  isTelegramSaving,
  telegramStatus,
  telegramStatusText,
  saveTelegramConfig,
} = useTelegramConfig()
const { homeDirectory, loadHomeDirectory } = useHomeDirectory()
const showInspectorPanel = computed(() => isInspectorPanelOpen.value)
watch(showInspectorPanel, (visible) => {
  if (visible) hasLoadedInspectorPanel.value = true
}, { immediate: true })
const inspectorPlanProgress = computed(() => buildInspectorPlanProgress(filteredMessages.value))
const showInspectorProgressSection = computed(() => inspectorPlanProgress.value !== null)
const inspectorProgressItems = computed(() => inspectorPlanProgress.value?.items ?? [])
const isInspectorProgressExpanded = ref(true)
const lastInspectorProgressAutoState = ref<{ messageId: string; isComplete: boolean } | null>(null)
const inspectorProgressToggleLabel = computed(() => (
  isInspectorProgressExpanded.value ? t('Collapse progress') : t('Expand progress')
))
const inspectorGitStatusText = computed(() => {
  if (!canShowInspectorBranchStatus.value) return t('No Git repository')
  if (isLoadingThreadBranches.value) return t('Loading Git state')
  if (isThreadDetachedHead.value) return t('Detached HEAD')
  if (isThreadWorktreeDirty.value) return t('Local changes present')
  return t('Working tree clean')
})
const inspectorCommitText = computed(() => {
  const shortSha = currentThreadHeadSha.value?.trim().slice(0, 8) ?? ''
  const subject = currentThreadHeadSubject.value?.trim() ?? ''
  return [shortSha, subject].filter(Boolean).join(' · ')
})

watch(
  () => {
    const progress = inspectorPlanProgress.value
    return progress
      ? {
          messageId: progress.messageId,
          isComplete: progress.isComplete,
        }
      : null
  },
  (state) => {
    if (!state) {
      lastInspectorProgressAutoState.value = null
      isInspectorProgressExpanded.value = true
      return
    }

    const previous = lastInspectorProgressAutoState.value
    if (previous?.messageId === state.messageId && previous.isComplete === state.isComplete) return

    isInspectorProgressExpanded.value = !state.isComplete
    lastInspectorProgressAutoState.value = state
  },
  { immediate: true },
)

function toggleInspectorProgress(): void {
  isInspectorProgressExpanded.value = !isInspectorProgressExpanded.value
}

function formatCompactTokenCount(value: number): string {
  if (!Number.isFinite(value)) return '0'
  return new Intl.NumberFormat('en-US', {
    notation: value >= 1000 ? 'compact' : 'standard',
    maximumFractionDigits: value >= 100000 ? 0 : 1,
  }).format(Math.max(0, Math.trunc(value)))
}

function buildThreadContextTooltip(usage: UiThreadTokenUsage | null): string {
  if (!usage) {
    return t('Waiting for Codex thread/tokenUsage/updated events for this thread.')
  }

  const lines = [
    `${t('Current context usage')}: ${usage.currentContextTokens.toLocaleString()} ${t('tokens')}`,
    `${t('Cumulative thread usage')}: ${usage.total.totalTokens.toLocaleString()} ${t('tokens')}`,
  ]

  if (typeof usage.modelContextWindow === 'number') {
    lines.unshift(`${t('Model context window')}: ${usage.modelContextWindow.toLocaleString()} ${t('tokens')}`)
    lines.push(`${t('Remaining context')}: ${(usage.remainingContextTokens ?? 0).toLocaleString()} ${t('tokens')}`)
  } else {
    lines.push(t('Model context window is unavailable in the latest usage event.'))
  }

  return lines.join('\n')
}

const threadContextBadgeState = computed(() => {
  const remainingPercent = selectedThreadTokenUsage.value?.remainingContextPercent
  if (remainingPercent === null || typeof remainingPercent !== 'number') return 'pending'
  if (remainingPercent <= 10) return 'danger'
  if (remainingPercent <= 25) return 'warning'
  return 'ok'
})

const threadContextPrimaryText = computed(() => {
  const usage = selectedThreadTokenUsage.value
  if (!usage) return t('Awaiting data')
  if (typeof usage.remainingContextTokens === 'number') {
    return `${formatCompactTokenCount(usage.remainingContextTokens)} ${t('left')}`
  }
  return `${formatCompactTokenCount(usage.currentContextTokens)} ${t('used')}`
})

const threadContextSecondaryText = computed(() => {
  const usage = selectedThreadTokenUsage.value
  if (!usage) return t('Updates after the next token usage event')
  if (typeof usage.modelContextWindow === 'number') {
    return `${formatCompactTokenCount(usage.currentContextTokens)} ${t('used')} / ${formatCompactTokenCount(usage.modelContextWindow)}`
  }
  return t('Window size unavailable')
})

const threadContextTooltip = computed(() => buildThreadContextTooltip(selectedThreadTokenUsage.value))

function getFolderOptionLabel(path: string, fallbackLabel = ''): string {
  const normalizedPath = normalizePathForUi(path).trim()
  const explicitLabel = fallbackLabel.trim()
  if (explicitLabel) return explicitLabel
  const leafName = getPathLeafName(normalizedPath)
  const knownPaths = [
    ...workspaceRootOptionsState.value.order,
    ...projectGroups.value.map((group) => group.threads[0]?.cwd?.trim() ?? '').filter(Boolean),
  ]
  return hasDuplicateFolderLeaf(normalizedPath, knownPaths) ? normalizedPath : leafName
}

function getOrderedWorkspaceRootOptions(): string[] {
  const savedRoots = new Set(workspaceRootOptionsState.value.order)
  const orderedRoots = workspaceRootOptionsState.value.projectOrder.filter((item) => savedRoots.has(item))
  for (const rootPath of workspaceRootOptionsState.value.order) {
    if (!orderedRoots.includes(rootPath)) orderedRoots.push(rootPath)
  }
  return orderedRoots
}

function getProjectOrderNameForPath(path: string): string {
  const normalizedPath = normalizePathForUi(path).trim()
  const knownPaths = [
    ...workspaceRootOptionsState.value.order,
    ...projectGroups.value.map((group) => group.threads[0]?.cwd?.trim() ?? '').filter(Boolean),
  ]
  return hasDuplicateFolderLeaf(normalizedPath, knownPaths) ? normalizedPath : getPathLeafName(normalizedPath)
}

function resolveWorkspaceRootCwd(projectName: string): string {
  const normalizedProjectName = normalizePathForUi(projectName).trim()
  if (!normalizedProjectName) return ''
  const knownPaths = [
    ...workspaceRootOptionsState.value.order,
    ...projectGroups.value.map((group) => group.threads[0]?.cwd?.trim() ?? '').filter(Boolean),
  ]
  for (const cwdRaw of workspaceRootOptionsState.value.order) {
    const cwd = normalizePathForUi(cwdRaw).trim()
    if (!cwd) continue
    const leafName = getPathLeafName(cwd)
    const orderName = hasDuplicateFolderLeaf(cwd, knownPaths) ? cwd : leafName
    if (cwd === normalizedProjectName || orderName === normalizedProjectName || leafName === normalizedProjectName) {
      return cwd
    }
  }
  return ''
}

const newThreadFolderOptions = computed(() => {
  const options: Array<{ value: string; label: string }> = []
  const seenCwds = new Set<string>()

  for (const cwdRaw of getOrderedWorkspaceRootOptions()) {
    const cwd = cwdRaw.trim()
    if (!cwd || seenCwds.has(cwd)) continue
    seenCwds.add(cwd)
    options.push({
      value: cwd,
      label: getFolderOptionLabel(cwd, workspaceRootOptionsState.value.labels[cwd]),
    })
  }

  for (const group of projectGroups.value) {
    const cwd = group.threads[0]?.cwd?.trim() ?? ''
    if (!cwd || seenCwds.has(cwd) || isProjectlessChatPath(cwd)) continue
    seenCwds.add(cwd)
    options.push({
      value: cwd,
      label: getFolderOptionLabel(cwd, projectDisplayNameById.value[group.projectName]),
    })
  }

  const selectedCwd = newThreadCwd.value.trim()
  if (selectedCwd && !seenCwds.has(selectedCwd)) {
    options.unshift({
      value: selectedCwd,
      label: getFolderOptionLabel(selectedCwd),
    })
  }

  return options
})
const isNewThreadCwdGitRepo = computed(() => {
  const cwd = newThreadCwd.value.trim()
  return cwd ? gitRepoStatusByCwd.value[cwd] === true : false
})
const projectGitRepoByName = computed<Record<string, boolean>>(() => {
  const result: Record<string, boolean> = {}
  for (const group of projectGroups.value) {
    const cwd = resolvePreferredLocalCwd(group.projectName, group.threads[0]?.cwd?.trim() ?? '')
    result[group.projectName] = cwd ? gitRepoStatusByCwd.value[cwd] === true : false
  }
  return result
})
const newWorktreeBranchDropdownOptions = computed<Array<{ value: string; label: string }>>(() => {
  const selectedBranch = newWorktreeBaseBranch.value.trim()
  const options = [...worktreeBranchOptions.value]
  if (selectedBranch && !options.some((option) => option.value === selectedBranch)) {
    options.unshift({ value: selectedBranch, label: selectedBranch })
  }
  return options
})
const selectedWorktreeBranchLabel = computed(() => {
  const selectedBranch = newWorktreeBaseBranch.value.trim()
  if (!selectedBranch) return ''
  const selected = newWorktreeBranchDropdownOptions.value.find((option) => option.value === selectedBranch)
  return selected?.label ?? selectedBranch
})
const createFolderParentPath = computed(() => existingFolderBrowsePath.value.trim())
const isCreateFolderNameValid = computed(() => {
  const draft = createFolderDraft.value.trim()
  if (!draft) return false
  if (draft === '.' || draft === '..') return false
  return !/[\\/]/u.test(draft)
})
const canCreateFolder = computed(() => {
  return isCreateFolderNameValid.value && createFolderParentPath.value.trim().length > 0 && !existingFolderError.value
})
const isProjectNameDraftValid = computed(() => {
  const draft = projectNameDraft.value.trim()
  if (!draft) return false
  if (draft === '.' || draft === '..') return false
  return !/[\\/]/u.test(draft)
})
const canSubmitProjectSetup = computed(() => {
  const baseDir = projectSetupBaseDir.value.trim()
  if (!baseDir) return false
  if (projectSetupMode.value === 'create') return isProjectNameDraftValid.value
  return githubCloneUrlDraft.value.trim().length > 0
})
const resolvedExistingFolderPath = computed(() => {
  const draftedPath = normalizePathForUi(existingFolderPathDraft.value).trim()
  if (draftedPath) return draftedPath
  return existingFolderBrowsePath.value.trim()
})
const createFolderSubmitLabel = computed(() => {
  if (isCreatingFolder.value) return 'Creating…'
  return 'Create'
})
const projectSetupSubmitLabel = computed(() => {
  if (isProjectSetupSubmitting.value) {
    return projectSetupMode.value === 'clone' ? t('Cloning…') : t('Creating…')
  }
  return projectSetupMode.value === 'clone' ? t('Clone repository') : t('Create project')
})
const canBrowseExistingFolderParent = computed(() => {
  const current = existingFolderBrowsePath.value.trim()
  const parent = existingFolderParentPath.value.trim()
  return Boolean(current && parent && current !== parent)
})
const existingFolderDisplayEntries = computed(() => {
  const entries: Array<{ key: string; name: string; path: string; kind: 'parent' | 'directory' }> = []
  if (canBrowseExistingFolderParent.value) {
    entries.push({
      key: `parent:${existingFolderParentPath.value}`,
      name: '..',
      path: existingFolderParentPath.value,
      kind: 'parent',
    })
  }
  for (const entry of existingFolderEntries.value) {
    entries.push({
      key: `directory:${entry.path}`,
      name: entry.name,
      path: entry.path,
      kind: 'directory',
    })
  }
  return entries
})
const existingFolderFilteredEntries = computed(() => {
  const filter = existingFolderFilter.value.trim().toLowerCase()
  if (!filter) return existingFolderDisplayEntries.value
  return existingFolderDisplayEntries.value.filter((entry) =>
    entry.kind === 'parent' || entry.name.toLowerCase().includes(filter),
  )
})
const contentStyle = computed(() => {
  const preset = CHAT_WIDTH_PRESETS[chatWidth.value]
  const keyboardInset = Math.max(
    0,
    layoutViewportHeight.value - visualViewportHeight.value - visualViewportOffsetTop.value,
  )
  return {
    '--chat-column-max': preset.columnMax,
    '--chat-card-max': preset.cardMax,
    '--visual-viewport-height': visualViewportHeight.value > 0 ? `${visualViewportHeight.value}px` : '100dvh',
    '--visual-viewport-offset-top': `${Math.max(0, visualViewportOffsetTop.value)}px`,
    '--virtual-keyboard-inset': `${keyboardInset}px`,
  }
})

onMounted(() => {
  window.addEventListener('keydown', onWindowKeyDown)
  document.addEventListener('visibilitychange', onDocumentVisibilityChange)
  window.addEventListener('pageshow', onWindowPageShow)
  window.addEventListener('focus', onWindowFocus)
  window.addEventListener('resize', updateVisualViewportState)
  window.visualViewport?.addEventListener('resize', updateVisualViewportState)
  window.visualViewport?.addEventListener('scroll', updateVisualViewportState)
  updateVisualViewportState()
  void initialize()
  void loadWorkspaceRootOptionsState()
  void refreshDefaultProjectName()
})

onUnmounted(() => {
  window.removeEventListener('keydown', onWindowKeyDown)
  document.removeEventListener('visibilitychange', onDocumentVisibilityChange)
  window.removeEventListener('pageshow', onWindowPageShow)
  window.removeEventListener('focus', onWindowFocus)
  window.removeEventListener('resize', updateVisualViewportState)
  window.visualViewport?.removeEventListener('resize', updateVisualViewportState)
  window.visualViewport?.removeEventListener('scroll', updateVisualViewportState)
  if (threadSearchTimer) {
    clearTimeout(threadSearchTimer)
    threadSearchTimer = null
  }
  stopPolling()
  clearHomeLiveOverlayTimer()
})

function updateVisualViewportState(): void {
  if (typeof window === 'undefined') return
  layoutViewportHeight.value = Math.max(layoutViewportHeight.value, window.innerHeight)
  visualViewportHeight.value = window.visualViewport?.height ?? window.innerHeight
  visualViewportOffsetTop.value = window.visualViewport?.offsetTop ?? 0
}

watch(
  () => homeLiveOverlay.value?.activityStartedAtMs ?? null,
  syncHomeLiveOverlayTimer,
  { immediate: true },
)

watch(sidebarSearchQuery, (value) => {
  const query = value.trim()
  if (threadSearchTimer) {
    clearTimeout(threadSearchTimer)
    threadSearchTimer = null
  }
  if (!query) {
    serverMatchedThreadIds.value = null
    return
  }

  threadSearchTimer = setTimeout(() => {
    void searchThreads(query, 1000)
      .then((result) => {
        if (sidebarSearchQuery.value.trim() !== query) return
        insertThreadSummaries(result.threads)
        serverMatchedThreadIds.value = result.threadIds
      })
      .catch(() => {
        if (sidebarSearchQuery.value.trim() !== query) return
        serverMatchedThreadIds.value = null
      })
  }, 220)
})

function onSkillsChanged(): void {
  void refreshSkills()
}

function onSelectThread(threadId: string): void {
  if (!threadId) return
  if (route.name === 'thread' && routeThreadId.value === threadId) return
  void router.push({ name: 'thread', params: { threadId } })
  if (isMobile.value) setSidebarCollapsed(true)
}

async function onExportThread(threadId: string): Promise<void> {
  if (!threadId) return
  if (selectedThreadId.value !== threadId) {
    await selectThread(threadId)
    await router.push({ name: 'thread', params: { threadId } })
  }
  await nextTick()
  onExportChat()
}

function onArchiveThread(threadId: string): void {
  void archiveThreadById(threadId)
}

function onDeleteThread(threadId: string): void {
  void deleteThreadSessionById(threadId)
}

async function onForkThread(threadId: string): Promise<void> {
  const nextThreadId = await forkThreadById(threadId)
  if (!nextThreadId) return
  if (!isHomeRoute.value) {
    await router.push({ name: 'thread', params: { threadId: nextThreadId } })
  } else {
    await router.replace({ name: 'thread', params: { threadId: nextThreadId } })
  }
  if (isMobile.value) setSidebarCollapsed(true)
}

function resolvePreferredLocalCwd(projectName: string, fallbackCwd = ''): string {
  const group = projectGroups.value.find((row) => row.projectName === projectName)
  if (!group) return resolveWorkspaceRootCwd(projectName) || fallbackCwd.trim()
  const nonWorktreeThread = group.threads.find((thread) => !isWorktreePath(thread.cwd))
  const candidate = nonWorktreeThread?.cwd?.trim() ?? group.threads[0]?.cwd?.trim() ?? ''
  return candidate || resolveWorkspaceRootCwd(projectName) || fallbackCwd.trim()
}

function onStartNewThread(projectName: string): void {
  const projectGroup = projectGroups.value.find((group) => group.projectName === projectName)
  const projectCwd = resolvePreferredLocalCwd(projectName, projectGroup?.threads[0]?.cwd?.trim() ?? '')
  if (projectCwd) {
    newThreadCwd.value = projectCwd
  }
  if (isMobile.value) setSidebarCollapsed(true)
  if (isHomeRoute.value) return
  void router.push({ name: 'home' })
}

function getProjectCwd(projectName: string): string {
  const projectGroup = projectGroups.value.find((group) => group.projectName === projectName)
  return resolvePreferredLocalCwd(projectName, projectGroup?.threads[0]?.cwd?.trim() ?? '')
}

const projectCwdByName = computed<Record<string, string>>(() =>
  Object.fromEntries(
    projectGroups.value
      .map((group) => [group.projectName, getProjectCwd(group.projectName).trim()] as const)
      .filter(([, cwd]) => cwd.length > 0),
  ),
)

function getProjectDisplayNameForWorktree(projectName: string): string {
  const fallbackName = getPathLeafName(projectName) || projectName
  return (projectDisplayNameById.value[projectName] ?? fallbackName).trim() || fallbackName
}

function toWorktreeFolderNameDraft(projectName: string): string {
  const displayName = getProjectDisplayNameForWorktree(projectName)
  const sanitized = displayName
    .replace(/[\\/]+/gu, '-')
    .replace(/[\u0000-\u001f]+/gu, '')
    .trim()
  return sanitized || 'worktree'
}

function onBrowseProjectFiles(projectName: string): void {
  const targetCwd = getProjectCwd(projectName)
  if (!targetCwd || typeof window === 'undefined') return
  window.open(`/codex-local-browse${encodeURI(targetCwd)}`, '_blank', 'noopener,noreferrer')
}

async function onCreateProjectWorktree(projectName: string): Promise<void> {
  const sourceCwd = getProjectCwd(projectName)
  if (!sourceCwd || typeof window === 'undefined') return
  await loadGitRepoStatus(sourceCwd)
  if (gitRepoStatusByCwd.value[sourceCwd] !== true) return

  const suggestedName = `${toWorktreeFolderNameDraft(projectName)}-`
  const worktreeName = window.prompt('New worktree folder name', suggestedName)
  if (worktreeName === null) return

  const normalizedWorktreeName = worktreeName.trim()
  if (!normalizedWorktreeName) return
  if (normalizedWorktreeName.includes('/') || normalizedWorktreeName.includes('\\') || normalizedWorktreeName === '.' || normalizedWorktreeName === '..') {
    window.alert('Worktree name must be a single folder name.')
    return
  }

  try {
    const created = await createPermanentWorktree(sourceCwd, normalizedWorktreeName)
    const normalizedPath = await openProjectRoot(created.cwd, {
      createIfMissing: false,
      label: '',
    })
    if (!normalizedPath) return

    newThreadCwd.value = normalizedPath
    newThreadRuntime.value = 'local'
    pinProjectToTop(getProjectOrderNameForPath(normalizedPath))
    await loadWorkspaceRootOptionsState()
    await refreshDefaultProjectName()
    if (isMobile.value) setSidebarCollapsed(true)
    if (!isHomeRoute.value) {
      await router.push({ name: 'home' })
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to create worktree.'
    window.alert(message)
  }
}

function onStartNewThreadFromToolbar(): void {
  newThreadCwd.value = ''
  newThreadRuntime.value = 'local'
  if (isMobile.value) setSidebarCollapsed(true)
  if (isHomeRoute.value) return
  void router.push({ name: 'home' })
}

async function loadGitRepoStatus(cwdRaw: string): Promise<void> {
  const cwd = cwdRaw.trim()
  if (!cwd || Object.prototype.hasOwnProperty.call(gitRepoStatusByCwd.value, cwd)) return

  const existingRequest = gitRepoStatusRequestByCwd.get(cwd)
  if (existingRequest) {
    const isGitRepo = await existingRequest
    if (!Object.prototype.hasOwnProperty.call(gitRepoStatusByCwd.value, cwd)) {
      gitRepoStatusByCwd.value = {
        ...gitRepoStatusByCwd.value,
        [cwd]: isGitRepo,
      }
    }
    return
  }

  const request = getGitRepositoryStatus(cwd)
    .then((status) => status.isGitRepo)
    .catch(() => false)
    .finally(() => {
      gitRepoStatusRequestByCwd.delete(cwd)
    })
  gitRepoStatusRequestByCwd.set(cwd, request)

  const isGitRepo = await request
  if (Object.prototype.hasOwnProperty.call(gitRepoStatusByCwd.value, cwd)) return
  gitRepoStatusByCwd.value = {
    ...gitRepoStatusByCwd.value,
    [cwd]: isGitRepo,
  }
}

function onRenameProject(payload: { projectName: string; displayName: string }): void {
  renameProject(payload.projectName, payload.displayName)
}

function onRenameThread(payload: { threadId: string; title: string }): void {
  void renameThreadById(payload.threadId, payload.title)
}

async function onHideProject(projectName: string): Promise<void> {
  await removeProject(projectName)
  await loadWorkspaceRootOptionsState()
  void refreshDefaultProjectName()
}

async function onDeleteProject(projectName: string): Promise<void> {
  const cwd = getProjectCwd(projectName)
  await deleteProjectSessionsByCwd(projectName, cwd)
  await loadWorkspaceRootOptionsState()
  void refreshDefaultProjectName()
}

function onRequestProjectGitStatus(projectName: string): void {
  const group = projectGroups.value.find((entry) => entry.projectName === projectName)
  const cwd = resolvePreferredLocalCwd(projectName, group?.threads[0]?.cwd?.trim() ?? '')
  void loadGitRepoStatus(cwd)
}

function onRespondServerRequest(payload: UiServerRequestReply): void {
  const threadId = selectedThreadId.value
  if (!threadId || isHomeRoute.value) return
  void handleServerRequestResponse(payload, threadId, captureThreadRunConfig())
}

async function handleServerRequestResponse(
  payload: UiServerRequestReply,
  threadId: string,
  runConfig: ThreadRunConfigSnapshot,
): Promise<void> {
  const responded = await respondToPendingServerRequest(payload)
  const followUpMessageText = payload.followUpMessageText?.trim() ?? ''
  if (!responded || !followUpMessageText) return

  try {
    await sendMessageToThread(threadId, followUpMessageText, [], [], [], runConfig)
  } catch {
    // sendMessageToThread 已经通过共享状态展示错误。
  }
}

async function onForkThreadFromMessage(payload: { threadId: string; turnIndex: number }): Promise<void> {
  const forkedThreadId = await forkThreadFromTurn(payload.threadId, payload.turnIndex)
  if (!forkedThreadId) return
  await router.push({ name: 'thread', params: { threadId: forkedThreadId } })
  if (selectedThreadId.value !== forkedThreadId) {
    await selectThread(forkedThreadId)
  }
  if (isMobile.value) setSidebarCollapsed(true)
}

function setSidebarCollapsed(nextValue: boolean): void {
  if (isSidebarCollapsed.value === nextValue) return
  isSidebarCollapsed.value = nextValue
  saveSidebarCollapsed(nextValue)
}

function toggleInspectorPanel(): void {
  isInspectorPanelOpen.value = !isInspectorPanelOpen.value
  saveInspectorPanelOpen(isInspectorPanelOpen.value)
}

function onWindowKeyDown(event: KeyboardEvent): void {
  if (event.defaultPrevented) return
  if (event.key === 'Escape' && isSettingsOpen.value) {
    isSettingsOpen.value = false
    return
  }
  if (shouldInterruptSelectedTurnFromEscape(event)) {
    event.preventDefault()
    event.stopPropagation()
    onInterruptTurn()
    return
  }
  if (!event.ctrlKey && !event.metaKey) return
  if (event.shiftKey || event.altKey) return
  const key = event.key.toLowerCase()
  if (key === 'b') {
    event.preventDefault()
    setSidebarCollapsed(!isSidebarCollapsed.value)
  }
}

function shouldInterruptSelectedTurnFromEscape(event: KeyboardEvent): boolean {
  if (event.key !== 'Escape') return false
  if (event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) return false
  if (!isSelectedThreadInProgress.value) return false
  if (isSelectedThreadInterruptPending.value || isInterruptingTurn.value) return false

  const target = event.target
  if (target instanceof Element) {
    if (target.closest('[role="dialog"], [data-codex-approval-surface]')) return false
  }
  return true
}

function onDocumentVisibilityChange(): void {
  if (typeof document === 'undefined') return
  if (!isMobile.value) return

  if (document.visibilityState === 'hidden') {
    mobileHiddenAtMs.value = Date.now()
    mobileResumeReloadTriggered.value = false
    return
  }

  maybeSyncAfterMobileResume()
}

function onWindowPageShow(event: PageTransitionEvent): void {
  if (!event.persisted) return
  maybeSyncAfterMobileResume()
}

function onWindowFocus(): void {
  if (route.name === 'home') {
    void loadWorkspaceRootOptionsState()
    void refreshDefaultProjectName()
  }
  maybeSyncAfterMobileResume()
}

function maybeSyncAfterMobileResume(): void {
  if (typeof window === 'undefined' || typeof document === 'undefined') return
  if (!isMobile.value) return
  if (document.visibilityState !== 'visible') return
  if (mobileResumeReloadTriggered.value) return
  if (mobileHiddenAtMs.value === null) return

  const hiddenForMs = Date.now() - mobileHiddenAtMs.value
  if (hiddenForMs < MOBILE_RESUME_RELOAD_MIN_HIDDEN_MS) return

  mobileResumeReloadTriggered.value = true
  mobileHiddenAtMs.value = null
  void syncAfterMobileResume()
}

async function syncAfterMobileResume(): Promise<void> {
  if (mobileResumeSyncInProgress.value) return
  mobileResumeSyncInProgress.value = true

  try {
    await refreshAll({
      includeSelectedThreadMessages: true,
      awaitAncillaryRefreshes: true,
    })
    await syncThreadSelectionWithRoute()
  } finally {
    mobileResumeSyncInProgress.value = false
  }
}

function toComposerDraftPayload(payload: ThreadSubmitPayload): ComposerDraftPayload {
  return {
    text: payload.text,
    imageUrls: [...payload.imageUrls],
    fileAttachments: payload.fileAttachments.map((attachment) => ({ ...attachment })),
    skills: payload.skills.map((skill) => ({ ...skill })),
  }
}

function createEmptyComposerDraftPayload(): ComposerDraftPayload {
  return {
    text: '',
    imageUrls: [],
    fileAttachments: [],
    skills: [],
  }
}

async function submitEditedHistoryMessage(
  state: HistoryMessageEditState,
  payload: ThreadSubmitPayload,
  runConfig: ThreadRunConfigSnapshot,
): Promise<void> {
  if (isHomeRoute.value || selectedThreadId.value !== state.threadId) return

  const rolledBack = await rollbackSelectedThread(state.turnId)
  if (!rolledBack) {
    if (!isHomeRoute.value && selectedThreadId.value === state.threadId) {
      editingHistoryMessageState.value = state
      threadComposerRef.value?.hydrateDraft(toComposerDraftPayload(payload))
    }
    return
  }

  void sendMessageToThread(
    state.threadId,
    payload.text,
    payload.imageUrls,
    payload.skills,
    payload.fileAttachments,
    runConfig,
  )
}

function onSubmitThreadMessage(payload: ThreadSubmitPayload): void {
  const text = payload.text
  const threadId = selectedThreadId.value
  const runConfig = captureThreadRunConfig()
  scheduleMobileConversationJumpToLatest()
  const editingHistoryState = editingHistoryMessageState.value
  if (editingHistoryState && editingHistoryState.threadId === threadId) {
    editingHistoryMessageState.value = null
    editingQueuedMessageState.value = null
    void submitEditedHistoryMessage(editingHistoryState, payload, runConfig)
    return
  }

  const editingState = editingQueuedMessageState.value
  const queueInsertIndex =
    payload.mode === 'queue'
    && editingState
    && editingState.threadId === threadId
      ? editingState.queueIndex
      : undefined
  editingQueuedMessageState.value = null
  if (isHomeRoute.value) {
    void submitFirstMessageForNewThread(text, payload.imageUrls, payload.skills, payload.fileAttachments)
    return
  }
  if (!threadId) return
  void sendMessageToThread(
    threadId,
    text,
    payload.imageUrls,
    payload.skills,
    payload.fileAttachments,
    {
      ...runConfig,
      mode: payload.mode,
      queueInsertIndex,
    },
  )
}

function onEditHistoryMessage(payload: { turnId: string; text: string }): void {
  const threadId = selectedThreadId.value
  const turnId = payload.turnId.trim()
  const text = payload.text
  const composer = threadComposerRef.value
  if (isHomeRoute.value || !threadId || !turnId || !text.trim() || !composer) return

  const currentEdit = editingHistoryMessageState.value
  if (currentEdit?.threadId === threadId && currentEdit.turnId === turnId) return

  if (!currentEdit && composer.hasUnsavedDraft()) {
    const shouldReplace = window.confirm('Replace the current draft with this message for editing?')
    if (!shouldReplace) return
  }

  editingQueuedMessageState.value = null
  editingHistoryMessageState.value = {
    threadId,
    turnId,
    previousDraft: currentEdit?.threadId === threadId
      ? currentEdit.previousDraft
      : composer.getDraftPayload(),
  }
  composer.hydrateDraft({
    ...createEmptyComposerDraftPayload(),
    text,
  })
}

function onCancelHistoryMessageEdit(): void {
  const state = editingHistoryMessageState.value
  if (!state || state.threadId !== selectedThreadId.value) return

  editingHistoryMessageState.value = null
  threadComposerRef.value?.hydrateDraft(state.previousDraft)
}

function onEditQueuedMessage(messageId: string): void {
  const queueIndex = selectedThreadQueuedMessages.value.findIndex((item) => item.id === messageId)
  const message = queueIndex >= 0 ? selectedThreadQueuedMessages.value[queueIndex] : undefined
  const composer = threadComposerRef.value
  if (!message || !composer) return

  if (composer.hasUnsavedDraft()) {
    const shouldReplace = window.confirm('Replace the current draft with this queued message for editing?')
    if (!shouldReplace) return
  }

  editingQueuedMessageState.value = selectedThreadId.value
    ? { threadId: selectedThreadId.value, queueIndex }
    : null
  editingHistoryMessageState.value = null
  const payload: ComposerDraftPayload = {
    text: message.text,
    imageUrls: [...message.imageUrls],
    fileAttachments: message.fileAttachments.map((attachment) => ({ ...attachment })),
    skills: message.skills.map((skill) => ({ ...skill })),
  }
  composer.hydrateDraft(payload)
  removeQueuedMessage(messageId)
}


function scheduleMobileConversationJumpToLatest(): void {
  if (!isMobile.value || isHomeRoute.value) return

  const jumpToLatest = () => {
    threadConversationRef.value?.jumpToLatest()
  }

  jumpToLatest()
  void nextTick(() => {
    jumpToLatest()
    if (typeof window === 'undefined') return
    window.requestAnimationFrame(() => {
      jumpToLatest()
      window.requestAnimationFrame(jumpToLatest)
    })
  })
}

function onSelectNewThreadFolder(cwd: string): void {
  newThreadCwd.value = cwd.trim()
  createFolderError.value = ''
}

function onSelectNewWorktreeBranch(branch: string): void {
  newWorktreeBaseBranch.value = branch.trim()
}

function canLoadBranchStateForCwd(cwd: string): boolean {
  const currentCwd = composerCwd.value.trim()
  if (!cwd || currentCwd !== cwd) return false
  return route.name === 'thread' || (route.name === 'home' && isNewThreadCwdGitRepo.value)
}

function resetThreadBranchState(): void {
  threadBranchesRequestId += 1
  currentThreadBranch.value = null
  currentThreadHeadSha.value = null
  currentThreadHeadSubject.value = null
  isThreadDetachedHead.value = false
  isThreadWorktreeDirty.value = false
  isLoadingThreadBranches.value = false
}

async function loadThreadBranches(cwd: string): Promise<void> {
  const targetCwd = cwd.trim()
  if (!targetCwd) {
    resetThreadBranchState()
    return
  }
  const requestId = ++threadBranchesRequestId
  isLoadingThreadBranches.value = true
  try {
    const state = await getGitBranchState(targetCwd)
    if (requestId !== threadBranchesRequestId || !canLoadBranchStateForCwd(targetCwd)) return
    currentThreadBranch.value = state.currentBranch
    currentThreadHeadSha.value = state.headSha
    currentThreadHeadSubject.value = state.headSubject
    isThreadDetachedHead.value = state.detached
    isThreadWorktreeDirty.value = state.dirty
  } catch {
    if (requestId !== threadBranchesRequestId || !canLoadBranchStateForCwd(targetCwd)) return
    currentThreadBranch.value = null
    currentThreadHeadSha.value = null
    currentThreadHeadSubject.value = null
    isThreadDetachedHead.value = false
    isThreadWorktreeDirty.value = false
  } finally {
    if (requestId === threadBranchesRequestId) {
      isLoadingThreadBranches.value = false
    }
  }
}

async function onOpenProjectSetupModal(): Promise<void> {
  const baseDir = await resolveProjectBaseDirectory()
  if (!baseDir) return

  await refreshDefaultProjectName()
  projectSetupBaseDir.value = baseDir
  projectNameDraft.value = defaultNewProjectName.value.trim() || 'New Project (1)'
  githubCloneUrlDraft.value = ''
  projectSetupError.value = ''
  projectSetupMode.value = 'create'
  isProjectSetupModalOpen.value = true
  void nextTick(() => projectSetupPrimaryInputRef.value?.focus())
}

function onCloseProjectSetupModal(): void {
  if (isProjectSetupSubmitting.value) return
  isProjectSetupModalOpen.value = false
  projectSetupError.value = ''
}

async function createProjectFromSetupModal(): Promise<string> {
  const baseDir = projectSetupBaseDir.value.trim()
  const normalizedProjectName = projectNameDraft.value.trim()
  if (!isProjectNameDraftValid.value) {
    throw new Error('Enter a single project folder name.')
  }
  const targetPath = normalizeAbsolutePath(joinPath(baseDir, normalizedProjectName))
  if (!targetPath) return ''

  return openProjectRoot(targetPath, {
    createIfMissing: true,
    label: '',
  })
}

async function cloneGithubRepositoryFromSetupModal(): Promise<string> {
  const baseDir = projectSetupBaseDir.value.trim()
  const normalizedRepoUrl = githubCloneUrlDraft.value.trim()
  if (!normalizedRepoUrl) return ''

  return cloneGithubRepository(normalizedRepoUrl, baseDir)
}

async function onSubmitProjectSetup(): Promise<void> {
  if (!canSubmitProjectSetup.value || isProjectSetupSubmitting.value) return

  projectSetupError.value = ''
  isProjectSetupSubmitting.value = true
  try {
    const normalizedPath =
      projectSetupMode.value === 'clone'
        ? await cloneGithubRepositoryFromSetupModal()
        : await createProjectFromSetupModal()
    if (!normalizedPath) return

    newThreadCwd.value = normalizedPath
    pinProjectToTop(getProjectOrderNameForPath(normalizedPath))
    await loadWorkspaceRootOptionsState()
    await refreshDefaultProjectName()
    isProjectSetupModalOpen.value = false
  } catch (error) {
    projectSetupError.value = error instanceof Error ? error.message : 'Failed to create or clone project.'
  } finally {
    isProjectSetupSubmitting.value = false
  }
}

function onProjectSetupInputKeydown(event: KeyboardEvent): void {
  if (isImeComposingKeydown(event)) {
    event.stopPropagation()
    return
  }
  if (!shouldHandleEnterKeydown(event)) return
  event.preventDefault()
  void onSubmitProjectSetup()
}

async function onOpenExistingFolder(): Promise<void> {
  const startPath = newThreadCwd.value.trim() || await resolveProjectBaseDirectory()
  if (!startPath) return
  isCreateFolderOpen.value = false
  isExistingFolderPickerOpen.value = true
  existingFolderFilter.value = ''
  await loadExistingFolderListing(startPath)
  if (!existingFolderError.value) {
    void nextTick(() => existingFolderPathInputRef.value?.focus())
  }
}

function onCloseExistingFolderPanel(): void {
  existingFolderBrowseRequestId += 1
  isExistingFolderPickerOpen.value = false
  isExistingFolderLoading.value = false
  existingFolderError.value = ''
  existingFolderFilter.value = ''
  existingFolderPathDraft.value = ''
  onCloseCreateFolderPanel()
}

async function onBrowseExistingFolder(path: string): Promise<void> {
  if (!path || isExistingFolderLoading.value) return
  existingFolderFilter.value = ''
  await loadExistingFolderListing(path)
}

function onToggleHiddenFolders(): void {
  const currentPath = existingFolderBrowsePath.value.trim()
  if (!isExistingFolderPickerOpen.value || !currentPath) return
  void loadExistingFolderListing(currentPath)
}

function onRetryExistingFolderBrowse(): void {
  const currentPath = resolvedExistingFolderPath.value
  if (!isExistingFolderPickerOpen.value || !currentPath || isExistingFolderLoading.value) return
  void loadExistingFolderListing(currentPath)
}

function onExistingFolderPathBlur(): void {
  if (!isExistingFolderPickerOpen.value || isExistingFolderLoading.value || isOpeningExistingFolder.value) return
  const draftedPath = resolvedExistingFolderPath.value
  const currentPath = existingFolderBrowsePath.value.trim()
  if (!draftedPath || draftedPath === currentPath) return
  void loadExistingFolderListing(draftedPath)
}

function onSubmitExistingFolderPath(): void {
  const draftedPath = resolvedExistingFolderPath.value
  const currentPath = existingFolderBrowsePath.value.trim()
  if (!draftedPath) return
  if (draftedPath !== currentPath) {
    void loadExistingFolderListing(draftedPath)
    return
  }
  void onConfirmExistingFolder(draftedPath)
}

function onExistingFolderPathKeydown(event: KeyboardEvent): void {
  if (isImeComposingKeydown(event)) {
    event.stopPropagation()
    return
  }
  if (shouldHandleEnterKeydown(event)) {
    event.preventDefault()
    onSubmitExistingFolderPath()
    return
  }
  if (event.key === 'Escape') {
    event.preventDefault()
    event.stopPropagation()
    onCloseExistingFolderPanel()
  }
}

async function onConfirmExistingFolder(path = resolvedExistingFolderPath.value): Promise<void> {
  const targetPath = normalizePathForUi(path).trim()
  if (!targetPath) return

  existingFolderError.value = ''
  isOpeningExistingFolder.value = true
  try {
    const normalizedPath = await openProjectRoot(targetPath, {
      createIfMissing: false,
      label: '',
    })
    if (!normalizedPath) {
      existingFolderError.value = 'Failed to open the selected folder.'
      return
    }

    newThreadCwd.value = normalizedPath
    pinProjectToTop(getProjectOrderNameForPath(normalizedPath))
    await loadWorkspaceRootOptionsState()
    await refreshDefaultProjectName()
    onCloseExistingFolderPanel()
  } catch (error) {
    existingFolderError.value = error instanceof Error ? error.message : 'Failed to open the selected folder.'
  } finally {
    isOpeningExistingFolder.value = false
  }
}

async function onOpenCreateFolderPanel(): Promise<void> {
  createFolderError.value = ''
  if (isCreateFolderOpen.value) {
    onCloseCreateFolderPanel()
    return
  }
  if (!isExistingFolderPickerOpen.value) {
    const startPath = newThreadCwd.value.trim() || await resolveProjectBaseDirectory()
    if (!startPath) return
    isExistingFolderPickerOpen.value = true
    existingFolderFilter.value = ''
    await loadExistingFolderListing(startPath)
    if (existingFolderError.value) return
  }
  if (existingFolderError.value) return
  createFolderDraft.value = defaultNewProjectName.value
  isCreateFolderOpen.value = true
  void nextTick(() => createFolderInputRef.value?.focus())
}

function onCloseCreateFolderPanel(): void {
  createFolderError.value = ''
  createFolderDraft.value = ''
  isCreateFolderOpen.value = false
}

async function onCreateFolder(): Promise<void> {
  const normalizedInput = createFolderDraft.value.trim()
  if (!normalizedInput) return

  createFolderError.value = ''
  if (existingFolderError.value) {
    createFolderError.value = 'Reload the current folder before creating a new one.'
    return
  }
  isCreatingFolder.value = true

  const baseDir = createFolderParentPath.value.trim()
  const targetPath = normalizeAbsolutePath(joinPath(baseDir, normalizedInput))

  if (!targetPath) {
    createFolderError.value = 'Unable to determine where the new folder should be created.'
    isCreatingFolder.value = false
    return
  }

  if (!isCreateFolderNameValid.value) {
    createFolderError.value = 'Enter a single folder name.'
    isCreatingFolder.value = false
    return
  }

  try {
    const normalizedPath = await createLocalDirectory(targetPath)
    if (!normalizedPath) {
      createFolderError.value = 'Failed to create the folder.'
      return
    }

    createFolderError.value = ''
    existingFolderFilter.value = ''
    await loadExistingFolderListing(normalizedPath)
    onCloseCreateFolderPanel()
  } catch (error) {
    createFolderError.value = error instanceof Error ? error.message : 'Failed to create folder.'
  } finally {
    isCreatingFolder.value = false
  }
}

function onCreateFolderInputKeydown(event: KeyboardEvent): void {
  if (isImeComposingKeydown(event)) {
    event.stopPropagation()
    return
  }
  if (shouldHandleEnterKeydown(event)) {
    event.preventDefault()
    void onCreateFolder()
    return
  }
  if (event.key === 'Escape') {
    event.preventDefault()
    event.stopPropagation()
    onCloseCreateFolderPanel()
  }
}

async function applyLaunchProjectPathFromUrl(): Promise<boolean> {
  if (typeof window === 'undefined') return false
  const launchProjectPath = new URLSearchParams(window.location.search).get('openProjectPath')?.trim() ?? ''
  if (!launchProjectPath) return false
  try {
    const normalizedPath = await openProjectRoot(launchProjectPath, {
      createIfMissing: false,
      label: '',
    })
    if (!normalizedPath) return false
    newThreadCwd.value = normalizedPath
    pinProjectToTop(getProjectOrderNameForPath(normalizedPath))
    await router.replace({ name: 'home' })
    await loadWorkspaceRootOptionsState()
    const nextUrl = new URL(window.location.href)
    nextUrl.searchParams.delete('openProjectPath')
    window.history.replaceState({}, '', nextUrl.toString())
    return true
  } catch {
    // If launch path is invalid, keep normal startup behavior.
    return false
  }
}

async function resolveProjectBaseDirectory(): Promise<string> {
  const baseDir = getProjectBaseDirectory()
  if (baseDir) return baseDir
  try {
    const loadedHomeDirectory = await loadHomeDirectory()
    if (loadedHomeDirectory) {
      return loadedHomeDirectory
    }
  } catch {
    // Fallback handled by empty return.
  }
  return ''
}

async function refreshDefaultProjectName(): Promise<void> {
  const baseDir = getProjectBaseDirectory()
  if (!baseDir) {
    defaultNewProjectName.value = 'New Project (1)'
    return
  }

  try {
    const suggestion = await getProjectRootSuggestion(baseDir)
    defaultNewProjectName.value = suggestion.name || 'New Project (1)'
  } catch {
    defaultNewProjectName.value = 'New Project (1)'
  }
}

function getProjectBaseDirectory(): string {
  const selected = newThreadCwd.value.trim()
  if (selected) return getPathParent(selected)
  const first = newThreadFolderOptions.value[0]?.value?.trim() ?? ''
  if (first) return getPathParent(first)
  return homeDirectory.value.trim()
}

async function loadWorkspaceRootOptionsState(): Promise<void> {
  try {
    const state = await getWorkspaceRootsState()
    workspaceRootOptionsState.value = {
      order: [...state.order],
      labels: { ...state.labels },
      projectOrder: [...state.projectOrder],
    }
  } catch {
    workspaceRootOptionsState.value = { order: [], labels: {}, projectOrder: [] }
  }
}

async function loadExistingFolderListing(path: string): Promise<void> {
  const requestId = ++existingFolderBrowseRequestId
  const normalizedRequestedPath = normalizePathForUi(path).trim()
  existingFolderPathDraft.value = normalizedRequestedPath
  existingFolderBrowsePath.value = normalizedRequestedPath
  existingFolderError.value = ''
  isExistingFolderLoading.value = true

  try {
    const listing = await listLocalDirectories(path, { showHidden: showHiddenFolders.value })
    if (requestId !== existingFolderBrowseRequestId) return
    existingFolderPathDraft.value = listing.path
    existingFolderBrowsePath.value = listing.path
    existingFolderParentPath.value = listing.parentPath
    existingFolderEntries.value = listing.entries
  } catch (error) {
    if (requestId !== existingFolderBrowseRequestId) return
    existingFolderError.value = error instanceof Error ? error.message : 'Failed to load local folders.'
    existingFolderParentPath.value = getPathParent(existingFolderBrowsePath.value)
    existingFolderEntries.value = []
    onCloseCreateFolderPanel()
  } finally {
    if (requestId === existingFolderBrowseRequestId) {
      isExistingFolderLoading.value = false
    }
  }
}

function onReorderQueuedMessage(payload: { draggedId: string; targetId: string }): void {
  reorderQueuedMessage(payload.draggedId, payload.targetId)
}

function onSelectModel(modelId: string): void {
  setSelectedModelIdForThread(composerThreadContextId.value, modelId)
}

function onSelectReasoningEffort(effort: ReasoningEffort | ''): void {
  setSelectedReasoningEffort(effort)
}

function onSelectSpeedMode(mode: SpeedMode): void {
  void updateSelectedSpeedMode(mode)
}

function onInterruptTurn(): void {
  void interruptSelectedThreadTurn()
}

function onImplementPlan(payload: { turnId: string }): void {
  if (isHomeRoute.value || !selectedThreadId.value) return
  setSelectedCollaborationMode('default')
  scheduleMobileConversationJumpToLatest()
  void sendMessageToSelectedThread('Implement', [], [], 'steer', [], undefined, 'default')
}


function onExportChat(): void {
  if (isHomeRoute.value || isSkillsRoute.value || typeof document === 'undefined') return
  const thread = selectedThread.value
  if (!thread || filteredMessages.value.length === 0) return
  const exportedAt = new Date()
  const markdown = buildThreadMarkdown(thread, filteredMessages.value, exportedAt)
  const fileName = buildExportFileName(thread.title, exportedAt)
  const blob = new Blob([markdown], { type: 'text/markdown;charset=utf-8' })
  const objectUrl = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = objectUrl
  link.download = fileName
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 0)
}

function toggleAccountsSectionCollapsed(): void {
  isAccountsSectionCollapsed.value = !isAccountsSectionCollapsed.value
  saveAccountsSectionCollapsed(isAccountsSectionCollapsed.value)
}

function normalizeMessageType(rawType: string | undefined, role: string): string {
  const normalized = (rawType ?? '').trim()
  if (normalized.length > 0) {
    return normalized
  }
  return role.trim() || 'message'
}

function onSelectCollaborationMode(mode: 'default' | 'plan'): void {
  setSelectedCollaborationMode(mode)
}

async function initialize(): Promise<void> {
  await router.isReady()

  if (route.name === 'thread' && routeThreadId.value) {
    primeSelectedThread(routeThreadId.value)
  }

  await refreshAll({
    includeSelectedThreadMessages: route.name === 'thread',
  })
  void loadAccountsState({ silent: true })
  await applyLaunchProjectPathFromUrl()
  hasInitialized.value = true
  await syncThreadSelectionWithRoute()
  startPolling()
}

function threadExistsInSidebar(threadId: string): boolean {
  if (!threadId) return false
  return projectGroups.value.some((group) => group.threads.some((thread) => thread.id === threadId))
}

async function syncThreadSelectionWithRoute(): Promise<void> {
  if (isRouteSyncInProgress.value) {
    hasPendingRouteSync = true
    return
  }
  isRouteSyncInProgress.value = true

  try {
    do {
      hasPendingRouteSync = false

      if (route.name === 'home' || route.name === 'skills') {
        if (selectedThreadId.value !== '') {
          await selectThread('')
        }
        continue
      }

      if (route.name === 'thread') {
        const threadId = routeThreadId.value
        if (!threadId) continue

        if (selectedThreadId.value !== threadId) {
          if (!threadExistsInSidebar(threadId)) {
            if (selectedThreadId.value) {
              await router.replace({ name: 'thread', params: { threadId: selectedThreadId.value } })
            } else {
              await router.replace({ name: 'home' })
            }
            continue
          }
          await selectThread(threadId)
        } else {
          void ensureThreadMessagesLoaded(threadId, { silent: true })
        }
      }
    } while (hasPendingRouteSync)

  } finally {
    isRouteSyncInProgress.value = false
  }
}

watch(
  () =>
    [
      route.name,
      routeThreadId.value,
      isLoadingThreads.value,
      selectedThreadId.value,
    ] as const,
  async () => {
    if (!hasInitialized.value) return
    await syncThreadSelectionWithRoute()
  },
)

watch(
  () => [route.name, composerCwd.value] as const,
  ([routeName, cwd]) => {
    if (routeName !== 'thread') return
    void loadGitRepoStatus(cwd)
  },
  { immediate: true },
)

watch(
  () => selectedThreadId.value,
  async (threadId) => {
    if (!hasInitialized.value) return
    if (isRouteSyncInProgress.value) return
    if (isHomeRoute.value || isSkillsRoute.value) return

    if (!threadId) {
      if (route.name !== 'home') {
        await router.replace({ name: 'home' })
      }
      return
    }

    if (route.name === 'thread' && routeThreadId.value === threadId) return
    await router.replace({ name: 'thread', params: { threadId } })
  },
)

watch(
  () => route.name,
  (routeName) => {
    if (!hasInitialized.value || routeName !== 'home') return
    resetNewThreadRunConfig()
  },
)

watch(
  () => newThreadFolderOptions.value,
  (options) => {
    if (options.length === 0) {
      newThreadCwd.value = ''
      void refreshDefaultProjectName()
      return
    }
    const selected = newThreadCwd.value.trim()
    if (selected) {
      const hasSelected = options.some((option) => option.value === selected)
      if (!hasSelected) {
        newThreadCwd.value = ''
      }
    }
    void refreshDefaultProjectName()
  },
  { immediate: true },
)

watch(
  () => newThreadCwd.value,
  () => {
    worktreeInitStatus.value = { phase: 'idle', title: '', message: '' }
    void refreshDefaultProjectName()
  },
)

watch(
  () => [route.name, newThreadCwd.value] as const,
  ([routeName, cwd]) => {
    if (routeName !== 'home') return
    void loadGitRepoStatus(cwd)
  },
  { immediate: true },
)

watch(
  isNewThreadCwdGitRepo,
  (isGitRepo) => {
    if (!isGitRepo && newThreadRuntime.value === 'worktree') {
      newThreadRuntime.value = 'local'
    }
  },
  { immediate: true },
)

watch(
  () => [newThreadRuntime.value, newThreadCwd.value] as const,
  ([runtime, cwd]) => {
    if (runtime !== 'worktree' || !isNewThreadCwdGitRepo.value) return
    void loadWorktreeBranches(cwd)
  },
  { immediate: true },
)

watch(
  () => newThreadRuntime.value,
  (runtime) => {
    if (runtime === 'local') {
      worktreeInitStatus.value = { phase: 'idle', title: '', message: '' }
      const current = newThreadCwd.value.trim()
      if (current && isWorktreePath(current)) {
        const fallbackProjectName = selectedThread.value?.projectName ?? getPathLeafName(current)
        const localCwd = resolvePreferredLocalCwd(fallbackProjectName, '')
        if (localCwd) {
          newThreadCwd.value = localCwd
        }
      }
      return
    }
    if (isNewThreadCwdGitRepo.value) {
      void loadWorktreeBranches(newThreadCwd.value)
    }
  },
)

watch(
  () => route.name,
  (name) => {
    if (name !== 'home') {
      worktreeInitStatus.value = { phase: 'idle', title: '', message: '' }
    }
    if (name !== 'thread') {
      isReviewPaneOpen.value = false
    }
  },
)

watch(
  () => selectedThreadId.value,
  () => {
    worktreeInitStatus.value = { phase: 'idle', title: '', message: '' }
  },
)

watch(
  () => [route.name, composerCwd.value, isNewThreadCwdGitRepo.value] as const,
  ([routeName, cwd, isNewThreadGitRepo]) => {
    const shouldLoadBranches = routeName === 'thread' || (routeName === 'home' && isNewThreadGitRepo)
    if (!shouldLoadBranches) {
      resetThreadBranchState()
      return
    }
    void loadThreadBranches(cwd)
  },
  { immediate: true },
)

watch(
  pageTitle,
  (value) => {
    if (typeof document === 'undefined') return
    document.title = value
  },
  { immediate: true },
)


watch(isMobile, (mobile) => {
  if (mobile && !isSidebarCollapsed.value) {
    setSidebarCollapsed(true)
  }
}, { immediate: true })

async function submitFirstMessageForNewThread(
  text: string,
  imageUrls: string[] = [],
  skills: Array<{ name: string; path: string }> = [],
  fileAttachments: Array<{ label: string; path: string; fsPath: string }> = [],
): Promise<void> {
  const routeFullPathAtSubmit = route.fullPath
  const runConfig = captureNewThreadSendOptions()
  try {
    worktreeInitStatus.value = { phase: 'idle', title: '', message: '' }
    let targetCwd = newThreadCwd.value
    if (newThreadRuntime.value === 'worktree') {
      worktreeInitStatus.value = {
        phase: 'running',
        title: t('Creating worktree'),
        message: t('Creating a worktree and running setup.'),
      }
      try {
        const created = await createWorktree(newThreadCwd.value, newWorktreeBaseBranch.value)
        targetCwd = created.cwd
        newThreadCwd.value = created.cwd
        worktreeInitStatus.value = { phase: 'idle', title: '', message: '' }
      } catch {
        worktreeInitStatus.value = {
          phase: 'error',
          title: t('Worktree setup failed'),
          message: t('Unable to create worktree. Try again or switch to Local project.'),
        }
        return
      }
    } else if (!targetCwd.trim()) {
      const directory = await createProjectlessThreadDirectory(text)
      targetCwd = directory.cwd
      newThreadCwd.value = directory.cwd
    }
    const threadId = await sendMessageToNewThread(text, targetCwd, imageUrls, skills, fileAttachments, runConfig)
    if (!threadId || route.fullPath !== routeFullPathAtSubmit) return
    await router.replace({ name: 'thread', params: { threadId } })
    scheduleMobileConversationJumpToLatest()
  } catch {
    // Error is already reflected in state.
  }
}

async function onTryDirectoryItem(payload: DirectoryTryItemPayload): Promise<void> {
  if (directoryTryInFlightKey.value) return
  const routeFullPathAtSubmit = route.fullPath
  const runConfig = captureNewThreadSendOptions()
  directoryTryInFlightKey.value = getDirectoryTryItemKey(payload)
  const text = buildDirectoryTryPrompt(payload)
  const skills = payload.attachedSkills?.length
    ? payload.attachedSkills
    : payload.kind === 'skill' && payload.skillPath
    ? [{ name: payload.name, path: payload.skillPath }]
    : []
  try {
    const targetCwd = composerCwd.value.trim() || await resolveProjectBaseDirectory()
    const threadId = await sendMessageToNewThread(text, targetCwd, [], skills, [], runConfig)
    if (!threadId || route.fullPath !== routeFullPathAtSubmit) return
    await router.replace({ name: 'thread', params: { threadId } })
    scheduleMobileConversationJumpToLatest()
  } catch {
    // Error is already reflected in shared thread state.
  } finally {
    directoryTryInFlightKey.value = ''
  }
}

async function loadWorktreeBranches(sourceCwd: string): Promise<void> {
  const normalizedSourceCwd = sourceCwd.trim()
  if (!normalizedSourceCwd) {
    worktreeBranchOptions.value = []
    newWorktreeBaseBranch.value = ''
    return
  }

  isLoadingWorktreeBranches.value = true
  try {
    const options = await getWorktreeBranchOptions(normalizedSourceCwd)
    worktreeBranchOptions.value = options
    const currentSelection = newWorktreeBaseBranch.value.trim()
    const hasCurrentSelection = currentSelection.length > 0 && options.some((option) => option.value === currentSelection)
    if (!hasCurrentSelection) {
      const preferredMainOption = options.find((option) => option.value.trim() === 'main')
      newWorktreeBaseBranch.value = preferredMainOption?.value ?? options[0]?.value ?? ''
    }
  } catch {
    worktreeBranchOptions.value = []
    newWorktreeBaseBranch.value = ''
  } finally {
    isLoadingWorktreeBranches.value = false
  }
}
</script>

<style scoped>
@reference "tailwindcss";

.content-root {
  @apply h-full min-h-0 min-w-0 w-full flex flex-col overflow-y-hidden overflow-x-hidden transition-colors;
  background-color: var(--codex-bg);
}

.content-root.is-virtual-keyboard-open {
  height: var(--visual-viewport-height);
  max-height: var(--visual-viewport-height);
  transform: translateY(var(--visual-viewport-offset-top));
}

.content-workspace {
  @apply flex min-h-0 min-w-0 flex-1 overflow-hidden;
}

.content-workspace.is-inspector-open {
  @apply gap-0;
}

.sidebar-thread-controls-header-host {
  @apply ml-1;
}

.skills-route-header-icon {
  @apply flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl text-white;
  background-color: var(--codex-skill);
  box-shadow: 0 16px 32px -20px color-mix(in srgb, var(--codex-skill) 90%, transparent);
}

.skills-route-header-icon :deep(svg) {
  @apply h-4.5 w-4.5;
}

.content-body {
  @apply flex-1 min-h-0 min-w-0 w-full flex flex-col gap-2 sm:gap-3 pt-1 pb-2 sm:pb-4 overflow-x-hidden;
}

.content-root.is-virtual-keyboard-open .content-body {
  padding-bottom: max(0.5rem, env(safe-area-inset-bottom));
}

.content-root.is-virtual-keyboard-open .content-grid {
  gap: 0.5rem;
}

.content-root.is-virtual-keyboard-open .content-thread {
  min-height: 0;
}

.content-root.is-virtual-keyboard-open .composer-with-queue {
  gap: 0.375rem;
  padding-bottom: max(0.25rem, env(safe-area-inset-bottom));
}

.content-root.is-virtual-keyboard-open .content-keyboard-spacer {
  display: none;
}



.content-error {
  @apply m-0 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-zinc-700;
}

.content-grid {
  @apply flex-1 min-h-0 flex flex-col gap-3;
}

.content-grid-home {
  @apply overflow-y-auto;
}

.content-thread {
  @apply flex-1 min-h-0;
}

.composer-with-queue {
  @apply w-full shrink-0 px-2 sm:px-6 flex flex-col gap-2;
}

.history-edit-composer-stack {
  @apply mx-auto flex w-full max-w-[min(var(--chat-column-max,72rem),100%)] flex-col gap-0;
}

.history-edit-composer-stack :deep(.thread-composer) {
  @apply max-w-none;
}

.history-edit-banner {
  @apply flex w-full items-center justify-between gap-3 rounded-t-2xl border-x border-t border-zinc-300 bg-zinc-50/90 px-3 py-2 text-sm text-zinc-700;
}

.history-edit-banner-text {
  @apply min-w-0 truncate font-medium;
}

.history-edit-banner-cancel {
  @apply inline-flex shrink-0 items-center gap-1.5 rounded-md border border-zinc-300 bg-white px-2.5 py-1 text-xs font-medium text-zinc-700 transition hover:bg-zinc-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-300;
}

.history-edit-banner-cancel-icon {
  @apply h-3.5 w-3.5;
}

.composer-runtime-error {
  @apply flex w-full items-start justify-between gap-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-medium text-zinc-800 shadow-sm;
}

.new-thread-live-overlay {
  @apply mx-auto flex w-full max-w-[min(var(--chat-column-max,72rem),100%)] flex-col gap-1 px-0 py-1;
}

.new-thread-live-overlay-label {
  @apply m-0 text-sm leading-5 font-medium;
  color: var(--codex-muted-text);
}

.content-header-inspector-toggle {
  @apply inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-transparent bg-transparent transition focus-visible:outline-none focus-visible:ring-2;
  color: var(--codex-muted-text);
  --tw-ring-color: var(--codex-focus-ring);
}

.content-header-inspector-toggle:hover {
  background-color: var(--codex-control-hover);
  color: var(--codex-text);
}

.content-header-inspector-toggle.is-active {
  background-color: var(--codex-selected-surface);
  color: var(--codex-text);
}

.content-header-inspector-toggle-icon {
  @apply h-4.5 w-4.5;
}

@media (max-width: 920px) {
  .content-workspace {
    @apply relative;
  }
}

.new-thread-empty {
  @apply flex-1 min-h-0 flex flex-col items-center justify-center gap-0.5 px-3 sm:px-6;
}

.new-thread-hero {
  @apply m-0 text-2xl sm:text-[2.5rem] font-normal leading-[1.05] text-zinc-900;
}

.new-thread-folder-dropdown {
  @apply text-2xl sm:text-[2.5rem] text-zinc-500;
}

.new-thread-folder-dropdown :deep(.composer-dropdown-trigger) {
  @apply h-auto p-0 text-2xl sm:text-[2.5rem] leading-[1.05];
}

.new-thread-folder-dropdown :deep(.composer-dropdown-value) {
  @apply leading-[1.05];
}

.new-thread-folder-dropdown :deep(.composer-dropdown-chevron) {
  @apply h-4 w-4 sm:h-5 sm:w-5 mt-0;
}

.new-thread-folder-selected {
  @apply mt-2 mb-0 max-w-3xl text-center text-xs text-zinc-500 break-all;
}

.new-thread-folder-actions {
  @apply mt-3 flex w-full max-w-3xl flex-wrap items-center justify-center gap-2;
}

.new-thread-launch-card {
  @apply mt-4 w-full max-w-3xl rounded-[28px] border px-5 py-5 text-left;
  border-color: var(--codex-border-heavy);
  background:
    radial-gradient(circle at top left, var(--codex-primary-subtle-bg), transparent 42%),
    linear-gradient(135deg, var(--codex-panel-surface), var(--codex-subtle-surface) 70%);
  box-shadow: 0 18px 50px -32px color-mix(in srgb, var(--codex-text) 28%, transparent);
}

.new-thread-launch-card-copy {
  @apply flex flex-col gap-2;
}

.new-thread-launch-card-topline {
  @apply flex items-center gap-2;
}

.new-thread-launch-card-badge {
  @apply flex h-8 w-8 shrink-0 items-center justify-center rounded-2xl;
  background-color: var(--codex-primary);
  color: var(--codex-primary-fg);
  box-shadow: 0 12px 28px -18px color-mix(in srgb, var(--codex-primary) 90%, transparent);
}

.new-thread-launch-card-badge :deep(svg) {
  @apply h-4 w-4;
}

.new-thread-launch-card-eyebrow {
  @apply m-0 text-[11px] font-semibold uppercase tracking-[0.24em];
  color: var(--codex-muted-text);
}

.new-thread-launch-card-title {
  @apply m-0 text-xl font-semibold leading-tight sm:text-2xl;
  color: var(--codex-text);
}

.new-thread-launch-card-text {
  @apply m-0 max-w-2xl text-sm leading-6 sm:text-[15px];
  color: var(--codex-muted-text);
}

.new-thread-launch-card-actions {
  @apply mt-4 flex flex-wrap items-center gap-2;
}

.new-thread-launch-card-pills {
  @apply mt-1 flex flex-wrap gap-2;
}

.new-thread-launch-card-pill {
  @apply inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.12em];
  border-color: var(--codex-border);
  background-color: var(--codex-control-bg);
  color: var(--codex-muted-text);
}

.new-thread-launch-card-button {
  @apply inline-flex h-10 items-center justify-center rounded-full border px-4 text-sm font-medium transition;
  border-color: var(--codex-border-heavy);
  background-color: var(--codex-surface);
  color: var(--codex-text);
}

.new-thread-launch-card-button:hover {
  background-color: var(--codex-control-hover);
}

.new-thread-launch-card-button-primary {
  border-color: var(--codex-primary);
  background-color: var(--codex-primary);
  color: var(--codex-primary-fg);
}

.new-thread-launch-card-button-primary:hover {
  background-color: var(--codex-primary-hover);
}

.new-thread-folder-action {
  @apply inline-flex h-9 items-center justify-center rounded-full border px-4 text-sm font-medium transition disabled:cursor-default disabled:opacity-60;
  border-color: var(--codex-border-heavy);
  background-color: var(--codex-control-bg);
  color: var(--codex-text);
}

.new-thread-folder-action:hover {
  background-color: var(--codex-control-hover);
}

.new-thread-folder-action-primary {
  border-color: var(--codex-primary);
  background-color: var(--codex-primary);
  color: var(--codex-primary-fg);
}

.new-thread-folder-action-primary:hover {
  background-color: var(--codex-primary-hover);
}

.new-thread-open-folder-overlay {
  @apply fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4;
}

.new-thread-open-folder {
  @apply flex w-full max-w-3xl max-h-[90vh] flex-col gap-2 overflow-y-auto rounded-2xl border px-4 py-4 text-left shadow-xl;
  border-color: var(--codex-border-heavy);
  background-color: var(--codex-panel-surface);
  color: var(--codex-text);
}

.new-thread-project-modal {
  @apply flex w-full max-w-xl max-h-[90vh] flex-col gap-3 overflow-y-auto rounded-2xl border px-4 py-4 text-left shadow-xl;
  border-color: var(--codex-border-heavy);
  background-color: var(--codex-panel-surface);
  color: var(--codex-text);
}

.new-thread-open-folder-header {
  @apply flex items-center justify-between gap-3;
}

.new-thread-open-folder-title {
  @apply m-0 text-sm font-semibold;
  color: var(--codex-text);
}

.new-thread-open-folder-close {
  @apply border-0 bg-transparent p-0 text-sm transition;
  color: var(--codex-muted-text);
}

.new-thread-open-folder-close:hover {
  color: var(--codex-text);
}

.new-thread-open-folder-label {
  @apply m-0 text-xs font-medium uppercase tracking-wide;
  color: var(--codex-muted-text);
}

.new-thread-open-folder-current {
  @apply flex items-start gap-2;
}

.new-thread-open-folder-path {
  @apply min-w-0 flex-1 rounded-xl border px-3 py-2 font-mono text-xs outline-none transition;
  border-color: var(--codex-border-heavy);
  background-color: var(--codex-control-bg);
  color: var(--codex-text);
}

.new-thread-open-folder-path:focus {
  box-shadow: 0 0 0 2px var(--codex-focus-ring);
}

.new-thread-open-folder-actions {
  @apply flex flex-wrap items-center gap-2;
}

.new-thread-project-mode-tabs {
  @apply grid grid-cols-2 rounded-xl border p-1;
  border-color: var(--codex-border-heavy);
  background-color: var(--codex-control-bg);
}

.new-thread-project-mode-tab {
  @apply inline-flex h-9 items-center justify-center rounded-lg border-0 bg-transparent px-3 text-sm font-medium transition disabled:cursor-default disabled:opacity-60;
  color: var(--codex-muted-text);
}

.new-thread-project-mode-tab:hover {
  background-color: var(--codex-control-hover);
  color: var(--codex-text);
}

.new-thread-project-mode-tab.is-active {
  background-color: var(--codex-selected-surface);
  color: var(--codex-text);
  box-shadow: var(--codex-shadow);
}

.new-thread-project-field {
  @apply flex flex-col gap-1.5;
}

.new-thread-project-modal-actions {
  @apply mt-1 flex flex-wrap justify-end gap-2;
}

.new-thread-open-folder-toggle {
  @apply inline-flex items-center gap-2 text-sm;
  color: var(--codex-muted-text);
}

.new-thread-open-folder-toggle-input {
  @apply relative h-4 w-4 shrink-0 appearance-none rounded-[4px] border outline-none transition;
  border-color: var(--codex-border-heavy);
  background-color: var(--codex-control-bg);
}

.new-thread-open-folder-toggle-input:focus-visible {
  box-shadow: 0 0 0 3px var(--codex-focus-ring);
}

.new-thread-open-folder-toggle-input:checked {
  border-color: var(--codex-primary);
  background-color: var(--codex-primary);
}

.new-thread-open-folder-toggle-input::after {
  content: '';
  position: absolute;
  left: 4px;
  top: 1px;
  width: 4px;
  height: 8px;
  border-right: 2px solid var(--codex-checkbox-check);
  border-bottom: 2px solid var(--codex-checkbox-check);
  transform: rotate(45deg);
  opacity: 0;
}

.new-thread-open-folder-toggle-input:checked::after {
  opacity: 1;
}

.new-thread-open-folder-filter {
  @apply w-full rounded-xl border px-3 py-2 text-sm outline-none transition;
  border-color: var(--codex-border-heavy);
  background-color: var(--codex-control-bg);
  color: var(--codex-text);
}

.new-thread-open-folder-filter:focus {
  box-shadow: 0 0 0 2px var(--codex-focus-ring);
}

.new-thread-open-folder-create {
  @apply flex flex-col gap-2;
}

.new-thread-open-folder-create-composer {
  @apply flex items-center gap-2;
}

.new-thread-open-folder-create-input {
  @apply w-full min-w-0 flex-1 rounded-xl border px-3 py-2 text-sm outline-none transition;
  border-color: var(--codex-border-heavy);
  background-color: var(--codex-control-bg);
  color: var(--codex-text);
}

.new-thread-open-folder-create-input:focus {
  box-shadow: 0 0 0 2px var(--codex-focus-ring);
}

.new-thread-open-folder-create-submit {
  @apply shrink-0;
}

.new-thread-folder-action[aria-pressed='true'] {
  border-color: var(--codex-primary);
  background-color: var(--codex-primary);
  color: var(--codex-primary-fg);
}

.new-thread-folder-action[aria-pressed='true']:hover {
  background-color: var(--codex-primary-hover);
}

.new-thread-open-folder-status {
  @apply m-0 rounded-xl border px-3 py-2 text-sm;
  border-color: var(--codex-border-heavy);
  background-color: var(--codex-control-bg);
  color: var(--codex-muted-text);
}

.new-thread-open-folder-error {
  @apply m-0 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-zinc-700;
}

.new-thread-open-folder-error-actions {
  @apply flex flex-wrap items-start gap-2;
}

.new-thread-open-folder-list {
  @apply m-0 flex max-h-72 list-none flex-col gap-1 overflow-y-auto p-0 pr-3;
  scrollbar-gutter: stable;
  scrollbar-color: var(--codex-scrollbar-thumb) var(--codex-scrollbar-track);
  scrollbar-width: thin;
}

.new-thread-open-folder-list::-webkit-scrollbar {
  width: 10px;
}

.new-thread-open-folder-list::-webkit-scrollbar-track {
  background: var(--codex-scrollbar-track);
  border-radius: 9999px;
}

.new-thread-open-folder-list::-webkit-scrollbar-thumb {
  background: var(--codex-scrollbar-thumb);
  border-radius: 9999px;
  border: 2px solid var(--codex-scrollbar-track);
}

.new-thread-open-folder-list::-webkit-scrollbar-thumb:hover {
  background: var(--codex-scrollbar-thumb-hover);
}

.new-thread-open-folder-item {
  @apply grid grid-cols-[minmax(0,1fr)_auto] items-center gap-1;
}

.new-thread-open-folder-item-main {
  @apply min-w-0 truncate rounded-xl border px-2.5 py-1 text-left text-sm font-medium leading-5 transition;
  border-color: var(--codex-border-heavy);
  background-color: var(--codex-control-bg);
  color: var(--codex-text);
}

.new-thread-open-folder-item-main:hover {
  background-color: var(--codex-control-hover);
}

.new-thread-open-folder-item-main:disabled,
.new-thread-open-folder-item-open:disabled {
  @apply cursor-default opacity-60;
}

.new-thread-open-folder-item-name {
  @apply block truncate;
}

.new-thread-open-folder-item-open {
  @apply inline-flex h-7 items-center justify-center rounded-xl border px-2.5 text-xs font-medium transition;
  border-color: var(--codex-border-heavy);
  background-color: var(--codex-control-bg);
  color: var(--codex-text);
}

.new-thread-open-folder-item-open:hover {
  background-color: var(--codex-control-hover);
}

.new-thread-runtime-dropdown {
  @apply mt-3;
}

.new-thread-branch-select {
  @apply mt-3 w-full max-w-3xl;
}

.new-thread-branch-select-label {
  @apply m-0 mb-1 text-xs font-medium uppercase tracking-wide text-zinc-500;
}

.new-thread-branch-dropdown :deep(.composer-dropdown-trigger) {
  @apply h-9 rounded-xl border border-zinc-200 bg-white px-3 text-sm text-zinc-700;
}

.new-thread-branch-select-help {
  @apply mt-1 mb-0 text-xs text-zinc-500;
}

.new-thread-runtime-help {
  @apply mt-2 mb-0 max-w-3xl text-center text-xs text-zinc-500;
}

.worktree-init-status {
  @apply mt-3 flex w-full max-w-xl flex-col gap-1 rounded-xl border px-3 py-2 text-sm;
}

.worktree-init-status.is-running {
  @apply border-zinc-300 bg-zinc-50 text-zinc-700;
}

.worktree-init-status.is-error {
  @apply border-rose-300 bg-rose-50 text-zinc-800;
}

.worktree-init-status-title {
  @apply font-medium;
}

.worktree-init-status-message {
  @apply break-all;
}

</style>

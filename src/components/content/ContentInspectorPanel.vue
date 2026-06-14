<template>
  <Transition name="content-inspector-panel-transition">
    <aside
      v-if="visible"
      class="content-inspector-panel"
      :aria-label="t('Inspector')"
    >
      <div class="content-inspector-shell">
        <div class="content-inspector-scroll">
          <section class="content-inspector-section">
            <div class="content-inspector-heading-row">
              <h2 class="content-inspector-heading">{{ t('Environment') }}</h2>
              <IconCodexSettingsCog class="content-inspector-heading-icon" aria-hidden="true" />
            </div>
            <div class="content-inspector-rows">
              <div class="content-inspector-row">
                <IconCodexPullRequestOpen class="content-inspector-row-icon" />
                <span class="content-inspector-row-label">{{ t('Changes') }}</span>
                <span class="content-inspector-row-value">{{ gitStatusText }}</span>
              </div>
              <div class="content-inspector-row">
                <IconCodexLaptop class="content-inspector-row-icon" />
                <span class="content-inspector-row-label">{{ t('Local') }}</span>
              </div>
              <HeaderGitBranchDropdown
                v-if="canShowBranchDropdown"
                class="content-inspector-branch-dropdown"
                :current-branch="currentBranch"
                :head-sha="headSha"
                :head-subject="headSubject"
                :head-date="headDate"
                :detached="detached"
                :dirty="dirty"
                :branches="branches"
                :commits-by-branch="commitsByBranch"
                :commits-loading-for="commitsLoadingFor"
                :commits-error="commitsError"
                :loading="loadingBranches"
                :busy="switchingBranch"
                :error="branchError"
                :review-open="reviewOpen"
                placement="inspector"
                :show-review="false"
                @toggle-review="$emit('toggle-review')"
                @checkout-branch="$emit('checkout-branch', $event)"
                @reset-branch-to-commit="$emit('reset-branch-to-commit', $event)"
                @load-commits="$emit('load-commits', $event)"
              />
              <div v-if="canShowBranchDropdown" class="content-inspector-row">
                <IconCodexSendToCloud class="content-inspector-row-icon" />
                <span class="content-inspector-row-label">{{ t('Commit or push') }}</span>
              </div>
              <div v-if="commitText" class="content-inspector-row">
                <span class="content-inspector-row-spacer" aria-hidden="true" />
                <span class="content-inspector-row-label content-inspector-row-label--muted">{{ commitText }}</span>
              </div>
            </div>
          </section>

          <section v-if="showProgressSection" class="content-inspector-section">
            <div class="content-inspector-heading-row content-inspector-progress-heading-row">
              <h2 class="content-inspector-heading">{{ t('Progress') }}</h2>
              <button
                class="content-inspector-progress-heading-button"
                type="button"
                :aria-label="progressToggleLabel"
                :title="progressToggleLabel"
                @click="$emit('toggle-progress')"
              >
                <IconCodexChevronRight
                  class="content-inspector-progress-chevron"
                  :class="{ 'is-expanded': progressExpanded }"
                />
              </button>
            </div>
            <div v-if="progressExpanded" class="content-inspector-rows content-inspector-progress-rows">
              <div
                v-for="item in progressItems"
                :key="item.label"
                class="content-inspector-row"
              >
                <IconCodexCheckCircleFilled
                  v-if="getProgressDotState(item.status) === 'done'"
                  class="content-inspector-status-icon"
                  data-state="done"
                  aria-hidden="true"
                />
                <IconCodexUnselectedCircle
                  v-else
                  class="content-inspector-status-icon"
                  :data-state="getProgressDotState(item.status)"
                  aria-hidden="true"
                />
                <span class="content-inspector-row-label">{{ item.label }}</span>
              </div>
            </div>
          </section>

          <section class="content-inspector-section">
            <h2 class="content-inspector-heading">{{ t('Sources') }}</h2>
            <div class="content-inspector-rows">
              <div v-if="sourceItems.length === 0" class="content-inspector-empty">
                {{ t('No sources yet') }}
              </div>
              <div
                v-for="item in sourceItems"
                :key="item.label"
                class="content-inspector-row"
              >
                <span v-if="item.mark" class="content-inspector-source-mark" aria-hidden="true">{{ item.mark }}</span>
                <span class="content-inspector-row-label">{{ item.label }}</span>
              </div>
            </div>
          </section>
        </div>
      </div>
    </aside>
  </Transition>
</template>

<script setup lang="ts">
import { useUiLanguage } from '../../composables/useUiLanguage'
import type { GitCommitOption, WorktreeBranchOption } from '../../api/codexGateway'
import type { InspectorSourceItem } from '../../app/appTypes'
import type { InspectorPlanProgressItem } from './inspectorProgress'
import {
  IconCodexCheckCircleFilled,
  IconCodexChevronRight,
  IconCodexLaptop,
  IconCodexPullRequestOpen,
  IconCodexSendToCloud,
  IconCodexSettingsCog,
  IconCodexUnselectedCircle,
} from '../icons/codex'
import HeaderGitBranchDropdown from './HeaderGitBranchDropdown.vue'

defineProps<{
  visible: boolean
  gitStatusText: string
  commitText: string
  canShowBranchDropdown: boolean
  currentBranch: string | null
  headSha: string | null
  headSubject: string | null
  headDate: string | null
  detached: boolean
  dirty: boolean
  branches: WorktreeBranchOption[]
  commitsByBranch: Record<string, GitCommitOption[]>
  commitsLoadingFor: string
  commitsError: string
  loadingBranches: boolean
  switchingBranch: boolean
  branchError: string
  reviewOpen: boolean
  showProgressSection: boolean
  progressToggleLabel: string
  progressExpanded: boolean
  progressItems: InspectorPlanProgressItem[]
  sourceItems: InspectorSourceItem[]
}>()

defineEmits<{
  'toggle-review': []
  'checkout-branch': [value: string]
  'reset-branch-to-commit': [payload: { branch: string; sha: string }]
  'load-commits': [branch: string]
  'toggle-progress': []
}>()

const { t } = useUiLanguage()

function getProgressDotState(status: string): 'done' | 'active' | 'idle' {
  if (status === 'completed') return 'done'
  if (status === 'inProgress') return 'active'
  return 'idle'
}
</script>

<style scoped>
@reference "tailwindcss";

.content-inspector-panel {
  @apply min-h-0 w-[20.25rem] shrink-0 pl-2 pr-5 pt-3 pb-5;
}

.content-inspector-panel-transition-enter-active,
.content-inspector-panel-transition-leave-active {
  transition:
    opacity 180ms ease,
    transform 180ms ease,
    width 180ms ease,
    padding-left 180ms ease,
    padding-right 180ms ease;
  overflow: hidden;
}

.content-inspector-panel-transition-enter-from,
.content-inspector-panel-transition-leave-to {
  width: 0;
  padding-left: 0;
  padding-right: 0;
  opacity: 0;
  transform: translateX(12px);
}

@media (prefers-reduced-motion: reduce) {
  .content-inspector-panel-transition-enter-active,
  .content-inspector-panel-transition-leave-active {
    transition: none;
  }
}

.content-inspector-shell {
  @apply flex max-h-full min-h-0 flex-col overflow-hidden rounded-[24px] border border-zinc-200/80 bg-white/95 pt-3 shadow-[0_18px_48px_-30px_rgba(0,0,0,0.45)];
  backdrop-filter: blur(18px);
}

.content-inspector-scroll {
  @apply min-h-0 overflow-y-auto pb-3;
}

.content-inspector-section {
  @apply relative flex flex-col pb-2.5;
}

.content-inspector-section::after {
  content: '';
  @apply absolute inset-x-4 bottom-0 h-px bg-zinc-200;
}

.content-inspector-section:last-child {
  @apply pb-0;
}

.content-inspector-section:last-child::after {
  display: none;
}

.content-inspector-heading {
  @apply m-0 px-4 pb-1 text-sm font-medium leading-5 text-zinc-500;
}

.content-inspector-heading-row {
  @apply flex items-center justify-between gap-3 px-4 pb-1;
}

.content-inspector-heading-row .content-inspector-heading {
  @apply px-0 pb-0;
}

.content-inspector-heading-icon {
  @apply h-4.5 w-4.5 shrink-0 text-zinc-500;
}

.content-inspector-progress-heading-row {
  @apply items-center;
}

.content-inspector-progress-heading-button {
  @apply inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-0 bg-transparent p-0 text-zinc-500 transition hover:bg-zinc-100 hover:text-zinc-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-300;
}

.content-inspector-progress-chevron {
  @apply h-4 w-4 transition-transform;
}

.content-inspector-progress-chevron.is-expanded {
  transform: rotate(90deg);
}

.content-inspector-rows {
  @apply flex flex-col gap-0 px-4;
}

.content-inspector-row {
  @apply flex min-h-7 min-w-0 items-center gap-2.5 rounded-md px-0 py-0.5 text-sm leading-5 text-zinc-800;
}

.content-inspector-row-icon,
.content-inspector-row-spacer {
  @apply h-4.5 w-4.5 shrink-0;
}

.content-inspector-row-icon {
  @apply text-zinc-500;
}

.content-inspector-row-label {
  @apply min-w-0 flex-1 truncate leading-5;
}

.content-inspector-row-value {
  @apply ml-auto max-w-40 shrink-0 truncate text-right text-xs text-zinc-500;
}

.content-inspector-row-label--muted {
  @apply text-xs text-zinc-500;
}

.content-inspector-empty {
  @apply py-0.5 text-sm leading-5 text-zinc-500;
}

.content-inspector-status-icon {
  @apply h-4.5 w-4.5 shrink-0;
  color: rgb(113 113 122);
}

.content-inspector-status-icon[data-state='done'] {
  color: rgb(113 113 122);
}

.content-inspector-status-icon[data-state='active'] {
  color: rgb(82 82 91);
}

.content-inspector-source-mark {
  @apply inline-flex h-4.5 w-4.5 shrink-0 items-center justify-center rounded-md bg-zinc-100 text-[10px] font-semibold text-zinc-600;
}

.content-inspector-branch-dropdown {
  @apply w-full min-w-0;
}

.content-inspector-branch-dropdown :deep(.header-git-trigger) {
  @apply min-h-7 w-full max-w-none justify-start rounded-md border-0 bg-transparent px-0 py-0.5 text-sm text-zinc-800 hover:bg-transparent;
}

.content-inspector-branch-dropdown :deep(.header-git-trigger-label) {
  @apply flex-1 text-left;
}

.content-inspector-branch-dropdown :deep(.header-git-menu-wrap) {
  @apply z-[80];
}

:global(:root.dark) .content-inspector-shell {
  border-color: rgba(255, 255, 255, 0.14);
  background-color: #303030;
  box-shadow: 0 18px 48px -30px rgba(0, 0, 0, 0.72);
}

:global(:root.dark) .content-inspector-section::after {
  background-color: rgba(255, 255, 255, 0.11);
}

:global(:root.dark) .content-inspector-heading,
:global(:root.dark) .content-inspector-row-label--muted,
:global(:root.dark) .content-inspector-row-icon,
:global(:root.dark) .content-inspector-heading-icon,
:global(:root.dark) .content-inspector-row-value {
  color: var(--codex-muted-text);
}

:global(:root.dark) .content-inspector-row {
  color: #d6d6d6;
}

:global(:root.dark) .content-inspector-empty {
  color: var(--codex-muted-text);
}

:global(:root.dark) .content-inspector-status-icon {
  color: #9a9a9a;
}

:global(:root.dark) .content-inspector-status-icon[data-state='done'] {
  color: #9a9a9a;
}

:global(:root.dark) .content-inspector-status-icon[data-state='active'] {
  color: #d6d6d6;
}

:global(:root.dark) .content-inspector-progress-heading-button {
  @apply focus-visible:ring-zinc-700;
  color: var(--codex-muted-text);
}

:global(:root.dark) .content-inspector-progress-heading-button:hover {
  background-color: var(--codex-control-hover);
  color: var(--codex-text);
}

:global(:root.dark) .content-inspector-source-mark {
  background-color: var(--codex-subtle-surface);
  color: var(--codex-muted-text);
}

:global(:root.dark) .content-inspector-branch-dropdown .header-git-trigger {
  color: var(--codex-text);
}

@media (max-width: 920px) {
  .content-inspector-panel {
    @apply absolute right-0 top-0 bottom-0 z-30 w-[min(19.75rem,calc(100vw-1rem))] pl-2 pr-2;
  }

  .content-inspector-shell {
    @apply shadow-2xl shadow-zinc-900/20;
  }
}
</style>

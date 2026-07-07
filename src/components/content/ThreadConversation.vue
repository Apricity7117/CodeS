<template>
  <section class="conversation-root" @click.capture="onConversationClick" @contextmenu.capture="onConversationContextMenu">
    <p v-if="isLoading" class="conversation-loading">Loading messages...</p>

    <p
      v-else-if="messages.length === 0 && pendingRequests.length === 0 && !liveOverlay"
      class="conversation-empty"
    >
      No messages in this thread yet.
    </p>

    <ul v-else ref="conversationListRef" class="conversation-list" @scroll="onConversationScroll">
      <li v-if="hasMoreAbove" class="conversation-load-more">
        <button
          type="button"
          class="load-more-button"
          :disabled="isLoadingMore || isLoadingPersistedAbove"
          @click="loadMoreAbove"
        >
          {{ isLoadingMore || isLoadingPersistedAbove ? 'Loading…' : 'Load earlier messages' }}
        </button>
      </li>
      <template v-for="message in visibleMessages" :key="message.id">
      <li
        v-if="!hiddenGroupedCommandIds.has(message.id) && !hiddenFileChangeMessageIds.has(message.id) && !hiddenWorkedProcessMessageIds.has(message.id)"
        class="conversation-item"
        :data-role="message.role"
        :data-message-type="message.messageType || ''"
      >
        <div v-if="isCommandMessage(message)" class="message-row" data-role="system">
          <div class="message-stack" data-role="system">
            <button
              v-if="getGroupedCommandsForLatest(message).length > 0"
              type="button"
              class="cmd-row cmd-row-group cmd-compact command-group-summary-row"
              :class="[commandStatusClass(message), { 'cmd-expanded': isCommandGroupExpanded(message) }]"
              @click="toggleCommandGroup(message)"
            >
              <span class="cmd-chevron" :class="{ 'cmd-chevron-open': isCommandGroupExpanded(message) }">▶</span>
              <span class="cmd-group-label">{{ commandGroupSummaryLabel(message) }}</span>
              <span class="cmd-status">{{ commandGroupSummaryStatus(message) }}</span>
            </button>
            <div
              v-if="getGroupedCommandsForLatest(message).length > 0"
              class="cmd-group-wrap"
              :class="{ 'cmd-group-visible': isCommandGroupExpanded(message) }"
            >
              <div class="cmd-group-inner">
                <div
                  v-for="cmd in getCommandBlockForLatest(message)"
                  :key="`grouped-cmd-${cmd.id}`"
                  class="worked-cmd-item"
                >
                  <ThreadCommandExecution
                    :message="cmd"
                    :expanded="isCommandExpanded(cmd)"
                    :compact="true"
                    :condensed-output="isCommandOutputCondensed(cmd)"
                    :status-label="commandStatusLabel(cmd)"
                    :status-class="commandStatusClass(cmd)"
                    :grouped="true"
                    @toggle="toggleCommandExpand(cmd)"
                  />
                </div>
              </div>
            </div>
            <template v-else>
              <ThreadCommandExecution
                :message="message"
                :expanded="isCommandExpanded(message)"
                :compact="isCommandCompact(message)"
                :condensed-output="isCommandOutputCondensed(message)"
                :status-label="commandStatusLabel(message)"
                :status-class="commandStatusClass(message)"
                @toggle="toggleCommandExpand(message)"
              />
            </template>
          </div>
        </div>

        <div
          v-else-if="isFileChangeMessage(message)"
          class="message-row"
          :data-role="message.role"
          :data-message-type="message.messageType || ''"
        >
          <div class="message-stack" :data-role="message.role">
            <article class="message-body" :data-role="message.role">
              <ThreadFileChangeSummary
                v-if="readStandaloneFileChangeSummary(message)"
                :summary="readStandaloneFileChangeSummary(message)"
                :message-id="message.id"
                :cwd="props.cwd"
                :expanded="isFileChangeSummaryExpanded(message)"
                @toggle="toggleFileChangeSummary(message)"
                @open-diff="(change) => openDiffViewer(readStandaloneFileChangeSummary(message), change)"
              />
            </article>
          </div>
        </div>

        <div v-else class="message-row" :data-role="message.role" :data-message-type="message.messageType || ''">
          <div
            class="message-stack"
            :class="{ 'message-stack-has-file-change-summary': readAnchoredFileChangeSummary(message) }"
            :data-role="message.role"
          >
            <article class="message-body" :data-role="message.role">
              <ul
                v-if="message.images && message.images.length > 0"
                class="message-image-list"
                :class="{ 'message-generated-image-list': message.messageType === 'imageView' }"
                :data-role="message.role"
              >
                <li v-for="imageUrl in message.images" :key="imageUrl" class="message-image-item">
                  <button class="message-image-button" type="button" @click="openImageModal(imageUrl)">
                    <img
                      class="message-image-preview"
                      :class="{ 'message-generated-image-preview': message.messageType === 'imageView' }"
                      :src="imageUrl"
                      :alt="message.messageType === 'imageView' ? 'Generated image' : 'Message image preview'"
                      loading="lazy"
                    />
                  </button>
                </li>
              </ul>

              <div v-if="message.fileAttachments && message.fileAttachments.length > 0" class="message-file-attachments">
                <span v-for="att in message.fileAttachments" :key="`${message.id}:${att.path}`" class="message-file-chip">
                  <span class="message-file-chip-icon">📄</span>
                  <a
                    class="message-file-link message-file-chip-name"
                    :href="toBrowseUrl(att.path)"
                    target="_blank"
                    rel="noopener noreferrer"
                    :title="att.path"
                  >
                    {{ att.label }}
                  </a>
                </span>
              </div>

              <div v-if="message.skills && message.skills.length > 0" class="message-skill-attachments">
                <a
                  v-for="skill in message.skills"
                  :key="`${message.id}:${skill.path}`"
                  class="message-skill-chip"
                  :href="toBrowseUrl(skill.path)"
                  :title="skill.path"
                >
                  <span class="message-skill-chip-prefix">Skill</span>
                  <span class="message-skill-chip-name">{{ skill.name }}</span>
                </a>
              </div>

              <article v-if="message.text.length > 0" class="message-card" :data-role="message.role">
                <ThreadWorkedTurn
                  v-if="message.messageType === 'worked'"
                  :message="message"
                  :process-messages="getProcessMessagesForWorked(message)"
                  :cwd="props.cwd"
                  :expanded="isWorkedExpanded(message)"
                  :is-command-expanded="isCommandExpanded"
                  :is-command-compact="isCommandCompact"
                  :is-command-output-condensed="isCommandOutputCondensed"
                  :command-status-label="commandStatusLabel"
                  :command-status-class="commandStatusClass"
                  :is-file-change-summary-expanded="isFileChangeSummaryExpanded"
                  :render-markdown-as-html="renderMarkdownBlocksAsHtml"
                  @toggle-worked="toggleWorkedExpand(message)"
                  @toggle-command="toggleCommandExpand"
                  @toggle-file-change-summary="toggleFileChangeSummary"
                  @open-diff="openDiffViewer"
                />
                <ThreadPlanCard
                  v-else-if="showPlanCardInThread(message)"
                  :message="message"
                  :collapsed="isPlanCollapsed(message)"
                  :copied="copiedResponseAnchorId === message.id"
                  :text-animations-enabled="isTextAnimationEnabled"
                  :render-markdown-as-html="renderMarkdownBlocksAsHtml"
                  @download="downloadPlan(message)"
                  @copy="copyResponse(message.id)"
                  @toggle-collapse="togglePlanCollapsed(message)"
                  @implement="implementPlan(message)"
                />
                <p v-else-if="message.role === 'user'" class="message-text message-text-plain">{{ message.text }}</p>
                <ThreadMessageMarkdown
                  v-else
                  :message-id="message.id"
                  :blocks="getMessageBlocks(message)"
                  :cwd="props.cwd"
                  :highlight-version="highlightCacheVersion"
                  :image-failure-version="markdownImageFailureVersion"
                  :get-inline-segments="getInlineSegments"
                  :to-browse-url="toBrowseUrl"
                  :render-list-item-content-as-html="renderListItemContentAsHtml"
                  :render-highlighted-code-as-html="renderCachedHighlightedCodeAsHtml"
                  :is-markdown-image-failed="isMarkdownImageFailed"
                  @open-image="openImageModal"
                  @image-error="onMarkdownImageError"
                />
              </article>

              <ThreadFileChangeSummary
                v-if="readAnchoredFileChangeSummary(message)"
                :summary="readAnchoredFileChangeSummary(message)"
                :message-id="message.id"
                :cwd="props.cwd"
                :expanded="isFileChangeSummaryExpanded(message)"
                :inline="true"
                @toggle="toggleFileChangeSummary(message)"
                @open-diff="(change) => openDiffViewer(readAnchoredFileChangeSummary(message), change)"
              />

              <div
                v-if="showMessageToolbar(message)"
                class="message-toolbar"
                :data-role="message.role"
              >
                <span v-if="formatMessageTime(message)" class="message-toolbar-time">{{ formatMessageTime(message) }}</span>
                <button
                  v-if="showCopyResponseButton(message)"
                  type="button"
                  class="message-copy-button"
                  :data-copied="copiedResponseAnchorId === message.id"
                  :aria-label="copyMessageButtonLabel(message)"
                  :title="copyMessageButtonLabel(message)"
                  @click="copyResponse(message.id)"
                >
                  <IconCodexCopy class="icon-svg message-copy-icon" />
                </button>
                <button
                  v-if="showEditMessageButton(message)"
                  type="button"
                  class="message-edit-button"
                  aria-label="Edit this message"
                  title="Edit this message"
                  @click="editMessage(message.id)"
                >
                  <IconCodexEdit class="icon-svg message-edit-icon" />
                </button>
                <button
                  v-if="showForkResponseButton(message)"
                  type="button"
                  class="message-fork-button"
                  aria-label="Fork thread from this response"
                  title="Fork thread from this response"
                  @click="forkResponse(message.id)"
                >
                  <IconCodexWorktree class="icon-svg message-fork-icon" />
                </button>
              </div>
            </article>
          </div>
        </div>
      </li>
      </template>
      <li v-if="liveOverlay" class="conversation-item conversation-item-overlay">
        <div class="message-row">
          <div class="message-stack">
            <article class="live-overlay-inline" aria-live="polite">
              <p class="live-overlay-label">
                <ThinkingShimmer :message="liveOverlayDisplayLabel" :active="isTextAnimationEnabled && !liveOverlay.errorText" />
              </p>
              <p
                v-if="isLiveReasoningTextEnabled && liveOverlayLatestReasoningLine"
                class="live-overlay-reasoning"
              >
                {{ liveOverlayLatestReasoningLine }}
              </p>
              <div v-if="liveOverlay.errorText" class="live-overlay-error">
                <span>{{ liveOverlay.errorText }}</span>
              </div>
            </article>
          </div>
        </div>
      </li>
      <li ref="bottomAnchorRef" class="conversation-bottom-anchor" />
    </ul>

    <button
      v-if="showJumpToLatestButton"
      type="button"
      class="jump-to-latest-button"
      title="Jump to latest"
      aria-label="Jump to latest output"
      @click="jumpToLatest"
    >
      <IconCodexArrowUp class="icon-svg jump-to-latest-icon" />
    </button>

    <div v-if="modalImageUrl.length > 0" class="image-modal-backdrop" @click="closeImageModal">
      <div class="image-modal-content" @click.stop>
        <button class="image-modal-close" type="button" aria-label="Close image preview" @click="closeImageModal">
          <IconCodexX class="icon-svg" />
        </button>
        <img class="image-modal-image" :src="modalImageUrl" alt="Expanded message image" />
      </div>
    </div>

    <div
      v-if="isFileLinkContextMenuVisible"
      ref="fileLinkContextMenuRef"
      class="file-link-context-menu"
      :style="fileLinkContextMenuStyle"
      @click.stop
    >
      <button type="button" class="file-link-context-menu-item" @click="openFileLinkContextBrowse">
        Open link
      </button>
      <button type="button" class="file-link-context-menu-item" @click="copyFileLinkContextLink">
        Copy link
      </button>
      <button
        v-if="fileLinkContextEditUrl"
        type="button"
        class="file-link-context-menu-item"
        @click="openFileLinkContextEdit"
      >
        Edit file
      </button>
    </div>

    <ThreadDiffViewer
      v-if="activeDiffViewerChange"
      :changes="diffViewerChanges"
      :active-change="activeDiffViewerChange"
      :cwd="props.cwd"
      :is-mobile="isMobile"
      :is-file-list-open="isDiffViewerFileListOpen"
      @close="closeDiffViewer"
      @toggle-file-list="toggleDiffViewerFileList"
      @close-file-list="closeDiffViewerFileList"
      @select-change="selectDiffViewerChange"
    />
  </section>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import type { UiFileChange, UiLiveOverlay, UiMessage, UiPlanStep, UiServerRequest } from '../../types/codex'
import { useMobile } from '../../composables/useMobile'
import { useUiLanguage } from '../../composables/useUiLanguage'
import ThinkingShimmer from './ThinkingShimmer.vue'
import ThreadCommandExecution from './ThreadCommandExecution.vue'
import ThreadDiffViewer from './ThreadDiffViewer.vue'
import ThreadFileChangeSummary from './ThreadFileChangeSummary.vue'
import ThreadMessageMarkdown from './ThreadMessageMarkdown.vue'
import ThreadPlanCard from './ThreadPlanCard.vue'
import ThreadWorkedTurn from './ThreadWorkedTurn.vue'
import { buildWorkedTurnGroups } from './threadWorkedGrouping'
import {
  buildPlanCopyText,
  planStepStatusIcon,
  readPlanExplanation,
  readPlanMarkdown,
  readPlanSteps,
  showMessageInThread,
  showPlanCardInThread,
} from './threadPlanUtils'
import {
  normalizePathSeparators,
  resolveRelativePath,
  toBrowseUrl as buildBrowseUrl,
  toEditUrlFromBrowseHref as buildEditUrlFromBrowseHref,
} from './threadFileLinks'
import { parseInlineSegments } from './threadInlineSegments'
import type { InlineSegment } from './threadInlineSegments'
import {
  escapeHtml,
  parseMessageBlocks,
  renderListItemContentAsHtml as renderMarkdownListItemContentAsHtml,
  renderMarkdownBlocksAsHtml as renderMarkdownBlocksToHtml,
} from './threadMarkdownBlocks'
import type { ListItem, MessageBlock } from './threadMarkdownBlocks'
import {
  aggregateFileChanges,
  buildFileChangeCopyText as buildFileChangeCopyTextForCwd,
  CODE_LANGUAGE_ALIASES,
  fileChangeKey,
  isFileChangeMessage,
  readActiveDiffViewerChange,
} from './threadFileChanges'
import type { TurnFileChangeSummary } from './threadFileChanges'
import {
  buildCopyableMessageContentByAnchorId,
  buildCopyableResponseContentByAnchorId,
  buildForkableTurnIndexByAnchorId,
} from './threadMessageActions'

import {
  IconCodexArrowUp,
  IconCodexCopy,
  IconCodexEdit,
  IconCodexWorktree,
  IconCodexX,
} from '../icons/codex'

type HighlightJsModule = (typeof import('highlight.js/lib/common'))['default']

const expandedCommandIds = ref<Set<string>>(new Set())
const collapsedAutoCommandIds = ref<Set<string>>(new Set())
const expandedCommandGroupIds = ref<Set<string>>(new Set())
const expandedWorkedIds = ref<Set<string>>(new Set())
const expandedFileChangeSummaryIds = ref<Set<string>>(new Set())
const collapsedPlanIds = ref<Set<string>>(new Set())
const activeDiffViewerSummary = ref<TurnFileChangeSummary | null>(null)
const activeDiffViewerChangeKey = ref('')
const isDiffViewerFileListOpen = ref(false)
const fileLinkContextMenuRef = ref<HTMLElement | null>(null)
const isFileLinkContextMenuVisible = ref(false)
const fileLinkContextMenuX = ref(0)
const fileLinkContextMenuY = ref(0)
const fileLinkContextBrowseUrl = ref('')
const fileLinkContextEditUrl = ref('')
const { isMobile } = useMobile()
const { t } = useUiLanguage()

function isCommandMessage(message: UiMessage): boolean {
  return message.messageType === 'commandExecution' && !!message.commandExecution
}

function isPlanCollapsed(message: UiMessage): boolean {
  return collapsedPlanIds.value.has(message.id)
}

function togglePlanCollapsed(message: UiMessage): void {
  const next = new Set(collapsedPlanIds.value)
  if (next.has(message.id)) {
    next.delete(message.id)
  } else {
    next.add(message.id)
  }
  collapsedPlanIds.value = next
}

function downloadPlan(message: UiMessage): void {
  if (typeof document === 'undefined') return
  const content = readPlanMarkdown(message).trim() || buildPlanCopyText(message)
  if (!content) return

  const blob = new Blob([content], { type: 'text/markdown;charset=utf-8' })
  const url = window.URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = 'plan.md'
  document.body.appendChild(anchor)
  anchor.click()
  document.body.removeChild(anchor)
  window.URL.revokeObjectURL(url)
}

function implementPlan(message: UiMessage): void {
  const turnId = message.turnId?.trim() ?? ''
  if (!turnId) return
  emit('implementPlan', { turnId })
}

function isCopyableAssistantMessage(message: UiMessage): boolean {
  return message.role === 'assistant'
    && !isCommandMessage(message)
    && message.messageType !== 'worked'
    && !hiddenWorkedProcessMessageIds.value.has(message.id)
    && !(message.messageType ?? '').endsWith('.live')
}

const activeCommandMessageId = computed(() => {
  for (let index = props.messages.length - 1; index >= 0; index -= 1) {
    const message = props.messages[index]
    if (message.messageType === 'commandExecution' && message.commandExecution?.status === 'inProgress') {
      return message.id
    }
  }
  return ''
})

const hasLiveAssistantText = computed(() =>
  props.messages.some((message) =>
    message.role === 'assistant' &&
    message.messageType === 'agentMessage.live' &&
    message.text.trim().length > 0,
  ),
)

const isLiveTurnRuntime = computed(() =>
  Boolean(props.liveOverlay) || activeCommandMessageId.value.length > 0 || hasLiveAssistantText.value,
)

const groupedCommandsByLatestId = computed<Record<string, UiMessage[]>>(() => {
  const next: Record<string, UiMessage[]> = {}
  for (let index = 0; index < props.messages.length;) {
    const message = props.messages[index]
    if (!isCommandMessage(message)) {
      index += 1
      continue
    }

    const block: UiMessage[] = []
    while (index < props.messages.length && isCommandMessage(props.messages[index])) {
      block.push(props.messages[index])
      index += 1
    }

    if (block.length <= 1) continue
    const latest = block[block.length - 1]
    next[latest.id] = block.slice(0, -1)
  }
  return next
})

const hiddenGroupedCommandIds = computed(() => {
  const next = new Set<string>()
  for (const commands of Object.values(groupedCommandsByLatestId.value)) {
    for (const command of commands) {
      next.add(command.id)
    }
  }
  return next
})

const workedTurnGroups = computed(() => buildWorkedTurnGroups(props.messages))

function getProcessMessagesForWorked(message: UiMessage): UiMessage[] {
  return workedTurnGroups.value.processMessagesByWorkedId[message.id] ?? []
}

const hiddenWorkedProcessMessageIds = computed(() => workedTurnGroups.value.hiddenProcessIds)

function isCommandAutoExpanded(message: UiMessage): boolean {
  return !hasLiveAssistantText.value && message.id === activeCommandMessageId.value
}

function isCommandExpanded(message: UiMessage): boolean {
  if (!isCommandMessage(message)) return false
  return expandedCommandIds.value.has(message.id)
    || (!collapsedAutoCommandIds.value.has(message.id) && isCommandAutoExpanded(message))
}

function isCommandCompact(message: UiMessage): boolean {
  return isCommandMessage(message) && isLiveTurnRuntime.value
}

function isCommandOutputCondensed(message: UiMessage): boolean {
  return isCommandMessage(message) && (isLiveTurnRuntime.value || message.commandExecution?.status === 'inProgress')
}

function toggleCommandExpand(message: UiMessage): void {
  if (!isCommandMessage(message)) return

  const nextExpanded = new Set(expandedCommandIds.value)
  const nextCollapsedAuto = new Set(collapsedAutoCommandIds.value)
  const isAutoExpanded = isCommandAutoExpanded(message)
  const isManuallyExpanded = nextExpanded.has(message.id)

  if (isManuallyExpanded) {
    nextExpanded.delete(message.id)
    if (isAutoExpanded) nextCollapsedAuto.add(message.id)
  } else if (isAutoExpanded && !nextCollapsedAuto.has(message.id)) {
    nextCollapsedAuto.add(message.id)
  } else {
    nextExpanded.add(message.id)
    nextCollapsedAuto.delete(message.id)
  }

  expandedCommandIds.value = nextExpanded
  collapsedAutoCommandIds.value = nextCollapsedAuto
}

function getGroupedCommandsForLatest(message: UiMessage): UiMessage[] {
  return groupedCommandsByLatestId.value[message.id] ?? []
}

function getCommandBlockForLatest(message: UiMessage): UiMessage[] {
  if (!isCommandMessage(message)) return []
  return [...getGroupedCommandsForLatest(message), message]
}

function toggleCommandGroup(message: UiMessage): void {
  const groupedCommands = getGroupedCommandsForLatest(message)
  if (groupedCommands.length === 0) return
  const next = new Set(expandedCommandGroupIds.value)
  if (next.has(message.id)) next.delete(message.id)
  else next.add(message.id)
  expandedCommandGroupIds.value = next
}

function isCommandGroupExpanded(message: UiMessage): boolean {
  return expandedCommandGroupIds.value.has(message.id)
}

function commandGroupSummaryLabel(message: UiMessage): string {
  const commands = getCommandBlockForLatest(message)
  const count = commands.length
  const latestCommand = message.commandExecution?.command?.trim() || '(command)'
  const countLabel = count === 1 ? '1 command' : `${count} commands`
  return `${countLabel} · latest: ${latestCommand}`
}

function commandGroupSummaryStatus(message: UiMessage): string {
  return commandStatusLabel(message)
}

function toggleWorkedExpand(message: UiMessage): void {
  const next = new Set(expandedWorkedIds.value)
  if (next.has(message.id)) next.delete(message.id)
  else next.add(message.id)
  expandedWorkedIds.value = next
}

function isWorkedExpanded(message: UiMessage): boolean {
  return expandedWorkedIds.value.has(message.id)
}

function toggleFileChangeSummary(message: UiMessage): void {
  const next = new Set(expandedFileChangeSummaryIds.value)
  if (next.has(message.id)) next.delete(message.id)
  else next.add(message.id)
  expandedFileChangeSummaryIds.value = next
}

function isFileChangeSummaryExpanded(message: UiMessage): boolean {
  return expandedFileChangeSummaryIds.value.has(message.id)
}

function openDiffViewer(summary: TurnFileChangeSummary | null, change: UiFileChange): void {
  if (!summary) return
  activeDiffViewerSummary.value = summary
  activeDiffViewerChangeKey.value = fileChangeKey(change)
  isDiffViewerFileListOpen.value = false
}

function closeDiffViewer(): void {
  activeDiffViewerSummary.value = null
  activeDiffViewerChangeKey.value = ''
  isDiffViewerFileListOpen.value = false
}

function toggleDiffViewerFileList(): void {
  isDiffViewerFileListOpen.value = !isDiffViewerFileListOpen.value
}

function closeDiffViewerFileList(): void {
  isDiffViewerFileListOpen.value = false
}

function selectDiffViewerChange(change: UiFileChange): void {
  activeDiffViewerChangeKey.value = fileChangeKey(change)
  if (isMobile.value) {
    isDiffViewerFileListOpen.value = false
  }
}

function commandStatusLabel(message: UiMessage): string {
  const ce = message.commandExecution
  if (!ce) return ''
  const compact = isCommandCompact(message)
  switch (ce.status) {
    case 'inProgress': return compact ? 'Running' : '⟳ Running'
    case 'completed': return ce.exitCode === 0 ? (compact ? 'Done' : '✓ Completed') : `Exit ${ce.exitCode ?? '?'}`
    case 'failed': return compact ? 'Failed' : '✗ Failed'
    case 'declined': return compact ? 'Declined' : '⊘ Declined'
    case 'interrupted': return compact ? 'Stopped' : '⊘ Interrupted'
    default: return ''
  }
}

function commandStatusClass(message: UiMessage): string {
  const s = message.commandExecution?.status
  if (s === 'inProgress') return 'cmd-status-running'
  if (s === 'completed' && message.commandExecution?.exitCode === 0) return 'cmd-status-ok'
  return 'cmd-status-error'
}

function pruneCommandIdSet(source: Set<string>, validIds: Set<string>): Set<string> {
  if (source.size === 0) return source
  const next = new Set<string>()
  for (const id of source) {
    if (validIds.has(id)) next.add(id)
  }
  return next.size === source.size ? source : next
}

const props = defineProps<{
  messages: UiMessage[]
  pendingRequests: UiServerRequest[]
  liveOverlay: UiLiveOverlay | null
  isLoading: boolean
  activeThreadId: string
  cwd: string
  hasMorePersistedAbove?: boolean
  isLoadingPersistedAbove?: boolean
  loadEarlierMessages?: (threadId: string) => Promise<void>
  textAnimationsEnabled?: boolean
  liveReasoningTextEnabled?: boolean
}>()

const emit = defineEmits<{
  forkThread: [payload: { threadId: string; turnIndex: number }]
  editHistoryMessage: [payload: { turnId: string; text: string }]
  implementPlan: [payload: { turnId: string }]
  respondServerRequest: [payload: { id: number; result?: unknown; error?: { code?: number; message: string } }]
}>()

const liveOverlayNowMs = ref(Date.now())
let liveOverlayTimer: number | undefined
const isTextAnimationEnabled = computed(() => props.textAnimationsEnabled !== false)
const isLiveReasoningTextEnabled = computed(() => props.liveReasoningTextEnabled !== false)

const liveOverlayDisplayLabel = computed(() => {
  const overlay = props.liveOverlay
  const baseLabel = overlay?.activityLabel?.trim() || 'Thinking'
  const startedAtMs = overlay?.activityStartedAtMs
  if (typeof startedAtMs !== 'number' || !Number.isFinite(startedAtMs)) return baseLabel

  const elapsedMs = Math.max(0, liveOverlayNowMs.value - startedAtMs)
  if (elapsedMs < 1000) return baseLabel

  const time = formatLiveOverlayDuration(elapsedMs)
  if (baseLabel === 'Thinking') {
    return t('Thinking for {time}', { time })
  }
  return t('{label} for {time}', { label: baseLabel, time })
})

const liveOverlayLatestReasoningLine = computed(() => {
  const text = props.liveOverlay?.reasoningText ?? ''
  const lines = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n')
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    const line = lines[index].trim()
    if (line.length > 0) return line
  }
  return ''
})

function formatLiveOverlayDuration(durationMs: number): string {
  const totalSeconds = Math.max(1, Math.round(durationMs / 1000))
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60
  const parts: string[] = []

  if (hours > 0) parts.push(`${hours}h`)
  if (minutes > 0 || hours > 0) parts.push(`${minutes}m`)

  const displaySeconds = seconds > 0 || parts.length === 0 ? seconds : 0
  parts.push(`${displaySeconds}s`)
  return parts.join(' ')
}

function clearLiveOverlayTimer(): void {
  if (liveOverlayTimer === undefined) return
  window.clearInterval(liveOverlayTimer)
  liveOverlayTimer = undefined
}

function syncLiveOverlayTimer(): void {
  clearLiveOverlayTimer()
  const startedAtMs = props.liveOverlay?.activityStartedAtMs
  if (typeof startedAtMs !== 'number' || !Number.isFinite(startedAtMs)) return
  liveOverlayNowMs.value = Date.now()
  liveOverlayTimer = window.setInterval(() => {
    liveOverlayNowMs.value = Date.now()
  }, 1000)
}

watch(
  () => props.liveOverlay?.activityStartedAtMs ?? null,
  () => syncLiveOverlayTimer(),
  { immediate: true },
)

onBeforeUnmount(clearLiveOverlayTimer)

const conversationListRef = ref<HTMLElement | null>(null)
const bottomAnchorRef = ref<HTMLElement | null>(null)
const modalImageUrl = ref('')
const copiedResponseAnchorId = ref('')
const toolQuestionAnswers = ref<Record<string, string>>({})
const toolQuestionOtherAnswers = ref<Record<string, string>>({})
const mcpElicitationAnswers = ref<Record<string, string | number | boolean | string[]>>({})
const autoFollowOutput = ref(true)
const BOTTOM_THRESHOLD_PX = 16

let conversationScrollFrame = 0
let bottomLockFrame = 0
let bottomLockFramesLeft = 0
let copiedMessageResetTimer: ReturnType<typeof setTimeout> | null = null
let copiedCodeBlockResetTimer: ReturnType<typeof setTimeout> | null = null
let copiedCodeBlockButton: HTMLButtonElement | null = null
let conversationScrollPromise: Promise<void> | null = null
const trackedPendingImages = new WeakSet<HTMLImageElement>()
const highlightJsModule = ref<HighlightJsModule | null>(null)
const highlightCacheVersion = ref(0)
const markdownImageFailureVersion = ref(0)
let highlightJsLoader: Promise<void> | null = null
const MESSAGE_BLOCK_CACHE_LIMIT = 300
const INLINE_SEGMENT_CACHE_LIMIT = 1200
const MARKDOWN_HTML_CACHE_LIMIT = 300
const HIGHLIGHT_HTML_CACHE_LIMIT = 250

type MessageBlockCacheEntry = {
  text: string
  cwd: string
  blocks: MessageBlock[]
}

type MarkdownHtmlCacheEntry = {
  text: string
  cwd: string
  highlightVersion: number
  html: string
}

const messageBlockCache = new Map<string, MessageBlockCacheEntry>()
const inlineSegmentCache = new Map<string, InlineSegment[]>()
const markdownHtmlCache = new Map<string, MarkdownHtmlCacheEntry>()
const highlightHtmlCache = new Map<string, string>()

function setBoundedCacheEntry<K, V>(cache: Map<K, V>, key: K, value: V, limit: number): V {
  if (cache.has(key)) cache.delete(key)
  cache.set(key, value)
  while (cache.size > limit) {
    const oldestKey = cache.keys().next().value as K | undefined
    if (oldestKey === undefined) break
    cache.delete(oldestKey)
  }
  return value
}

const RENDER_WINDOW_SIZE = 50
const LOAD_MORE_CHUNK = 30
const LOAD_MORE_SCROLL_THRESHOLD_PX = 200

const renderWindowStart = ref(0)
const isLoadingMore = ref(false)

const visibleMessages = computed(() => props.messages.slice(renderWindowStart.value).filter(showMessageInThread))
const hasMoreAbove = computed(() => renderWindowStart.value > 0 || props.hasMorePersistedAbove === true)

const showJumpToLatestButton = computed(
  () => !autoFollowOutput.value && (props.messages.length > 0 || props.pendingRequests.length > 0 || Boolean(props.liveOverlay)),
)

function ensureHighlightJsLoaded(): Promise<void> {
  if (highlightJsModule.value) return Promise.resolve()
  if (!highlightJsLoader) {
    highlightJsLoader = import('highlight.js/lib/common')
      .then((module) => {
        highlightJsModule.value = module.default
        highlightHtmlCache.clear()
        markdownHtmlCache.clear()
        highlightCacheVersion.value += 1
      })
      .finally(() => {
        highlightJsLoader = null
      })
  }
  return highlightJsLoader
}

type ParsedToolQuestion = {
  id: string
  header: string
  question: string
  isSecret: boolean
  isOther: boolean
  options: Array<{ label: string; description: string }>
}
type McpElicitationFieldOption = {
  value: string
  label: string
}
type McpElicitationField = {
  key: string
  label: string
  description: string
  required: boolean
  kind: 'string' | 'number' | 'boolean' | 'singleEnum' | 'multiEnum'
  inputType: string
  options: McpElicitationFieldOption[]
  defaultValue: string | number | boolean | string[]
}

const copyableResponseContentByAnchorId = computed<Record<string, string>>(() => {
  const fileChangeCopyByAnchorId: Record<string, string> = {}
  for (const [anchorMessageId, summary] of Object.entries(anchoredFileChangeSummaryByAnchorId.value)) {
    if (summary.source !== 'metadata') continue
    const fileChangeCopy = buildFileChangeCopyText(summary)
    if (!fileChangeCopy) continue
    fileChangeCopyByAnchorId[anchorMessageId] = fileChangeCopy
  }
  return buildCopyableResponseContentByAnchorId(props.messages, isCopyableAssistantMessage, fileChangeCopyByAnchorId)
})

const copyableMessageContentByAnchorId = computed<Record<string, string>>(() => {
  return buildCopyableMessageContentByAnchorId(props.messages, copyableResponseContentByAnchorId.value)
})

const forkableTurnIndexByAnchorId = computed<Record<string, number>>(() => {
  return buildForkableTurnIndexByAnchorId(props.messages, isCopyableAssistantMessage)
})

function showCopyResponseButton(message: UiMessage): boolean {
  return typeof copyableMessageContentByAnchorId.value[message.id] === 'string'
}

function showForkResponseButton(message: UiMessage): boolean {
  return typeof forkableTurnIndexByAnchorId.value[message.id] === 'number'
}

function formatMessageTime(message: UiMessage): string {
  const sentAtIso = message.sentAtIso?.trim() ?? ''
  if (!sentAtIso) return ''
  const timestamp = Date.parse(sentAtIso)
  if (!Number.isFinite(timestamp)) return ''
  return new Intl.DateTimeFormat(undefined, {
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(timestamp))
}

function showMessageToolbar(message: UiMessage): boolean {
  if (hiddenWorkedProcessMessageIds.value.has(message.id)) return false
  return Boolean(formatMessageTime(message))
    || showCopyResponseButton(message)
    || showEditMessageButton(message)
    || showForkResponseButton(message)
}

function copyMessageButtonLabel(message: UiMessage): string {
  if (copiedResponseAnchorId.value === message.id) {
    return message.role === 'assistant' ? t('Response copied') : t('Message copied')
  }
  return message.role === 'assistant' ? t('Copy response') : t('Copy message')
}

const anchoredFileChangeSummaryByAnchorId = computed<Record<string, TurnFileChangeSummary>>(() => {
  const assistantAnchorIdByTurnKey = new Map<string, string>()
  const assistantSummaryByAnchorId = new Map<string, TurnFileChangeSummary>()
  const fileChangeMessagesByTurnKey = new Map<string, UiMessage[]>()

  for (const message of props.messages) {
    if (isCopyableAssistantMessage(message) && typeof message.turnIndex === 'number') {
      assistantAnchorIdByTurnKey.set(`turn:${message.turnIndex}`, message.id)
      if (Array.isArray(message.fileChanges) && message.fileChanges.length > 0) {
        assistantSummaryByAnchorId.set(message.id, {
          changes: aggregateFileChanges(message.fileChanges),
          sourceMessageIds: [],
          source: 'assistant',
        })
      }
    }

    if (!isFileChangeMessage(message)) continue
    const turnKey = typeof message.turnIndex === 'number' ? `turn:${message.turnIndex}` : `message:${message.id}`
    const current = fileChangeMessagesByTurnKey.get(turnKey)
    if (current) current.push(message)
    else fileChangeMessagesByTurnKey.set(turnKey, [message])
  }

  const summaries: Record<string, TurnFileChangeSummary> = {}
  for (const [turnKey, messages] of fileChangeMessagesByTurnKey.entries()) {
    const anchorId = assistantAnchorIdByTurnKey.get(turnKey)
    if (!anchorId) continue
    summaries[anchorId] = {
      changes: aggregateFileChanges(messages.flatMap((message) => message.fileChanges ?? [])),
      sourceMessageIds: messages.map((message) => message.id),
      source: 'metadata',
    }
  }

  for (const [anchorId, summary] of assistantSummaryByAnchorId.entries()) {
    if (!summaries[anchorId]) {
      summaries[anchorId] = summary
    }
  }

  return summaries
})

const standaloneFileChangeSummaryByMessageId = computed<Record<string, TurnFileChangeSummary>>(() => {
  const assistantAnchorIdByTurnKey = new Map<string, string>()
  const fileChangeMessagesByTurnKey = new Map<string, UiMessage[]>()

  for (const message of props.messages) {
    if (isCopyableAssistantMessage(message) && typeof message.turnIndex === 'number') {
      assistantAnchorIdByTurnKey.set(`turn:${message.turnIndex}`, message.id)
    }

    if (!isFileChangeMessage(message)) continue
    const turnKey = typeof message.turnIndex === 'number' ? `turn:${message.turnIndex}` : `message:${message.id}`
    const current = fileChangeMessagesByTurnKey.get(turnKey)
    if (current) current.push(message)
    else fileChangeMessagesByTurnKey.set(turnKey, [message])
  }

  const summaries: Record<string, TurnFileChangeSummary> = {}
  for (const [turnKey, messages] of fileChangeMessagesByTurnKey.entries()) {
    if (assistantAnchorIdByTurnKey.has(turnKey)) continue
    const visibleMessage = messages[messages.length - 1]
    if (!visibleMessage) continue
    summaries[visibleMessage.id] = {
      changes: aggregateFileChanges(messages.flatMap((message) => message.fileChanges ?? [])),
      sourceMessageIds: messages.map((message) => message.id),
      source: 'metadata',
    }
  }

  return summaries
})

const hiddenFileChangeMessageIds = computed(() => {
  const next = new Set<string>()
  for (const summary of Object.values(anchoredFileChangeSummaryByAnchorId.value)) {
    for (const messageId of summary.sourceMessageIds) {
      next.add(messageId)
    }
  }
  for (const [messageId, summary] of Object.entries(standaloneFileChangeSummaryByMessageId.value)) {
    for (const sourceMessageId of summary.sourceMessageIds) {
      if (sourceMessageId !== messageId) {
        next.add(sourceMessageId)
      }
    }
  }
  return next
})

function readAnchoredFileChangeSummary(message: UiMessage): TurnFileChangeSummary | null {
  return anchoredFileChangeSummaryByAnchorId.value[message.id] ?? null
}

function readStandaloneFileChangeSummary(message: UiMessage): TurnFileChangeSummary | null {
  return standaloneFileChangeSummaryByMessageId.value[message.id] ?? null
}

function buildFileChangeCopyText(summary: TurnFileChangeSummary | null): string {
  return buildFileChangeCopyTextForCwd(summary, props.cwd)
}

const diffViewerChanges = computed<UiFileChange[]>(() => activeDiffViewerSummary.value?.changes ?? [])

const activeDiffViewerChange = computed<UiFileChange | null>(() => {
  return readActiveDiffViewerChange(diffViewerChanges.value, activeDiffViewerChangeKey.value)
})

function copyTextWithSelectionFallback(text: string): boolean {
  if (typeof document === 'undefined') return false

  const textarea = document.createElement('textarea')
  textarea.value = text
  textarea.setAttribute('readonly', 'true')
  textarea.style.position = 'fixed'
  textarea.style.left = '-9999px'
  textarea.style.opacity = '0'
  textarea.style.pointerEvents = 'none'
  document.body.appendChild(textarea)
  textarea.focus()
  textarea.select()
  textarea.setSelectionRange(0, text.length)

  try {
    return document.execCommand('copy')
  } catch {
    return false
  } finally {
    document.body.removeChild(textarea)
  }
}

function resetCodeCopyButton(button: HTMLButtonElement): void {
  button.dataset.copied = 'false'
  button.setAttribute('aria-label', 'Copy code')
  button.setAttribute('title', 'Copy code')
}

function markCodeCopyButtonCopied(button: HTMLButtonElement): void {
  if (copiedCodeBlockResetTimer) {
    clearTimeout(copiedCodeBlockResetTimer)
    copiedCodeBlockResetTimer = null
  }
  if (copiedCodeBlockButton && copiedCodeBlockButton !== button && copiedCodeBlockButton.isConnected) {
    resetCodeCopyButton(copiedCodeBlockButton)
  }

  copiedCodeBlockButton = button
  button.dataset.copied = 'true'
  button.setAttribute('aria-label', 'Code copied')
  button.setAttribute('title', 'Code copied')

  copiedCodeBlockResetTimer = setTimeout(() => {
    if (copiedCodeBlockButton === button && button.isConnected) {
      resetCodeCopyButton(button)
    }
    copiedCodeBlockButton = null
    copiedCodeBlockResetTimer = null
  }, 1600)
}

async function copyCodeBlock(button: HTMLButtonElement): Promise<void> {
  const block = button.closest('.message-code-block')
  const code = block?.querySelector<HTMLElement>('.message-code-pre code')
  const text = code?.textContent ?? ''
  if (!text) return

  let copied = false
  if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text)
      copied = true
    } catch {
      copied = false
    }
  }

  if (!copied) {
    copied = copyTextWithSelectionFallback(text)
  }

  if (copied) markCodeCopyButtonCopied(button)
}

function onConversationClick(event: MouseEvent): void {
  const target = event.target
  if (!(target instanceof Element)) return

  const codeCopyButton = target.closest<HTMLButtonElement>('button[data-code-copy="true"]')
  if (!codeCopyButton) return

  event.preventDefault()
  event.stopPropagation()
  void copyCodeBlock(codeCopyButton)
}

async function copyResponse(anchorMessageId: string): Promise<void> {
  const content = copyableMessageContentByAnchorId.value[anchorMessageId] ?? ''
  if (!content) return

  let copied = false
  if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(content)
      copied = true
    } catch {
      copied = false
    }
  }

  if (!copied) {
    copied = copyTextWithSelectionFallback(content)
  }

  if (!copied) return

  copiedResponseAnchorId.value = anchorMessageId
  if (copiedMessageResetTimer) {
    clearTimeout(copiedMessageResetTimer)
  }
  copiedMessageResetTimer = setTimeout(() => {
    if (copiedResponseAnchorId.value === anchorMessageId) {
      copiedResponseAnchorId.value = ''
    }
    copiedMessageResetTimer = null
  }, 1800)
}

function forkResponse(anchorMessageId: string): void {
  const turnIndex = forkableTurnIndexByAnchorId.value[anchorMessageId]
  if (typeof turnIndex !== 'number') return
  if (!props.activeThreadId) return
  emit('forkThread', {
    threadId: props.activeThreadId,
    turnIndex,
  })
}

const editableTurnIdByMessageId = computed<Record<string, string>>(() => {
  const next: Record<string, string> = {}
  for (const message of props.messages) {
    if (message.role !== 'user' || typeof message.turnIndex !== 'number') continue
    const turnId = typeof message.turnId === 'string' && message.turnId.length > 0 ? message.turnId : ''
    if (!turnId || message.text.trim().length === 0) continue
    next[message.id] = turnId
  }
  return next
})

function showEditMessageButton(message: UiMessage): boolean {
  return typeof editableTurnIdByMessageId.value[message.id] === 'string'
}

function editMessage(messageId: string): void {
  const turnId = editableTurnIdByMessageId.value[messageId]
  if (!turnId) return
  const message = props.messages.find((item) => item.id === messageId)
  const text = message?.text ?? ''
  if (!text.trim()) return
  emit('editHistoryMessage', { turnId, text })
}

function getInlineSegments(text: string): InlineSegment[] {
  const cached = inlineSegmentCache.get(text)
  if (cached) {
    inlineSegmentCache.delete(text)
    inlineSegmentCache.set(text, cached)
    return cached
  }
  return setBoundedCacheEntry(inlineSegmentCache, text, parseInlineSegments(text), INLINE_SEGMENT_CACHE_LIMIT)
}

function toBrowseUrl(pathValue: string): string {
  return buildBrowseUrl(pathValue, props.cwd)
}

const fileLinkContextMenuStyle = computed(() => ({
  left: `${String(fileLinkContextMenuX.value)}px`,
  top: `${String(fileLinkContextMenuY.value)}px`,
}))

function toEditUrlFromBrowseHref(href: string): string {
  return buildEditUrlFromBrowseHref(href, window.location.href)
}

function onConversationContextMenu(event: MouseEvent): void {
  const target = event.target
  if (!(target instanceof Element)) return

  const anchor = target.closest('a.message-file-link')
  if (!(anchor instanceof HTMLAnchorElement)) return

  const href = (anchor.getAttribute('href') ?? '').trim()
  if (!href || href === '#') return

  event.preventDefault()
  event.stopPropagation()

  fileLinkContextBrowseUrl.value = href
  fileLinkContextEditUrl.value = toEditUrlFromBrowseHref(href)
  fileLinkContextMenuX.value = event.clientX
  fileLinkContextMenuY.value = event.clientY
  isFileLinkContextMenuVisible.value = true
}

function closeFileLinkContextMenu(): void {
  if (!isFileLinkContextMenuVisible.value) return
  isFileLinkContextMenuVisible.value = false
}

function openFileLinkContextBrowse(): void {
  const href = fileLinkContextBrowseUrl.value
  closeFileLinkContextMenu()
  if (!href || href === '#') return
  window.open(href, '_blank', 'noopener,noreferrer')
}

function openFileLinkContextEdit(): void {
  const href = fileLinkContextEditUrl.value
  closeFileLinkContextMenu()
  if (!href || href === '#') return
  window.open(href, '_blank', 'noopener,noreferrer')
}

async function copyFileLinkContextLink(): Promise<void> {
  const href = fileLinkContextBrowseUrl.value
  closeFileLinkContextMenu()
  if (!href || href === '#') return

  try {
    await navigator.clipboard.writeText(href)
  } catch {
    const textarea = document.createElement('textarea')
    textarea.value = href
    textarea.setAttribute('readonly', 'true')
    textarea.style.position = 'fixed'
    textarea.style.opacity = '0'
    document.body.appendChild(textarea)
    textarea.select()
    document.execCommand('copy')
    document.body.removeChild(textarea)
  }
}

function onWindowPointerDownForFileLinkContextMenu(event: PointerEvent): void {
  if (!isFileLinkContextMenuVisible.value) return
  const menu = fileLinkContextMenuRef.value
  if (!menu) {
    closeFileLinkContextMenu()
    return
  }
  const target = event.target
  if (target instanceof Node && menu.contains(target)) return
  closeFileLinkContextMenu()
}

function onWindowBlurForFileLinkContextMenu(): void {
  closeFileLinkContextMenu()
}

function onWindowKeydownForFileLinkContextMenu(event: KeyboardEvent): void {
  if (event.key !== 'Escape') return
  closeFileLinkContextMenu()
}

function getMessageBlocks(message: UiMessage): MessageBlock[] {
  const cached = messageBlockCache.get(message.id)
  if (cached && cached.text === message.text && cached.cwd === props.cwd) {
    messageBlockCache.delete(message.id)
    messageBlockCache.set(message.id, cached)
    return cached.blocks
  }
  const blocks = parseMessageBlocks(message.text)
  return setBoundedCacheEntry(
    messageBlockCache,
    message.id,
    { text: message.text, cwd: props.cwd, blocks },
    MESSAGE_BLOCK_CACHE_LIMIT,
  ).blocks
}

function normalizeCodeLanguage(language: string): string {
  const token = language.trim().split(/\s+/u)[0]?.toLowerCase() ?? ''
  if (!token) return ''
  return CODE_LANGUAGE_ALIASES[token] ?? token
}

function renderHighlightedCodeAsHtmlUncached(language: string, value: string): string {
  const normalizedLanguage = normalizeCodeLanguage(language)
  if (!normalizedLanguage) return escapeHtml(value)
  const highlighter = highlightJsModule.value
  if (!highlighter) return escapeHtml(value)

  try {
    if (highlighter.getLanguage(normalizedLanguage)) {
      return highlighter.highlight(value, {
        language: normalizedLanguage,
        ignoreIllegals: true,
      }).value
    }
  } catch {
    // Fall back to plain escaped code when highlighting fails.
  }

  return escapeHtml(value)
}

function renderCachedHighlightedCodeAsHtml(language: string, value: string): string {
  const cacheKey = `${highlightCacheVersion.value}\u0000${normalizeCodeLanguage(language)}\u0000${language}\u0000${value}`
  const cached = highlightHtmlCache.get(cacheKey)
  if (cached !== undefined) {
    highlightHtmlCache.delete(cacheKey)
    highlightHtmlCache.set(cacheKey, cached)
    return cached
  }
  return setBoundedCacheEntry(
    highlightHtmlCache,
    cacheKey,
    renderHighlightedCodeAsHtmlUncached(language, value),
    HIGHLIGHT_HTML_CACHE_LIMIT,
  )
}

function renderListItemContentAsHtml(item: ListItem): string {
  return renderMarkdownListItemContentAsHtml(item, {
    getInlineSegments,
    toBrowseUrl,
    renderHighlightedCodeAsHtml: renderCachedHighlightedCodeAsHtml,
  })
}

function renderMarkdownBlocksAsHtml(text: string): string {
  const cacheKey = `${props.cwd}\u0000${highlightCacheVersion.value}\u0000${text}`
  const cached = markdownHtmlCache.get(cacheKey)
  if (cached && cached.text === text && cached.cwd === props.cwd && cached.highlightVersion === highlightCacheVersion.value) {
    markdownHtmlCache.delete(cacheKey)
    markdownHtmlCache.set(cacheKey, cached)
    return cached.html
  }
  const html = renderMarkdownBlocksToHtml(text, {
    getInlineSegments,
    toBrowseUrl,
    renderHighlightedCodeAsHtml: renderCachedHighlightedCodeAsHtml,
  })
  return setBoundedCacheEntry(
    markdownHtmlCache,
    cacheKey,
    {
      text,
      cwd: props.cwd,
      highlightVersion: highlightCacheVersion.value,
      html,
    },
    MARKDOWN_HTML_CACHE_LIMIT,
  ).html
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

function formatIsoTime(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleTimeString()
}

function readRequestReason(request: UiServerRequest): string {
  const params = asRecord(request.params)
  const reason = typeof params?.reason === 'string' ? params.reason.trim() : ''
  if (reason) return reason
  const message = typeof params?.message === 'string' ? params.message.trim() : ''
  if (message) return message
  return typeof params?.prompt === 'string' ? params.prompt.trim() : ''
}

function requestDisplayTitle(request: UiServerRequest): string {
  if (request.method === 'item/commandExecution/requestApproval') return 'Command approval required'
  if (request.method === 'item/fileChange/requestApproval') return 'File change approval required'
  if (request.method === 'item/permissions/requestApproval') return 'Permissions approval required'
  if (request.method === 'mcpServer/elicitation/request') return 'MCP server input required'
  if (request.method === 'item/tool/requestUserInput') return 'Input required'
  if (request.method === 'item/tool/call') return 'Tool call waiting for response'
  return request.method
}

function readMcpElicitationServerName(request: UiServerRequest): string {
  const params = asRecord(request.params)
  return typeof params?.serverName === 'string' ? params.serverName.trim() : ''
}

function readMcpElicitationUrl(request: UiServerRequest): string {
  const params = asRecord(request.params)
  return typeof params?.url === 'string' ? params.url.trim() : ''
}

function mcpElicitationAnswerKey(requestId: number, fieldKey: string): string {
  return `${String(requestId)}:${fieldKey}`
}

function readMcpElicitationFields(request: UiServerRequest): McpElicitationField[] {
  const params = asRecord(request.params)
  const requestedSchema = asRecord(params?.requestedSchema)
  const properties = asRecord(requestedSchema?.properties)
  if (!properties) return []

  const required = new Set(
    Array.isArray(requestedSchema?.required)
      ? requestedSchema.required.filter((entry): entry is string => typeof entry === 'string')
      : [],
  )

  return Object.entries(properties)
    .map(([key, value]) => parseMcpElicitationField(key, asRecord(value), required.has(key)))
    .filter((field): field is McpElicitationField => field !== null)
}

function parseMcpElicitationField(
  key: string,
  schema: Record<string, unknown> | null,
  required: boolean,
): McpElicitationField | null {
  if (!schema) return null

  const label = typeof schema.title === 'string' && schema.title.trim().length > 0 ? schema.title.trim() : key
  const description = typeof schema.description === 'string' ? schema.description.trim() : ''
  const type = typeof schema.type === 'string' ? schema.type.trim() : ''

  if (type === 'boolean') {
    return { key, label, description, required, kind: 'boolean', inputType: 'checkbox', options: [], defaultValue: schema.default === true }
  }

  if (type === 'number' || type === 'integer') {
    return {
      key,
      label,
      description,
      required,
      kind: 'number',
      inputType: 'number',
      options: [],
      defaultValue: typeof schema.default === 'number' ? schema.default : '',
    }
  }

  const options = readMcpElicitationOptions(schema)
  if (type === 'array') {
    return {
      key,
      label,
      description,
      required,
      kind: 'multiEnum',
      inputType: 'checkbox',
      options,
      defaultValue: Array.isArray(schema.default)
        ? schema.default.filter((entry): entry is string => typeof entry === 'string')
        : [],
    }
  }

  if (options.length > 0) {
    return {
      key,
      label,
      description,
      required,
      kind: 'singleEnum',
      inputType: 'select',
      options,
      defaultValue: (typeof schema.default === 'string' ? schema.default : '') || options[0]?.value || '',
    }
  }

  return {
    key,
    label,
    description,
    required,
    kind: 'string',
    inputType: readMcpElicitationInputType(schema),
    options: [],
    defaultValue: typeof schema.default === 'string' ? schema.default : '',
  }
}

function readMcpElicitationOptions(schema: Record<string, unknown>): McpElicitationFieldOption[] {
  const titledSource = Array.isArray(schema.oneOf) ? schema.oneOf : Array.isArray(schema.anyOf) ? schema.anyOf : []
  const titledOptions = titledSource
    .map((option) => asRecord(option))
    .map((option) => ({
      value: typeof option?.const === 'string' ? option.const : '',
      label: typeof option?.title === 'string' && option.title.trim().length > 0 ? option.title : (typeof option?.const === 'string' ? option.const : ''),
    }))
    .filter((option) => option.value.length > 0)
  if (titledOptions.length > 0) return titledOptions

  const items = asRecord(schema.items)
  if (items) {
    const nestedOptions = readMcpElicitationOptions(items)
    if (nestedOptions.length > 0) return nestedOptions
  }

  const values = Array.isArray(schema.enum) ? schema.enum.filter((entry): entry is string => typeof entry === 'string') : []
  const names = Array.isArray(schema.enumNames) ? schema.enumNames.filter((entry): entry is string => typeof entry === 'string') : []
  return values.map((value, index) => ({ value, label: names[index] || value }))
}

function readMcpElicitationInputType(schema: Record<string, unknown>): string {
  const format = typeof schema.format === 'string' ? schema.format.trim() : ''
  if (format === 'email') return 'email'
  if (format === 'uri') return 'url'
  if (format === 'date') return 'date'
  if (format === 'date-time') return 'datetime-local'
  return 'text'
}

function readMcpElicitationFieldValue(requestId: number, field: McpElicitationField): string | number | boolean | string[] {
  const saved = mcpElicitationAnswers.value[mcpElicitationAnswerKey(requestId, field.key)]
  return saved === undefined ? field.defaultValue : saved
}

function readMcpElicitationMultiValue(requestId: number, field: McpElicitationField): string[] {
  const value = readMcpElicitationFieldValue(requestId, field)
  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === 'string') : []
}

function toolQuestionKey(requestId: number, questionId: string): string {
  return `${String(requestId)}:${questionId}`
}

function readToolQuestions(request: UiServerRequest): ParsedToolQuestion[] {
  const params = asRecord(request.params)
  const questions = Array.isArray(params?.questions) ? params.questions : []
  const parsed: ParsedToolQuestion[] = []

  for (const row of questions) {
    const question = asRecord(row)
    if (!question) continue
    const id = typeof question.id === 'string' ? question.id : ''
    if (!id) continue

    const options = Array.isArray(question.options)
      ? question.options
        .map((option) => asRecord(option))
        .map((option) => ({
          label: typeof option?.label === 'string' ? option.label : '',
          description: typeof option?.description === 'string' ? option.description : '',
        }))
        .filter((option) => option.label.length > 0)
      : []

    parsed.push({
      id,
      header: typeof question.header === 'string' ? question.header : '',
      question: typeof question.question === 'string' ? question.question : '',
      isSecret: question.isSecret === true,
      isOther: question.isOther === true,
      options,
    })
  }

  return parsed
}

function readQuestionAnswer(requestId: number, questionId: string, fallback: string): string {
  const key = toolQuestionKey(requestId, questionId)
  const saved = toolQuestionAnswers.value[key]
  if (typeof saved === 'string' && saved.length > 0) return saved
  return fallback
}

function onQuestionAnswerInput(requestId: number, questionId: string, event: Event): void {
  const target = event.target
  if (!(target instanceof HTMLInputElement)) return
  const key = toolQuestionKey(requestId, questionId)
  toolQuestionAnswers.value = {
    ...toolQuestionAnswers.value,
    [key]: target.value,
  }
}

function readQuestionOptionDescription(requestId: number, question: ParsedToolQuestion): string {
  const selected = readQuestionAnswer(requestId, question.id, question.options[0]?.label || '')
  const match = question.options.find((option) => option.label === selected)
  return match?.description ?? ''
}

function readQuestionOtherAnswer(requestId: number, questionId: string): string {
  const key = toolQuestionKey(requestId, questionId)
  return toolQuestionOtherAnswers.value[key] ?? ''
}

function onQuestionAnswerChange(requestId: number, questionId: string, event: Event): void {
  const target = event.target
  if (!(target instanceof HTMLSelectElement)) return
  const key = toolQuestionKey(requestId, questionId)
  toolQuestionAnswers.value = {
    ...toolQuestionAnswers.value,
    [key]: target.value,
  }
}

function onQuestionOtherAnswerInput(requestId: number, questionId: string, event: Event): void {
  const target = event.target
  if (!(target instanceof HTMLInputElement)) return
  const key = toolQuestionKey(requestId, questionId)
  toolQuestionOtherAnswers.value = {
    ...toolQuestionOtherAnswers.value,
    [key]: target.value,
  }
}

function onMcpElicitationFieldInput(requestId: number, field: McpElicitationField, event: Event): void {
  const target = event.target
  if (!(target instanceof HTMLInputElement) && !(target instanceof HTMLSelectElement)) return
  mcpElicitationAnswers.value = {
    ...mcpElicitationAnswers.value,
    [mcpElicitationAnswerKey(requestId, field.key)]: target.value,
  }
}

function onMcpElicitationBooleanToggle(requestId: number, field: McpElicitationField, event: Event): void {
  const target = event.target
  if (!(target instanceof HTMLInputElement)) return
  mcpElicitationAnswers.value = {
    ...mcpElicitationAnswers.value,
    [mcpElicitationAnswerKey(requestId, field.key)]: target.checked,
  }
}

function onMcpElicitationMultiToggle(
  requestId: number,
  field: McpElicitationField,
  optionValue: string,
  event: Event,
): void {
  const target = event.target
  if (!(target instanceof HTMLInputElement)) return
  const next = new Set(readMcpElicitationMultiValue(requestId, field))
  if (target.checked) next.add(optionValue)
  else next.delete(optionValue)
  mcpElicitationAnswers.value = {
    ...mcpElicitationAnswers.value,
    [mcpElicitationAnswerKey(requestId, field.key)]: Array.from(next),
  }
}

function onRespondApproval(requestId: number, decision: 'accept' | 'acceptForSession' | 'decline' | 'cancel'): void {
  emit('respondServerRequest', {
    id: requestId,
    result: { decision },
  })
}

function onRespondPermissionsApproval(request: UiServerRequest, scope: 'turn' | 'session'): void {
  const params = asRecord(request.params)
  const permissions = asRecord(params?.permissions) ?? {}
  emit('respondServerRequest', {
    id: request.id,
    result: {
      permissions,
      scope,
    },
  })
}

function buildMcpElicitationContent(request: UiServerRequest): Record<string, unknown> {
  const content: Record<string, unknown> = {}
  for (const field of readMcpElicitationFields(request)) {
    const value = readMcpElicitationFieldValue(request.id, field)
    if (field.kind === 'multiEnum') {
      const arrayValue = Array.isArray(value) ? value : []
      if (arrayValue.length > 0 || field.required) content[field.key] = arrayValue
      continue
    }
    if (field.kind === 'boolean') {
      content[field.key] = Boolean(value)
      continue
    }
    if (field.kind === 'number') {
      const numberValue = typeof value === 'number' ? value : Number(String(value).trim())
      if (!Number.isNaN(numberValue)) content[field.key] = numberValue
      continue
    }
    const textValue = String(value ?? '').trim()
    if (textValue.length > 0 || field.required) content[field.key] = textValue
  }
  return content
}

function onRespondMcpElicitation(request: UiServerRequest, action: 'accept' | 'decline' | 'cancel'): void {
  const params = asRecord(request.params)
  const result: Record<string, unknown> = { action }
  if (action === 'accept' && typeof params?.mode === 'string' && params.mode === 'form') {
    result.content = buildMcpElicitationContent(request)
  }
  emit('respondServerRequest', {
    id: request.id,
    result,
  })
}

function onRespondToolRequestUserInput(request: UiServerRequest): void {
  const questions = readToolQuestions(request)
  const answers: Record<string, { answers: string[] }> = {}

  for (const question of questions) {
    const selected = readQuestionAnswer(request.id, question.id, question.options[0]?.label || '')
    const other = readQuestionOtherAnswer(request.id, question.id).trim()
    const values = [selected, other].map((value) => value.trim()).filter((value) => value.length > 0)
    answers[question.id] = { answers: values }
  }

  emit('respondServerRequest', {
    id: request.id,
    result: { answers },
  })
}

function onRespondToolCallFailure(requestId: number): void {
  emit('respondServerRequest', {
    id: requestId,
    result: {
      success: false,
      contentItems: [
        {
          type: 'inputText',
          text: 'Tool call rejected from CodeS.',
        },
      ],
    },
  })
}

function onRespondToolCallSuccess(requestId: number): void {
  emit('respondServerRequest', {
    id: requestId,
    result: {
      success: true,
      contentItems: [],
    },
  })
}

function onRespondEmptyResult(requestId: number): void {
  emit('respondServerRequest', {
    id: requestId,
    result: {},
  })
}

function onRejectUnknownRequest(requestId: number): void {
  emit('respondServerRequest', {
    id: requestId,
    error: {
      code: -32000,
      message: 'Rejected from CodeS.',
    },
  })
}

function scrollToBottom(): void {
  const container = conversationListRef.value
  const anchor = bottomAnchorRef.value
  if (!container || !anchor) return
  container.scrollTop = container.scrollHeight
  anchor.scrollIntoView({ block: 'end' })
}

function isAtBottom(container: HTMLElement): boolean {
  const distance = container.scrollHeight - (container.scrollTop + container.clientHeight)
  return distance <= BOTTOM_THRESHOLD_PX
}

function applyConversationScrollState(): void {
  const container = conversationListRef.value
  if (!container) return

  if (autoFollowOutput.value) {
    enforceBottomState()
    return
  }
}

function enforceBottomState(): void {
  const container = conversationListRef.value
  if (!container) return
  scrollToBottom()
}

function shouldLockToBottom(): boolean {
  return autoFollowOutput.value
}

function runBottomLockFrame(): void {
  if (!shouldLockToBottom()) {
    bottomLockFramesLeft = 0
    bottomLockFrame = 0
    return
  }

  enforceBottomState()
  bottomLockFramesLeft -= 1
  if (bottomLockFramesLeft <= 0) {
    bottomLockFrame = 0
    return
  }
  bottomLockFrame = requestAnimationFrame(runBottomLockFrame)
}

function scheduleBottomLock(frames = 6): void {
  if (!shouldLockToBottom()) return
  if (bottomLockFrame) {
    cancelAnimationFrame(bottomLockFrame)
    bottomLockFrame = 0
  }
  bottomLockFramesLeft = Math.max(frames, 1)
  bottomLockFrame = requestAnimationFrame(runBottomLockFrame)
}

function onPendingImageSettled(): void {
  scheduleBottomLock(3)
}

function jumpToLatest(): void {
  autoFollowOutput.value = true
  enforceBottomState()
  scheduleBottomLock(4)
}

async function loadMoreAbove(): Promise<void> {
  const container = conversationListRef.value
  if (!container || !hasMoreAbove.value || isLoadingMore.value || props.isLoadingPersistedAbove === true) return

  isLoadingMore.value = true
  const threadIdAtStart = props.activeThreadId

  const prevScrollHeight = container.scrollHeight
  const prevScrollTop = container.scrollTop

  try {
    if (renderWindowStart.value > 0) {
      renderWindowStart.value = Math.max(0, renderWindowStart.value - LOAD_MORE_CHUNK)
    } else if (props.hasMorePersistedAbove === true) {
      await props.loadEarlierMessages?.(threadIdAtStart)
    }

    await nextTick()

    // Discard scroll restoration if the thread changed while we were awaiting.
    if (props.activeThreadId === threadIdAtStart) {
      container.scrollTop = prevScrollTop + (container.scrollHeight - prevScrollHeight)
    }
  } finally {
    isLoadingMore.value = false
  }
}

defineExpose({
  jumpToLatest,
})

function bindPendingImageHandlers(): void {
  if (!shouldLockToBottom()) return
  const container = conversationListRef.value
  if (!container) return

  const images = container.querySelectorAll<HTMLImageElement>('img.message-image-preview')
  for (const image of images) {
    if (image.complete || trackedPendingImages.has(image)) continue
    trackedPendingImages.add(image)
    image.addEventListener('load', onPendingImageSettled, { once: true })
    image.addEventListener('error', onPendingImageSettled, { once: true })
  }
}

async function scheduleConversationScroll(): Promise<void> {
  if (conversationScrollPromise) return conversationScrollPromise

  conversationScrollPromise = nextTick().then(() => new Promise<void>((resolve) => {
    if (conversationScrollFrame) {
      cancelAnimationFrame(conversationScrollFrame)
    }
    conversationScrollFrame = requestAnimationFrame(() => {
      conversationScrollFrame = 0
      conversationScrollPromise = null
      applyConversationScrollState()
      bindPendingImageHandlers()
      scheduleBottomLock()
      resolve()
    })
  }))

  return conversationScrollPromise
}

function clearRenderCaches(): void {
  messageBlockCache.clear()
  inlineSegmentCache.clear()
  markdownHtmlCache.clear()
  highlightHtmlCache.clear()
}

watch(
  () => props.messages,
  async (next) => {
    if (props.isLoading) return

    const commandIds = new Set(
      next
        .filter((message) => message.messageType === 'commandExecution' && message.commandExecution)
        .map((message) => message.id),
    )
    expandedCommandIds.value = pruneCommandIdSet(expandedCommandIds.value, commandIds)
    collapsedAutoCommandIds.value = pruneCommandIdSet(collapsedAutoCommandIds.value, commandIds)
    expandedCommandGroupIds.value = pruneCommandIdSet(
      expandedCommandGroupIds.value,
      new Set(Object.keys(groupedCommandsByLatestId.value)),
    )
    expandedFileChangeSummaryIds.value = pruneCommandIdSet(
      expandedFileChangeSummaryIds.value,
      new Set([
        ...Object.keys(anchoredFileChangeSummaryByAnchorId.value),
        ...Object.keys(standaloneFileChangeSummaryByMessageId.value),
      ]),
    )

    // Keep renderWindowStart in bounds whenever the message list changes length.
    // Following output: always pin the window to the last RENDER_WINDOW_SIZE messages so
    //   the rendered count stays bounded (handles both growth and shrink/rollback).
    // Scrolled up: only clamp downward so renderWindowStart never exceeds the list length
    //   (prevents visibleMessages from becoming empty after a rollback).
    if (autoFollowOutput.value) {
      renderWindowStart.value = Math.max(0, next.length - RENDER_WINDOW_SIZE)
    } else {
      renderWindowStart.value = Math.min(renderWindowStart.value, Math.max(0, next.length - 1))
    }

    await scheduleConversationScroll()
  },
)

watch(
  () => props.messages.some((message) => message.text.includes('```')),
  (hasCodeBlocks) => {
    if (!hasCodeBlocks || highlightJsModule.value) return
    void ensureHighlightJsLoaded()
  },
  { immediate: true },
)

watch(
  activeCommandMessageId,
  (nextId, prevId) => {
    if (!prevId || prevId === nextId) return
    if (!collapsedAutoCommandIds.value.has(prevId)) return
    const nextCollapsedAuto = new Set(collapsedAutoCommandIds.value)
    nextCollapsedAuto.delete(prevId)
    collapsedAutoCommandIds.value = nextCollapsedAuto
  },
)

watch(
  () => props.pendingRequests,
  async () => {
    if (props.isLoading) return
    await scheduleConversationScroll()
  },
  { deep: true },
)

watch(
  () => props.liveOverlay,
  async (overlay) => {
    if (!overlay) return
    if (!autoFollowOutput.value) return
    await nextTick()
    enforceBottomState()
    scheduleBottomLock(8)
  },
  { deep: true },
)

watch(
  () => props.isLoading,
  async (loading) => {
    if (loading) return
    renderWindowStart.value = Math.max(0, props.messages.length - RENDER_WINDOW_SIZE)
    await scheduleConversationScroll()
  },
)

watch(
  () => props.activeThreadId,
  async () => {
    autoFollowOutput.value = true
    modalImageUrl.value = ''
    isLoadingMore.value = false
    // Apply immediately for cached threads where isLoading never toggles.
    renderWindowStart.value = Math.max(0, props.messages.length - RENDER_WINDOW_SIZE)
    await scheduleConversationScroll()
  },
  { flush: 'post' },
)

function onConversationScroll(): void {
  const container = conversationListRef.value
  if (!container || props.isLoading) return
  autoFollowOutput.value = isAtBottom(container)
  if (hasMoreAbove.value && !isLoadingMore.value && container.scrollTop < LOAD_MORE_SCROLL_THRESHOLD_PX) {
    void loadMoreAbove()
  }
}

const failedMarkdownImages = ref(new Set<string>())

function markdownImageKey(messageId: string, blockIndex: number): string {
  return `${messageId}:${blockIndex}`
}

function isMarkdownImageFailed(messageId: string, blockIndex: number): boolean {
  return failedMarkdownImages.value.has(markdownImageKey(messageId, blockIndex))
}

function onMarkdownImageError(messageId: string, blockIndex: number): void {
  const next = new Set(failedMarkdownImages.value)
  next.add(markdownImageKey(messageId, blockIndex))
  failedMarkdownImages.value = next
  markdownImageFailureVersion.value += 1
}

function openImageModal(imageUrl: string): void {
  modalImageUrl.value = imageUrl
}

function closeImageModal(): void {
  modalImageUrl.value = ''
}

onMounted(() => {
  window.addEventListener('pointerdown', onWindowPointerDownForFileLinkContextMenu)
  window.addEventListener('blur', onWindowBlurForFileLinkContextMenu)
  window.addEventListener('keydown', onWindowKeydownForFileLinkContextMenu)
})

onBeforeUnmount(() => {
  clearRenderCaches()
  if (conversationScrollFrame) {
    cancelAnimationFrame(conversationScrollFrame)
    conversationScrollFrame = 0
  }
  if (bottomLockFrame) {
    cancelAnimationFrame(bottomLockFrame)
    bottomLockFrame = 0
  }
  if (copiedMessageResetTimer) {
    clearTimeout(copiedMessageResetTimer)
    copiedMessageResetTimer = null
  }
  if (copiedCodeBlockResetTimer) {
    clearTimeout(copiedCodeBlockResetTimer)
    copiedCodeBlockResetTimer = null
  }
  copiedCodeBlockButton = null
  window.removeEventListener('pointerdown', onWindowPointerDownForFileLinkContextMenu)
  window.removeEventListener('blur', onWindowBlurForFileLinkContextMenu)
  window.removeEventListener('keydown', onWindowKeydownForFileLinkContextMenu)
})
</script>

<style scoped>
@reference "tailwindcss";

.conversation-root {
  @apply relative h-full min-h-0 min-w-0 p-0 flex flex-col overflow-y-hidden overflow-x-hidden bg-transparent border-none rounded-none;
}

.conversation-loading {
  @apply m-0 px-6 text-sm text-slate-500;
}

.conversation-empty {
  @apply m-0 px-6 text-sm text-slate-500;
}

.conversation-list {
  @apply h-full min-h-0 list-none m-0 px-2 sm:px-6 py-0 overflow-y-auto overflow-x-visible flex flex-col gap-2 sm:gap-3;
}

.conversation-load-more {
  @apply flex justify-center py-3 m-0;
}

.load-more-button {
  @apply px-4 py-1.5 text-xs rounded-full border border-slate-300 dark:border-slate-600
         text-slate-500 dark:text-slate-400 bg-transparent
         hover:bg-slate-100 dark:hover:bg-slate-800
         disabled:opacity-40 disabled:cursor-not-allowed
         transition-colors cursor-pointer;
}

.conversation-item {
  @apply m-0 w-full min-w-0 flex;
}

.conversation-item-request {
  @apply justify-center;
}

.conversation-item-overlay {
  @apply justify-center;
}

.message-row {
  @apply relative w-full min-w-0 max-w-[min(var(--chat-column-max,45rem),100%)] mx-auto flex;
}

.message-row[data-role='user'] {
  @apply justify-end;
}

.message-row[data-role='assistant'],
.message-row[data-role='system'] {
  @apply justify-start;
}

.conversation-bottom-anchor {
  @apply h-px;
}

.jump-to-latest-button {
  @apply absolute left-1/2 bottom-4 z-20 inline-flex h-[32.4px] w-[32.4px] -translate-x-1/2 items-center justify-center rounded-full border border-slate-300 bg-white/96 text-slate-700 shadow-sm shadow-slate-900/10 transition hover:-translate-x-1/2 hover:-translate-y-px hover:bg-white hover:text-slate-900;
}

.jump-to-latest-icon {
  @apply h-[14.4px] w-[14.4px];
  transform: rotate(180deg);
}

.message-stack {
  @apply flex flex-col w-full min-w-0;
}

.request-card {
  @apply w-full max-w-[min(var(--chat-column-max,45rem),100%)] rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 flex flex-col gap-2;
}

.request-title {
  @apply m-0 text-sm leading-5 font-semibold text-amber-900;
}

.request-meta {
  @apply m-0 text-xs leading-4 text-amber-700;
}

.request-reason {
  @apply m-0 text-sm leading-5 text-amber-900 whitespace-pre-wrap break-words;
  overflow-wrap: anywhere;
}

.request-actions {
  @apply flex flex-wrap gap-2;
}

.request-button {
  @apply rounded-md border border-amber-300 bg-white px-3 py-1.5 text-xs text-amber-900 hover:bg-amber-100 transition;
}

.request-button-primary {
  @apply border-amber-500 bg-amber-500 text-white hover:bg-amber-600;
}

.request-user-input {
  @apply flex flex-col gap-3;
}

.request-question {
  @apply flex flex-col gap-1;
}

.request-question-title {
  @apply m-0 text-sm leading-5 font-medium text-amber-900;
}

.request-question-text {
  @apply m-0 text-xs leading-4 text-amber-800;
}

.request-question-option-description {
  @apply m-0 text-xs leading-4 text-amber-700;
}

.request-link {
  @apply inline-flex w-fit rounded-md border border-amber-300 bg-white px-3 py-1.5 text-xs text-amber-900 hover:bg-amber-100 transition;
}

.request-select {
  @apply h-8 rounded-md border border-amber-300 bg-white px-2 text-sm text-amber-900;
}

.request-input {
  @apply h-8 rounded-md border border-amber-300 bg-white px-2 text-sm text-amber-900 placeholder:text-amber-500;
}

.request-checkbox-list {
  @apply flex flex-col gap-1.5;
}

.request-checkbox-row {
  @apply flex items-center gap-2 text-sm text-amber-900;
}

.live-overlay-inline {
  @apply w-full max-w-[min(var(--chat-column-max,45rem),100%)] px-0 py-1 flex flex-col gap-1;
}

.live-overlay-label {
  @apply m-0 text-sm leading-5 font-medium text-zinc-600;
}

.live-overlay-reasoning {
  @apply m-0 min-w-0 max-w-full truncate text-sm leading-5 text-zinc-500;
}

.live-overlay-error {
  @apply m-0 flex items-start justify-between gap-3 text-sm leading-5 whitespace-pre-wrap;
  color: var(--codex-muted-text);
}

.message-body {
  @apply flex flex-col min-w-0 max-w-full;
  width: fit-content;
}

.message-body[data-role='assistant'],
.message-body[data-role='system'] {
  width: 100%;
}

.message-body[data-role='user'] {
  @apply ml-auto items-end;
  align-self: flex-end;
}

.message-toolbar {
  @apply mt-1.5 self-start inline-flex items-center gap-0.5 opacity-0 transition-opacity duration-150;
}

.message-toolbar[data-role='user'] {
  @apply self-end;
}

.message-row:hover .message-toolbar,
.message-toolbar:focus-within {
  @apply opacity-100;
}

@media (hover: none) {
  .message-toolbar {
    @apply opacity-100;
  }
}

.message-copy-button,
.message-fork-button {
  @apply inline-flex h-6 w-6 items-center justify-center rounded-md border border-transparent p-0 text-zinc-500 transition hover:bg-zinc-100 hover:text-zinc-950 focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-300;
}

.message-toolbar-time {
  @apply px-1 text-xs leading-6 tabular-nums text-zinc-500;
}

.message-copy-button[data-copied='true'] {
  @apply bg-emerald-50 text-emerald-700 hover:bg-emerald-50 hover:text-emerald-700;
}

.message-edit-button {
  @apply inline-flex h-6 w-6 items-center justify-center rounded-md border border-transparent p-0 text-zinc-500 transition hover:bg-zinc-100 hover:text-zinc-950 focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-300;
}

.message-fork-icon,
.message-copy-icon {
  @apply h-4 w-4;
}

.message-edit-icon {
  @apply h-4 w-4;
}

.message-image-list {
  @apply list-none m-0 mb-2 p-0 flex flex-wrap gap-2;
}

.message-image-list[data-role='user'] {
  @apply ml-auto justify-end;
}

.message-generated-image-list {
  @apply gap-3;
}

.message-image-item {
  @apply m-0;
}

.message-image-button {
  @apply block rounded-xl overflow-hidden border border-slate-300 bg-white p-0 transition hover:border-slate-400;
}

.message-image-preview {
  @apply block w-16 h-16 object-cover;
}

.message-generated-image-preview {
  @apply w-auto h-auto max-w-[min(560px,85vw)] max-h-[min(460px,62vh)] object-contain bg-white;
}

.message-file-attachments {
  @apply mb-2 flex flex-wrap gap-1.5;
}

.message-skill-attachments {
  @apply mb-2 flex flex-wrap justify-end gap-1.5;
}

.message-file-chip {
  @apply inline-flex items-center gap-1 rounded-md border border-zinc-200 bg-zinc-50 px-2 py-0.5 text-xs text-zinc-700;
}

.message-skill-chip {
  @apply inline-flex max-w-full items-center gap-1.5 rounded-md border px-2 py-0.5 text-xs no-underline transition;
  border-color: var(--codex-skill-border);
  background-color: var(--codex-skill-bg);
  color: var(--codex-skill-fg);
}

.message-skill-chip:hover {
  border-color: var(--codex-skill);
  background-color: color-mix(in srgb, var(--codex-skill-bg) 78%, var(--codex-skill) 22%);
  color: var(--codex-skill-fg);
}

.message-skill-chip-prefix {
  @apply shrink-0 font-medium;
  color: var(--codex-skill-fg);
}

.message-skill-chip-name {
  @apply min-w-0 max-w-48 truncate font-mono;
}

.message-file-chip-icon {
  @apply text-[10px] leading-none;
}

.message-file-chip-name {
  @apply truncate max-w-48 font-mono;
}

.message-card {
  @apply max-w-[min(var(--chat-card-max,76ch),100%)] px-0 py-0 bg-transparent border-none rounded-none;
}

.message-text {
  @apply m-0 whitespace-pre-wrap break-words text-slate-800;
  font-size: var(--codex-chat-font-size);
  line-height: var(--codex-chat-line-height);
  overflow-wrap: anywhere;
}

.message-file-link {
  @apply text-sm leading-relaxed no-underline hover:underline underline-offset-2;
  color: var(--codex-link);
}

.message-file-link:hover {
  color: var(--codex-link-hover);
}

.file-link-context-menu {
  @apply fixed z-50 min-w-36 rounded-lg border border-zinc-200 bg-white p-1 shadow-xl;
}

.file-link-context-menu-item {
  @apply block w-full rounded-md px-2 py-1.5 text-left text-xs text-zinc-700 hover:bg-zinc-100;
}

.message-stack[data-role='user'] {
  @apply items-end;
}

.message-stack[data-role='assistant'],
.message-stack[data-role='system'] {
  @apply items-start;
}

.message-card[data-role='user'] {
  @apply rounded-2xl px-4 py-3 max-w-[min(560px,100%)];
  background-color: var(--codex-message-bubble-bg);
  width: fit-content;
  margin-left: auto;
  align-self: flex-end;
}

.message-card[data-role='assistant'],
.message-card[data-role='system'] {
  @apply px-0 py-0 bg-transparent border-none rounded-none;
}

:global(.dark) .message-file-chip {
  @apply border-zinc-700 bg-zinc-900 text-zinc-200;
}

:global(.dark) .message-skill-chip {
  border-color: var(--codex-skill-border);
  background-color: var(--codex-skill-bg);
  color: var(--codex-skill-fg);
}

:global(.dark) .message-skill-chip-prefix {
  color: var(--codex-skill-fg);
}

.conversation-item[data-message-type='worked'] .message-stack,
.conversation-item[data-message-type='worked'] .message-body,
.conversation-item[data-message-type='worked'] .message-card {
  @apply w-full max-w-full;
}

.conversation-item[data-message-type='fileChange'] .message-stack,
.conversation-item[data-message-type='fileChange'] .message-body,
.conversation-item[data-message-type='fileChange'] .message-card,
.message-stack-has-file-change-summary {
  @apply w-full max-w-full;
}

.worked-cmd-item {
  @apply flex flex-col;
}

.image-modal-backdrop {
  @apply fixed inset-0 z-50 bg-black/40 p-6 flex items-center justify-center;
}

.image-modal-content {
  @apply relative max-w-[min(92vw,1100px)] max-h-[92vh];
}

.image-modal-close {
  @apply absolute top-2 right-2 z-10 w-10 h-10 rounded-full bg-white/90 text-slate-900 border border-slate-300 flex items-center justify-center;
}

.image-modal-image {
  @apply block max-w-full max-h-[90vh] rounded-2xl shadow-2xl bg-white;
}

.icon-svg {
  @apply w-5 h-5;
}

.message-fork-icon.icon-svg,
.message-copy-icon.icon-svg {
  @apply h-4 w-4;
}

.message-edit-icon.icon-svg {
  @apply h-4 w-4;
}

.cmd-row {
  @apply w-full flex items-center gap-2 px-3 py-1.5 rounded-lg border cursor-pointer transition text-left;
  background-color: var(--codex-file-summary-bg);
  border-color: var(--codex-file-summary-border);
}

.cmd-row:hover {
  background-color: var(--codex-file-summary-hover);
}

.cmd-row.cmd-row-group {
  color: var(--codex-text);
}

.cmd-row.cmd-compact {
  gap: 0.375rem;
  padding: 0.375rem 0.625rem;
  border-radius: 0.625rem;
}

.cmd-row.cmd-compact .cmd-chevron {
  font-size: 9px;
}

.cmd-row.cmd-expanded {
  @apply rounded-b-none;
}

.cmd-chevron {
  @apply text-[10px] text-zinc-400 transition-transform duration-150 flex-shrink-0;
}

.cmd-chevron-open {
  transform: rotate(90deg);
}

.cmd-group-label {
  @apply flex-1 min-w-0 truncate text-xs font-mono text-zinc-700;
}

.cmd-status {
  @apply max-w-24 truncate text-right text-[11px] font-medium flex-shrink-0;
}

.cmd-status-running .cmd-status {
  @apply text-amber-600;
}

.cmd-status-ok .cmd-status {
  @apply text-emerald-600;
}

.cmd-status-error .cmd-status {
  color: var(--codex-muted-text);
}

.cmd-group-wrap {
  display: grid;
  grid-template-rows: 0fr;
  min-height: 0;
  overflow: hidden;
  visibility: hidden;
  transition: grid-template-rows 220ms ease-out, visibility 0s linear 220ms;
}

.cmd-group-wrap.cmd-group-visible {
  grid-template-rows: 1fr;
  visibility: visible;
  transition-delay: 0s;
}

.cmd-group-inner {
  @apply mb-1 flex min-h-0 flex-col gap-0 overflow-hidden rounded-b-xl border pl-0;
  background-color: var(--codex-file-summary-bg);
  border-color: var(--codex-file-summary-border);
  border-top: 0;
}

.cmd-group-wrap:not(.cmd-group-visible) .cmd-group-inner {
  margin-bottom: 0;
  border-color: transparent;
}

.cmd-group-inner .worked-cmd-item {
  border-top: 1px solid var(--codex-file-row-border);
}

.cmd-row.command-group-summary-row {
  @apply min-h-11 rounded-xl px-3 py-2 shadow-none;
  background-color: var(--codex-file-summary-bg);
  border: 1px solid var(--codex-file-summary-border);
  color: var(--codex-text);
  box-shadow: 0 1px 1px rgba(0, 0, 0, 0.02);
}

.cmd-row.command-group-summary-row:hover {
  background-color: var(--codex-file-summary-hover);
}

.cmd-row.command-group-summary-row.cmd-expanded {
  border-bottom-right-radius: 0;
  border-bottom-left-radius: 0;
}

.cmd-row.command-group-summary-row .cmd-group-label {
  @apply text-[13px] font-medium;
  color: var(--codex-text);
  font-family: var(--codex-ui-font-family);
}

.cmd-row.command-group-summary-row .cmd-status {
  @apply inline-flex max-w-28 items-center justify-end text-xs font-medium;
}

</style>

<!--
  全局高亮覆盖：通过 v-html 注入的代码块（计划卡片、worked 过程）不带 scoped data-v 属性，
  scoped 的 :deep(.hljs*) 规则无法命中它们，会回退到全局 github-dark 主题（深色背景 + 错误配色，
  在浅色模式下尤为明显，例如 ```json``` 显示为深色块）。此处用非 scoped 规则统一两条渲染路径。
-->
<style>
.message-code-pre .hljs {
  display: block;
  padding: 0;
  background: transparent;
  color: var(--codex-code-text);
}

.message-code-pre .hljs-subst {
  color: var(--codex-code-text);
}

.message-code-pre .hljs-comment,
.message-code-pre .hljs-quote {
  color: var(--codex-code-comment);
}

.message-code-pre .hljs-keyword,
.message-code-pre .hljs-selector-tag,
.message-code-pre .hljs-meta .hljs-keyword,
.message-code-pre .hljs-doctag,
.message-code-pre .hljs-built_in,
.message-code-pre .hljs-type {
  color: var(--codex-code-keyword);
}

.message-code-pre .hljs-string,
.message-code-pre .hljs-attr,
.message-code-pre .hljs-symbol,
.message-code-pre .hljs-bullet {
  color: var(--codex-code-string);
}

.message-code-pre .hljs-title,
.message-code-pre .hljs-section,
.message-code-pre .hljs-name,
.message-code-pre .hljs-selector-id,
.message-code-pre .hljs-selector-class,
.message-code-pre .hljs-function .hljs-title,
.message-code-pre .hljs-class .hljs-title {
  color: var(--codex-code-title);
}

.message-code-pre .hljs-number,
.message-code-pre .hljs-literal,
.message-code-pre .hljs-variable,
.message-code-pre .hljs-template-variable {
  color: var(--codex-code-number);
}

.message-code-pre .hljs-addition {
  color: var(--codex-diff-added);
  background-color: transparent;
}

.message-code-pre .hljs-deletion {
  color: var(--codex-diff-removed);
  background-color: transparent;
}

/* JSON 语法会输出大量 hljs-punctuation（{ } : , [ ]），github-dark 主题未配色，
   统一使用代码文本色，避免与正文颜色不一致 */
.message-code-pre .hljs-punctuation {
  color: var(--codex-code-text);
}
</style>

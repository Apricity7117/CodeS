<template>
  <div class="worked-separator-wrap" aria-live="polite">
    <button type="button" class="worked-separator" @click="$emit('toggle-worked')">
      <span class="worked-separator-line" aria-hidden="true" />
      <span class="worked-chevron" :class="{ 'worked-chevron-open': expanded }">▶</span>
      <p class="worked-separator-text">{{ message.text }}</p>
      <span class="worked-separator-line" aria-hidden="true" />
    </button>
    <div v-if="expanded" class="worked-details">
      <div
        v-for="item in processMessages"
        :key="`worked-process-${item.id}`"
        class="worked-cmd-item"
      >
        <ThreadCommandExecution
          v-if="isCommandMessage(item)"
          :message="item"
          :expanded="isCommandExpanded(item)"
          :compact="isCommandCompact(item)"
          :condensed-output="isCommandOutputCondensed(item)"
          :status-label="commandStatusLabel(item)"
          :status-class="commandStatusClass(item)"
          @toggle="$emit('toggle-command', item)"
        />
        <ThreadFileChangeSummary
          v-else-if="isFileChangeMessage(item)"
          :summary="readFileChangeMessageSummary(item)"
          :message-id="item.id"
          :cwd="cwd"
          :expanded="isFileChangeSummaryExpanded(item)"
          :inline="true"
          :show-change-delta="false"
          @toggle="$emit('toggle-file-change-summary', item)"
          @open-diff="(change) => $emit('open-diff', readFileChangeMessageSummary(item), change)"
        />
        <article
          v-else-if="item.text.trim().length > 0"
          class="worked-process-text"
          v-html="renderMarkdownAsHtml(item.text)"
        />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { UiFileChange, UiMessage } from '../../types/codex'
import ThreadCommandExecution from './ThreadCommandExecution.vue'
import ThreadFileChangeSummary from './ThreadFileChangeSummary.vue'
import {
  isFileChangeMessage,
  readFileChangeMessageSummary,
} from './threadFileChanges'
import type { TurnFileChangeSummary } from './threadFileChanges'

defineProps<{
  message: UiMessage
  processMessages: UiMessage[]
  cwd: string
  expanded: boolean
  isCommandExpanded: (message: UiMessage) => boolean
  isCommandCompact: (message: UiMessage) => boolean
  isCommandOutputCondensed: (message: UiMessage) => boolean
  commandStatusLabel: (message: UiMessage) => string
  commandStatusClass: (message: UiMessage) => string
  isFileChangeSummaryExpanded: (message: UiMessage) => boolean
  renderMarkdownAsHtml: (text: string) => string
}>()

defineEmits<{
  'toggle-worked': []
  'toggle-command': [message: UiMessage]
  'toggle-file-change-summary': [message: UiMessage]
  'open-diff': [summary: TurnFileChangeSummary | null, change: UiFileChange]
}>()

function isCommandMessage(message: UiMessage): boolean {
  return message.messageType === 'commandExecution' && !!message.commandExecution
}
</script>

<style scoped>
@reference "tailwindcss";

.worked-separator-wrap {
  @apply flex w-full flex-col gap-0;
}

.worked-separator {
  @apply flex w-full cursor-pointer items-center gap-3 border-none bg-transparent p-0;
}

.worked-chevron {
  @apply flex-shrink-0 text-[9px] text-zinc-400 transition-transform duration-200;
}

.worked-chevron-open {
  transform: rotate(90deg);
}

.worked-separator-line {
  @apply h-px flex-1 bg-zinc-300/80;
}

.worked-separator-text {
  @apply m-0 font-normal text-slate-800;
  font-size: var(--codex-chat-font-size);
  line-height: var(--codex-chat-line-height);
}

.worked-details {
  @apply flex flex-col gap-1.5 pt-2;
}

.worked-cmd-item {
  @apply flex flex-col;
}

.worked-process-text {
  @apply m-0 max-w-full text-sm leading-6 text-zinc-700;
}

.worked-process-text :deep(p) {
  @apply my-0;
}
</style>

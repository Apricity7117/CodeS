<template>
  <div
    class="plan-card"
    :data-streaming="message.messageType === 'plan.live'"
    :data-collapsed="collapsed"
  >
    <div class="plan-card-header">
      <p class="plan-card-title">
        <ThinkingShimmer
          :message="planCardTitle(message)"
          :active="textAnimationsEnabled && message.messageType === 'plan.live'"
        />
      </p>
      <div class="plan-card-header-actions">
        <button
          v-if="planMarkdown"
          type="button"
          class="plan-card-icon-button"
          aria-label="Download plan"
          title="Download plan"
          @click="$emit('download')"
        >
          <IconCodexDownload class="icon-svg plan-card-action-icon" />
        </button>
        <button
          v-if="planMarkdown"
          type="button"
          class="plan-card-icon-button"
          :aria-label="copied ? 'Plan copied' : 'Copy plan'"
          :title="copied ? 'Plan copied' : 'Copy plan'"
          @click="$emit('copy')"
        >
          <IconCodexCheckMd v-if="copied" class="icon-svg plan-card-action-icon" />
          <IconCodexCopy v-else class="icon-svg plan-card-action-icon" />
        </button>
        <button
          type="button"
          class="plan-card-icon-button"
          :aria-label="collapsed ? 'Expand plan summary' : 'Collapse plan summary'"
          :title="collapsed ? 'Expand plan summary' : 'Collapse plan summary'"
          @click="$emit('toggle-collapse')"
        >
          <IconCodexChevron
            class="icon-svg plan-card-action-icon plan-card-collapse-icon"
            :class="{ 'is-collapsed': collapsed }"
          />
        </button>
      </div>
    </div>
    <div
      v-if="planMarkdown"
      class="plan-card-content"
      :data-collapsed="collapsed"
    >
      <div class="plan-card-markdown" v-html="renderMarkdownAsHtml(planMarkdown)" />
      <div v-if="collapsed" class="plan-card-collapse-fade">
        <button type="button" class="plan-card-expand-button" @click="$emit('toggle-collapse')">
          Expand plan
        </button>
      </div>
    </div>
    <div v-if="showImplementPlanButton(message)" class="plan-card-actions">
      <button
        type="button"
        class="plan-card-implement-button"
        @click="$emit('implement')"
      >
        Implement plan
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { UiMessage } from '../../types/codex'
import ThinkingShimmer from './ThinkingShimmer.vue'
import {
  planCardTitle,
  readPlanMarkdown,
  showImplementPlanButton,
} from './threadPlanUtils'
import {
  IconCodexCheckMd,
  IconCodexChevron,
  IconCodexCopy,
  IconCodexDownload,
} from '../icons/codex'

const props = defineProps<{
  message: UiMessage
  collapsed: boolean
  copied: boolean
  textAnimationsEnabled: boolean
  renderMarkdownAsHtml: (text: string) => string
}>()

defineEmits<{
  download: []
  copy: []
  'toggle-collapse': []
  implement: []
}>()

const planMarkdown = computed(() => readPlanMarkdown(props.message))
</script>

<style scoped>
@reference "tailwindcss";

.plan-card {
  --plan-card-bg: color-mix(in srgb, var(--codex-text) 5%, transparent);
  --plan-card-hover-bg: color-mix(in srgb, var(--codex-text) 8%, transparent);
  @apply relative flex max-w-[min(var(--chat-card-max,76ch),100%)] flex-col;
  gap: 0;
  overflow: clip;
  border: 0;
  border-radius: var(--codex-radius-lg);
  background-color: var(--plan-card-bg);
  color: var(--codex-text);
}

@supports not (overflow: clip) {
  .plan-card {
    overflow: hidden;
  }
}

.plan-card-header {
  @apply relative flex flex-wrap items-center justify-between gap-2 px-3 py-2;
  min-height: 2.5rem;
}

.plan-card-title {
  @apply m-0 min-w-0 flex-1 font-semibold;
  color: var(--codex-text);
  font-size: 1rem;
  line-height: 1.25;
  letter-spacing: 0;
}

.plan-card-title :deep(.thinking-shimmer) {
  display: inline-block;
  max-width: 100%;
}

.plan-card-header-actions {
  @apply ml-auto flex shrink-0 items-center gap-1;
}

.plan-card-icon-button {
  @apply inline-flex h-7 w-7 items-center justify-center rounded-md border-0 bg-transparent p-0 transition;
  color: var(--codex-muted-text);
}

.plan-card-icon-button:hover {
  background-color: var(--plan-card-hover-bg);
  color: var(--codex-text);
}

.plan-card-icon-button:focus-visible {
  outline: 2px solid var(--codex-focus-ring);
  outline-offset: 2px;
}

.plan-card-action-icon.icon-svg {
  @apply h-3.5 w-3.5;
}

.plan-card-collapse-icon {
  transition: transform 160ms ease;
}

.plan-card-collapse-icon.is-collapsed {
  transform: rotate(180deg);
}

.plan-card-content {
  @apply relative overflow-hidden px-3 pb-3;
}

.plan-card-content[data-collapsed='true'] {
  max-height: 20rem;
}

.plan-card-collapse-fade {
  @apply pointer-events-none absolute inset-x-0 bottom-0 flex justify-center pt-16 pb-3;
  background: linear-gradient(
    to top,
    var(--plan-card-bg) 0%,
    color-mix(in srgb, var(--plan-card-bg) 92%, transparent) 48%,
    transparent 100%
  );
}

.plan-card-expand-button {
  @apply pointer-events-auto inline-flex h-8 items-center rounded-md border px-3 text-xs font-medium transition;
  border-color: color-mix(in srgb, var(--codex-text) 14%, transparent);
  background-color: color-mix(in srgb, var(--codex-bg) 88%, var(--codex-text) 12%);
  color: var(--codex-text);
}

.plan-card-expand-button:hover {
  background-color: color-mix(in srgb, var(--codex-bg) 80%, var(--codex-text) 20%);
}

.plan-card-expand-button:focus-visible {
  outline: 2px solid var(--codex-focus-ring);
  outline-offset: 2px;
}

.plan-card-markdown {
  @apply flex flex-col gap-2;
  color: var(--codex-text);
}

.plan-card-markdown :deep(.message-text),
.plan-card-markdown :deep(.message-heading),
.plan-card-markdown :deep(.message-blockquote),
.plan-card-markdown :deep(.message-list),
.plan-card-markdown :deep(.message-table-wrap),
.plan-card-markdown :deep(.message-code-block),
.plan-card-markdown :deep(.message-divider) {
  @apply m-0;
}

.plan-card-markdown :deep(.message-text) {
  @apply whitespace-pre-wrap;
  color: var(--codex-text);
  font-size: var(--codex-chat-font-size);
  line-height: var(--codex-chat-line-height);
}

.plan-card-markdown :deep(.message-heading) {
  color: var(--codex-text);
  letter-spacing: 0;
}

.plan-card-markdown :deep(.message-heading-h1) {
  @apply text-2xl font-semibold leading-tight;
}

.plan-card-markdown :deep(.message-heading-h2) {
  @apply text-xl font-semibold leading-tight;
}

.plan-card-markdown :deep(.message-heading-h3) {
  @apply text-lg font-semibold leading-snug;
}

.plan-card-markdown :deep(.message-heading-h4) {
  @apply text-base font-semibold leading-snug;
}

.plan-card-markdown :deep(.message-heading-h5) {
  @apply text-sm font-semibold leading-snug uppercase;
  letter-spacing: 0;
}

.plan-card-markdown :deep(.message-heading-h6) {
  @apply text-xs font-semibold leading-snug uppercase;
  color: var(--codex-muted-text);
  letter-spacing: 0;
}

.plan-card-markdown :deep(.message-blockquote) {
  @apply rounded-r-lg py-1 pl-4 whitespace-pre-wrap;
  border-left: 3px solid color-mix(in srgb, var(--codex-text) 20%, transparent);
  background-color: color-mix(in srgb, var(--codex-text) 4%, transparent);
  color: var(--codex-muted-text);
  font-size: var(--codex-chat-font-size);
  line-height: var(--codex-chat-line-height);
}

.plan-card-markdown :deep(.message-list) {
  @apply flex flex-col gap-1.5 pl-5;
  color: var(--codex-text);
  font-size: var(--codex-chat-font-size);
  line-height: var(--codex-chat-line-height);
}

.plan-card-markdown :deep(.message-list-unordered) {
  @apply list-disc;
}

.plan-card-markdown :deep(.message-list-ordered) {
  @apply list-decimal;
}

.plan-card-markdown :deep(.message-list-item) {
  @apply pl-1;
}

.plan-card-markdown :deep(.message-list-item-text) {
  @apply whitespace-pre-wrap;
}

.plan-card-markdown :deep(.message-list-item-paragraph + .message-list-item-paragraph) {
  @apply mt-2;
}

.plan-card-markdown :deep(.message-task-list) {
  @apply list-none pl-0;
}

.plan-card-markdown :deep(.message-task-item) {
  @apply flex items-start gap-2;
}

.plan-card-markdown :deep(.message-task-checkbox) {
  @apply mt-0.5 select-none text-sm leading-none;
  color: var(--codex-muted-text);
}

.plan-card-markdown :deep(.message-code-block) {
  @apply relative overflow-hidden rounded-lg border shadow-none;
  background-color: var(--codex-code-block-bg);
  border-color: var(--codex-code-block-border);
  color: var(--codex-code-text);
  box-shadow: none;
}

.plan-card-markdown :deep(.message-code-toolbar) {
  @apply pointer-events-none absolute inset-x-0 top-0 z-10 flex h-10 items-center justify-between gap-3 px-3 pt-2;
}

.plan-card-markdown :deep(.message-code-language) {
  @apply min-w-0 truncate font-mono text-xs font-medium normal-case text-zinc-500;
}

.plan-card-markdown :deep(.message-code-copy) {
  @apply pointer-events-auto inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-transparent bg-transparent p-0 transition focus:outline-none focus-visible:ring-2;
  --tw-ring-color: var(--codex-focus-ring);
  color: var(--codex-muted-text);
}

.plan-card-markdown :deep(.message-code-copy:hover) {
  background-color: var(--codex-control-hover);
  color: var(--codex-text);
}

.plan-card-markdown :deep(.message-code-copy[data-copied='true']) {
  background-color: var(--codex-success-bg);
  color: var(--codex-success-fg);
}

.plan-card-markdown :deep(.message-code-copy[data-copied='true']:hover) {
  background-color: var(--codex-success-bg);
  color: var(--codex-success-fg);
}

.plan-card-markdown :deep(.message-code-copy-icon) {
  @apply h-4 w-4 shrink-0;
}

.plan-card-markdown :deep(.message-code-copy-icon--check) {
  @apply hidden;
}

.plan-card-markdown :deep(.message-code-copy[data-copied='true'] .message-code-copy-icon--copy) {
  @apply hidden;
}

.plan-card-markdown :deep(.message-code-copy[data-copied='true'] .message-code-copy-icon--check) {
  @apply block;
}

.plan-card-markdown :deep(.message-code-pre) {
  @apply m-0 overflow-x-auto px-4 pt-10 pb-3 leading-6;
  font-size: var(--codex-code-font-size);
}

.plan-card-markdown :deep(.message-inline-code) {
  @apply rounded-md px-1.5 py-0.5 font-mono text-[0.9em];
  background-color: var(--codex-inline-code-bg);
  color: var(--codex-text);
  font-size: var(--codex-code-font-size);
  box-shadow: none;
}

.plan-card-markdown :deep(.message-file-link) {
  @apply underline underline-offset-2;
  color: var(--codex-link);
  text-decoration-color: var(--codex-accent);
}

.plan-card-markdown :deep(.message-table) {
  background-color: var(--codex-surface);
}

.plan-card-actions {
  @apply flex justify-end px-3 pb-3;
}

.plan-card-implement-button {
  @apply inline-flex h-8 items-center rounded-md border px-3 text-xs font-medium transition;
  border-color: color-mix(in srgb, var(--codex-text) 14%, transparent);
  background-color: color-mix(in srgb, var(--codex-bg) 88%, var(--codex-text) 12%);
  color: var(--codex-text);
}

.plan-card-implement-button:hover {
  border-color: color-mix(in srgb, var(--codex-text) 22%, transparent);
  background-color: color-mix(in srgb, var(--codex-bg) 80%, var(--codex-text) 20%);
}

.plan-card-implement-button:focus-visible {
  outline: 2px solid var(--codex-focus-ring);
  outline-offset: 2px;
}

.icon-svg {
  @apply h-5 w-5;
}
</style>

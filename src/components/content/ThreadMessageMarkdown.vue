<template>
  <div
    class="message-text-flow"
    v-memo="[messageId, blocks, cwd, highlightVersion, imageFailureVersion]"
  >
    <template v-for="(block, blockIndex) in blocks" :key="`block-${blockIndex}`">
      <p v-if="block.kind === 'paragraph'" class="message-text">
        <ThreadInlineSegments :segments="getInlineSegments(block.value)" :to-browse-url="toBrowseUrl" />
      </p>
      <component
        :is="headingTag(block.level)"
        v-else-if="block.kind === 'heading'"
        class="message-heading"
        :class="headingClass(block.level)"
      >
        <ThreadInlineSegments :segments="getInlineSegments(block.value)" :to-browse-url="toBrowseUrl" />
      </component>
      <blockquote v-else-if="block.kind === 'blockquote'" class="message-blockquote">
        <ThreadInlineSegments :segments="getInlineSegments(block.value)" :to-browse-url="toBrowseUrl" />
      </blockquote>
      <ul v-else-if="block.kind === 'unorderedList'" class="message-list message-list-unordered">
        <li v-for="(item, itemIndex) in block.items" :key="`ul-${blockIndex}-${itemIndex}`" class="message-list-item">
          <div class="message-list-item-content" v-html="renderListItemContentAsHtml(item)" />
        </li>
      </ul>
      <ul v-else-if="block.kind === 'taskList'" class="message-list message-task-list">
        <li v-for="(item, itemIndex) in block.items" :key="`task-${blockIndex}-${itemIndex}`" class="message-task-item">
          <span class="message-task-checkbox" :data-checked="item.checked">{{ item.checked ? '☑' : '☐' }}</span>
          <div class="message-list-item-text">
            <ThreadInlineSegments :segments="getInlineSegments(item.text)" :to-browse-url="toBrowseUrl" />
          </div>
        </li>
      </ul>
      <ol
        v-else-if="block.kind === 'orderedList'"
        class="message-list message-list-ordered"
        :start="block.start"
      >
        <li v-for="(item, itemIndex) in block.items" :key="`ol-${blockIndex}-${itemIndex}`" class="message-list-item">
          <div class="message-list-item-content" v-html="renderListItemContentAsHtml(item)" />
        </li>
      </ol>
      <div v-else-if="block.kind === 'table'" class="message-table-wrap">
        <table class="message-table">
          <thead>
            <tr>
              <th
                v-for="(cell, cellIndex) in block.headers"
                :key="`th-${blockIndex}-${cellIndex}`"
                class="message-table-head-cell"
                :style="{ textAlign: block.alignments[cellIndex] ?? 'left' }"
              >
                <ThreadInlineSegments :segments="getInlineSegments(cell)" :to-browse-url="toBrowseUrl" />
              </th>
            </tr>
          </thead>
          <tbody v-if="block.rows.length > 0">
            <tr v-for="(row, rowIndex) in block.rows" :key="`tr-${blockIndex}-${rowIndex}`" class="message-table-body-row">
              <td
                v-for="(cell, cellIndex) in row"
                :key="`td-${blockIndex}-${rowIndex}-${cellIndex}`"
                class="message-table-cell"
                :style="{ textAlign: block.alignments[cellIndex] ?? 'left' }"
              >
                <ThreadInlineSegments :segments="getInlineSegments(cell)" :to-browse-url="toBrowseUrl" />
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <div v-else-if="block.kind === 'codeBlock'" class="message-code-block">
        <div class="message-code-toolbar">
          <span class="message-code-language">{{ formatCodeLanguageLabel(block.language) }}</span>
          <button
            class="message-code-copy"
            type="button"
            data-code-copy="true"
            aria-label="Copy code"
            title="Copy code"
          >
            <IconCodexCopy class="message-code-copy-icon message-code-copy-icon--copy" aria-hidden="true" />
            <IconCodexCheckMd class="message-code-copy-icon message-code-copy-icon--check" aria-hidden="true" />
          </button>
        </div>
        <pre class="message-code-pre"><code class="hljs" v-html="renderHighlightedCodeAsHtml(block.language, block.value)"></code></pre>
      </div>
      <hr v-else-if="block.kind === 'thematicBreak'" class="message-divider" />
      <p v-else-if="isMarkdownImageFailed(messageId, blockIndex)" class="message-text">{{ block.markdown }}</p>
      <button
        v-else
        class="message-image-button"
        type="button"
        @click="$emit('open-image', block.url)"
      >
        <img
          class="message-image-preview message-markdown-image"
          :src="block.url"
          :alt="block.alt || 'Embedded message image'"
          loading="lazy"
          @error="$emit('image-error', messageId, blockIndex)"
        />
      </button>
    </template>
  </div>
</template>

<script setup lang="ts">
import {
  formatCodeLanguageLabel,
  headingClass,
  headingTag,
} from './threadMarkdownBlocks'
import type { ListItem, MessageBlock } from './threadMarkdownBlocks'
import type { InlineSegment } from './threadInlineSegments'
import ThreadInlineSegments from './ThreadInlineSegments.vue'
import {
  IconCodexCheckMd,
  IconCodexCopy,
} from '../icons/codex'

defineProps<{
  messageId: string
  blocks: MessageBlock[]
  cwd: string
  highlightVersion: number
  imageFailureVersion: number
  getInlineSegments: (text: string) => InlineSegment[]
  toBrowseUrl: (pathValue: string) => string
  renderListItemContentAsHtml: (item: ListItem) => string
  renderHighlightedCodeAsHtml: (language: string, value: string) => string
  isMarkdownImageFailed: (messageId: string, blockIndex: number) => boolean
}>()

defineEmits<{
  'open-image': [imageUrl: string]
  'image-error': [messageId: string, blockIndex: number]
}>()
</script>

<style scoped>
@reference "tailwindcss";

.message-text-flow {
  @apply flex flex-col gap-2;
}

.message-text {
  @apply m-0 whitespace-pre-wrap break-words text-slate-800;
  font-size: var(--codex-chat-font-size);
  line-height: var(--codex-chat-line-height);
  overflow-wrap: anywhere;
}

.message-heading {
  @apply m-0 text-slate-900 tracking-tight;
}

.message-heading-h1 {
  @apply text-2xl font-semibold leading-tight;
}

.message-heading-h2 {
  @apply text-xl font-semibold leading-tight;
}

.message-heading-h3 {
  @apply text-lg font-semibold leading-snug;
}

.message-heading-h4 {
  @apply text-base font-semibold leading-snug;
}

.message-heading-h5 {
  @apply text-sm font-semibold leading-snug uppercase tracking-[0.02em];
}

.message-heading-h6 {
  @apply text-xs font-semibold leading-snug uppercase tracking-[0.04em] text-slate-600;
}

.message-blockquote {
  @apply m-0 break-words rounded-r-lg border-l-4 border-slate-300 bg-slate-50/70 py-1 pl-4 whitespace-pre-wrap text-slate-700;
  font-size: var(--codex-chat-font-size);
  line-height: var(--codex-chat-line-height);
  overflow-wrap: anywhere;
}

.message-list {
  @apply m-0 flex flex-col gap-1.5 pl-5 text-slate-800;
  font-size: var(--codex-chat-font-size);
  line-height: var(--codex-chat-line-height);
}

.message-list-unordered {
  @apply list-disc;
}

.message-list-ordered {
  @apply list-decimal;
}

.message-list-item {
  @apply pl-1;
}

.message-list-item-content {
  @apply flex flex-col gap-1.5;
}

.message-list-item-text {
  @apply break-words whitespace-pre-wrap;
  overflow-wrap: anywhere;
}

.message-list-item-paragraph + .message-list-item-paragraph,
.message-list-item-content :deep(.message-list-item-paragraph + .message-list-item-paragraph) {
  @apply mt-2;
}

.message-task-list {
  @apply list-none pl-0;
}

.message-task-item {
  @apply flex items-start gap-2;
}

.message-task-checkbox {
  @apply mt-0.5 select-none text-sm leading-none text-slate-500;
}

.message-table-wrap {
  @apply w-full overflow-x-auto;
}

.message-table {
  @apply min-w-full overflow-hidden rounded-xl border border-separate border-spacing-0 border-slate-200 bg-white text-sm text-slate-800;
}

.message-table-head-cell,
.message-table-cell {
  @apply border-b border-l border-slate-200 px-3 py-2 align-top break-words whitespace-pre-wrap;
  overflow-wrap: anywhere;
}

.message-table-head-cell:first-child,
.message-table-cell:first-child {
  @apply border-l-0;
}

.message-table-head-cell {
  @apply bg-slate-100 font-semibold text-slate-900;
}

.message-table-body-row:last-child .message-table-cell {
  @apply border-b-0;
}

.message-code-block {
  @apply relative max-w-full overflow-hidden rounded-lg border text-zinc-950 shadow-none;
  background-color: var(--codex-code-block-bg);
  border-color: var(--codex-code-block-border);
  box-shadow: none;
}

.message-code-toolbar {
  @apply pointer-events-none absolute inset-x-0 top-0 z-10 flex h-10 items-center justify-between gap-3 px-3 pt-2;
}

.message-code-language {
  @apply min-w-0 truncate font-mono text-xs font-medium normal-case text-zinc-500;
}

.message-code-copy {
  @apply pointer-events-auto inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-transparent bg-transparent p-0 transition focus:outline-none focus-visible:ring-2;
  --tw-ring-color: var(--codex-focus-ring);
  color: var(--codex-muted-text);
}

.message-code-copy:hover {
  background-color: var(--codex-control-hover);
  color: var(--codex-text);
}

.message-code-copy[data-copied='true'] {
  background-color: var(--codex-success-bg);
  color: var(--codex-success-fg);
}

.message-code-copy[data-copied='true']:hover {
  background-color: var(--codex-success-bg);
  color: var(--codex-success-fg);
}

.message-code-copy-icon {
  @apply h-4 w-4 shrink-0;
}

.message-code-copy-icon--check {
  @apply hidden;
}

.message-code-copy[data-copied='true'] .message-code-copy-icon--copy {
  @apply hidden;
}

.message-code-copy[data-copied='true'] .message-code-copy-icon--check {
  @apply block;
}

.message-code-pre {
  @apply m-0 overflow-x-auto px-4 pt-10 pb-3 leading-relaxed whitespace-pre;
  font-family: var(--codex-code-font-family);
  font-size: var(--codex-code-font-size);
}

.message-code-pre :deep(.hljs) {
  @apply block bg-transparent p-0 text-inherit;
}

.message-code-pre :deep(.hljs),
.message-code-pre :deep(.hljs-subst) {
  color: var(--codex-code-text);
}

.message-code-pre :deep(.hljs-comment),
.message-code-pre :deep(.hljs-quote) {
  color: var(--codex-code-comment);
}

.message-code-pre :deep(.hljs-keyword),
.message-code-pre :deep(.hljs-selector-tag),
.message-code-pre :deep(.hljs-meta .hljs-keyword),
.message-code-pre :deep(.hljs-doctag),
.message-code-pre :deep(.hljs-built_in),
.message-code-pre :deep(.hljs-type) {
  color: var(--codex-code-keyword);
}

.message-code-pre :deep(.hljs-string),
.message-code-pre :deep(.hljs-attr),
.message-code-pre :deep(.hljs-symbol),
.message-code-pre :deep(.hljs-bullet) {
  color: var(--codex-code-string);
}

.message-code-pre :deep(.hljs-title),
.message-code-pre :deep(.hljs-section),
.message-code-pre :deep(.hljs-name),
.message-code-pre :deep(.hljs-selector-id),
.message-code-pre :deep(.hljs-selector-class),
.message-code-pre :deep(.hljs-function .hljs-title),
.message-code-pre :deep(.hljs-class .hljs-title) {
  color: var(--codex-code-title);
}

.message-code-pre :deep(.hljs-number),
.message-code-pre :deep(.hljs-literal),
.message-code-pre :deep(.hljs-variable),
.message-code-pre :deep(.hljs-template-variable) {
  color: var(--codex-code-number);
}

.message-code-pre :deep(.hljs-addition) {
  color: var(--codex-diff-added);
}

.message-code-pre :deep(.hljs-deletion) {
  color: var(--codex-diff-removed);
}

.message-divider {
  @apply m-0 h-px border-0 bg-slate-300/80;
}

.message-image-button {
  @apply block overflow-hidden rounded-xl border border-slate-300 bg-white p-0 transition hover:border-slate-400;
}

.message-image-preview {
  @apply block h-16 w-16 object-cover;
}

.message-markdown-image {
  @apply h-auto w-auto max-h-[min(460px,62vh)] max-w-[min(560px,85vw)] object-contain bg-white;
}

.message-list-item-content :deep(.message-text),
.message-list-item-content :deep(.message-heading),
.message-list-item-content :deep(.message-blockquote),
.message-list-item-content :deep(.message-list),
.message-list-item-content :deep(.message-table-wrap),
.message-list-item-content :deep(.message-code-block),
.message-list-item-content :deep(.message-divider) {
  @apply m-0;
}

.message-list-item-content :deep(.message-inline-code) {
  @apply rounded-md px-1.5 py-0.5 font-mono leading-[1.4];
  background-color: var(--codex-inline-code-bg);
  color: var(--codex-text);
  font-size: var(--codex-code-font-size);
  box-shadow: none;
}

.message-list-item-content :deep(.message-bold-text) {
  @apply font-semibold;
  color: var(--codex-text);
}

.message-list-item-content :deep(.message-italic-text) {
  @apply italic;
}

.message-list-item-content :deep(.message-strikethrough-text) {
  @apply line-through;
  color: var(--codex-muted-text);
}

.message-list-item-content :deep(.message-file-link) {
  @apply text-sm leading-relaxed no-underline underline-offset-2 hover:underline;
  color: var(--codex-link);
}
</style>

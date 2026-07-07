<template>
  <button
    type="button"
    class="cmd-row"
    :class="[
      statusClass,
      {
        'cmd-expanded': expanded,
        'cmd-compact': compact,
        'cmd-row-grouped-item': grouped,
      },
    ]"
    @click="$emit('toggle')"
  >
    <span class="cmd-chevron" :class="{ 'cmd-chevron-open': expanded }">▶</span>
    <code class="cmd-label">{{ commandText }}</code>
    <span class="cmd-status">{{ statusLabel }}</span>
  </button>
  <div
    class="cmd-output-wrap"
    :class="{
      'cmd-output-visible': expanded,
      'cmd-output-grouped': grouped,
      'cmd-output-empty': !hasOutput,
    }"
  >
    <div class="cmd-output-inner">
      <pre
        class="cmd-output"
        :class="{ 'cmd-output-condensed': condensedOutput }"
        v-text="outputText"
      ></pre>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { UiMessage } from '../../types/codex'

const props = withDefaults(defineProps<{
  message: UiMessage
  expanded: boolean
  compact?: boolean
  condensedOutput?: boolean
  statusLabel: string
  statusClass: string
  grouped?: boolean
}>(), {
  compact: false,
  condensedOutput: false,
  grouped: false,
})

defineEmits<{
  toggle: []
}>()

const commandText = computed(() => props.message.commandExecution?.command || '(command)')
const hasOutput = computed(() => (props.message.commandExecution?.aggregatedOutput ?? '').trim().length > 0)
const outputText = computed(() => props.message.commandExecution?.aggregatedOutput || '(no output)')
</script>

<style scoped>
@reference "tailwindcss";

.cmd-row {
  @apply flex w-full cursor-pointer items-center gap-2 rounded-lg border px-3 py-1.5 text-left transition;
  background-color: var(--codex-file-summary-bg);
  border-color: var(--codex-file-summary-border);
}

.cmd-row:hover {
  background-color: var(--codex-file-summary-hover);
}

.cmd-row.cmd-compact {
  gap: 0.375rem;
  padding: 0.375rem 0.625rem;
  border-radius: 0.625rem;
}

.cmd-row.cmd-compact .cmd-chevron {
  font-size: 9px;
}

.cmd-row.cmd-compact .cmd-label {
  font-size: 0.75rem;
}

.cmd-row.cmd-compact .cmd-status {
  max-width: 4.5rem;
  font-size: 0.75rem;
}

.cmd-row.cmd-expanded {
  @apply rounded-b-none;
}

.cmd-chevron {
  @apply flex-shrink-0 text-[10px] text-zinc-400 transition-transform duration-150;
}

.cmd-chevron-open {
  transform: rotate(90deg);
}

.cmd-label {
  @apply min-w-0 flex-1 truncate font-mono text-xs text-zinc-700;
}

.cmd-status {
  @apply max-w-24 flex-shrink-0 truncate text-right text-[11px] font-medium;
}

.cmd-status-running .cmd-status {
  @apply text-amber-600;
}

.cmd-status-ok .cmd-status {
  color: var(--codex-success-fg);
}

.cmd-status-error .cmd-status {
  color: var(--codex-muted-text);
}

.cmd-output-wrap {
  @apply rounded-b-lg;
  display: grid;
  grid-template-rows: 0fr;
  width: 100%;
  background-color: transparent;
  border: 0 solid transparent;
  border-top: none;
  transition: grid-template-rows 300ms ease-out, border-color 300ms ease-out;
}

.cmd-output-wrap.cmd-output-visible {
  grid-template-rows: 1fr;
  background-color: var(--codex-file-summary-bg);
  border-width: 0 1px 1px;
  border-color: var(--codex-file-summary-border);
}

.cmd-output-inner {
  min-height: 0;
  overflow: hidden;
}

.cmd-output-wrap.cmd-output-visible.cmd-output-empty .cmd-output-inner {
  min-height: 2.5rem;
}

.cmd-output {
  @apply m-0 max-h-60 overflow-y-auto whitespace-pre-wrap break-words px-3 py-2;
  color: var(--codex-text);
  font-family: var(--codex-code-font-family);
  font-size: var(--codex-code-font-size);
  line-height: 1.55;
}

.cmd-output-wrap.cmd-output-empty .cmd-output {
  color: var(--codex-muted-text);
}

.cmd-output.cmd-output-condensed {
  max-height: 9rem;
}

.cmd-row.cmd-row-grouped-item {
  @apply min-h-10 rounded-none border-0 px-3 py-2 shadow-none;
  background-color: transparent;
}

.cmd-row.cmd-row-grouped-item:hover {
  background-color: var(--codex-file-summary-hover);
}

.cmd-row.cmd-row-grouped-item.cmd-expanded {
  border-bottom-right-radius: 0;
  border-bottom-left-radius: 0;
}

.cmd-row.cmd-row-grouped-item .cmd-label {
  @apply text-[13px];
}

.cmd-row.cmd-row-grouped-item .cmd-status {
  @apply ml-auto max-w-28 text-xs font-medium;
}

.cmd-output-wrap.cmd-output-grouped.cmd-output-visible {
  border-width: 1px 0 0;
  border-color: var(--codex-file-row-border);
}
</style>

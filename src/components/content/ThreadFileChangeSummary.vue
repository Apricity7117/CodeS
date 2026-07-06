<template>
  <section
    v-if="summary"
    class="file-change-summary-block"
    :class="{ 'file-change-summary-block-inline': inline }"
  >
    <button
      type="button"
      class="cmd-row cmd-row-group cmd-compact file-change-summary-row"
      :class="{ 'cmd-expanded': expanded }"
      @click="$emit('toggle')"
    >
      <span class="cmd-chevron" :class="{ 'cmd-chevron-open': expanded }">▶</span>
      <span class="file-change-summary-label">
        {{ fileChangeSummaryLabel(summary, t) }}
      </span>
      <span class="file-change-summary-status">
        <span
          v-for="part in fileChangeSummaryStatusParts(summary)"
          :key="`${messageId}:${part.tone}:${part.label}`"
          class="file-change-signed-count"
          :data-tone="part.tone"
        >
          {{ part.label }}
        </span>
      </span>
    </button>
    <div class="cmd-group-wrap" :class="{ 'cmd-group-visible': expanded }">
      <div class="file-change-panel-inner">
        <ul class="file-change-list">
          <li
            v-for="change in summary.changes"
            :key="`${messageId}:${change.path}:${change.movedToPath || ''}`"
            class="file-change-item"
          >
            <span class="file-change-badge" :data-operation="fileChangeOperationTone(change)">
              {{ fileChangeOperationLabel(change) }}
            </span>
            <button
              type="button"
              class="file-change-path-button"
              :title="change.path"
              @click="$emit('open-diff', change)"
            >
              {{ displayPath(change.path) }}
            </button>
            <span v-if="change.movedToPath" class="file-change-arrow">→</span>
            <button
              v-if="change.movedToPath"
              type="button"
              class="file-change-path-button"
              :title="change.movedToPath"
              @click="$emit('open-diff', change)"
            >
              {{ displayPath(change.movedToPath) }}
            </button>
            <span v-if="showChangeDelta && hasChangeDelta(change)" class="file-change-delta">
              <span
                v-for="part in fileChangeDeltaParts(change)"
                :key="`${messageId}:${change.path}:${part.tone}:${part.label}`"
                class="file-change-signed-count"
                :data-tone="part.tone"
              >
                {{ part.label }}
              </span>
            </span>
          </li>
        </ul>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import type { UiFileChange } from '../../types/codex'
import { useUiLanguage } from '../../composables/useUiLanguage'
import {
  displayFileChangePath,
  fileChangeDeltaParts,
  fileChangeOperationLabel,
  fileChangeOperationTone,
  fileChangeSummaryLabel,
  fileChangeSummaryStatusParts,
} from './threadFileChanges'
import type { TurnFileChangeSummary } from './threadFileChanges'

const props = withDefaults(defineProps<{
  summary: TurnFileChangeSummary | null
  messageId: string
  cwd: string
  expanded: boolean
  inline?: boolean
  showChangeDelta?: boolean
}>(), {
  inline: false,
  showChangeDelta: true,
})

defineEmits<{
  toggle: []
  'open-diff': [change: UiFileChange]
}>()

const { t } = useUiLanguage()

function displayPath(pathValue: string): string {
  return displayFileChangePath(pathValue, props.cwd)
}

function hasChangeDelta(change: UiFileChange): boolean {
  return change.addedLineCount > 0 || change.removedLineCount > 0
}
</script>

<style scoped>
@reference "tailwindcss";

.file-change-summary-block {
  @apply mt-3 flex flex-col gap-0;
  width: 100%;
  max-width: 100%;
}

.file-change-summary-block-inline {
  @apply mt-4;
}

.cmd-row {
  @apply flex w-full cursor-pointer items-center gap-2 rounded-lg border px-3 py-1.5 text-left transition;
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

.cmd-row.file-change-summary-row {
  @apply min-h-11 rounded-xl px-3 py-2 shadow-none;
  background-color: var(--codex-file-summary-bg);
  border: 1px solid var(--codex-file-summary-border);
  color: var(--codex-text);
  box-shadow: 0 1px 1px rgba(0, 0, 0, 0.02);
}

.cmd-row.file-change-summary-row:hover {
  background-color: var(--codex-file-summary-hover);
}

.cmd-row.file-change-summary-row.cmd-expanded {
  border-bottom-right-radius: 0;
  border-bottom-left-radius: 0;
}

.cmd-chevron {
  @apply flex-shrink-0 text-[10px] text-zinc-400 transition-transform duration-150;
}

.cmd-chevron-open {
  transform: rotate(90deg);
}

.file-change-summary-label {
  @apply min-w-0 flex-1 truncate text-[13px] font-medium;
  color: var(--codex-text);
}

.file-change-summary-status {
  @apply inline-flex max-w-28 flex-shrink-0 items-center justify-end gap-1.5 text-right text-xs font-medium;
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

.file-change-panel-inner {
  @apply mb-1 min-h-0 overflow-hidden pl-0;
}

.file-change-list {
  @apply m-0 flex list-none flex-col gap-0 overflow-hidden rounded-b-xl border p-0;
  background-color: var(--codex-file-summary-bg);
  border-color: var(--codex-file-summary-border);
  border-top: 0;
}

.file-change-item {
  @apply flex flex-wrap items-center gap-2 px-3 py-2 text-sm;
  color: var(--codex-text);
  border-top: 1px solid var(--codex-file-row-border);
}

.file-change-item:hover {
  background-color: var(--codex-file-summary-hover);
}

.file-change-badge {
  @apply inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-normal;
}

.file-change-badge[data-operation='add'] {
  background-color: var(--codex-diff-added-bg);
  color: var(--codex-diff-added);
}

.file-change-badge[data-operation='update'] {
  @apply bg-sky-50 text-sky-700;
}

.file-change-badge[data-operation='delete'] {
  background-color: var(--codex-diff-removed-bg);
  color: var(--codex-diff-removed);
}

.file-change-badge[data-operation='move'] {
  @apply bg-amber-50 text-amber-700;
}

.file-change-path-button {
  @apply min-w-0 border-0 bg-transparent p-0 text-left font-mono text-[13px] underline-offset-2 hover:underline;
  color: var(--codex-link);
}

.file-change-path-button:hover {
  color: var(--codex-link-hover);
}

.file-change-arrow {
  @apply text-zinc-400;
}

.file-change-delta {
  @apply ml-auto inline-flex items-center gap-1.5 rounded-full px-1.5 py-0.5 text-[11px] font-medium;
  background-color: var(--codex-control-bg);
  color: var(--codex-muted-text);
}

.file-change-signed-count {
  @apply inline-flex whitespace-nowrap;
}

.file-change-signed-count[data-tone='add'] {
  color: var(--codex-diff-added);
}

.file-change-signed-count[data-tone='remove'] {
  color: var(--codex-diff-removed);
}
</style>

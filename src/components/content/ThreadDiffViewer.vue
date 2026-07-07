<template>
  <div v-if="activeChange" class="diff-viewer-backdrop" @click="$emit('close')">
    <div class="diff-viewer-shell" @click.stop>
      <aside v-if="!isMobile" class="diff-viewer-sidebar">
        <div class="diff-viewer-sidebar-header">
          <p class="diff-viewer-sidebar-title">Changed files</p>
          <p class="diff-viewer-sidebar-count">{{ formatChangeCountLabel(changes.length) }}</p>
        </div>
        <div class="diff-viewer-sidebar-list">
          <button
            v-for="change in changes"
            :key="`diff-viewer:${fileChangeKey(change)}`"
            type="button"
            class="diff-viewer-file-button"
            :data-active="fileChangeKey(change) === fileChangeKey(activeChange)"
            @click="$emit('select-change', change)"
          >
            <span class="file-change-badge" :data-operation="fileChangeOperationTone(change)">
              {{ fileChangeOperationLabel(change) }}
            </span>
            <span class="diff-viewer-file-label">
              {{ displayPath(change.path) }}
              <template v-if="change.movedToPath"> &rarr; {{ displayPath(change.movedToPath) }}</template>
            </span>
            <span v-if="formatFileChangeDelta(change)" class="diff-viewer-file-delta">{{ formatFileChangeDelta(change) }}</span>
          </button>
        </div>
      </aside>

      <section class="diff-viewer-main">
        <div class="diff-viewer-toolbar">
          <div class="diff-viewer-title-wrap">
            <p class="diff-viewer-title">
              {{ displayPath(activeChange.path) }}
              <template v-if="activeChange.movedToPath"> &rarr; {{ displayPath(activeChange.movedToPath) }}</template>
            </p>
            <p class="diff-viewer-subtitle">
              {{ fileChangeOperationLabel(activeChange) }}
              <span v-if="formatFileChangeDelta(activeChange)"> · {{ formatFileChangeDelta(activeChange) }}</span>
            </p>
          </div>
          <div class="diff-viewer-toolbar-actions">
            <button
              v-if="isMobile"
              type="button"
              class="diff-viewer-mobile-files-button"
              @click="$emit('toggle-file-list')"
            >
              {{ formatChangeCountLabel(changes.length) }}
            </button>
            <button class="diff-viewer-close" type="button" aria-label="Close diff viewer" @click="$emit('close')">
              <IconCodexX class="icon-svg" />
            </button>
          </div>
        </div>

        <div v-if="!hasDiffViewerContent(activeChange)" class="diff-viewer-empty">
          <p class="diff-viewer-empty-title">No diff available</p>
          <p class="diff-viewer-empty-text">This summary was restored from the final answer text, but the thread history does not include patch diff content for this file.</p>
        </div>

        <div v-else class="diff-viewer-panel">
          <div class="diff-viewer-meta">
            <span class="diff-viewer-language">{{ inferDiffViewerLanguage(activeChange) || 'diff' }}</span>
          </div>
          <div class="diff-viewer-lines">
            <div
              v-for="line in activeDiffViewerLines"
              :key="line.key"
              class="diff-viewer-line"
              :data-kind="line.kind"
            >
              <span class="diff-viewer-line-number">{{ line.oldLine ?? '' }}</span>
              <span class="diff-viewer-line-number">{{ line.newLine ?? '' }}</span>
              <span class="diff-viewer-line-marker">{{ diffViewerMarker(line) }}</span>
              <code class="diff-viewer-line-code" v-html="escapeHtml(line.text) || '&nbsp;'"></code>
            </div>
          </div>
        </div>
      </section>

      <Transition name="diff-viewer-sheet">
        <div
          v-if="isMobile && isFileListOpen"
          class="diff-viewer-mobile-sheet-backdrop"
          @click="$emit('close-file-list')"
        >
          <div class="diff-viewer-mobile-sheet" @click.stop>
            <div class="diff-viewer-mobile-sheet-handle" aria-hidden="true"></div>
            <div class="diff-viewer-mobile-sheet-header">
              <p class="diff-viewer-sidebar-title">Changed files</p>
              <p class="diff-viewer-sidebar-count">{{ formatChangeCountLabel(changes.length) }}</p>
            </div>
            <div class="diff-viewer-mobile-sheet-list">
              <button
                v-for="change in changes"
                :key="`diff-viewer-sheet:${fileChangeKey(change)}`"
                type="button"
                class="diff-viewer-file-button"
                :data-active="fileChangeKey(change) === fileChangeKey(activeChange)"
                @click="$emit('select-change', change)"
              >
                <span class="file-change-badge" :data-operation="fileChangeOperationTone(change)">
                  {{ fileChangeOperationLabel(change) }}
                </span>
                <span class="diff-viewer-file-label">
                  {{ displayPath(change.path) }}
                  <template v-if="change.movedToPath"> &rarr; {{ displayPath(change.movedToPath) }}</template>
                </span>
                <span v-if="formatFileChangeDelta(change)" class="diff-viewer-file-delta">{{ formatFileChangeDelta(change) }}</span>
              </button>
            </div>
          </div>
        </div>
      </Transition>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { UiFileChange } from '../../types/codex'
import { useUiLanguage } from '../../composables/useUiLanguage'
import { escapeHtml } from './threadMarkdownBlocks'
import {
  buildDiffViewerLines,
  diffViewerMarker,
  displayFileChangePath,
  fileChangeKey,
  fileChangeOperationLabel,
  fileChangeOperationTone,
  formatFileChangeCountLabel,
  formatFileChangeDelta,
  hasDiffViewerContent,
  inferDiffViewerLanguage,
} from './threadFileChanges'
import { IconCodexX } from '../icons/codex'

const props = defineProps<{
  changes: UiFileChange[]
  activeChange: UiFileChange | null
  cwd: string
  isMobile: boolean
  isFileListOpen: boolean
}>()

defineEmits<{
  close: []
  'toggle-file-list': []
  'close-file-list': []
  'select-change': [change: UiFileChange]
}>()

const { t } = useUiLanguage()
const activeDiffViewerLines = computed(() => buildDiffViewerLines(props.activeChange))

function formatChangeCountLabel(count: number): string {
  return formatFileChangeCountLabel(count, t)
}

function displayPath(pathValue: string): string {
  return displayFileChangePath(pathValue, props.cwd)
}
</script>

<style scoped>
@reference "tailwindcss";

.diff-viewer-backdrop {
  @apply fixed inset-0 z-50 bg-black/45 p-3 sm:p-6 flex items-center justify-center;
}

.diff-viewer-shell {
  @apply relative grid h-[min(86vh,900px)] w-[min(94vw,1320px)] grid-cols-1 overflow-hidden border shadow-2xl lg:grid-cols-[320px_minmax(0,1fr)];
  border-radius: var(--codex-radius-2xl);
  border-color: var(--codex-border-heavy);
  background-color: var(--codex-panel-surface);
  color: var(--codex-text);
}

.diff-viewer-sidebar {
  @apply flex min-h-0 flex-col border-b lg:border-b-0 lg:border-r;
  border-color: var(--codex-border);
  background-color: var(--codex-surface);
}

.diff-viewer-sidebar-header {
  @apply flex items-center justify-between gap-3 border-b px-4 py-4;
  border-color: var(--codex-border);
}

.diff-viewer-sidebar-title {
  @apply m-0 text-sm font-semibold;
  color: var(--codex-text);
}

.diff-viewer-sidebar-count {
  @apply m-0 text-xs font-medium;
  color: var(--codex-muted-text);
}

.diff-viewer-sidebar-list {
  @apply flex min-h-0 flex-col gap-2 overflow-y-auto p-3;
}

.diff-viewer-file-button {
  @apply flex w-full flex-col items-start gap-2 border border-transparent bg-transparent px-3 py-3 text-left transition;
  border-radius: var(--codex-radius-lg);
  color: var(--codex-text);
}

.diff-viewer-file-button:hover {
  border-color: var(--codex-border);
  background-color: var(--codex-control-hover);
}

.diff-viewer-file-button[data-active='true'] {
  border-color: var(--codex-border-heavy);
  background-color: var(--codex-control-bg);
  box-shadow: inset 2px 0 0 var(--codex-accent);
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

.diff-viewer-file-label {
  @apply font-mono text-[13px];
  color: var(--codex-text);
  overflow-wrap: anywhere;
  word-break: normal;
}

.diff-viewer-file-delta {
  @apply inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-medium;
  background-color: var(--codex-control-bg);
  color: var(--codex-muted-text);
}

.diff-viewer-main {
  @apply flex min-h-0 flex-col;
  background-color: var(--codex-panel-surface);
}

.diff-viewer-toolbar {
  @apply flex items-start justify-between gap-4 border-b px-5 py-4;
  border-color: var(--codex-border);
  background-color: var(--codex-panel-surface);
}

.diff-viewer-toolbar-actions {
  @apply flex items-center gap-2 shrink-0;
}

.diff-viewer-title-wrap {
  @apply min-w-0;
}

.diff-viewer-title {
  @apply m-0 break-all text-base font-semibold;
  color: var(--codex-text);
}

.diff-viewer-subtitle {
  @apply mt-1 mb-0 text-sm;
  color: var(--codex-muted-text);
}

.diff-viewer-close {
  @apply static inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full border;
  border-color: var(--codex-border);
  background-color: var(--codex-control-bg);
  color: var(--codex-text);
}

.diff-viewer-close:hover {
  background-color: var(--codex-control-hover);
}

.diff-viewer-mobile-files-button {
  @apply inline-flex items-center rounded-full border px-3 py-1.5 text-xs font-medium;
  border-color: var(--codex-border);
  background-color: var(--codex-control-bg);
  color: var(--codex-text);
}

.diff-viewer-mobile-files-button:hover {
  background-color: var(--codex-control-hover);
}

.diff-viewer-empty {
  @apply flex min-h-0 flex-1 flex-col items-center justify-center px-6 text-center;
}

.diff-viewer-empty-title {
  @apply m-0 text-base font-semibold;
  color: var(--codex-text);
}

.diff-viewer-empty-text {
  @apply mt-2 max-w-2xl text-sm leading-relaxed;
  color: var(--codex-muted-text);
}

.diff-viewer-panel {
  @apply flex min-h-0 flex-1 flex-col;
}

.diff-viewer-meta {
  @apply border-b px-5 py-2;
  border-color: var(--codex-border);
  background-color: var(--codex-file-summary-bg);
}

.diff-viewer-language {
  @apply inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase tracking-normal;
  background-color: var(--codex-control-bg);
  color: var(--codex-muted-text);
}

.diff-viewer-lines {
  @apply min-h-0 flex-1 overflow-auto;
  background-color: var(--codex-file-summary-bg);
}

.diff-viewer-line {
  display: grid;
  grid-template-columns: 4rem 4rem 2rem minmax(0, 1fr);
  align-items: stretch;
  min-width: fit-content;
}

.diff-viewer-line-number {
  @apply border-r px-3 py-1.5 text-right font-mono text-xs select-none;
  border-color: var(--codex-file-row-border);
  color: var(--codex-muted-text);
}

.diff-viewer-line-marker {
  @apply border-r px-2 py-1.5 text-center font-mono text-xs select-none;
  border-color: var(--codex-file-row-border);
  color: var(--codex-muted-text);
}

.diff-viewer-line-code {
  @apply block whitespace-pre px-3 py-1.5 leading-5;
  color: var(--codex-text);
  font-family: var(--codex-code-font-family);
  font-size: var(--codex-code-font-size);
}

.diff-viewer-line[data-kind='meta'] {
  background-color: color-mix(in srgb, var(--codex-text) 7%, var(--codex-file-summary-bg));
}

.diff-viewer-line[data-kind='meta'] .diff-viewer-line-code,
.diff-viewer-line[data-kind='meta'] .diff-viewer-line-marker {
  color: var(--codex-link);
}

.diff-viewer-line[data-kind='hunk'] {
  background-color: color-mix(in srgb, var(--codex-accent) 12%, var(--codex-file-summary-bg));
}

.diff-viewer-line[data-kind='hunk'] .diff-viewer-line-code,
.diff-viewer-line[data-kind='hunk'] .diff-viewer-line-marker {
  color: var(--codex-link);
}

.diff-viewer-line[data-kind='add'] {
  background: var(--codex-diff-added-bg);
}

.diff-viewer-line[data-kind='add'] .diff-viewer-line-marker,
.diff-viewer-line[data-kind='add'] .diff-viewer-line-code {
  color: var(--codex-diff-added);
}

.diff-viewer-line[data-kind='remove'] {
  background: var(--codex-diff-removed-bg);
}

.diff-viewer-line[data-kind='remove'] .diff-viewer-line-marker,
.diff-viewer-line[data-kind='remove'] .diff-viewer-line-code {
  color: var(--codex-diff-removed);
}

.diff-viewer-line[data-kind='context'] {
  background-color: var(--codex-file-summary-bg);
}

.diff-viewer-line[data-kind='context'] .diff-viewer-line-code {
  color: var(--codex-text);
}

.diff-viewer-mobile-sheet-backdrop {
  @apply absolute inset-0 z-20 bg-black/35 flex items-end;
}

.diff-viewer-mobile-sheet {
  @apply w-full max-h-[70vh] rounded-t-3xl shadow-2xl border-t flex flex-col overflow-hidden;
  border-color: var(--codex-border);
  background-color: var(--codex-panel-surface);
}

.diff-viewer-mobile-sheet-handle {
  @apply mx-auto mt-3 h-1.5 w-12 rounded-full;
  background-color: var(--codex-border-heavy);
}

.diff-viewer-mobile-sheet-header {
  @apply flex items-center justify-between gap-3 px-4 pt-3 pb-2 border-b;
  border-color: var(--codex-border);
}

.diff-viewer-mobile-sheet-list {
  @apply flex min-h-0 flex-col gap-2 overflow-y-auto px-3 py-3;
}

.diff-viewer-sheet-enter-active,
.diff-viewer-sheet-leave-active {
  @apply transition-opacity duration-200;
}

.diff-viewer-sheet-enter-active .diff-viewer-mobile-sheet,
.diff-viewer-sheet-leave-active .diff-viewer-mobile-sheet {
  transition: transform 200ms ease;
}

.diff-viewer-sheet-enter-from,
.diff-viewer-sheet-leave-to {
  @apply opacity-0;
}

.diff-viewer-sheet-enter-from .diff-viewer-mobile-sheet,
.diff-viewer-sheet-leave-to .diff-viewer-mobile-sheet {
  transform: translateY(100%);
}

.icon-svg {
  @apply w-5 h-5;
}

@media (max-width: 767px) {
  .diff-viewer-backdrop {
    @apply p-0 items-stretch;
  }

  .diff-viewer-shell {
    @apply h-[100dvh] w-screen rounded-none border-0 shadow-none;
  }

  .diff-viewer-main {
    @apply min-w-0;
  }

  .diff-viewer-toolbar {
    @apply sticky top-0 z-10 px-3 py-3;
    background-color: var(--codex-panel-surface);
  }

  .diff-viewer-title {
    @apply text-sm leading-5;
  }

  .diff-viewer-subtitle {
    @apply text-xs;
  }

  .diff-viewer-meta {
    @apply px-3 py-2;
  }

  .diff-viewer-language {
    @apply text-[10px];
  }

  .diff-viewer-line {
    grid-template-columns: 2.75rem 2.75rem 1.5rem minmax(0, 1fr);
  }

  .diff-viewer-line-number {
    @apply px-1.5 py-1 text-[10px];
  }

  .diff-viewer-line-marker {
    @apply px-1 py-1 text-[10px];
  }

  .diff-viewer-line-code {
    @apply px-2 py-1 text-[11px] leading-5;
  }
}
</style>

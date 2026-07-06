<template>
  <template v-for="(segment, segmentIndex) in segments" :key="`segment-${segmentIndex}`">
    <span v-if="segment.kind === 'text'">{{ segment.value }}</span>
    <strong v-else-if="segment.kind === 'bold'" class="message-bold-text">{{ segment.value }}</strong>
    <em v-else-if="segment.kind === 'italic'" class="message-italic-text">{{ segment.value }}</em>
    <s v-else-if="segment.kind === 'strikethrough'" class="message-strikethrough-text">{{ segment.value }}</s>
    <a
      v-else-if="segment.kind === 'file'"
      class="message-file-link"
      :href="toBrowseUrl(segment.path)"
      target="_blank"
      rel="noopener noreferrer"
      :title="segment.path"
    >
      {{ segment.displayPath }}
    </a>
    <a
      v-else-if="segment.kind === 'url'"
      class="message-file-link"
      :href="segment.href"
      target="_blank"
      rel="noopener noreferrer"
      :title="segment.href"
    >
      {{ segment.value }}
    </a>
    <code v-else class="message-inline-code">{{ segment.value }}</code>
  </template>
</template>

<script setup lang="ts">
import type { InlineSegment } from './threadInlineSegments'

defineProps<{
  segments: InlineSegment[]
  toBrowseUrl: (pathValue: string) => string
}>()
</script>

<style scoped>
@reference "tailwindcss";

.message-bold-text {
  @apply font-semibold;
  color: var(--codex-text);
}

.message-italic-text {
  @apply italic;
}

.message-strikethrough-text {
  @apply line-through;
  color: var(--codex-muted-text);
}

.message-inline-code {
  @apply rounded-md px-1.5 py-0.5 font-mono leading-[1.4];
  background-color: var(--codex-inline-code-bg);
  color: var(--codex-text);
  font-size: var(--codex-code-font-size);
  box-shadow: none;
}

.message-file-link {
  @apply text-sm leading-relaxed no-underline underline-offset-2 hover:underline;
  color: var(--codex-link);
}

.message-file-link:hover {
  color: var(--codex-link-hover);
}
</style>

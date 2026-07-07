<template>
  <header class="content-header">
    <div class="content-leading" :class="{ 'is-accent': accent }">
      <slot name="leading" />
    </div>
    <h1 class="content-title" :class="{ 'is-accent': accent }" :title="title">{{ title }}</h1>
    <div class="content-actions">
      <slot name="actions" />
    </div>
  </header>
</template>

<script setup lang="ts">
defineProps<{
  title: string
  accent?: boolean
}>()
</script>

<style scoped>
@reference "tailwindcss";

.content-header {
  @apply relative z-10 w-full min-w-0 flex items-center gap-2 sm:gap-3 px-2 sm:px-3 py-2;
  background-color: var(--codex-bg);
  min-height: var(--codex-toolbar-height);
}

.content-title {
  @apply m-0 min-w-0 max-w-[min(72ch,100%)] flex-1 truncate font-medium leading-6;
  font-size: var(--codex-text-sm);
  color: var(--codex-text);
}

.content-title.is-accent {
  @apply text-lg font-semibold leading-7 tracking-[-0.01em] sm:text-[1.4rem];
  color: var(--codex-text);
}

.content-actions {
  @apply ml-auto flex shrink-0 items-center justify-end gap-1;
}

.content-leading {
  @apply flex shrink-0 items-center gap-1;
}

.content-leading.is-accent {
  @apply gap-2;
}

</style>

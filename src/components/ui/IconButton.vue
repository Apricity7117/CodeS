<template>
  <button
    class="ui-icon-button"
    :class="`ui-icon-button--${size}`"
    :type="type"
    :aria-label="label"
    :aria-pressed="pressed === undefined ? undefined : pressed"
    :title="title ?? label"
    :disabled="disabled"
    @click="$emit('click', $event)"
  >
    <slot />
  </button>
</template>

<script setup lang="ts">
withDefaults(
  defineProps<{
    label: string
    title?: string
    pressed?: boolean
    disabled?: boolean
    type?: 'button' | 'submit' | 'reset'
    size?: 'sm' | 'md'
  }>(),
  {
    disabled: false,
    pressed: undefined,
    size: 'md',
    title: undefined,
    type: 'button',
  },
)

defineEmits<{
  click: [event: MouseEvent]
}>()
</script>

<style scoped>
@reference "tailwindcss";

.ui-icon-button {
  @apply flex items-center justify-center rounded-md border border-transparent bg-transparent transition disabled:pointer-events-none disabled:opacity-45;
  color: var(--codex-muted-text);
}

.ui-icon-button:hover {
  border-color: var(--codex-border);
  background-color: var(--codex-control-hover);
  color: var(--codex-text);
}

.ui-icon-button[aria-pressed='true'] {
  border-color: var(--codex-selected-border);
  background-color: var(--codex-selected-surface);
  color: var(--codex-text);
}

.ui-icon-button--sm {
  @apply h-6 w-6;
}

.ui-icon-button--md {
  @apply h-6.75 w-6.75;
}

.ui-icon-button :deep(svg) {
  @apply h-4 w-4;
}

</style>

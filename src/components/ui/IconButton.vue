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
  @apply rounded-md border border-transparent bg-transparent text-zinc-600 flex items-center justify-center transition hover:border-zinc-200 hover:bg-zinc-50 disabled:pointer-events-none disabled:opacity-45;
}

.ui-icon-button[aria-pressed='true'] {
  @apply border-zinc-300 bg-zinc-100 text-zinc-700;
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

:global(:root.dark) .ui-icon-button {
  @apply text-zinc-400 hover:border-zinc-600 hover:bg-zinc-800;
}

:global(:root.dark) .ui-icon-button[aria-pressed='true'] {
  @apply border-zinc-600 bg-zinc-800 text-zinc-300;
}
</style>

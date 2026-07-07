<template>
  <button
    type="button"
    role="switch"
    class="codex-switch"
    :class="[`codex-switch--${switchSize}`, { 'is-disabled': disabled }]"
    :aria-checked="checked"
    :aria-label="ariaLabel"
    :data-state="state"
    :disabled="disabled"
    @click="onClick"
  >
    <span class="codex-switch-track" :data-state="state">
      <span class="codex-switch-thumb" :data-state="state" />
    </span>
  </button>
</template>

<script setup lang="ts">
import { computed } from 'vue'

const props = withDefaults(defineProps<{
  checked: boolean
  ariaLabel: string
  disabled?: boolean
  size?: 'default' | 'sm'
}>(), {
  disabled: false,
  size: 'default',
})

const emit = defineEmits<{
  'update:checked': [value: boolean]
}>()

const switchSize = computed(() => props.size)
const state = computed(() => props.checked ? 'checked' : 'unchecked')

function onClick(): void {
  if (props.disabled) return
  emit('update:checked', !props.checked)
}
</script>

<style scoped>
@reference "tailwindcss";

.codex-switch {
  @apply inline-flex items-center rounded-full border-0 bg-transparent p-0 text-sm outline-none transition focus-visible:ring-2;
  color: var(--codex-muted-text);
  --tw-ring-color: var(--codex-focus-ring);
}

.codex-switch:not(.is-disabled) {
  @apply cursor-pointer;
}

.codex-switch.is-disabled {
  @apply cursor-not-allowed opacity-60;
}

.codex-switch-track {
  @apply relative inline-flex shrink-0 items-center rounded-full transition-colors duration-200 ease-out;
  background-color: var(--codex-switch-track-bg);
}

.codex-switch-track[data-state='checked'] {
  background-color: var(--codex-switch-checked-bg);
}

.codex-switch--default .codex-switch-track {
  @apply h-5 w-8;
}

.codex-switch--sm .codex-switch-track {
  @apply h-4 w-7;
}

.codex-switch-thumb {
  @apply rounded-full border shadow-sm transition-transform duration-200 ease-out;
  border-color: var(--codex-switch-thumb-bg);
  background-color: var(--codex-switch-thumb-bg);
}

.codex-switch-thumb[data-state='checked'] {
  border-color: var(--codex-switch-checked-thumb-bg);
  background-color: var(--codex-switch-checked-thumb-bg);
}

.codex-switch--default .codex-switch-thumb {
  @apply h-4 w-4;
}

.codex-switch--sm .codex-switch-thumb {
  @apply h-3 w-3;
}

.codex-switch--default .codex-switch-thumb[data-state='unchecked'],
.codex-switch--sm .codex-switch-thumb[data-state='unchecked'] {
  transform: translateX(2px);
}

.codex-switch--default .codex-switch-thumb[data-state='checked'],
.codex-switch--sm .codex-switch-thumb[data-state='checked'] {
  transform: translateX(14px);
}

</style>

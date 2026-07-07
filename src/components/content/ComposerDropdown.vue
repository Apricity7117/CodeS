<template>
  <div ref="rootRef" class="composer-dropdown">
    <button
      class="composer-dropdown-trigger"
      type="button"
      :title="triggerAccessibleLabel"
      :aria-label="triggerAccessibleLabel"
      :disabled="disabled"
      @click="onToggle"
    >
      <component :is="selectedPrefixIcon" v-if="selectedPrefixIcon" class="composer-dropdown-prefix-icon" />
      <span v-if="!iconOnly" class="composer-dropdown-value">{{ selectedLabel }}</span>
      <IconCodexChevron class="composer-dropdown-chevron" />
    </button>

    <Teleport to="body">
      <div
        v-if="isOpen"
        ref="menuRef"
        class="composer-dropdown-menu-wrap"
        :class="{
          'composer-dropdown-menu-wrap-up': openDirection === 'up',
          'composer-dropdown-menu-wrap-down': openDirection === 'down',
        }"
        :style="menuStyle"
      >
        <div class="composer-dropdown-menu">
          <div v-if="enableSearch" class="composer-dropdown-search-wrap">
            <input
              ref="searchInputRef"
              v-model="searchQuery"
              class="composer-dropdown-search-input"
              type="text"
              :placeholder="searchPlaceholderText"
              @keydown="onSearchInputKeydown"
            />
          </div>

          <ul class="composer-dropdown-options" role="listbox">
            <li v-for="option in filteredOptions" :key="option.value">
              <button
                class="composer-dropdown-option"
                :class="{ 'is-selected': option.value === modelValue }"
                type="button"
                @click="onSelect(option.value)"
              >
                {{ option.label }}
              </button>
            </li>
            <li v-if="filteredOptions.length === 0" class="composer-dropdown-empty">
              {{ emptyText }}
            </li>
          </ul>

        </div>
      </div>
    </Teleport>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch, type Component } from 'vue'
import { IconCodexChevron } from '../icons/codex'
import { isImeComposingKeydown } from '../../utils/keyboard'

type DropdownOption = {
  value: string
  label: string
}

const props = defineProps<{
  modelValue: string
  options: DropdownOption[]
  placeholder?: string
  disabled?: boolean
  selectedPrefixIcon?: Component | null
  iconOnly?: boolean
  openDirection?: 'up' | 'down'
  enableSearch?: boolean
  searchPlaceholder?: string
  emptyLabel?: string
}>()

const emit = defineEmits<{
  'update:modelValue': [value: string]
}>()

const rootRef = ref<HTMLElement | null>(null)
const menuRef = ref<HTMLElement | null>(null)
const searchInputRef = ref<HTMLInputElement | null>(null)
const isOpen = ref(false)
const searchQuery = ref('')
const menuStyle = ref<Record<string, string>>({})

const selectedLabel = computed(() => {
  const selected = props.options.find((option) => option.value === props.modelValue)
  if (selected) return selected.label
  return props.placeholder?.trim() || ''
})

const openDirection = computed(() => props.openDirection ?? 'down')
const iconOnly = computed(() => props.iconOnly === true)
const enableSearch = computed(() => props.enableSearch === true)
const searchPlaceholderText = computed(() => props.searchPlaceholder?.trim() || 'Quick search projects')
const emptyText = computed(() => props.emptyLabel?.trim() || 'No results')
const triggerAccessibleLabel = computed(() => selectedLabel.value || props.placeholder?.trim() || 'Select option')
const filteredOptions = computed(() => {
  const query = searchQuery.value.trim().toLowerCase()
  if (!query) return props.options
  return props.options.filter((option) => {
    return option.label.toLowerCase().includes(query) || option.value.toLowerCase().includes(query)
  })
})

function onToggle(): void {
  if (props.disabled) return
  isOpen.value = !isOpen.value
  if (isOpen.value) {
    searchQuery.value = ''
    nextTick(() => {
      nextTick(updateMenuPosition)
      if (enableSearch.value) searchInputRef.value?.focus()
    })
  }
}

function onSelect(value: string): void {
  emit('update:modelValue', value)
  isOpen.value = false
  searchQuery.value = ''
}

function onEscapeSearch(): void {
  if (searchQuery.value.length > 0) {
    searchQuery.value = ''
    return
  }
  isOpen.value = false
}

function onSearchInputKeydown(event: KeyboardEvent): void {
  if (isImeComposingKeydown(event)) {
    event.stopPropagation()
    return
  }
  if (event.key !== 'Escape') return
  event.preventDefault()
  onEscapeSearch()
}

function onDocumentPointerDown(event: PointerEvent): void {
  if (!isOpen.value) return
  const root = rootRef.value
  const menu = menuRef.value
  if (!root) return

  const target = event.target
  if (!(target instanceof Node)) return
  if (root.contains(target)) return
  if (menu?.contains(target)) return
  isOpen.value = false
  searchQuery.value = ''
}

function updateMenuPosition(): void {
  const root = rootRef.value
  if (!root) return

  const rect = root.getBoundingClientRect()
  const viewportWidth = window.innerWidth
  const viewportHeight = window.innerHeight
  const desiredWidth = Math.min(
    enableSearch.value ? 320 : 224,
    Math.max(160, viewportWidth - 16),
  )
  const width = Math.max(desiredWidth, Math.min(rect.width, viewportWidth - 16))
  const left = Math.max(8, Math.min(rect.left, viewportWidth - width - 8))
  const top = `${rect.bottom + 8}px`
  const bottom = `${viewportHeight - rect.top + 8}px`

  menuStyle.value = {
    position: 'fixed',
    width: `${width}px`,
    left: `${left}px`,
    top: openDirection.value === 'up' ? 'auto' : top,
    bottom: openDirection.value === 'up' ? bottom : 'auto',
    zIndex: '120',
  }
}

function onWindowLayoutChange(): void {
  if (!isOpen.value) return
  updateMenuPosition()
}

watch(filteredOptions, () => {
  if (!isOpen.value) return
  nextTick(updateMenuPosition)
})

onMounted(() => {
  window.addEventListener('pointerdown', onDocumentPointerDown)
  window.addEventListener('resize', onWindowLayoutChange)
  window.addEventListener('scroll', onWindowLayoutChange, true)
})

onBeforeUnmount(() => {
  window.removeEventListener('pointerdown', onDocumentPointerDown)
  window.removeEventListener('resize', onWindowLayoutChange)
  window.removeEventListener('scroll', onWindowLayoutChange, true)
})
</script>

<style scoped>
@reference "tailwindcss";

.composer-dropdown {
  @apply relative inline-flex min-w-0;
}

.composer-dropdown-trigger {
  @apply inline-flex min-h-7 min-w-0 items-center gap-1 border-0 bg-transparent px-0 py-0.5 text-sm leading-tight outline-none transition;
  color: var(--codex-muted-text);
}

.composer-dropdown-prefix-icon {
  @apply h-3.5 w-3.5 shrink-0 text-amber-500;
}

.composer-dropdown-trigger:disabled {
  @apply cursor-not-allowed;
  color: var(--codex-muted-text);
}

.composer-dropdown-value {
  @apply whitespace-nowrap text-left truncate pb-px;
}

.composer-dropdown-chevron {
  @apply mt-px h-3.5 w-3.5 shrink-0;
  color: var(--codex-muted-text);
}

.composer-dropdown-menu-wrap {
  @apply z-[120];
}

.composer-dropdown-menu-wrap-down {
}

.composer-dropdown-menu-wrap-up {
}

.composer-dropdown-menu {
  @apply m-0 min-w-56 rounded-xl border p-1 shadow-lg;
  border-color: var(--codex-border-heavy);
  background-color: var(--codex-popover-surface);
  box-shadow: 0 18px 48px color-mix(in srgb, #000 20%, transparent);
}

.composer-dropdown-search-wrap {
  @apply px-1 pb-1;
}

.composer-dropdown-search-input {
  @apply w-full rounded-md border px-2 py-1 text-xs outline-none transition;
  border-color: var(--codex-border);
  background-color: var(--codex-control-bg);
  color: var(--codex-text);
}

.composer-dropdown-options {
  @apply m-0 max-h-56 list-none overflow-y-auto p-0;
}

.composer-dropdown-option {
  @apply flex w-full items-center rounded-lg border-0 bg-transparent px-2 py-1.5 text-left text-sm transition;
  color: var(--codex-text);
}

.composer-dropdown-option:hover {
  background-color: var(--codex-control-hover);
}

.composer-dropdown-option.is-selected {
  background-color: var(--codex-selected-surface);
}

.composer-dropdown-empty {
  @apply px-2 py-1.5 text-xs;
  color: var(--codex-muted-text);
}
</style>

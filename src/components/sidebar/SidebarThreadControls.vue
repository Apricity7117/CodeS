<template>
  <div class="sidebar-thread-controls">
    <IconButton
      :label="isSidebarCollapsed ? t('Expand sidebar') : t('Collapse sidebar')"
      @click="$emit('toggle-sidebar')"
    >
      <IconLayoutSidebarFilled v-if="isSidebarCollapsed" />
      <IconLayoutSidebar v-else />
    </IconButton>

    <slot />

    <IconButton
      v-if="showNewThreadButton"
      :label="t('Start new thread')"
      @click="$emit('start-new-thread')"
    >
      <IconCodexEdit />
    </IconButton>
  </div>
</template>

<script setup lang="ts">
import { IconLayoutSidebar, IconLayoutSidebarFilled } from '@tabler/icons-vue'
import { useUiLanguage } from '../../composables/useUiLanguage'
import { IconCodexEdit } from '../icons/codex'
import IconButton from '../ui/IconButton.vue'

defineProps<{
  isSidebarCollapsed: boolean
  showNewThreadButton?: boolean
}>()

defineEmits<{
  'toggle-sidebar': []
  'start-new-thread': []
}>()

const { t } = useUiLanguage()
</script>

<style scoped>
@reference "tailwindcss";

.sidebar-thread-controls {
  @apply flex flex-row flex-nowrap items-center gap-2;
}
</style>

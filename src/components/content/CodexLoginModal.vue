<template>
  <div
    class="codex-login-modal-backdrop"
    role="presentation"
    @click="$emit('cancel')"
  >
    <form
      class="codex-login-modal"
      role="dialog"
      aria-modal="true"
      :aria-label="t('Complete Codex login')"
      @submit.prevent="$emit('submit')"
      @click.stop
    >
      <div class="codex-login-modal-header">
        <h2 class="codex-login-modal-title">{{ t('Complete Codex login') }}</h2>
        <button
          class="codex-login-modal-close"
          type="button"
          :aria-label="t('Close')"
          :disabled="isCompleting"
          @click="$emit('cancel')"
        >
          &times;
        </button>
      </div>
      <p class="codex-login-modal-copy">
        {{ t('Finish login in the browser, then paste the localhost callback URL here.') }}
      </p>
      <a
        v-if="loginUrl"
        class="codex-login-modal-link"
        :href="loginUrl"
        target="_blank"
        rel="noreferrer"
      >
        {{ t('Open login URL') }}
      </a>
      <input
        ref="callbackInputRef"
        class="codex-login-modal-input"
        type="url"
        inputmode="url"
        :value="callbackUrl"
        :placeholder="t('Paste localhost callback URL')"
        :disabled="isCompleting"
        @input="$emit('update:callbackUrl', ($event.target as HTMLInputElement).value)"
      >
      <div v-if="error" class="codex-login-modal-error">
        <span>{{ error }}</span>
      </div>
      <div class="codex-login-modal-actions">
        <button
          class="codex-login-modal-cancel"
          type="button"
          :disabled="isCompleting"
          @click="$emit('cancel')"
        >
          {{ t('Cancel') }}
        </button>
        <button
          class="codex-login-modal-submit"
          type="submit"
          :disabled="isCompleting || callbackUrl.trim().length === 0"
        >
          {{ isCompleting ? t('Completing…') : t('Complete') }}
        </button>
      </div>
    </form>
  </div>
</template>

<script setup lang="ts">
import { nextTick, onMounted, ref } from 'vue'
import { useUiLanguage } from '../../composables/useUiLanguage'

defineProps<{
  callbackUrl: string
  error: string
  isCompleting: boolean
  loginUrl: string
}>()

defineEmits<{
  cancel: []
  submit: []
  'update:callbackUrl': [value: string]
}>()

const { t } = useUiLanguage()
const callbackInputRef = ref<HTMLInputElement | null>(null)

onMounted(() => {
  void nextTick(() => callbackInputRef.value?.focus())
})
</script>

<style scoped>
@reference "tailwindcss";

.codex-login-modal-backdrop {
  @apply fixed inset-0 z-[100] flex items-center justify-center bg-black/35 px-4;
}

.codex-login-modal {
  @apply flex w-full max-w-md flex-col gap-3 rounded-xl border p-4 shadow-2xl;
  border-color: var(--codex-border-heavy);
  background-color: var(--codex-popover-surface);
}

.codex-login-modal-header {
  @apply flex items-center justify-between gap-3;
}

.codex-login-modal-title {
  @apply text-base font-semibold;
  color: var(--codex-text);
}

.codex-login-modal-close {
  @apply inline-flex h-7 w-7 items-center justify-center rounded-full border text-lg leading-none transition disabled:cursor-default disabled:opacity-60;
  border-color: var(--codex-border-heavy);
  background-color: var(--codex-surface);
  color: var(--codex-muted-text);
}

.codex-login-modal-close:hover {
  background-color: var(--codex-control-hover);
  color: var(--codex-text);
}

.codex-login-modal-copy {
  @apply text-sm leading-5;
  color: var(--codex-muted-text);
}

.codex-login-modal-link {
  @apply min-w-0 truncate text-sm hover:underline;
  color: var(--codex-link);
}

.codex-login-modal-link:hover {
  color: var(--codex-link-hover);
}

.codex-login-modal-input {
  @apply w-full rounded-lg border px-3 py-2 text-sm outline-none transition disabled:cursor-default disabled:opacity-60;
  border-color: var(--codex-border-heavy);
  background-color: var(--codex-control-bg);
  color: var(--codex-text);
}

.codex-login-modal-input:focus {
  border-color: var(--codex-selected-border);
}

.codex-login-modal-error {
  @apply rounded-md bg-rose-50 px-3 py-2 text-xs text-zinc-700;
}

.codex-login-modal-actions {
  @apply flex items-center justify-end gap-2;
}

.codex-login-modal-cancel,
.codex-login-modal-submit {
  @apply rounded-full border px-3 py-1.5 text-sm transition disabled:cursor-default disabled:opacity-60;
  border-color: var(--codex-border-heavy);
  background-color: var(--codex-surface);
  color: var(--codex-text);
}

.codex-login-modal-cancel:hover,
.codex-login-modal-submit:hover {
  background-color: var(--codex-control-hover);
}

.codex-login-modal-submit {
  border-color: var(--codex-primary);
  background-color: var(--codex-primary);
  color: var(--codex-primary-fg);
}

.codex-login-modal-submit:hover {
  background-color: var(--codex-primary-hover);
}
</style>

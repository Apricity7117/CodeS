<template>
  <span ref="rootRef" class="thinking-shimmer" :class="{ 'is-active': isSweepActive && active }">
    {{ messageText }}
    <span v-if="active" class="thinking-shimmer-sweep" aria-hidden="true">
      <span class="thinking-shimmer-highlight">{{ messageText }}</span>
    </span>
  </span>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'

const props = withDefaults(defineProps<{
  message?: string
  active?: boolean
}>(), {
  message: 'Thinking',
  active: true,
})

const messageText = computed(() => props.message?.trim() || 'Thinking')
const rootRef = ref<HTMLElement | null>(null)
const isSweepActive = ref(false)
let startTimer: number | undefined
let repeatTimer: number | undefined
let sweepTimer: number | undefined
let sweepFrame: number | undefined

function clearTimers(): void {
  if (startTimer !== undefined) window.clearTimeout(startTimer)
  if (repeatTimer !== undefined) window.clearInterval(repeatTimer)
  if (sweepTimer !== undefined) window.clearTimeout(sweepTimer)
  if (sweepFrame !== undefined) window.cancelAnimationFrame(sweepFrame)
  startTimer = undefined
  repeatTimer = undefined
  sweepTimer = undefined
  sweepFrame = undefined
  isSweepActive.value = false
}

function triggerSweep(): void {
  if (!props.active) return
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
  if (!rootRef.value) return
  if (sweepTimer !== undefined) window.clearTimeout(sweepTimer)
  isSweepActive.value = false
  sweepFrame = requestAnimationFrame(() => {
    sweepFrame = undefined
    isSweepActive.value = true
    sweepTimer = window.setTimeout(() => {
      isSweepActive.value = false
      sweepTimer = undefined
    }, 1000)
  })
}

function startCadence(): void {
  clearTimers()
  if (!props.active) return
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
  startTimer = window.setTimeout(() => {
    triggerSweep()
    repeatTimer = window.setInterval(triggerSweep, 4000)
  }, 600)
}

watch(() => props.active, startCadence, { immediate: true })
onBeforeUnmount(clearTimers)
</script>

<style scoped>
@reference "tailwindcss";

.thinking-shimmer {
  color: var(--shimmer-text-secondary, currentColor);
  -webkit-text-fill-color: currentColor;
  background: transparent;
  background-clip: border-box;
  animation: none;
  position: relative;
}

.thinking-shimmer-sweep {
  pointer-events: none;
  width: 50%;
  position: absolute;
  inset: 0 auto 0 0;
  overflow: hidden;
  transform: translateX(-100%);
  mask-image: linear-gradient(90deg, transparent 0%, #000 40% 60%, transparent 100%);
  -webkit-mask-image: linear-gradient(90deg, transparent 0%, #000 40% 60%, transparent 100%);
}

.thinking-shimmer-highlight {
  width: 200%;
  color: var(--shimmer-contrast, var(--codex-text, currentColor));
  -webkit-text-fill-color: currentColor;
  display: block;
  transform: translateX(50%);
}

.thinking-shimmer.is-active .thinking-shimmer-sweep,
.thinking-shimmer.is-active .thinking-shimmer-highlight {
  animation-duration: 1s;
  animation-timing-function: steps(48, end);
  animation-iteration-count: 1;
}

.thinking-shimmer.is-active .thinking-shimmer-sweep {
  animation-name: thinking-shimmer-sweep;
}

.thinking-shimmer.is-active .thinking-shimmer-highlight {
  animation-name: thinking-shimmer-highlight;
}

@media (prefers-reduced-motion: reduce) {
  .thinking-shimmer.is-active .thinking-shimmer-sweep,
  .thinking-shimmer.is-active .thinking-shimmer-highlight {
    animation: none;
  }
}

@keyframes thinking-shimmer-sweep {
  from {
    transform: translateX(-100%);
  }

  to {
    transform: translateX(250%);
  }
}

@keyframes thinking-shimmer-highlight {
  from {
    transform: translateX(50%);
  }

  to {
    transform: translateX(-125%);
  }
}
</style>

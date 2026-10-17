<script setup lang="ts">
// The hold timer on C5 (BR-P4, BR-P5). Server-corrected, like the cut-off countdown.
const props = defineProps<{ holdExpiresAt: string; serverNow: string }>()
const emit = defineEmits<{ expired: [] }>()

const { parts, done } = useCountdown(
  () => props.holdExpiresAt,
  () => props.serverNow
)
const pad = (n: number) => String(n).padStart(2, '0')

watch(done, (isDone) => {
  if (isDone) emit('expired')
})
</script>

<template>
  <div>
    <!-- role="timer" without aria-live: screen readers are not interrupted every second. -->
    <p role="timer" class="text-lg font-bold tabular-nums text-stone-900">
      <template v-if="!done">Your spaces are held for {{ pad(parts.minutes) }}:{{ pad(parts.seconds) }}</template>
      <template v-else>Your hold has expired</template>
    </p>
    <!-- Announced once, only when the hold expires. -->
    <p role="status" class="sr-only">{{ done ? 'Your hold has expired.' : '' }}</p>
  </div>
</template>

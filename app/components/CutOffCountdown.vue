<script setup lang="ts">
const props = defineProps<{ cutOffAt: string; serverNow: string }>()
const emit = defineEmits<{ reached: [] }>()

const { parts, done } = useCountdown(
  () => props.cutOffAt,
  () => props.serverNow
)

const pad = (n: number) => String(n).padStart(2, '0')

watch(done, (isDone) => {
  if (isDone) emit('reached')
})
</script>

<template>
  <div>
    <!-- role="timer" without aria-live: screen readers are not interrupted every second. -->
    <p role="timer" class="text-lg font-bold tabular-nums text-stone-900">
      <template v-if="!done">
        Orders close in
        <span v-if="parts.days > 0">{{ parts.days }}d </span>{{ pad(parts.hours) }}h {{ pad(parts.minutes) }}m
        {{ pad(parts.seconds) }}s
      </template>
      <template v-else>Orders for this drop have closed</template>
    </p>
    <!-- Announced once, only when the countdown reaches zero. -->
    <p role="status" class="sr-only">{{ done ? 'Orders for this drop have now closed.' : '' }}</p>
  </div>
</template>

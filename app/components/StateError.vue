<script setup lang="ts">
const props = defineProps<{ message?: string }>()
const emit = defineEmits<{ retry: [] }>()
</script>

<template>
  <div role="alert" class="rounded-2xl border border-danger/60 bg-panel-raised p-4">
    <p class="font-semibold text-ink">{{ props.message ?? "We couldn't load this drop." }}</p>
    <p class="mt-1 text-sm text-ink-muted">Check your connection and try again.</p>
    <UButton class="mt-3 min-h-11" color="primary" label="Try again" @click="emit('retry')" />
  </div>
</template>

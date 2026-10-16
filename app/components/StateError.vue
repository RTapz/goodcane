<script setup lang="ts">
const props = defineProps<{ message?: string }>()
const emit = defineEmits<{ retry: [] }>()
</script>

<template>
  <div role="alert" class="rounded-lg border border-red-300 bg-white p-4">
    <p class="font-semibold text-stone-900">{{ props.message ?? "We couldn't load this drop." }}</p>
    <p class="mt-1 text-sm text-stone-700">Check your connection and try again.</p>
    <UButton class="mt-3 min-h-11" color="primary" label="Try again" @click="emit('retry')" />
  </div>
</template>

<script setup lang="ts">
const props = defineProps<{ units: number; totalPesewas: number; spacesAfter: number }>()
</script>

<template>
  <div class="fixed inset-x-0 bottom-0 z-40 border-t border-stone-300 bg-cream-50 pb-[env(safe-area-inset-bottom)]">
    <div class="mx-auto flex w-full max-w-md items-center justify-between gap-3 px-4 py-3">
      <div aria-live="polite">
        <p class="font-bold text-stone-900">
          {{ props.units }} {{ props.units === 1 ? 'bottle' : 'bottles' }}, {{ formatPesewas(props.totalPesewas) }}
        </p>
        <p class="text-sm text-stone-700">{{ props.spacesAfter }} spaces left after yours</p>
      </div>
      <UButton
        to="/details"
        :disabled="props.units === 0"
        size="xl"
        class="min-h-12 px-6"
        label="Continue"
      />
    </div>
  </div>
</template>

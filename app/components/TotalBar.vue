<script setup lang="ts">
const props = defineProps<{ units: number; totalPesewas: number; spacesAfter: number; overBy: number }>()
</script>

<template>
  <div class="gc-bottom-bar fixed inset-x-0 bottom-0 z-40 pb-[env(safe-area-inset-bottom)]">
    <div class="mx-auto flex w-full max-w-md items-center justify-between gap-3 px-4 py-3">
      <div aria-live="polite">
        <p class="font-bold text-stone-900">
          {{ plural(props.units, 'bottle', 'bottles') }}, {{ formatPesewas(props.totalPesewas) }}
        </p>
        <p class="text-sm text-stone-700">
          {{ props.overBy > 0 ? `Remove ${plural(props.overBy, 'bottle', 'bottles')} to continue` : `${plural(props.spacesAfter, 'space', 'spaces')} left after yours` }}
        </p>
      </div>
      <UButton
        to="/details"
        :disabled="props.units === 0 || props.overBy > 0"
        size="xl"
        class="min-h-12 px-6"
        label="Continue"
      />
    </div>
  </div>
</template>

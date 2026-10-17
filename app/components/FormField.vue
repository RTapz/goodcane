<script setup lang="ts">
// A visible label, optional hint and inline error wired to the input by id.
const props = defineProps<{ id: string; label: string; hint?: string; error?: string }>()
</script>

<template>
  <div class="space-y-1">
    <label :for="props.id" class="block font-semibold text-stone-900">{{ props.label }}</label>
    <p v-if="props.hint" :id="`${props.id}-hint`" class="text-sm text-stone-700">{{ props.hint }}</p>
    <slot
      :invalid="!!props.error"
      :described-by="[props.hint ? `${props.id}-hint` : '', props.error ? `${props.id}-error` : ''].filter(Boolean).join(' ') || undefined"
    />
    <p v-if="props.error" :id="`${props.id}-error`" class="text-sm font-semibold text-red-700">{{ props.error }}</p>
  </div>
</template>

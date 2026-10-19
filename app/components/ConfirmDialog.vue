<script setup lang="ts">
// The confirmation step before an action that cannot be undone (BR-X1, BR-DP2): says what will
// happen, then one button to go ahead and one to keep things as they are. Shared by O2 and C9.
const props = defineProps<{ title: string; confirmLabel: string; keepLabel: string; busy?: boolean }>()
const emit = defineEmits<{ confirm: []; close: [] }>()
</script>

<template>
  <LazyUModal :open="true" :title="props.title" @update:open="(v: boolean) => { if (!v) emit('close') }">
    <template #body>
      <div class="text-ink"><slot /></div>
      <div class="mt-3 flex flex-wrap gap-2">
        <UButton class="min-h-11" color="error" :label="props.confirmLabel" :loading="props.busy" :disabled="props.busy" @click="emit('confirm')" />
        <UButton class="min-h-11" color="neutral" variant="outline" :label="props.keepLabel" @click="emit('close')" />
      </div>
    </template>
  </LazyUModal>
</template>

<script setup lang="ts">
// The one disclosure (spec constraint 8): a sticky button on every page that says everything is
// demo data. It replaces the old banner and the scattered "Sample" and "Demo" labels.
const open = ref(false)
</script>

<template>
  <div class="pointer-events-none fixed inset-x-0 top-0 z-50 mx-auto flex w-full max-w-md justify-end px-4 pt-3">
    <UButton
      class="pointer-events-auto min-h-11 bg-studio px-4 text-canvas shadow-md hover:bg-ink"
      label="Demo data"
      aria-haspopup="dialog"
      @click="open = true"
    />
  </div>
  <LazyUModal v-if="open" :open="true" title="Everything here is demo data" @update:open="(v: boolean) => { if (!v) open = false }">
    <template #body>
      <ul class="list-disc space-y-1 pl-5 text-ink">
        <li>The drinks, prices, drop dates, pickup point, delivery areas and customers are made up.</li>
        <li>No real orders are placed and no money is taken. Payment is a simulation.</li>
        <li>No messages are sent by this app.</li>
        <li>This is a prototype, not GoodCane's shop.</li>
      </ul>
      <UButton class="mt-4 min-h-11" label="Got it" @click="open = false" />
    </template>
  </LazyUModal>
</template>

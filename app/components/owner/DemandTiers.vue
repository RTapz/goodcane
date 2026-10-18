<script setup lang="ts">
// Paid versus Likely (BR-FC6: always shown separately), as plain divs. Colour is never the
// only cue: each tier has a text label and number, Likely is also hatched, and the bar itself
// is hidden from screen readers because the list beside it says the same thing in words.
const props = defineProps<{ paid: number; likely: number; openRequested: number; capacity: number; spacesLeft: number }>()

const width = (units: number) => `${Math.min(100, (units / Math.max(1, props.capacity)) * 100)}%`
</script>

<template>
  <div>
    <div class="flex h-8 w-full overflow-hidden rounded-full border border-stone-400 bg-white" aria-hidden="true">
      <div class="h-full bg-cane-700" :style="{ width: width(props.paid) }" />
      <div class="tier-likely h-full border-l-2 border-white" :style="{ width: width(props.likely) }" />
    </div>
    <ul class="mt-2 space-y-1 text-stone-900">
      <li class="flex items-center gap-2">
        <span class="inline-block size-4 shrink-0 rounded-sm bg-cane-700" aria-hidden="true" />
        <span><strong>Paid {{ props.paid }}</strong> units (firm)</span>
      </li>
      <li class="flex items-center gap-2">
        <span class="tier-likely inline-block size-4 shrink-0 rounded-sm" aria-hidden="true" />
        <span>
          <strong>Likely {{ props.likely }}</strong> of {{ props.openRequested }} requested, not yet paid
        </span>
      </li>
      <li class="flex items-center gap-2">
        <span class="inline-block size-4 shrink-0 rounded-sm border border-stone-400 bg-white" aria-hidden="true" />
        <span><strong>{{ props.spacesLeft }}</strong> of {{ props.capacity }} spaces left</span>
      </li>
    </ul>
  </div>
</template>

<style scoped>
/* Amber with diagonal stripes, so Likely differs from Paid by pattern as well as colour. */
.tier-likely {
  background: repeating-linear-gradient(135deg, #b45309 0 4px, #f59e0b 4px 8px);
}
</style>

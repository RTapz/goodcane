<script setup lang="ts">
// BR-FC8: how many extra units to make for walk-ins and off-app orders.
type Setting = 'careful' | 'balanced' | 'never_sell_out'
const props = defineProps<{ modelValue: Setting; units: number; lowConfidence: boolean; saving: boolean }>()
const emit = defineEmits<{ 'update:modelValue': [Setting] }>()

const options: { value: Setting; label: string; explain: string }[] = [
  { value: 'careful', label: 'Careful with waste', explain: 'Plan for the quietest of the last 5 drops.' },
  { value: 'balanced', label: 'Balanced', explain: 'Plan for the average of the last 5 drops.' },
  { value: 'never_sell_out', label: 'Never sell out', explain: 'Plan for the busiest of the last 5 drops.' }
]
</script>

<template>
  <fieldset :disabled="props.saving">
    <legend class="font-semibold text-stone-900">Extra for walk-ins and off-app orders</legend>
    <div class="mt-2 space-y-2">
      <label
        v-for="option in options"
        :key="option.value"
        class="flex min-h-11 cursor-pointer items-start gap-3 rounded-2xl border border-stone-300 bg-white p-3"
        :class="props.modelValue === option.value ? 'border-cane-700 ring-1 ring-cane-700' : ''"
      >
        <input
          type="radio"
          name="buffer-setting"
          class="mt-1 size-5 accent-cane-700"
          :value="option.value"
          :checked="props.modelValue === option.value"
          @change="emit('update:modelValue', option.value)"
        >
        <span>
          <span class="block font-semibold">{{ option.label }}</span>
          <span class="block text-sm text-stone-700">{{ option.explain }}</span>
        </span>
      </label>
    </div>
    <p class="mt-2 text-stone-900">
      Buffer: <strong>{{ props.units }} units</strong>
      <span v-if="props.lowConfidence" class="ml-1 rounded-full bg-cream-300 px-2.5 py-0.5 text-sm font-semibold text-cream-950">
        Low confidence: sample default, fewer than 3 finished drops
      </span>
    </p>
  </fieldset>
</template>

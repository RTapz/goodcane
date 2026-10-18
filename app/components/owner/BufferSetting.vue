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
    <legend class="font-semibold text-ink">Extra for walk-ins and off-app orders</legend>
    <div class="mt-2 space-y-2">
      <label
        v-for="option in options"
        :key="option.value"
        class="flex min-h-11 cursor-pointer items-start gap-3 rounded-2xl border border-line bg-panel-raised p-3"
        :class="props.modelValue === option.value ? 'border-sage ring-1 ring-sage' : ''"
      >
        <input
          type="radio"
          name="buffer-setting"
          class="mt-1 size-5 accent-sage"
          :value="option.value"
          :checked="props.modelValue === option.value"
          @change="emit('update:modelValue', option.value)"
        >
        <span>
          <span class="block font-semibold">{{ option.label }}</span>
          <span class="block text-sm text-ink-muted">{{ option.explain }}</span>
        </span>
      </label>
    </div>
    <p class="mt-2 text-ink">
      Buffer: <strong>{{ props.units }} units</strong>
      <span v-if="props.lowConfidence" class="ml-1 rounded-full bg-warn-panel px-2.5 py-0.5 text-sm font-semibold text-amber-200">
        Low confidence: default value, fewer than 3 finished drops
      </span>
    </p>
  </fieldset>
</template>

<script setup lang="ts">
const props = defineProps<{ label: string; quantity: number; canAdd: boolean }>()
const emit = defineEmits<{ change: [quantity: number] }>()
</script>

<template>
  <div class="flex items-center gap-1" role="group" :aria-label="`Quantity of ${props.label}`">
    <UButton
      :aria-label="`Remove one ${props.label}`"
      :disabled="props.quantity === 0"
      color="neutral"
      variant="outline"
      class="size-11 justify-center text-xl"
      @click="emit('change', props.quantity - 1)"
    >
      &minus;
    </UButton>
    <output class="w-8 text-center text-lg font-bold tabular-nums" :aria-label="`${props.quantity} ${props.label}`">
      {{ props.quantity }}
    </output>
    <UButton
      :aria-label="`Add one ${props.label}`"
      :disabled="!props.canAdd"
      color="primary"
      class="size-11 justify-center text-xl"
      @click="emit('change', props.quantity + 1)"
    >
      +
    </UButton>
  </div>
</template>

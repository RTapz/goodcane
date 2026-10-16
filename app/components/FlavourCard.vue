<script setup lang="ts">
import type { MenuItem } from '~~/server/schemas/drops'

const props = defineProps<{
  name: string
  tasteGroup: MenuItem['tasteGroup']
  isSpecial: boolean
  items: MenuItem[]
  highlighted: boolean
  quantityOf: (id: string) => number
  canAddOne: (item: MenuItem) => boolean
}>()
const emit = defineEmits<{ change: [menuItemId: string, quantity: number] }>()

const tasteLabel = { sweet: 'Sweet', spicy: 'Spicy', sour: 'Sour' }
</script>

<template>
  <li
    class="rounded-lg border-l-8 bg-white p-3 shadow-sm"
    :class="props.highlighted ? 'ring-2 ring-cane-600' : ''"
    :style="{ borderLeftColor: flavourColour(props.name) }"
  >
    <div class="flex flex-wrap items-center gap-2">
      <span
        aria-hidden="true"
        class="size-4 shrink-0 rounded-full"
        :style="{ backgroundColor: flavourColour(props.name) }"
      />
      <h3 class="text-lg font-bold text-stone-900">{{ props.name }}</h3>
      <UBadge :label="tasteLabel[props.tasteGroup]" color="primary" variant="subtle" size="sm" />
      <UBadge v-if="props.isSpecial" label="Drop special" color="neutral" variant="subtle" size="sm" />
    </div>
    <ul class="mt-2 space-y-2">
      <li v-for="item in props.items" :key="item.id" class="flex items-center justify-between gap-2">
        <div>
          <p class="font-semibold text-stone-900">{{ item.size }}</p>
          <p class="text-sm text-stone-700">{{ formatPesewas(item.pricePesewas) }} <span class="text-stone-600">Sample price</span></p>
        </div>
        <QuantityStepper
          :label="`${props.name} ${item.size}`"
          :quantity="props.quantityOf(item.id)"
          :can-add="props.canAddOne(item)"
          @change="(q) => emit('change', item.id, q)"
        />
      </li>
    </ul>
  </li>
</template>

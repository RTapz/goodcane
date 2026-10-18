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
  <li class="gc-card flex flex-col p-3" :class="props.highlighted ? 'ring-2 ring-cane-600' : ''">
    <div class="flex flex-col items-center text-center">
      <FlavourTile :colour="flavourColour(props.name)" size="lg" />
      <h3 class="mt-2 font-bold leading-tight text-stone-900">{{ props.name }}</h3>
      <div class="mt-1 flex flex-wrap justify-center gap-1">
        <UBadge :label="tasteLabel[props.tasteGroup]" color="primary" variant="subtle" size="sm" />
        <UBadge v-if="props.isSpecial" label="Drop special" color="neutral" variant="subtle" size="sm" />
      </div>
    </div>
    <ul class="mt-3 space-y-3">
      <li v-for="item in props.items" :key="item.id" class="space-y-1.5">
        <p class="text-center text-sm">
          <span class="font-semibold text-stone-900">{{ item.size }}</span>{{ ' ' }}<span class="text-stone-700">{{ formatPesewas(item.pricePesewas) }}</span>
          <span class="block text-xs text-stone-600">Sample price</span>
        </p>
        <div class="flex justify-center">
          <QuantityStepper
            :label="`${props.name} ${item.size}`"
            :quantity="props.quantityOf(item.id)"
            :can-add="props.canAddOne(item)"
            @change="(q) => emit('change', item.id, q)"
          />
        </div>
      </li>
    </ul>
  </li>
</template>

<script setup lang="ts">
import type { OrderSummary } from '~~/server/services/orders/get-order'

const props = defineProps<{ order: OrderSummary }>()
</script>

<template>
  <section class="gc-card p-4" aria-labelledby="summary-heading">
    <h2 id="summary-heading" class="font-bold text-stone-900">For {{ formatDropDate(props.order.drop.dropAt) }}</h2>
    <ul class="mt-2 space-y-1">
      <li v-for="line in props.order.lines" :key="line.menuItemId" class="flex justify-between gap-2 text-stone-900">
        <span class="flex items-center gap-2">
          <FlavourTile :colour="flavourColour(line.name)" size="sm" />
          <span>{{ line.quantity }} x {{ line.name }} {{ line.size }}</span>
        </span>
        <span>{{ formatPesewas(line.quantity * line.unitPricePesewas) }}</span>
      </li>
      <li v-if="props.order.feePesewas > 0" class="flex justify-between gap-2 text-stone-700">
        <span>Delivery fee (sample)</span>
        <span>{{ formatPesewas(props.order.feePesewas) }}</span>
      </li>
    </ul>
    <p class="mt-2 flex justify-between border-t border-stone-200 pt-2 text-lg font-bold text-stone-900">
      <span>Total</span>
      <span>{{ formatPesewas(props.order.totalPesewas) }}</span>
    </p>
  </section>
</template>

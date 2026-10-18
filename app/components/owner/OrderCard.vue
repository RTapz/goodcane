<script setup lang="ts">
// One order on O2. Status in words and colour; refund flags in words (BR-O2, BR-O4).
import type { OwnerOrderView } from '~~/server/services/owner/orders'

const props = defineProps<{ order: OwnerOrderView; busy: boolean }>()
const emit = defineEmits<{ fulfil: []; cancel: [] }>()

const statusText: Record<OwnerOrderView['status'], string> = {
  requested: 'Requested, not paid',
  lapsed: 'Lapsed: not paid in time',
  paid_confirmed: 'Paid and confirmed',
  fulfilled: 'Fulfilled',
  cancelled: 'Cancelled',
  expired: 'Expired'
}
const statusClass: Record<OwnerOrderView['status'], string> = {
  requested: 'bg-amber-100 text-amber-950',
  lapsed: 'bg-stone-200 text-stone-900',
  paid_confirmed: 'bg-cane-100 text-cane-950',
  fulfilled: 'bg-cane-700 text-white',
  cancelled: 'bg-red-100 text-red-950',
  expired: 'bg-stone-200 text-stone-900'
}
const sizeLabel: Record<string, string> = { '330ml': '330ml', '500ml': '500ml', '2l': '2L', '4l': '4L' }
</script>

<template>
  <li class="rounded-lg border border-stone-300 bg-white p-3">
    <div class="flex flex-wrap items-start justify-between gap-2">
      <div class="min-w-0">
        <p class="font-semibold">{{ props.order.firstName ?? 'Removed customer' }}</p>
        <p class="text-sm text-stone-700">{{ props.order.maskedPhone ?? 'No phone kept' }}</p>
      </div>
      <span class="rounded px-2 py-0.5 text-sm font-semibold" :class="statusClass[props.order.status]">
        {{ statusText[props.order.status] }}
      </span>
    </div>
    <ul class="mt-2 text-sm">
      <li v-for="line in props.order.lines" :key="`${line.name}-${line.size}`">
        {{ line.quantity }} x {{ line.name }}, {{ sizeLabel[line.size] ?? line.size }}
      </li>
    </ul>
    <p class="mt-1 text-sm text-stone-700">
      {{ formatShortDate(props.order.dropAt) }} drop, {{ props.order.fulfilment === 'delivery' ? `delivery to ${props.order.area}` : 'pickup' }},
      {{ formatPesewas(props.order.totalPesewas) }}{{ props.order.isSample ? ', Sample' : '' }}
    </p>
    <p v-if="props.order.refundDue" class="mt-2 rounded bg-red-50 px-2 py-1 text-sm font-semibold text-red-900">
      Refund due (demo: no real money moves)
    </p>
    <p v-if="props.order.unconfirmedPaymentRefundDue" class="mt-2 rounded bg-red-50 px-2 py-1 text-sm font-semibold text-red-900">
      Payment received, not confirmed, refund due
    </p>
    <div v-if="props.order.status === 'paid_confirmed' || props.order.status === 'requested'" class="mt-3 flex flex-wrap gap-2">
      <UButton
        v-if="props.order.status === 'paid_confirmed'"
        class="min-h-11"
        label="Mark fulfilled"
        :disabled="props.busy"
        @click="emit('fulfil')"
      />
      <UButton class="min-h-11" color="neutral" variant="outline" label="Cancel order" :disabled="props.busy" @click="emit('cancel')" />
    </div>
  </li>
</template>

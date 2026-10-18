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
  requested: 'bg-warn-panel text-amber-200',
  lapsed: 'bg-panel-raised text-ink-muted',
  paid_confirmed: 'bg-mint-panel text-sage',
  fulfilled: 'bg-sage text-canvas',
  cancelled: 'bg-danger-panel text-danger',
  expired: 'bg-panel-raised text-ink-muted'
}
const sizeLabel: Record<string, string> = { '330ml': '330ml', '500ml': '500ml', '2l': '2L', '4l': '4L' }
</script>

<template>
  <li class="gc-card p-3">
    <div class="flex flex-wrap items-start justify-between gap-2">
      <div class="min-w-0">
        <p class="font-semibold">{{ props.order.firstName ?? 'Removed customer' }}</p>
        <p class="text-sm text-ink-muted">{{ props.order.maskedPhone ?? 'No phone kept' }}</p>
      </div>
      <span class="rounded-full px-2.5 py-0.5 text-sm font-semibold" :class="statusClass[props.order.status]">
        {{ statusText[props.order.status] }}
      </span>
    </div>
    <ul class="mt-2 text-sm">
      <li v-for="line in props.order.lines" :key="`${line.name}-${line.size}`">
        {{ line.quantity }} x {{ line.name }}, {{ sizeLabel[line.size] ?? line.size }}
      </li>
    </ul>
    <p class="mt-1 text-sm text-ink-muted">
      {{ formatShortDate(props.order.dropAt) }} drop, {{ props.order.fulfilment === 'delivery' ? `delivery to ${props.order.area}` : 'pickup' }},
      {{ formatPesewas(props.order.totalPesewas) }}
    </p>
    <p v-if="props.order.refundDue" class="mt-2 rounded-xl bg-danger-panel px-3 py-1.5 text-sm font-semibold text-danger">
      Refund due
    </p>
    <p v-if="props.order.unconfirmedPaymentRefundDue" class="mt-2 rounded-xl bg-danger-panel px-3 py-1.5 text-sm font-semibold text-danger">
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

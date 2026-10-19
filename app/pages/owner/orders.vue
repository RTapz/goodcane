<script setup lang="ts">
// O2 "Orders": filter by drop and status, mark fulfilled, cancel with a confirm dialog (BR-X1).
import type { OwnerOrderView } from '~~/server/services/owner/orders'

definePageMeta({ middleware: 'owner' })
useHead({ title: 'Orders (owner) | GoodCane Drops' })

const { data: dropList } = await useFetch<{ defaultDropId: string | null; drops: { id: string; dropAt: string; closed: boolean; isSample: boolean }[] }>(
  '/api/owner/drops',
  { key: 'owner-drops' }
)

const dropFilter = ref<string>(dropList.value?.defaultDropId ?? '')
const statusFilter = ref<string>('')
const query = computed(() => ({
  ...(dropFilter.value ? { drop: dropFilter.value } : {}),
  ...(statusFilter.value ? { status: statusFilter.value } : {})
}))
const { data, status, refresh } = await useFetch<{ orders: OwnerOrderView[] }>('/api/owner/orders', { key: 'owner-orders', query })

const statuses = [
  { value: '', label: 'All' },
  { value: 'requested', label: 'Requested, not paid' },
  { value: 'lapsed', label: 'Lapsed' },
  { value: 'paid_confirmed', label: 'Paid and confirmed' },
  { value: 'fulfilled', label: 'Fulfilled' },
  { value: 'cancelled', label: 'Cancelled' },
  { value: 'expired', label: 'Expired' }
]

const busyId = ref<string | null>(null)
const notice = ref('')
const toCancel = ref<OwnerOrderView | null>(null)

async function act(order: OwnerOrderView, action: 'fulfil' | 'cancel') {
  busyId.value = order.id
  notice.value = ''
  try {
    await $fetch(`/api/owner/orders/${order.id}/${action}`, { method: 'POST', body: action === 'cancel' ? { confirm: true } : {} })
    notice.value = action === 'fulfil' ? 'Marked as fulfilled.' : order.status === 'paid_confirmed' ? 'Cancelled. Refund due is set.' : 'Cancelled.'
  } catch {
    notice.value = "That didn't work: the order may have changed. The list has been refreshed."
  } finally {
    busyId.value = null
    toCancel.value = null
    await refresh()
  }
}
</script>

<template>
  <div>
    <OwnerNav />
    <h1 class="text-2xl">Orders</h1>

    <div class="mt-3 grid grid-cols-1 gap-3">
      <div>
        <label for="drop-filter" class="block font-semibold">Drop</label>
        <select id="drop-filter" v-model="dropFilter" class="mt-1 min-h-11 w-full rounded-xl border border-line-strong bg-panel-raised px-3">
          <option value="">All drops</option>
          <option v-for="d in dropList?.drops ?? []" :key="d.id" :value="d.id">
            {{ formatDropDate(d.dropAt) }} ({{ d.closed ? 'closed' : 'open' }})
          </option>
        </select>
      </div>
      <div>
        <label for="status-filter" class="block font-semibold">Status</label>
        <select id="status-filter" v-model="statusFilter" class="mt-1 min-h-11 w-full rounded-xl border border-line-strong bg-panel-raised px-3">
          <option v-for="s in statuses" :key="s.value" :value="s.value">{{ s.label }}</option>
        </select>
      </div>
    </div>

    <p v-if="notice" role="status" class="mt-3 rounded-xl bg-mint-panel p-3 font-semibold text-sage">{{ notice }}</p>

    <StateLoading v-if="status === 'pending' && !data" class="mt-4" />
    <StateError v-else-if="status === 'error'" class="mt-4" message="We couldn't load the orders." @retry="refresh()" />
    <p v-else-if="!data?.orders.length" class="mt-4 gc-card p-4">No orders match these filters.</p>
    <template v-else>
      <p class="mt-3 text-sm text-ink-muted">{{ plural(data.orders.length, 'order', 'orders') }}, newest first</p>
      <ul class="mt-2 space-y-3">
        <OwnerOrderCard
          v-for="order in data.orders"
          :key="order.id"
          :order="order"
          :busy="busyId === order.id"
          @fulfil="act(order, 'fulfil')"
          @cancel="toCancel = order"
        />
      </ul>
    </template>

    <ConfirmDialog
      v-if="toCancel"
      title="Cancel this order?"
      confirm-label="Yes, cancel the order"
      keep-label="Keep it"
      :busy="busyId === toCancel.id"
      @confirm="act(toCancel!, 'cancel')"
      @close="toCancel = null"
    >
      <p>
        {{ toCancel.firstName ?? 'This customer' }}'s order will be cancelled and its units freed for others.
        <template v-if="toCancel.status === 'paid_confirmed'">It was paid, so <strong>refund due</strong> will be set.</template>
      </p>
    </ConfirmDialog>
  </div>
</template>

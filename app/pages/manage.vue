<script setup lang="ts">
// C9 "Manage": only through this browser's session, which a private link creates (BR-L7). Never
// by phone number. Order history, reminder settings (with Resubscribe, BR-R8) and
// "Delete my data now" (BR-DP2). Cancelling an order and stopping reminders never share a button (BR-X2).
import type { MyOrder } from '~~/server/services/my-orders'

useHead({ title: 'Manage | GoodCane Drops' })

const { me, ready, refresh: refreshMe } = useMe()
await ready
const { data: history, refresh: refreshOrders } = await useFetch<{ orders: MyOrder[] }>('/api/me/orders', {
  key: 'my-orders',
  immediate: !!me.value
})

const statusText: Record<MyOrder['status'], string> = {
  requested: 'Requested, not paid',
  lapsed: 'Not paid in time',
  paid_confirmed: 'Paid and confirmed',
  fulfilled: 'Collected or delivered',
  cancelled: 'Cancelled',
  expired: 'Not paid in time'
}

// Cancel this order (BR-X1): the same confirmation step as the owner's.
const toCancel = ref<MyOrder | null>(null)
const cancelling = ref(false)
const cancelNotice = ref<string | null>(null)

async function cancelOrder() {
  const order = toCancel.value
  if (!order) return
  cancelling.value = true
  cancelNotice.value = null
  try {
    const result = await $fetch<{ refundDue: boolean }>(`/api/orders/${order.id}/cancel`, { method: 'POST', body: { confirm: true } })
    cancelNotice.value = result.refundDue ? 'Cancelled. GoodCane will refund you (no money moves in the demo).' : 'Cancelled.'
  } catch {
    cancelNotice.value = "We couldn't cancel it: it may have changed or passed its cut-off. Your orders have been refreshed."
  } finally {
    cancelling.value = false
    toCancel.value = null
    await refreshOrders()
  }
}

// Delete my data now: warn (do not block) if a paid order is still to come.
const confirmingDelete = ref(false)
const deleting = ref(false)
const deleted = ref(false)
const deleteError = ref<string | null>(null)
const upcomingPaid = computed(() =>
  (history.value?.orders ?? []).filter((o) => o.status === 'paid_confirmed' && Date.parse(o.dropAt) > Date.now())
)

async function deleteMyData() {
  deleting.value = true
  deleteError.value = null
  try {
    await $fetch('/api/me/delete', { method: 'POST', body: { confirm: true } })
    deleted.value = true
    confirmingDelete.value = false
    await refreshMe()
  } catch {
    deleteError.value = "We couldn't delete your details. Try again."
  } finally {
    deleting.value = false
  }
}
</script>

<template>
  <div class="space-y-4 pb-8">
    <h1 class="text-2xl text-ink">Manage</h1>

    <section v-if="deleted" role="status" class="space-y-2 gc-card p-4">
      <h2 class="text-ink">Your details are deleted</h2>
      <p class="text-ink">
        Your name, phone, addresses and private links are gone, and reminders are off. Your past orders stay in GoodCane's numbers
        without your name or phone. Your private link no longer works.
      </p>
      <UButton to="/" class="min-h-11" label="Back to this drop" />
    </section>

    <template v-else-if="!me">
      <section class="space-y-2 gc-card p-4">
        <h2 class="text-ink">Open your private link to manage your orders</h2>
        <p class="text-ink-muted">
          Your orders are only shown through your private link or on the phone you ordered from, never by phone number.
        </p>
      </section>
      <LostLinkHelp />
    </template>

    <template v-else>
      <section class="gc-card p-4" aria-labelledby="who-heading">
        <h2 id="who-heading" class="text-ink">{{ me.firstName }}</h2>
        <p class="text-ink-muted">Phone {{ me.phoneMasked }}</p>
      </section>

      <section class="space-y-2" aria-labelledby="orders-heading">
        <h2 id="orders-heading" class="text-ink">Your orders</h2>
        <p v-if="!history?.orders.length" class="gc-card p-4 text-ink-muted">No orders yet.</p>
        <ul v-else class="space-y-3">
          <li v-for="order in history.orders" :key="order.id" class="gc-card p-3">
            <div class="flex flex-wrap items-start justify-between gap-2">
              <p class="font-semibold text-ink">{{ formatDropDate(order.dropAt) }}</p>
              <span class="rounded-full bg-panel-raised px-2.5 py-0.5 text-sm font-semibold text-ink">{{ statusText[order.status] }}</span>
            </div>
            <ul class="mt-1 text-sm text-ink">
              <li v-for="line in order.lines" :key="`${line.name}-${line.size}`">{{ line.quantity }} x {{ line.name }}, {{ line.size }}</li>
            </ul>
            <p class="mt-1 text-sm text-ink-muted">
              {{ order.fulfilment === 'delivery' ? 'Delivery' : 'Pickup' }}, {{ formatPesewas(order.totalPesewas) }}
            </p>
            <p v-if="order.refundDue" class="mt-1 text-sm font-semibold text-ink">A refund is due (no money moves in the demo).</p>
            <UButton
              v-if="order.canCancel"
              class="mt-2 min-h-11"
              color="neutral"
              variant="outline"
              label="Cancel this order"
              @click="toCancel = order"
            />
          </li>
        </ul>
        <p v-if="cancelNotice" role="status" class="rounded-xl bg-mint-panel p-3 font-semibold text-sage">{{ cancelNotice }}</p>
      </section>

      <ReminderOptIn source="c9" compact />

      <section class="space-y-2 gc-card p-4" aria-labelledby="delete-heading">
        <h2 id="delete-heading" class="text-ink">Delete my data now</h2>
        <p class="text-ink-muted">
          Deletes your name, phone, addresses and private links straight away. Your past orders stay in GoodCane's numbers without
          your name or phone.
        </p>
        <UButton class="min-h-11" color="error" variant="outline" label="Delete my data now" @click="confirmingDelete = true" />
        <p v-if="deleteError" role="alert" class="text-sm font-semibold text-danger">{{ deleteError }}</p>
      </section>
    </template>

    <ConfirmDialog
      v-if="toCancel"
      title="Cancel this order?"
      confirm-label="Yes, cancel the order"
      keep-label="Keep it"
      :busy="cancelling"
      @confirm="cancelOrder"
      @close="toCancel = null"
    >
      <p>
        Your order for {{ formatDropDate(toCancel.dropAt) }} will be cancelled and its bottles freed for others.
        <template v-if="toCancel.status === 'paid_confirmed'">It was paid, so GoodCane will owe you a <strong>refund</strong>.</template>
      </p>
    </ConfirmDialog>

    <ConfirmDialog
      v-if="confirmingDelete"
      title="Delete your details?"
      confirm-label="Yes, delete my details"
      keep-label="Keep my details"
      :busy="deleting"
      @confirm="deleteMyData"
      @close="confirmingDelete = false"
    >
      <p>Your name, phone, addresses and private links will be deleted. This cannot be undone.</p>
      <p v-if="upcomingPaid.length" class="mt-2 rounded-xl bg-warn-panel p-3">
        You have a paid order for {{ formatDropDate(upcomingPaid[0]!.dropAt) }}. It stays booked, but GoodCane will no longer
        have your name or phone to hand it over, so bring your order details with you.
      </p>
    </ConfirmDialog>
  </div>
</template>

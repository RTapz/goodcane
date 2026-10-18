<script setup lang="ts">
// C5 Simulated payment (BR-P1 to BR-P5). Nothing here talks to a real payment provider.
import type { FetchError } from 'ofetch'
import type { SimulatePaymentResponse } from '~~/server/schemas/payments'
import type { OrderSummary } from '~~/server/services/orders/get-order'

type Phase =
  | 'starting'
  | 'holding'
  | 'expired'
  | 'no_space'
  | 'closed'
  | 'not_payable'
  | 'not_confirmed'
  | 'not_found'
  | 'error'

const route = useRoute()
const id = computed(() => String(route.params.id))
const {
  data: order,
  error: orderError,
  refresh: refreshOrder
} = await useFetch<OrderSummary>(() => `/api/orders/${id.value}`, { key: `order-${id.value}` })

const isPaid = () => order.value?.status === 'paid_confirmed' || order.value?.status === 'fulfilled'
const freshLink = useFreshLink()
const rebuild = useRebuildOrder()

const phase = ref<Phase>('starting')
const hold = ref<{ holdExpiresAt: string; serverNow: string } | null>(null)
const spacesLeft = ref<number | null>(null)
const pending = ref(false)
const attemptMessage = ref<string | null>(null)
const notConfirmedReason = ref<string | null>(null)

async function startHold() {
  phase.value = 'starting'
  attemptMessage.value = null
  try {
    hold.value = await $fetch<{ holdExpiresAt: string; serverNow: string }>(`/api/orders/${id.value}/pay-start`, {
      method: 'POST'
    })
    phase.value = 'holding'
  } catch (error) {
    const e = error as FetchError<{ data?: { reason?: string; spacesLeft?: number } }>
    const reason = e.data?.data?.reason
    if (e.statusCode === 404) phase.value = 'not_found'
    else if (reason === 'not_enough_space') {
      spacesLeft.value = e.data?.data?.spacesLeft ?? 0
      phase.value = 'no_space'
    } else if (reason === 'drop_closed') phase.value = 'closed'
    else if (reason === 'not_payable') {
      // It may already be paid (for example in another tab): show the confirmation, not a dead end.
      await refreshOrder()
      if (isPaid()) await navigateTo(`/confirmed/${id.value}`, { replace: true })
      else phase.value = 'not_payable'
    } else phase.value = 'error'
  }
}

onMounted(() => {
  if (isPaid()) {
    navigateTo(`/confirmed/${id.value}`, { replace: true })
  } else if (orderError.value?.statusCode === 404) {
    phase.value = 'not_found'
  } else {
    startHold()
  }
})

async function simulate(outcome: 'success' | 'failed' | 'no_response') {
  if (pending.value) return
  pending.value = true
  attemptMessage.value = null
  // A new reference for every attempt (BR-P3); a double tap is stopped by `pending`.
  const reference = `DEMO-${newIdempotencyKey()}`
  try {
    const result = await $fetch<SimulatePaymentResponse>('/api/payments/simulate', {
      method: 'POST',
      body: { orderId: id.value, reference, outcome }
    })
    if (result.result === 'confirmed') {
      // Store the link, refresh the shared cached order, then go to C6 (order tested in payment-flow).
      await completeSuccessfulPayment({
        orderId: id.value,
        result,
        storeLink: (link) => {
          freshLink.value = link
        },
        refreshOrder,
        navigate: async (path) => {
          await navigateTo(path)
        }
      })
    } else if (result.result === 'hold_kept') {
      attemptMessage.value =
        outcome === 'failed'
          ? 'Payment failed (simulated). Your spaces are still held, so you can try again.'
          : 'No response from the payment provider (simulated). Your spaces are still held, so you can try again.'
    } else {
      notConfirmedReason.value = result.reason
      phase.value = 'not_confirmed'
    }
  } catch {
    attemptMessage.value = "We couldn't reach the payment service. Your spaces are still held. Try again."
  } finally {
    pending.value = false
  }
}
</script>

<template>
  <div class="space-y-4 pb-8">
    <h1 class="text-2xl text-ink">Payment</h1>

    <div v-if="phase === 'not_found'" class="gc-card p-4">
      <h2 class="text-xl text-ink">We can't find this order on this device</h2>
      <p class="mt-1 text-ink-muted">Orders can only be paid on the phone or browser that placed them.</p>
      <UButton to="/" class="mt-3 min-h-11" label="Back to this drop" />
    </div>

    <template v-else-if="order">
      <OrderSummaryCard :order="order" />

      <StateLoading v-if="phase === 'starting'" />

      <section v-else-if="phase === 'holding' && hold" class="gc-card space-y-3 p-4" aria-label="Payment">
        <HoldCountdown :hold-expires-at="hold.holdExpiresAt" :server-now="hold.serverNow" @expired="phase = 'expired'" />
        <p class="text-ink">
          This is a simulation. Choose what the payment provider would answer. No money is taken.
        </p>
        <div class="grid gap-2">
          <UButton block size="xl" class="min-h-12" :disabled="pending" label="Simulate success" @click="simulate('success')" />
          <UButton
            block
            size="xl"
            color="neutral"
            variant="outline"
            class="min-h-12"
            :disabled="pending"
            label="Simulate failed"
            @click="simulate('failed')"
          />
          <UButton
            block
            size="xl"
            color="neutral"
            variant="outline"
            class="min-h-12"
            :disabled="pending"
            label="Simulate no response"
            @click="simulate('no_response')"
          />
        </div>
        <p v-if="attemptMessage" role="alert" class="rounded-2xl border border-amber-400 bg-panel-raised p-3 font-semibold text-ink">
          {{ attemptMessage }}
        </p>
      </section>

      <section v-else-if="phase === 'expired'" role="status" class="space-y-3 gc-card p-4">
        <h2 class="text-xl text-ink">Your hold has expired</h2>
        <p class="text-ink-muted">Your spaces were released. You can check if they are still free, or change your order.</p>
        <div class="grid gap-2">
          <UButton block size="xl" class="min-h-12" label="Refresh availability" @click="startHold" />
          <UButton block size="xl" color="neutral" variant="outline" class="min-h-12" label="Rebuild my order" @click="rebuild(order)" />
        </div>
      </section>

      <section v-else-if="phase === 'no_space'" role="status" class="space-y-3 gc-card p-4">
        <h2 class="text-xl text-ink">Not enough space left</h2>
        <p class="text-ink-muted">
          Only {{ plural(spacesLeft ?? 0, 'space is', 'spaces are') }} left in this drop, so nothing has been held.
          Your order has not moved to another drop.
        </p>
        <div class="grid gap-2">
          <UButton block size="xl" class="min-h-12" label="Rebuild my order" @click="rebuild(order)" />
          <UButton block size="xl" color="neutral" variant="outline" class="min-h-12" to="/" label="Back to this drop" />
        </div>
      </section>

      <section v-else-if="phase === 'not_confirmed'" role="alert" class="space-y-3 gc-card p-4">
        <h2 class="text-xl text-ink">Payment not confirmed</h2>
        <p class="text-ink">
          Your payment could not be confirmed and no order was made. In a live service this would be refunded.
        </p>
        <p class="text-sm text-ink-muted">
          {{
            notConfirmedReason === 'drop_closed'
              ? 'Orders for this drop closed before the payment arrived.'
              : notConfirmedReason === 'not_enough_space'
                ? 'The drop filled up before the payment arrived.'
                : 'This order can no longer be paid.'
          }}
        </p>
        <div class="grid gap-2">
          <UButton block size="xl" class="min-h-12" label="Rebuild my order" @click="rebuild(order)" />
          <UButton block size="xl" color="neutral" variant="outline" class="min-h-12" to="/" label="Back to this drop" />
        </div>
      </section>

      <section v-else-if="phase === 'closed' || phase === 'not_payable'" role="status" class="space-y-3 gc-card p-4">
        <h2 class="text-xl text-ink">
          {{ phase === 'closed' ? 'Orders for this drop have closed' : 'This order can no longer be paid' }}
        </h2>
        <p class="text-ink-muted">Nothing has been charged. You can reserve for the next drop.</p>
        <UButton block size="xl" class="min-h-12" to="/" label="See the next drop" />
      </section>

      <StateError v-else-if="phase === 'error'" message="We couldn't hold your spaces." @retry="startHold" />
    </template>

    <StateError v-else-if="orderError" message="We couldn't load your order." @retry="startHold" />
    <StateLoading v-else />
  </div>
</template>

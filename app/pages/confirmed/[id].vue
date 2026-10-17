<script setup lang="ts">
// C6 Batch card (confirmation). Reminder opt-in comes in the next slice.
import type { NewLinkResponse } from '~~/server/schemas/payments'
import type { OrderSummary } from '~~/server/services/orders/get-order'

const route = useRoute()
const id = computed(() => String(route.params.id))
const { data: order, status, error, refresh } = await useFetch<OrderSummary>(() => `/api/orders/${id.value}`, {
  key: `order-${id.value}`
})
const freshLink = useFreshLink()
const { clear } = useCart()

const paid = computed(() => order.value?.status === 'paid_confirmed' || order.value?.status === 'fulfilled')
const link = computed(() => (freshLink.value?.orderId === id.value ? freshLink.value : null))
const makingLink = ref(false)
const linkError = ref<string | null>(null)

onMounted(async () => {
  if (!order.value) return
  // Never send someone back to pay on the strength of a cached copy (tested in payment-flow).
  if (await shouldReturnToPay({ isPaid: () => paid.value, refresh })) {
    navigateTo(`/pay/${id.value}`, { replace: true })
  } else {
    // The order is placed: the cart for it is done.
    clear()
  }
})

/** BR-L10: a new private link, revoking the old one. Shown once, like the first. */
async function makeNewLink() {
  makingLink.value = true
  linkError.value = null
  try {
    const result = await $fetch<NewLinkResponse>('/api/me/link', { method: 'POST' })
    freshLink.value = { orderId: id.value, ...result }
  } catch {
    linkError.value = "We couldn't make a new link. Try again."
  } finally {
    makingLink.value = false
  }
}
</script>

<template>
  <div class="space-y-4 pb-8">
    <StateLoading v-if="status === 'pending' && !order" />

    <div v-else-if="error?.statusCode === 404" class="rounded-lg bg-white p-4 shadow-sm">
      <h1 class="text-xl font-bold text-stone-900">We can't find this order on this device</h1>
      <p class="mt-1 text-stone-700">Open your private link on this phone to see your orders.</p>
      <UButton to="/" class="mt-3 min-h-11" label="Back to this drop" />
    </div>

    <StateError v-else-if="error" message="We couldn't load your order." @retry="refresh()" />

    <template v-else-if="order && paid">
      <header class="rounded-lg bg-cane-700 p-4 text-white">
        <h1 class="text-2xl font-extrabold">Paid and confirmed</h1>
        <p class="mt-1">Your bottles are reserved for {{ formatDropDate(order.drop.dropAt) }}. Demo: no real money was taken.</p>
      </header>

      <section class="rounded-lg bg-white p-4 shadow-sm" aria-labelledby="handover-heading">
        <h2 id="handover-heading" class="font-bold text-stone-900">{{ order.fulfilment === 'delivery' ? 'Delivery' : 'Pickup' }}</h2>
        <p v-if="order.fulfilment === 'delivery'" class="mt-1 text-stone-800">{{ order.address }}, {{ order.area }}</p>
        <p v-else class="mt-1 text-stone-800">Sample location, Accra (Demo), on {{ formatDropDate(order.drop.dropAt) }}</p>
        <p class="mt-1 text-stone-800">{{ order.firstName }}, {{ order.phoneMasked }}</p>
      </section>

      <OrderSummaryCard :order="order" />

      <PrivateLinkCard v-if="link" :private-link="link.privateLink" :whatsapp-url="link.whatsappUrl" />
      <section v-else class="space-y-2 rounded-lg bg-white p-4 shadow-sm" aria-labelledby="link-again-heading">
        <h2 id="link-again-heading" class="font-bold text-stone-900">Your private link</h2>
        <p class="text-stone-700">
          Your private link was shown once, when you paid. Lost it? Make a new one. Your old link will stop working.
        </p>
        <UButton class="min-h-11" :loading="makingLink" :disabled="makingLink" label="Make a new link" @click="makeNewLink" />
        <p v-if="linkError" role="alert" class="text-sm font-semibold text-red-700">{{ linkError }}</p>
      </section>

      <UButton to="/" block size="xl" color="neutral" variant="outline" class="min-h-12" label="Back to this drop" />
    </template>

    <StateLoading v-else />
  </div>
</template>

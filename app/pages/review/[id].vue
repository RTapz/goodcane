<script setup lang="ts">
// C4 Review and pay. No hold yet: spaces are held only once Pay is tapped (C5 slice, BR-O1).
import type { OrderSummary } from '~~/server/services/orders/get-order'

const route = useRoute()
const id = computed(() => String(route.params.id))
const { data: order, status, error, refresh } = await useFetch<OrderSummary>(() => `/api/orders/${id.value}`, {
  key: `order-${id.value}`
})
const { data: next, refresh: refreshSpaces } = await useNextDrop()
const { attachToDrop, setQuantity, clear } = useCart()

// Live spaces left for this order's drop: refreshed every 30 seconds and when the tab regains focus.
let timer: ReturnType<typeof setInterval> | undefined
const onFocus = () => refreshSpaces()
onMounted(() => {
  timer = setInterval(() => refreshSpaces(), 30_000)
  window.addEventListener('focus', onFocus)
})
onBeforeUnmount(() => {
  clearInterval(timer)
  window.removeEventListener('focus', onFocus)
})

const spacesLeft = computed(() => {
  const dropId = order.value?.drop.id
  const candidates = [next.value?.drop, next.value?.nextDrop]
  return candidates.find((d) => d?.id === dropId)?.spacesLeft ?? null
})
const units = computed(() => order.value?.lines.reduce((sum, l) => sum + l.quantity, 0) ?? 0)
const notFound = computed(() => error.value?.statusCode === 404)
const inactive = computed(() => !!order.value && (order.value.lapsed || order.value.status === 'expired'))

/** Puts this order's items back in the cart and returns to C2 (no dead end). */
async function rebuild() {
  if (!order.value) return
  attachToDrop(order.value.drop.id)
  clear()
  for (const line of order.value.lines) setQuantity(line.menuItemId, line.quantity)
  await navigateTo('/order')
}
</script>

<template>
  <div class="space-y-4 pb-28">
    <h1 class="text-2xl font-extrabold text-stone-900">Review and pay</h1>

    <StateLoading v-if="status === 'pending' && !order" />

    <div v-else-if="notFound" class="rounded-lg bg-white p-4 shadow-sm">
      <h2 class="text-xl font-bold text-stone-900">We can't find this order on this device</h2>
      <p class="mt-1 text-stone-700">Orders can only be opened on the phone or browser that placed them.</p>
      <UButton to="/" class="mt-3 min-h-11" label="Back to this drop" />
    </div>

    <StateError v-else-if="status === 'error'" message="We couldn't load your order." @retry="refresh()" />

    <template v-else-if="order">
      <div v-if="inactive" role="status" class="rounded-lg bg-white p-4 shadow-sm">
        <h2 class="text-xl font-bold text-stone-900">This request has lapsed</h2>
        <p class="mt-1 text-stone-700">It was not paid in time, so nothing is reserved. Your items are kept so you can start again.</p>
        <UButton class="mt-3 min-h-11" label="Rebuild my order" @click="rebuild" />
      </div>

      <div v-else-if="order.drop.closed" role="status" class="rounded-lg bg-white p-4 shadow-sm">
        <h2 class="text-xl font-bold text-stone-900">Orders for {{ formatDropDate(order.drop.dropAt) }} have closed</h2>
        <p class="mt-1 text-stone-700">This order was not paid before the cut-off. You can reserve for the next drop.</p>
        <UButton to="/" class="mt-3 min-h-11" label="See the next drop" />
      </div>

      <section class="rounded-lg bg-white p-4 shadow-sm" aria-labelledby="summary-heading">
        <h2 id="summary-heading" class="font-bold text-stone-900">For {{ formatDropDate(order.drop.dropAt) }}</h2>
        <ul class="mt-2 space-y-1">
          <li v-for="line in order.lines" :key="line.menuItemId" class="flex justify-between gap-2 text-stone-900">
            <span class="flex items-center gap-2">
              <span aria-hidden="true" class="size-3 shrink-0 rounded-full" :style="{ backgroundColor: flavourColour(line.name) }" />
              <span>{{ line.quantity }} x {{ line.name }} {{ line.size }}</span>
            </span>
            <span>{{ formatPesewas(line.quantity * line.unitPricePesewas) }}</span>
          </li>
          <li v-if="order.feePesewas > 0" class="flex justify-between gap-2 text-stone-700">
            <span>Delivery fee (sample)</span>
            <span>{{ formatPesewas(order.feePesewas) }}</span>
          </li>
        </ul>
        <p class="mt-2 flex justify-between border-t border-stone-200 pt-2 text-lg font-bold text-stone-900">
          <span>Total</span>
          <span>{{ formatPesewas(order.totalPesewas) }}</span>
        </p>
      </section>

      <section class="rounded-lg bg-white p-4 shadow-sm" aria-labelledby="details-heading">
        <h2 id="details-heading" class="font-bold text-stone-900">{{ order.fulfilment === 'delivery' ? 'Delivery' : 'Pickup' }}</h2>
        <p v-if="order.fulfilment === 'delivery'" class="mt-1 text-stone-800">{{ order.address }}, {{ order.area }}</p>
        <p v-else class="mt-1 text-stone-800">Sample location, Accra (Demo), on drop day</p>
        <p class="mt-1 text-stone-800">{{ order.firstName }}, {{ order.phoneMasked }}</p>
        <NuxtLink to="/details" class="mt-1 inline-flex min-h-11 items-center font-semibold text-cane-700 underline">Change details</NuxtLink>
      </section>

      <template v-if="!inactive && !order.drop.closed">
        <section class="space-y-1 rounded-lg bg-cream-200 p-4" aria-label="About payment">
          <p class="font-bold text-stone-900">Demo payment: no real money is taken</p>
          <p class="text-stone-800">Spaces are held for {{ order.holdMinutes }} minutes once you tap Pay.</p>
          <p class="text-stone-800" aria-live="polite">
            {{ spacesLeft === null ? '' : `${plural(spacesLeft, 'space', 'spaces')} left in this drop right now. Your order needs ${units}.` }}
          </p>
        </section>

        <StickyActionBar>
          <div>
            <p class="font-bold text-stone-900">{{ formatPesewas(order.totalPesewas) }}</p>
            <p class="text-sm text-stone-700">Demo payment</p>
          </div>
          <UButton :to="{ path: '/pay', query: { order: order.id } }" size="xl" class="min-h-12 px-8" label="Pay" />
        </StickyActionBar>
      </template>
    </template>
  </div>
</template>

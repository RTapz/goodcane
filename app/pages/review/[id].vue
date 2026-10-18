<script setup lang="ts">
// C4 Review and pay. No hold yet: spaces are held only once Pay is tapped (C5, BR-O1).
import type { OrderSummary } from '~~/server/services/orders/get-order'

const route = useRoute()
const id = computed(() => String(route.params.id))
const { data: order, status, error, refresh } = await useFetch<OrderSummary>(() => `/api/orders/${id.value}`, {
  key: `order-${id.value}`
})
const { data: next, refresh: refreshSpaces } = await useNextDrop()
const rebuildOrder = useRebuildOrder()

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

const paid = computed(() => order.value?.status === 'paid_confirmed' || order.value?.status === 'fulfilled')

/** Puts this order's items back in the cart and returns to C2 (no dead end). */
async function rebuild() {
  if (order.value) await rebuildOrder(order.value)
}
</script>

<template>
  <div class="space-y-4 pb-28">
    <h1 class="text-2xl text-ink">Review and pay</h1>

    <StateLoading v-if="status === 'pending' && !order" />

    <div v-else-if="notFound" class="gc-card p-4">
      <h2 class="text-xl text-ink">We can't find this order on this device</h2>
      <p class="mt-1 text-ink-muted">Orders can only be opened on the phone or browser that placed them.</p>
      <UButton to="/" class="mt-3 min-h-11" label="Back to this drop" />
    </div>

    <StateError v-else-if="status === 'error'" message="We couldn't load your order." @retry="refresh()" />

    <template v-else-if="order">
      <div v-if="inactive" role="status" class="gc-card p-4">
        <h2 class="text-xl text-ink">This request has lapsed</h2>
        <p class="mt-1 text-ink-muted">It was not paid in time, so nothing is reserved. Your items are kept so you can start again.</p>
        <UButton class="mt-3 min-h-11" label="Rebuild my order" @click="rebuild" />
      </div>

      <div v-else-if="order.drop.closed" role="status" class="gc-card p-4">
        <h2 class="text-xl text-ink">Orders for {{ formatDropDate(order.drop.dropAt) }} have closed</h2>
        <p class="mt-1 text-ink-muted">This order was not paid before the cut-off. You can reserve for the next drop.</p>
        <UButton to="/" class="mt-3 min-h-11" label="See the next drop" />
      </div>

      <section class="gc-card p-4" aria-labelledby="summary-heading">
        <h2 id="summary-heading" class="text-ink">For {{ formatDropDate(order.drop.dropAt) }}</h2>
        <ul class="mt-2 space-y-1">
          <li v-for="line in order.lines" :key="line.menuItemId" class="flex justify-between gap-2 text-ink">
            <span class="flex items-center gap-2">
              <FlavourBottle :name="line.name" size="xs" eager />
              <span>{{ line.quantity }} x {{ line.name }} {{ line.size }}</span>
            </span>
            <span>{{ formatPesewas(line.quantity * line.unitPricePesewas) }}</span>
          </li>
          <li v-if="order.feePesewas > 0" class="flex justify-between gap-2 text-ink-muted">
            <span>Delivery fee</span>
            <span>{{ formatPesewas(order.feePesewas) }}</span>
          </li>
        </ul>
        <p class="mt-2 flex justify-between border-t border-line pt-2 text-lg font-bold text-ink">
          <span>Total</span>
          <span>{{ formatPesewas(order.totalPesewas) }}</span>
        </p>
      </section>

      <section class="gc-card p-4" aria-labelledby="details-heading">
        <h2 id="details-heading" class="text-ink">{{ order.fulfilment === 'delivery' ? 'Delivery' : 'Pickup' }}</h2>
        <p v-if="order.fulfilment === 'delivery'" class="mt-1 text-ink">{{ order.address }}, {{ order.area }}</p>
        <p v-else class="mt-1 text-ink">Pickup point, Accra, on drop day</p>
        <p class="mt-1 text-ink">{{ order.firstName }}, {{ order.phoneMasked }}</p>
        <NuxtLink to="/details" class="mt-1 inline-flex min-h-11 items-center font-semibold text-sage underline">Change details</NuxtLink>
      </section>

      <div v-if="paid" role="status" class="gc-card p-4">
        <h2 class="text-xl text-ink">This order is paid and confirmed</h2>
        <UButton :to="`/confirmed/${order.id}`" class="mt-3 min-h-11" label="See your confirmation" />
      </div>

      <template v-else-if="!inactive && !order.drop.closed">
        <section class="space-y-1 rounded-2xl bg-warn-panel p-4" aria-label="About payment">
          <p class="font-bold text-ink">No money is taken</p>
          <p class="text-ink">Spaces are held for {{ order.holdMinutes }} minutes once you tap Pay.</p>
          <p class="text-ink" aria-live="polite">
            {{ spacesLeft === null ? '' : `${plural(spacesLeft, 'space', 'spaces')} left in this drop right now. Your order needs ${units}.` }}
          </p>
        </section>

        <StickyActionBar>
          <div>
            <p class="font-bold text-ink">{{ formatPesewas(order.totalPesewas) }}</p>
            <p class="text-sm text-ink-muted">No money is taken</p>
          </div>
          <UButton :to="`/pay/${order.id}`" size="xl" class="min-h-12 px-8" label="Pay" />
        </StickyActionBar>
      </template>
    </template>
  </div>
</template>

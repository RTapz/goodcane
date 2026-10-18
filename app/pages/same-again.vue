<script setup lang="ts">
// C7 "Same again?" (spec 6.3): open, then Pay. Two taps to the payment screen.
// Every change to the usual order is the customer's choice: nothing is swapped, reduced or moved silently.
import type { FetchError } from 'ofetch'
import type { DropSummary } from '~~/server/schemas/drops'
import { fitsInDrop } from '../../server/domain/capacity/spaces'
import { buildUsualOrder, type MenuOption } from '../../server/domain/orders/usual'
import { orderTotalPesewas } from '../../server/domain/orders/totals'

const { me, ready } = useMe()
await ready
const { data: next, refresh: refreshDrop } = await useNextDrop()
const { setNotice } = useOrderNotice()
const { attachToDrop, clear, setQuantity } = useCart()

// No session or no previous paid order: C1 with a friendly line (no dead end).
if (!me.value?.lastOrder) {
  setNotice("We couldn't find a previous order on this phone. Start a new one below.")
  await navigateTo('/', { replace: true })
}
const last = computed(() => me.value?.lastOrder ?? null)

// The customer's choices. Empty means "as last time".
const quantities = ref<Record<string, number>>({})
const acceptedSubstitutes = ref<Record<string, boolean>>({})
const leftOut = ref<Record<string, boolean>>({})
const chosenNextDrop = ref(false)
const acknowledgedClosed = ref(false)
const switchedToPickup = ref(false)
const expanded = ref(false)

const targetDrop = computed<DropSummary | null>(() =>
  chosenNextDrop.value ? (next.value?.nextDrop ?? null) : (next.value?.drop ?? null)
)
const spaces = computed(() => targetDrop.value?.spacesLeft ?? 0)

const menu = computed<MenuOption[]>(() =>
  (next.value?.menu ?? []).map((m) => ({
    ...m,
    // Sold-out flags are for the current drop; for the next drop, check its own spaces.
    available: chosenNextDrop.value ? fitsInDrop(m.capacityWeight, spaces.value) : !m.soldOut
  }))
)

const usual = computed(() =>
  buildUsualOrder(
    (last.value?.lines ?? []).filter((l) => !leftOut.value[l.menuItemId]),
    menu.value,
    spaces.value,
    { quantities: quantities.value, acceptedSubstitutes: acceptedSubstitutes.value }
  )
)

// Delivery from last time: the same area by name, its fee checked against today's settings.
const area = computed(() =>
  last.value?.fulfilment === 'delivery' ? (next.value?.deliveryAreas.find((a) => a.name === last.value?.area) ?? null) : null
)
const delivery = computed(() => last.value?.fulfilment === 'delivery' && !switchedToPickup.value)
const areaGone = computed(() => delivery.value && !area.value)
const feePesewas = computed(() => (delivery.value ? (area.value?.feePesewas ?? 0) : 0))
const feeChanged = computed(() => delivery.value && !!area.value && area.value.feePesewas !== last.value?.feePesewas)

const orderLines = computed(() => {
  const merged = new Map<string, number>()
  for (const line of usual.value.lines) {
    if (line.item && line.quantity > 0) merged.set(line.item.id, (merged.get(line.item.id) ?? 0) + line.quantity)
  }
  return [...merged].map(([menuItemId, quantity]) => ({ menuItemId, quantity }))
})
const total = computed(() =>
  orderTotalPesewas(
    usual.value.lines
      .filter((l) => l.item && l.quantity > 0)
      .map((l) => ({ quantity: l.quantity, unitPricePesewas: l.item!.pricePesewas })),
    feePesewas.value
  )
)

const undecidedSubstitute = computed(() => usual.value.lines.some((l) => l.status === 'substituted' && !l.accepted))
const tooBig = computed(() => usual.value.lines.filter((l) => l.cappedQuantity !== null))
const closedNotice = computed(() => !!next.value?.closed && !!next.value.missedDrop && !chosenNextDrop.value)
const canPay = computed(
  () =>
    !!targetDrop.value &&
    usual.value.fits &&
    !undecidedSubstitute.value &&
    !areaGone.value &&
    (!closedNotice.value || acknowledgedClosed.value)
)

const canAddOne = (weight: number) => fitsInDrop(usual.value.units + weight, spaces.value)
function setLineQuantity(menuItemId: string, quantity: number) {
  quantities.value = { ...quantities.value, [menuItemId]: Math.max(0, quantity) }
}
function reduceToFit() {
  const reduced = { ...quantities.value }
  for (const line of tooBig.value) reduced[line.last.menuItemId] = line.cappedQuantity ?? 0
  quantities.value = reduced
}

/** Hands the current choice to C2 or C3 through the cart, for changes C7 does not handle. */
async function continueIn(path: '/order' | '/details') {
  if (!targetDrop.value) return navigateTo('/')
  attachToDrop(targetDrop.value.id)
  clear()
  for (const line of orderLines.value) setQuantity(line.menuItemId, line.quantity)
  await navigateTo(path)
}

const paying = ref(false)
const payError = ref<string | null>(null)
const newTotal = ref<number | null>(null)

async function pay(expectedTotalPesewas = total.value) {
  if (!targetDrop.value || paying.value) return
  paying.value = true
  payError.value = null
  try {
    const { orderId } = await $fetch<{ orderId: string }>('/api/orders', {
      method: 'POST',
      body: {
        reorder: true,
        dropId: targetDrop.value.id,
        lines: orderLines.value,
        fulfilment: delivery.value ? 'delivery' : 'pickup',
        ...(delivery.value && area.value ? { deliveryAreaId: area.value.id } : {}),
        // A fresh key per Pay tap; the server copies name, phone and address itself.
        idempotencyKey: newIdempotencyKey(),
        expectedTotalPesewas
      }
    })
    await navigateTo(`/pay/${orderId}`)
  } catch (error) {
    const e = error as FetchError<{ data?: { reason?: string; totalPesewas?: number } }>
    const reason = e.data?.data?.reason
    if (reason === 'price_changed') {
      newTotal.value = e.data?.data?.totalPesewas ?? null
    } else if (reason === 'too_many_open_requests') {
      payError.value = 'You already have 3 unpaid orders. Pay for one first, or wait for one to lapse.'
    } else if (reason === 'details_needed') {
      await continueIn('/details')
    } else if (reason === 'not_enough_space' || reason === 'drop_closed') {
      await refreshDrop()
      payError.value = reason === 'drop_closed' ? 'Orders for this drop have just closed.' : 'Spaces changed while you were looking.'
    } else if (e.statusCode === 404) {
      setNotice("We couldn't find your details on this phone. Start a new order below.")
      await navigateTo('/')
    } else {
      payError.value = "We couldn't place your order. Check your connection and try again."
    }
  } finally {
    paying.value = false
  }
}
</script>

<template>
  <div v-if="me && last" class="space-y-3 pb-28">
    <h1 class="text-2xl font-extrabold text-stone-900">Same again, {{ me.firstName }}?</h1>

    <!-- Drop closed: show the next drop and let the customer choose it. -->
    <div v-if="closedNotice && targetDrop" role="status" class="rounded-2xl border border-amber-400 bg-white p-3">
      <p class="font-semibold text-stone-900">
        Orders for {{ formatDropDate(next!.missedDrop!.dropAt) }} have closed. Next drop: {{ formatDropDate(targetDrop.dropAt) }}.
      </p>
      <UButton
        v-if="!acknowledgedClosed"
        class="mt-2 min-h-11"
        :label="`Order for ${formatDropDate(targetDrop.dropAt)}`"
        @click="acknowledgedClosed = true"
      />
    </div>

    <div v-if="!targetDrop" class="gc-card p-4">
      <p class="font-semibold text-stone-900">No drop is open right now.</p>
      <UButton to="/" class="mt-2 min-h-11" label="See what's next" />
    </div>

    <template v-else>
      <section aria-label="Next drop" class="space-y-0.5">
        <p class="text-lg font-bold text-stone-900">For {{ formatDropDate(targetDrop.dropAt) }}</p>
        <ClientOnly>
          <CutOffCountdown :cut-off-at="targetDrop.cutOffAt" :server-now="next!.serverNow" @reached="refreshDrop()" />
          <template #fallback>
            <p class="font-bold text-stone-900">Orders close {{ formatCutOff(targetDrop.cutOffAt) }}</p>
          </template>
        </ClientOnly>
        <p class="text-stone-800">{{ plural(spaces, 'space', 'spaces') }} left</p>
      </section>

      <!-- Drop full: ask first (BR-F1). -->
      <div v-if="tooBig.length > 0" role="status" class="rounded-2xl border border-amber-400 bg-white p-3">
        <p class="font-semibold text-stone-900">Only {{ plural(spaces, 'space is', 'spaces are') }} left for your usual.</p>
        <div class="mt-2 flex flex-wrap gap-2">
          <UButton class="min-h-11" label="Reduce to fit" @click="reduceToFit" />
          <UButton
            v-if="!chosenNextDrop && next?.nextDrop"
            color="neutral"
            variant="outline"
            class="min-h-11"
            :label="`See ${formatDropDate(next.nextDrop.dropAt)}`"
            @click="chosenNextDrop = true"
          />
        </div>
      </div>

      <section aria-labelledby="usual-heading" class="gc-card p-3">
        <h2 id="usual-heading" class="font-bold text-stone-900">Your usual</h2>

        <p v-if="usual.lines.length > 2 && !expanded" class="mt-1 text-stone-800">
          {{ usual.lines.map((l) => `${l.quantity} x ${(l.item ?? l.substitute)?.name ?? l.last.name}`).join(', ') }}
          <UButton variant="link" class="min-h-11 px-1" label="Show items" @click="expanded = true" />
        </p>

        <ul v-else class="mt-1 divide-y divide-stone-200">
          <li v-for="line in usual.lines" :key="line.last.menuItemId" class="py-1.5">
            <div class="flex items-center justify-between gap-2">
              <span class="flex min-w-0 items-center gap-2">
                <FlavourTile :colour="flavourColour((line.item ?? line.last).name)" size="sm" />
                <span class="text-stone-900">{{ (line.item ?? line.last).name }} {{ (line.item ?? line.last).size }}</span>
              </span>
              <QuantityStepper
                v-if="line.item"
                :label="`${line.item.name} ${line.item.size}`"
                :quantity="line.quantity"
                :can-add="canAddOne(line.item.capacityWeight)"
                @change="(q) => setLineQuantity(line.last.menuItemId, q)"
              />
            </div>

            <p v-if="line.price.newPesewas !== null && line.price.newPesewas !== line.price.oldPesewas && line.status !== 'substituted'" class="text-sm text-stone-800">
              Price changed: was {{ formatPesewas(line.price.oldPesewas) }}, now {{ formatPesewas(line.price.newPesewas) }}
            </p>

            <div v-if="line.status === 'substituted' && !line.accepted" class="mt-1 rounded-xl bg-cream-200 p-2 text-sm text-stone-900">
              <p>{{ line.last.name }} {{ line.last.size }} is not available. Try {{ line.substitute!.name }} {{ line.substitute!.size }} ({{ formatPesewas(line.substitute!.pricePesewas) }})?</p>
              <div class="mt-1 flex gap-2">
                <UButton size="sm" class="min-h-11" label="Use this" @click="acceptedSubstitutes = { ...acceptedSubstitutes, [line.last.menuItemId]: true }" />
                <UButton size="sm" color="neutral" variant="outline" class="min-h-11" label="Leave it out" @click="leftOut = { ...leftOut, [line.last.menuItemId]: true }" />
              </div>
            </div>
            <p v-else-if="line.status === 'substituted'" class="text-sm text-stone-700">Instead of {{ line.last.name }} {{ line.last.size }}</p>

            <p v-if="line.status === 'unavailable'" class="text-sm text-stone-800">
              No similar drink in this drop, so it is left out.
              <NuxtLink to="/order" class="font-semibold text-cane-700 underline">Choose another</NuxtLink>
            </p>
          </li>
        </ul>

        <p v-if="delivery" class="mt-1 text-sm text-stone-800">
          Delivery to {{ last.area }}
          <template v-if="feeChanged">(fee was {{ formatPesewas(last.feePesewas) }}, now {{ formatPesewas(feePesewas) }})</template>
        </p>
        <p v-else class="mt-1 text-sm text-stone-800">Pickup, pickup point, Accra</p>
      </section>

      <div v-if="areaGone" role="status" class="rounded-2xl border border-amber-400 bg-white p-3">
        <p class="font-semibold text-stone-900">Delivery to {{ last.area }} is no longer offered.</p>
        <div class="mt-2 flex flex-wrap gap-2">
          <UButton class="min-h-11" label="Switch to pickup" @click="switchedToPickup = true" />
          <UButton color="neutral" variant="outline" class="min-h-11" label="Update details" @click="continueIn('/details')" />
        </div>
      </div>

      <p v-if="payError" role="alert" class="rounded-2xl border border-red-300 bg-white p-3 font-semibold text-stone-900">{{ payError }}</p>

      <!-- Below the fold: loaded lazily. -->
      <NuxtLink to="/order" class="inline-flex min-h-11 items-center font-semibold text-cane-700 underline" @click.prevent="continueIn('/order')">
        Change my order
      </NuxtLink>
      <LazyReminderOptIn source="c7" compact />

      <!-- Only needed when the server answers price_changed, so its code loads then. -->
      <LazyUModal v-if="newTotal !== null" :open="true" title="The total has changed" @update:open="(v: boolean) => { if (!v) newTotal = null }">
        <template #body>
          <p class="text-stone-900">The total is now {{ formatPesewas(newTotal ?? 0) }}. Continue?</p>
          <div class="mt-3 flex gap-2">
            <UButton class="min-h-11" label="Continue" @click="pay(newTotal!); newTotal = null" />
            <UButton color="neutral" variant="outline" class="min-h-11" label="Not now" @click="newTotal = null; refreshDrop()" />
          </div>
        </template>
      </LazyUModal>

      <StickyActionBar>
        <div>
          <p class="font-bold text-stone-900">{{ formatPesewas(total) }}</p>
          <p class="text-sm text-stone-700">No money is taken</p>
        </div>
        <UButton size="xl" class="min-h-12 px-8" :disabled="!canPay || paying" :loading="paying" label="Pay" @click="pay()" />
      </StickyActionBar>
    </template>
  </div>
</template>

<script setup lang="ts">
// C2 Build order.
import type { MenuItem } from '~~/server/schemas/drops'
import { fitsInDrop } from '../../server/domain/capacity/spaces'

const route = useRoute()
const { data, status, refresh } = await useNextDrop()
const menu = computed(() => data.value?.menu ?? [])
const { cart, units, totalPesewas, attachToDrop, switchDrop, quantityOf, setQuantity } = useCart(menu)
// Set when the server turned an order down on C3. Spaces may have changed, so refetch.
const { notice, clearNotice } = useOrderNotice()
onMounted(() => {
  if (notice.value) refresh()
})
onBeforeUnmount(clearNotice)

const pickedTaste = computed(() => {
  const taste = route.query.taste
  return taste === 'sweet' || taste === 'spicy' || taste === 'sour' ? taste : null
})

// The drop this cart is for: the current drop, or the next one if the customer chose it.
const activeDrop = computed(() => {
  const next = data.value?.nextDrop
  if (next && cart.value.dropId === next.id) return next
  return data.value?.drop ?? null
})

onMounted(() => {
  watch(
    () => data.value?.drop?.id,
    (id) => {
      if (id && cart.value.dropId !== data.value?.nextDrop?.id) attachToDrop(id)
    },
    { immediate: true }
  )
})

const spaces = computed(() => activeDrop.value?.spacesLeft ?? 0)
const spacesAfter = computed(() => Math.max(0, spaces.value - units.value))

/** Items that can be ordered in the active drop at all (sold-out items are hidden). */
const available = computed(() =>
  menu.value.filter((item) =>
    activeDrop.value?.id === data.value?.drop?.id ? !item.soldOut : fitsInDrop(item.capacityWeight, spaces.value)
  )
)

const flavours = computed(() => {
  const groups = new Map<string, MenuItem[]>()
  for (const item of available.value) {
    groups.set(item.name, [...(groups.get(item.name) ?? []), item])
  }
  const list = [...groups.entries()].map(([name, items]) => ({
    name,
    items,
    tasteGroup: items[0]!.tasteGroup,
    isSpecial: items[0]!.isSpecial
  }))
  // The picked taste comes first; nothing is hidden.
  return pickedTaste.value
    ? [...list.filter((f) => f.tasteGroup === pickedTaste.value), ...list.filter((f) => f.tasteGroup !== pickedTaste.value)]
    : list
})

// A completely full drop (BR-F2): how many bottles they wanted is recorded whatever they choose.
// "Join" then moves to the next drop; nothing moves without that tap (BR-F1).
const { tellGoodCane } = useTurnedAway()
const MAX_WANTED = 24
const wanted = ref(1)
const telling = ref(false)
const told = ref(false)
const tellError = ref<string | null>(null)

async function tell(): Promise<boolean> {
  if (!activeDrop.value) return false
  telling.value = true
  tellError.value = null
  try {
    await tellGoodCane(activeDrop.value.id, wanted.value)
    return true
  } catch {
    tellError.value = "We couldn't pass that on just now."
    return false
  } finally {
    telling.value = false
  }
}

async function joinNextDrop(nextDropId: string) {
  await tell()
  // Never a dead end: they chose the next drop, so go even if the note did not get through.
  switchDrop(nextDropId)
}

async function justTell() {
  told.value = await tell()
}

const canAddOne = (item: MenuItem) => fitsInDrop(units.value + item.capacityWeight, spaces.value)
// The cart can be bigger than the spaces left if spaces were taken since it was built.
const overBy = computed(() => Math.max(0, units.value - spaces.value))
const atLimit = computed(() => overBy.value === 0 && units.value > 0 && available.value.every((item) => !canAddOne(item)))
</script>

<template>
  <div class="space-y-4 pb-28">
    <StateLoading v-if="status === 'pending' && !data" />
    <StateError v-else-if="status === 'error'" @retry="refresh()" />

    <template v-else-if="data">
      <div v-if="!activeDrop" class="gc-card p-4">
        <h1 class="text-xl text-ink">No drop is scheduled yet</h1>
        <p class="mt-1 text-ink-muted">Check back soon for the next one.</p>
        <UButton to="/" class="mt-3 min-h-11" color="neutral" variant="outline" label="Back to this drop" />
      </div>

      <template v-else>
        <header>
          <h1 class="text-2xl text-ink">Build your order</h1>
          <p class="text-ink-muted">For {{ formatDropDate(activeDrop.dropAt) }}. {{ plural(spaces, 'space', 'spaces') }} left.</p>
          <p v-if="pickedTaste" class="mt-1 text-sm text-ink-muted">
            {{ pickedTaste[0]!.toUpperCase() + pickedTaste.slice(1) }} flavours first, as you picked.
          </p>
        </header>

        <div v-if="notice" role="alert" class="flex items-start justify-between gap-2 rounded-2xl border border-amber-400 bg-panel-raised p-3">
          <p class="font-semibold text-ink">{{ notice }}</p>
          <UButton color="neutral" variant="ghost" class="min-h-11 shrink-0" label="Dismiss" @click="clearNotice" />
        </div>

        <p v-if="overBy > 0" role="status" class="rounded-2xl bg-warn-panel p-3 text-sm text-ink">
          Your order has {{ plural(units, 'bottle', 'bottles') }}, but only {{ plural(spaces, 'space is', 'spaces are') }} left.
          Remove {{ plural(overBy, 'bottle', 'bottles') }} to continue.
        </p>
        <p v-else-if="atLimit" role="status" class="rounded-2xl bg-warn-panel p-3 text-sm text-ink">
          Your order fills the last spaces in this drop, so you can't add more.
        </p>

        <!-- Never dead-end: a full drop offers the next one, and only moves if the customer taps it. -->
        <div v-if="available.length === 0" class="space-y-3 gc-card p-4">
          <h2 class="text-xl text-ink">This drop is full</h2>
          <p v-if="told" role="status" class="rounded-xl bg-mint-panel p-3 font-semibold text-sage">
            Thanks. GoodCane now knows you wanted {{ plural(wanted, 'bottle', 'bottles') }}.
          </p>
          <template v-else>
            <div class="flex flex-wrap items-center justify-between gap-2">
              <p class="font-semibold text-ink">How many bottles did you want?</p>
              <QuantityStepper label="bottles wanted" :quantity="wanted" :can-add="wanted < MAX_WANTED" @change="(q) => (wanted = Math.max(1, q))" />
            </div>
            <p class="text-sm text-ink-muted">This helps GoodCane make enough next time. It is not an order.</p>
          </template>
          <template v-if="data.nextDrop && activeDrop.id !== data.nextDrop.id">
            <p class="text-ink-muted">
              The next drop is {{ formatDropDate(data.nextDrop.dropAt) }}, with {{ plural(data.nextDrop.spacesLeft, 'space', 'spaces') }} left.
            </p>
            <UButton
              block
              class="min-h-11"
              :loading="telling"
              :disabled="telling"
              :label="`Join ${formatDropDate(data.nextDrop.dropAt)}`"
              @click="joinNextDrop(data.nextDrop.id)"
            />
          </template>
          <p v-else class="text-ink-muted">No more drops are scheduled yet. Check back soon.</p>
          <UButton
            v-if="!told"
            block
            class="min-h-11"
            color="neutral"
            variant="outline"
            :disabled="telling"
            label="No thanks, just let GoodCane know"
            @click="justTell"
          />
          <p v-if="tellError" role="alert" class="text-sm font-semibold text-danger">{{ tellError }}</p>
        </div>

        <ul v-else class="grid grid-cols-2 gap-3">
          <FlavourCard
            v-for="flavour in flavours"
            :key="flavour.name"
            :name="flavour.name"
            :taste-group="flavour.tasteGroup"
            :is-special="flavour.isSpecial"
            :items="flavour.items"
            :highlighted="flavour.tasteGroup === pickedTaste"
            :quantity-of="quantityOf"
            :can-add-one="canAddOne"
            @change="setQuantity"
          />
        </ul>

        <TotalBar :units="units" :total-pesewas="totalPesewas" :spaces-after="spacesAfter" :over-by="overBy" />
      </template>
    </template>
  </div>
</template>

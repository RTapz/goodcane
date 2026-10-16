<script setup lang="ts">
// C2 Build order.
import type { MenuItem } from '~~/server/schemas/drops'
import { fitsInDrop } from '../../server/domain/capacity/spaces'

const route = useRoute()
const { data, status, refresh } = await useNextDrop()
const menu = computed(() => data.value?.menu ?? [])
const { cart, units, totalPesewas, attachToDrop, switchDrop, quantityOf, setQuantity } = useCart(menu)

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

const canAddOne = (item: MenuItem) => fitsInDrop(units.value + item.capacityWeight, spaces.value)
const atLimit = computed(() => units.value > 0 && available.value.every((item) => !canAddOne(item)))
</script>

<template>
  <div class="space-y-4 pb-28">
    <StateLoading v-if="status === 'pending' && !data" />
    <StateError v-else-if="status === 'error'" @retry="refresh()" />

    <template v-else-if="data">
      <div v-if="!activeDrop" class="rounded-lg bg-white p-4 shadow-sm">
        <h1 class="text-xl font-bold text-stone-900">No drop is scheduled yet</h1>
        <p class="mt-1 text-stone-700">Check back soon for the next one.</p>
        <UButton to="/" class="mt-3 min-h-11" color="neutral" variant="outline" label="Back to this drop" />
      </div>

      <template v-else>
        <header>
          <h1 class="text-2xl font-extrabold text-stone-900">Build your order</h1>
          <p class="text-stone-700">For {{ formatDropDate(activeDrop.dropAt) }}. {{ spaces }} spaces left.</p>
          <p v-if="pickedTaste" class="mt-1 text-sm text-stone-700">
            {{ pickedTaste[0]!.toUpperCase() + pickedTaste.slice(1) }} flavours first, as you picked.
          </p>
        </header>

        <p v-if="atLimit" role="status" class="rounded-lg bg-cream-200 p-3 text-sm text-stone-900">
          Your order fills the last spaces in this drop, so you can't add more.
        </p>

        <!-- Never dead-end: a full drop offers the next one, and only moves if the customer taps it. -->
        <div v-if="available.length === 0" class="rounded-lg bg-white p-4 shadow-sm">
          <h2 class="text-xl font-bold text-stone-900">This drop is full</h2>
          <template v-if="data.nextDrop && activeDrop.id !== data.nextDrop.id">
            <p class="mt-1 text-stone-700">
              The next drop is {{ formatDropDate(data.nextDrop.dropAt) }}, with {{ data.nextDrop.spacesLeft }} spaces left.
            </p>
            <UButton
              class="mt-3 min-h-11"
              :label="`Order for ${formatDropDate(data.nextDrop.dropAt)}`"
              @click="switchDrop(data.nextDrop.id)"
            />
          </template>
          <p v-else class="mt-1 text-stone-700">No more drops are scheduled yet. Check back soon.</p>
        </div>

        <ul v-else class="space-y-3">
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

        <TotalBar :units="units" :total-pesewas="totalPesewas" :spaces-after="spacesAfter" />
      </template>
    </template>
  </div>
</template>

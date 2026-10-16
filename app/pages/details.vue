<script setup lang="ts">
// C3 Your details: placeholder until the next slice.
const { data } = await useNextDrop()
const menu = computed(() => data.value?.menu ?? [])
const { cart, priced, units, totalPesewas, attachToDrop } = useCart(menu)

// After a reload, bring back the cart saved in this tab (if it is for the current drop).
onMounted(() => {
  const id = data.value?.drop?.id
  if (id && !cart.value.dropId) attachToDrop(id)
})
</script>

<template>
  <div class="space-y-4">
    <h1 class="text-2xl font-extrabold text-stone-900">Your details</h1>
    <section class="rounded-lg bg-white p-4 shadow-sm" aria-label="Your order">
      <p v-if="units === 0" class="text-stone-700">Your order is empty.</p>
      <template v-else>
        <ul class="space-y-1">
          <li v-for="line in priced" :key="line.item.id" class="flex justify-between text-stone-900">
            <span>{{ line.quantity }} x {{ line.item.name }} {{ line.item.size }}</span>
            <span>{{ formatPesewas(line.quantity * line.item.pricePesewas) }}</span>
          </li>
        </ul>
        <p class="mt-2 border-t border-stone-200 pt-2 font-bold text-stone-900">
          {{ units }} {{ units === 1 ? 'bottle' : 'bottles' }}, {{ formatPesewas(totalPesewas) }}
        </p>
      </template>
    </section>
    <p class="rounded-lg bg-cream-200 p-3 text-stone-900">Your details: coming in the next slice.</p>
    <UButton to="/order" color="neutral" variant="outline" class="min-h-11" label="Back to your order" />
  </div>
</template>

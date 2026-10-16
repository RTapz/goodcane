<script setup lang="ts">
// C1 Landing: "This drop".
const { data, status, refresh } = await useNextDrop()
const { customer } = useCustomer()

const drop = computed(() => data.value?.drop ?? null)
</script>

<template>
  <div class="space-y-6 pb-20">
    <h1 class="sr-only">GoodCane Drops: this drop</h1>

    <StateLoading v-if="status === 'pending' && !data" />
    <StateError v-else-if="status === 'error'" @retry="refresh()" />

    <template v-else-if="data">
      <section v-if="customer" class="rounded-lg bg-cane-50 p-3" aria-label="Welcome back">
        <p class="font-bold text-cane-900">Welcome back, {{ customer.firstName }}. Same again?</p>
        <UButton to="/order" class="mt-2 min-h-11" label="See my usual" />
      </section>

      <UAlert
        v-if="data.closed && data.missedDrop"
        color="warning"
        variant="subtle"
        :title="`Orders for ${formatDropDate(data.missedDrop.dropAt)} have closed`"
        :description="drop ? `You can still reserve for ${formatDropDate(drop.dropAt)}.` : undefined"
      />

      <section v-if="drop" aria-labelledby="drop-heading" class="space-y-1">
        <p class="text-sm font-semibold uppercase tracking-wide text-cane-700">This drop</p>
        <h2 id="drop-heading" class="text-3xl font-extrabold text-stone-900">{{ formatDropDate(drop.dropAt) }}</h2>
        <ClientOnly>
          <CutOffCountdown :cut-off-at="drop.cutOffAt" :server-now="data.serverNow" @reached="refresh()" />
          <template #fallback>
            <p class="text-lg font-bold text-stone-900">Orders close {{ formatCutOff(drop.cutOffAt) }}</p>
          </template>
        </ClientOnly>
        <p class="text-stone-700">Cut-off: {{ formatCutOff(drop.cutOffAt) }}</p>
        <p class="font-semibold text-stone-900">
          {{ drop.spacesLeft > 0 ? `${drop.spacesLeft} spaces left` : 'This drop is full' }}
        </p>
      </section>

      <section v-else class="rounded-lg bg-white p-4 shadow-sm">
        <h2 class="text-xl font-bold text-stone-900">No drop is scheduled yet</h2>
        <p class="mt-1 text-stone-700">Check back soon for the next one.</p>
      </section>

      <TastePicker v-if="drop" />
      <SampleReviews />
      <ClaimsNote />
      <PickupInfo :start="data.pickupWindow.start" :end="data.pickupWindow.end" />

      <div v-if="drop" class="fixed inset-x-0 bottom-0 z-40 border-t border-stone-300 bg-cream-50 pb-[env(safe-area-inset-bottom)]">
        <div class="mx-auto w-full max-w-md px-4 py-3">
          <UButton to="/order" block size="xl" class="min-h-12" :label="`Order for ${formatDropDate(drop.dropAt)}`" />
        </div>
      </div>
    </template>
  </div>
</template>

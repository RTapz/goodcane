<script setup lang="ts">
// C1 Landing: "This drop".
const { data, status, refresh } = await useNextDrop()
const { me, ready } = useMe()
await ready
const { notice, clearNotice } = useOrderNotice()
const route = useRoute()

const drop = computed(() => data.value?.drop ?? null)
// A returning customer with a previous paid order gets the one-tap way back (C7).
const canReorder = computed(() => !!me.value?.lastOrder && !!drop.value)
const countdownAtServerTime = computed(() => {
  if (!drop.value || !data.value) return ''
  const { days, hours, minutes, seconds } = splitDuration(Date.parse(drop.value.cutOffAt) - Date.parse(data.value.serverNow))
  const pad = (n: number) => String(n).padStart(2, '0')
  return `Orders close in ${days > 0 ? `${days}d ` : ''}${pad(hours)}h ${pad(minutes)}m ${pad(seconds)}s`
})
onBeforeUnmount(clearNotice)
</script>

<template>
  <div class="space-y-6 pb-20">
    <h1 class="sr-only">GoodCane Drops: this drop</h1>

    <StateLoading v-if="status === 'pending' && !data" />
    <StateError v-else-if="status === 'error'" @retry="refresh()" />

    <template v-else-if="data">
      <p v-if="notice" role="status" class="rounded-2xl border border-amber-400 bg-white p-3 font-semibold text-stone-900">
        {{ notice }}
      </p>

      <section v-if="me && canReorder" class="gc-card p-4" aria-label="Welcome back">
        <p class="font-bold text-cane-900">Welcome back, {{ me.firstName }}. Same again?</p>
        <UButton to="/same-again" class="mt-2 min-h-11" label="Order my usual" />
      </section>
      <p v-else-if="route.query.welcome" role="status" class="rounded-2xl bg-cane-50 p-3 font-semibold text-cane-900">
        Welcome{{ me?.firstName ? `, ${me.firstName}` : '' }}. Start an order for the next drop below.
      </p>

      <UAlert
        v-if="data.closed && data.missedDrop"
        color="warning"
        variant="subtle"
        :title="`Orders for ${formatDropDate(data.missedDrop.dropAt)} have closed`"
        :description="drop ? `You can still reserve for ${formatDropDate(drop.dropAt)}.` : undefined"
      />

      <section v-if="drop" aria-labelledby="drop-heading" class="space-y-1 rounded-3xl bg-gradient-to-br from-cane-100 via-cane-50 to-white p-5 shadow-[0_10px_28px_-12px_rgb(16_40_24/0.25)]">
        <p class="text-sm font-semibold uppercase tracking-wide text-cane-700">This drop</p>
        <h2 id="drop-heading" class="text-3xl font-extrabold text-stone-900">{{ formatDropDate(drop.dropAt) }}</h2>
        <ClientOnly>
          <CutOffCountdown :cut-off-at="drop.cutOffAt" :server-now="data.serverNow" @reached="refresh()" />
          <!-- Same text as the live countdown at server time, so nothing moves when it takes over. -->
          <template #fallback>
            <p class="text-lg font-bold tabular-nums text-stone-900">{{ countdownAtServerTime }}</p>
          </template>
        </ClientOnly>
        <p class="text-stone-700">Cut-off: {{ formatCutOff(drop.cutOffAt) }}</p>
        <p class="inline-flex rounded-full bg-white px-3 py-1 font-semibold text-cane-900 shadow-sm">
          {{ drop.spacesLeft > 0 ? `${plural(drop.spacesLeft, 'space', 'spaces')} left` : 'This drop is full' }}
        </p>
      </section>

      <section v-else class="gc-card p-4">
        <h2 class="text-xl font-bold text-stone-900">No drop is scheduled yet</h2>
        <p class="mt-1 text-stone-700">Check back soon for the next one.</p>
      </section>

      <TastePicker v-if="drop" />
      <ClaimsNote />
      <PickupInfo :start="data.pickupWindow.start" :end="data.pickupWindow.end" />

      <div v-if="drop" class="gc-bottom-bar fixed inset-x-0 bottom-0 z-40 pb-[env(safe-area-inset-bottom)]">
        <div class="mx-auto w-full max-w-md px-4 py-3">
          <UButton to="/order" block size="xl" class="min-h-12" :label="`Order for ${formatDropDate(drop.dropAt)}`" />
        </div>
      </div>
    </template>
  </div>
</template>

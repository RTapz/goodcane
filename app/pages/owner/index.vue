<script setup lang="ts">
// O1 "This drop": the demand view (spec 5.9, 6.2). All numbers are in units (BR-C1).
// The arithmetic is on the server; this page only shows it.
import type { DropDemand } from '~~/server/services/owner/demand'
import type { PilotMetrics } from '~~/server/services/owner/metrics'

definePageMeta({ middleware: 'owner' })
useHead({ title: 'This drop (owner) | GoodCane Drops' })

interface DropOption {
  id: string
  dropAt: string
  cutOffAt: string
  status: string
  closed: boolean
  isSample: boolean
}

const route = useRoute()
const { data: dropList, status: dropsStatus, refresh: refreshDrops } = await useFetch<{ defaultDropId: string | null; drops: DropOption[] }>(
  '/api/owner/drops',
  { key: 'owner-drops' }
)
const selected = ref<string | null>((route.query.drop as string | undefined) ?? dropList.value?.defaultDropId ?? null)
watch(dropList, (list) => {
  if (!selected.value && list?.defaultDropId) selected.value = list.defaultDropId
})

const { data: demand, status: demandStatus, refresh: refreshDemand } = await useFetch<DropDemand>(
  () => `/api/owner/drop/${selected.value}/demand`,
  { key: 'owner-demand', immediate: !!selected.value, watch: [selected] }
)
const { data: metricsBody } = await useFetch<{ metrics: PilotMetrics | null }>('/api/owner/metrics', { key: 'owner-metrics' })

const loading = computed(() => dropsStatus.value === 'pending' || (demandStatus.value === 'pending' && !demand.value))
const failed = computed(() => dropsStatus.value === 'error' || demandStatus.value === 'error')
async function retry() {
  await refreshDrops()
  if (selected.value) await refreshDemand()
}

// Buffer setting (BR-FC8): saved, then the numbers are reloaded.
const savingBuffer = ref(false)
const bufferError = ref('')
async function setBuffer(setting: 'careful' | 'balanced' | 'never_sell_out') {
  savingBuffer.value = true
  bufferError.value = ''
  try {
    await $fetch('/api/owner/settings/buffer', { method: 'POST', body: { setting } })
    await refreshDemand()
  } catch {
    bufferError.value = "We couldn't save that. Try again."
  } finally {
    savingBuffer.value = false
  }
}

const methodLabel: Record<DropDemand['forecast']['method'], string> = {
  pace: 'Pace projection',
  baseline: 'Baseline (fewer than 4 finished drops)',
  baseline_too_early: 'Baseline (too early for pace)',
  none: 'No projection yet'
}
const paceText = computed(() => {
  const f = demand.value?.forecast
  if (!f) return ''
  if (f.pace !== null) return `${f.pace} units`
  if (f.paceUnavailable === 'too_early') return 'too early (more than 5 days to cut-off)'
  return 'not enough finished drops yet'
})
const sizeLabel: Record<string, string> = { '330ml': '330ml', '500ml': '500ml', '2l': '2L', '4l': '4L' }
const weightsText = computed(() => (demand.value?.unitWeights ?? []).map((w) => `${sizeLabel[w.size] ?? w.size} = ${w.weight}`).join(', '))
</script>

<template>
  <div>
    <OwnerNav />
    <h1 class="text-2xl font-bold">This drop</h1>

    <StateLoading v-if="loading" class="mt-4" />
    <StateError v-else-if="failed" class="mt-4" message="We couldn't load the demand view." @retry="retry" />
    <p v-else-if="!dropList?.drops.length" class="mt-4 gc-card p-4">
      No drops yet. Drops appear here once they are scheduled.
    </p>

    <template v-else-if="demand">
      <div class="mt-3">
        <label for="drop-picker" class="block font-semibold">Drop</label>
        <select
          id="drop-picker"
          v-model="selected"
          class="mt-1 min-h-11 w-full rounded-xl border border-stone-400 bg-white px-3 text-stone-900"
        >
          <option v-for="d in dropList.drops" :key="d.id" :value="d.id">
            {{ formatDropDate(d.dropAt) }} ({{ d.closed ? 'closed' : 'open' }}){{ d.isSample ? ', Sample' : '' }}
          </option>
        </select>
      </div>

      <!-- A finished drop: what happened, not what to make. -->
      <section v-if="demand.drop.closed && demand.actuals" class="mt-4 rounded-3xl bg-gradient-to-br from-cane-700 to-cane-800 p-5 text-white" aria-labelledby="headline">
        <h2 id="headline" class="text-sm font-semibold uppercase tracking-wide text-cane-100">Final demand</h2>
        <p class="text-3xl font-bold">{{ demand.actuals.demand }} units</p>
        <p class="mt-1 text-cane-100">{{ demand.units.paid }} paid + {{ demand.units.turnedAway }} turned away</p>
        <p v-if="demand.drop.isSample" class="mt-2 inline-block rounded-full bg-white px-2.5 text-sm font-semibold text-cane-900">Sample data</p>
      </section>

      <!-- Headline: suggested production (BR-FC9). The owner always decides. -->
      <section v-else class="mt-4 rounded-3xl bg-gradient-to-br from-cane-700 to-cane-800 p-5 text-white" aria-labelledby="headline">
        <h2 id="headline" class="text-sm font-semibold uppercase tracking-wide text-cane-100">Suggested production</h2>
        <p v-if="demand.suggested !== null" class="text-3xl font-bold">Make about {{ demand.suggested }} units</p>
        <p v-else class="text-xl font-bold">Not enough history to suggest a number yet</p>
        <p v-if="demand.suggested !== null" class="mt-1 text-cane-100">
          {{ demand.forecast.projected }} projected pre-orders + {{ demand.unplannedBuffer.units }} for walk-ins. You decide.
        </p>
        <p v-if="demand.drop.isSample" class="mt-2 inline-block rounded-full bg-white px-2.5 text-sm font-semibold text-cane-900">Sample data</p>
      </section>

      <div class="mt-4 space-y-1">
        <CutOffCountdown v-if="!demand.drop.closed" :cut-off-at="demand.drop.cutOffAt" :server-now="demand.serverNow" />
        <p v-else class="font-semibold">Orders closed {{ formatCutOff(demand.drop.cutOffAt) }}</p>
        <p class="text-stone-700">Drop day: {{ formatDropDate(demand.drop.dropAt) }}</p>
      </div>

      <section class="mt-4 gc-card p-4" aria-labelledby="tiers">
        <h2 id="tiers" class="text-lg font-bold">Booked so far</h2>
        <OwnerDemandTiers
          class="mt-2"
          :paid="demand.units.paid"
          :likely="demand.units.likely"
          :open-requested="demand.units.openRequested"
          :capacity="demand.drop.capacity"
          :spaces-left="demand.units.spacesLeft"
        />
        <p class="mt-2 text-sm text-stone-700">
          Likely uses a {{ formatPercent(demand.units.conversion.rate, 0) }} request-to-paid rate{{ demand.units.conversion.fallback ? ' (default value: fewer than 3 finished drops)' : ' from finished drops' }}.
        </p>
        <p class="mt-2" :class="demand.units.turnedAway > 0 ? 'font-semibold text-red-800' : 'text-stone-900'">
          Turned away: {{ demand.units.turnedAway }} units{{ demand.units.turnedAway > 0 ? ' (wanted but the drop was full)' : '' }}
        </p>
      </section>

      <section v-if="!demand.drop.closed" class="mt-4 gc-card p-4" aria-labelledby="projection">
        <h2 id="projection" class="text-lg font-bold">Projected pre-orders</h2>
        <p class="text-sm text-stone-700">{{ methodLabel[demand.forecast.method] }}</p>
        <p v-if="demand.forecast.range" class="mt-1 text-2xl font-bold">
          about {{ demand.forecast.range.low }} to {{ demand.forecast.range.high }} units
        </p>
        <p v-if="demand.forecast.range" class="text-sm text-stone-700">
          {{ demand.forecast.range.fallback ? 'Range is a default plus or minus 10%: no scored drops yet.' : `Range from the recent error of ${plural(demand.forecast.errorBandDrops, 'scored drop', 'scored drops')}.` }}
        </p>
        <p v-if="demand.forecast.closedDrops === 0" class="mt-1">No finished drops yet, so there is nothing to project from.</p>
        <dl class="mt-3 grid grid-cols-2 gap-2">
          <div class="rounded-xl bg-cane-50 p-3">
            <dt class="text-sm font-semibold">Baseline</dt>
            <dd>{{ demand.forecast.baseline !== null ? `${demand.forecast.baseline} units` : 'no history yet' }}</dd>
          </div>
          <div class="rounded-xl bg-cane-50 p-3">
            <dt class="text-sm font-semibold">Pace</dt>
            <dd>{{ paceText }}</dd>
          </div>
        </dl>
      </section>

      <section v-if="!demand.drop.closed" class="mt-4 gc-card p-4" aria-labelledby="buffer">
        <h2 id="buffer" class="sr-only">Buffer setting</h2>
        <OwnerBufferSetting
          :model-value="demand.unplannedBuffer.setting"
          :units="demand.unplannedBuffer.units"
          :low-confidence="demand.unplannedBuffer.lowConfidence"
          :saving="savingBuffer"
          @update:model-value="setBuffer"
        />
        <p v-if="bufferError" role="alert" class="mt-2 font-semibold text-red-700">{{ bufferError }}</p>
      </section>

      <section class="mt-4 gc-card p-4" aria-labelledby="planned-share">
        <h2 id="planned-share" class="text-lg font-bold">Planned share</h2>
        <p v-if="demand.plannedShare?.kind === 'estimate'">
          {{ demand.plannedShare.preordered }} of {{ demand.plannedShare.expected }} expected units pre-ordered (estimate)
        </p>
        <p v-else-if="demand.plannedShare?.kind === 'exact'">
          <strong>{{ formatPercent(demand.plannedShare.share, 0) }}</strong> pre-ordered:
          {{ demand.plannedShare.preordered }} pre-ordered, {{ demand.plannedShare.unplanned }} sold without a pre-order
        </p>
        <p v-else class="text-stone-700">Shown once there is a suggestion or the batch is closed.</p>
      </section>

      <section v-if="demand.actuals" class="mt-4 gc-card p-4" aria-labelledby="actuals">
        <h2 id="actuals" class="text-lg font-bold">How it went</h2>
        <ul class="mt-1 space-y-1">
          <li>Demand: <strong>{{ demand.actuals.demand }} units</strong> ({{ demand.units.paid }} paid + {{ demand.units.turnedAway }} turned away)</li>
          <li v-if="demand.actuals.snapshotPace !== null">
            Forecast at the checkpoint (pace): {{ demand.actuals.snapshotPace }} units, off by {{ Math.abs(demand.actuals.snapshotPace - demand.actuals.demand) }}
          </li>
          <li v-if="demand.actuals.snapshotBaseline !== null">Baseline at the checkpoint: {{ demand.actuals.snapshotBaseline }} units</li>
          <li v-if="demand.actuals.made !== null">Made {{ demand.actuals.made }}, sold without pre-order {{ demand.actuals.unplanned }}, wasted {{ demand.actuals.wasted }}</li>
          <li v-else class="text-stone-700">Batch not closed yet.</li>
        </ul>
      </section>

      <section class="mt-4 gc-card p-4" aria-labelledby="by-flavour">
        <h2 id="by-flavour" class="text-lg font-bold">Booked so far, by flavour</h2>
        <ul v-if="demand.byFlavour.length" class="mt-2 divide-y divide-stone-200">
          <li v-for="line in demand.byFlavour" :key="line.flavour" class="flex items-center gap-2 py-2">
            <span class="inline-block size-3 shrink-0 rounded-full" :style="{ background: flavourColour(line.flavour) }" aria-hidden="true" />
            <span class="flex-1">{{ line.flavour }}</span>
            <span class="text-right">Paid <strong>{{ line.paid }}</strong>, likely {{ line.likely }}</span>
          </li>
        </ul>
        <p v-else class="mt-1 text-stone-700">Nothing booked for this drop yet.</p>
        <p class="mt-2 text-sm text-stone-700">The forecast is for the total, not per flavour. Lapsed requests are left out.</p>
      </section>

      <p class="mt-4 text-sm text-stone-700">
        1 unit = one 330ml bottle; larger sizes count as more{{ weightsText ? ` (${weightsText})` : '' }}.
      </p>

      <OwnerPilotMetrics v-if="metricsBody?.metrics" class="mt-4" :metrics="metricsBody.metrics" />
    </template>
  </div>
</template>

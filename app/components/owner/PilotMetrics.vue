<script setup lang="ts">
// The four required pilot metrics (spec section 10), as plain numbers.
import type { PilotMetrics } from '~~/server/services/owner/metrics'

const props = defineProps<{ metrics: PilotMetrics }>()
const pct = (value: number | null) => (value === null ? 'Not enough data yet' : formatPercent(value))
const m = computed(() => props.metrics)
// Positive bias means forecasting too high (BR-FC11).
const biasText = computed(() => {
  const bias = m.value.accuracy.bias
  if (bias === null) return 'not enough data'
  if (bias === 0) return '0% (no lean)'
  return bias > 0 ? `+${formatPercent(bias)} (forecast too high)` : `${formatPercent(bias)} (forecast too low)`
})
</script>

<template>
  <section aria-labelledby="pilot-metrics" class="gc-card p-4">
    <h2 id="pilot-metrics" class="text-lg font-bold">Pilot metrics</h2>
    <dl class="mt-3 space-y-3">
      <div>
        <dt class="font-semibold">Repeat-order rate</dt>
        <dd>
          <strong class="text-xl">{{ pct(m.repeatOrders.rate) }}</strong>
          <span class="block text-sm text-stone-700">
            {{ m.repeatOrders.repeated }} of {{ m.repeatOrders.eligible }} customers who could order again did
          </span>
        </dd>
      </div>
      <div>
        <dt class="font-semibold">Confirmed weekly orders</dt>
        <dd>
          <ul class="text-sm">
            <li v-for="week in m.confirmedWeekly" :key="week.weekStart">
              Week of {{ formatShortDate(week.weekStart) }}: <strong>{{ plural(week.orders, 'order', 'orders') }}</strong>, {{ plural(week.units, 'unit', 'units') }}
            </li>
          </ul>
        </dd>
      </div>
      <div>
        <dt class="font-semibold">Cancellations</dt>
        <dd>
          <strong class="text-xl">{{ pct(m.cancellations.rate) }}</strong>
          <span class="block text-sm text-stone-700">
            {{ m.cancellations.customerCancelled }} of {{ m.cancellations.paidOrders }} paid orders cancelled by the customer;
            {{ m.cancellations.ownerCancelled }} cancelled by you.
            Expired unpaid requests: {{ pct(m.cancellations.expiryRate) }} ({{ m.cancellations.expired }} of {{ m.cancellations.ordersPlaced }}).
          </span>
        </dd>
      </div>
      <div>
        <dt class="font-semibold">Forecast accuracy</dt>
        <dd>
          <template v-if="m.accuracy.scoredDrops > 0">
            <strong class="text-xl">MAPE {{ pct(m.accuracy.mape) }}</strong>
            <span class="block text-sm text-stone-700">
              Naive benchmark (last drop's demand): {{ pct(m.accuracy.naiveMape) }}.
              WAPE {{ pct(m.accuracy.wape) }}, bias {{ biasText }}.
              From {{ plural(m.accuracy.scoredDrops, 'scored drop', 'scored drops') }}.
            </span>
          </template>
          <span v-else class="text-stone-700">No scored drops yet: a drop is scored once it closes with a pace snapshot.</span>
        </dd>
      </div>
    </dl>
    <p class="mt-3 rounded-xl bg-cream-200 p-3 text-sm text-stone-900">
      Honesty note: this forecast learns from seeded data, so it shows the method works, not real accuracy.
    </p>
  </section>
</template>

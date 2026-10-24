<script setup lang="ts">
// O6 "Metrics": the four required pilot metrics (spec section 10) with the honesty note (5.9).
import type { PilotMetrics } from '~~/server/services/owner/metrics'

definePageMeta({ middleware: 'owner' })
useHead({ title: 'Metrics (owner) | GoodCane Drops' })

const { data, status, refresh } = await useFetch<{ metrics: PilotMetrics | null }>('/api/owner/metrics', { key: 'owner-metrics' })
</script>

<template>
  <div>
    <OwnerNav />
    <h1 class="text-2xl">Metrics</h1>

    <StateLoading v-if="status === 'pending' && !data" class="mt-4" />
    <StateError v-else-if="status === 'error'" class="mt-4" message="We couldn't load the metrics." @retry="refresh()" />
    <p v-else-if="!data?.metrics" class="mt-4 gc-card p-4">No drops yet, so there is nothing to measure.</p>
    <OwnerPilotMetrics v-else class="mt-4" :metrics="data.metrics" />
  </div>
</template>

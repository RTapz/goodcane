<script setup lang="ts">
// O3 "Close batch" (spec 5.10, BR-B1 to B4): units made and unplanned sold, wasted optional and
// calculated if left out; a non-blocking warning when the numbers do not add up. Closing is final.
// In demo mode a drop can be closed early, after a confirmation, while another open drop remains.
import type { CloseInfo } from '~~/server/services/owner/close-batch'
import { closeBatch, EARLY_CLOSE_WARNING } from '../../../server/domain/batch/close'

definePageMeta({ middleware: 'owner' })
useHead({ title: 'Close batch (owner) | GoodCane Drops' })

const route = useRoute()
const { data: dropList, refresh: refreshDrops } = await useFetch<{ drops: { id: string; dropAt: string; cutOffAt: string; status: string; closed: boolean }[] }>(
  '/api/owner/drops',
  { key: 'owner-drops' }
)
// Default: the most recent drop past its cut-off that is not closed yet, else the most recent drop.
const firstToClose = computed(() => dropList.value?.drops.find((d) => d.closed && d.status !== 'completed') ?? dropList.value?.drops[0] ?? null)
const selected = ref<string>((route.query.drop as string | undefined) ?? firstToClose.value?.id ?? '')

const { data: info, refresh } = await useFetch<CloseInfo>(() => `/api/owner/close/${selected.value}`, {
  key: 'owner-close',
  immediate: !!selected.value,
  watch: [selected]
})

const unitsMade = ref<number | null>(null)
const unplannedSold = ref<number | null>(null)
const wasted = ref<number | null>(null)
watch(selected, () => {
  unitsMade.value = null
  unplannedSold.value = null
  wasted.value = null
  result.value = null
})

// Live preview with the same rule the server applies.
const preview = computed(() => {
  if (!info.value || unitsMade.value === null || unplannedSold.value === null) return null
  return closeBatch({ ordersSold: info.value.ordersSold, unitsMade: unitsMade.value, unplannedSold: unplannedSold.value, wasted: wasted.value })
})

const busy = ref(false)
const confirmingEarly = ref(false)
const error = ref<string | null>(null)
const result = ref<{ status: string; wasted: number; warning: { difference: number } | null } | null>(null)

const refusal: Record<string, string> = {
  not_past_cut_off: 'Orders for this drop are still open. Close it after the cut-off.',
  last_open_drop: 'This is the only drop customers can order for, so it cannot be closed early.',
  already_closed: 'This batch is already closed.',
  negative_wasted: 'Units made is less than orders sold plus unplanned sold.'
}

function differenceText(difference: number) {
  return difference > 0
    ? `${plural(difference, 'unit', 'units')} made but not accounted for.`
    : `${plural(-difference, 'unit', 'units')} more accounted for than made.`
}

async function submit() {
  if (!preview.value?.ok) return
  busy.value = true
  error.value = null
  try {
    const path: string = `/api/owner/close/${selected.value}`
    result.value = await $fetch<{ status: string; wasted: number; warning: { difference: number } | null }>(path, {
      method: 'POST',
      body: { unitsMade: unitsMade.value, unplannedSold: unplannedSold.value, wasted: wasted.value }
    })
    await Promise.all([refresh(), refreshDrops()])
  } catch (e) {
    const reason = (e as { data?: { data?: { reason?: string } } }).data?.data?.reason
    error.value = (reason && refusal[reason]) ?? "We couldn't close the batch. Try again."
  } finally {
    busy.value = false
    confirmingEarly.value = false
  }
}

function onClose() {
  if (info.value?.mode.ok && info.value.mode.mode === 'demo_early') confirmingEarly.value = true
  else submit()
}

const numberInput = 'mt-1 min-h-11 w-full rounded-xl border border-line-strong bg-panel-raised px-3 tabular-nums'
</script>

<template>
  <div>
    <OwnerNav />
    <h1 class="text-2xl">Close batch</h1>

    <label for="close-drop" class="mt-3 block font-semibold">Drop</label>
    <select id="close-drop" v-model="selected" :class="numberInput">
      <option v-for="d in dropList?.drops ?? []" :key="d.id" :value="d.id">
        {{ formatDropDate(d.dropAt) }} ({{ d.status === 'completed' ? 'closed' : d.closed ? 'orders closed' : 'open' }})
      </option>
    </select>

    <template v-if="info">
      <section v-if="info.stored" class="mt-4 gc-card p-4" aria-labelledby="stored-heading">
        <h2 id="stored-heading">Batch closed</h2>
        <p class="mt-1">
          Made {{ info.stored.unitsMade }} = orders sold {{ info.ordersSold }} + unplanned {{ info.stored.unplannedSold }} + wasted
          {{ info.stored.wasted }}.
        </p>
        <p class="mt-1 text-sm text-ink-muted">Closed {{ formatCutOff(info.stored.closedAt) }}. A closed batch is final.</p>
      </section>

      <form v-else class="mt-4 space-y-3 gc-card p-4" @submit.prevent="onClose">
        <p>Orders sold (paid): <strong>{{ plural(info.ordersSold, 'unit', 'units') }}</strong></p>
        <div>
          <label for="units-made" class="block font-semibold">Units made</label>
          <input id="units-made" v-model.number="unitsMade" type="number" inputmode="numeric" min="0" required :class="numberInput" />
        </div>
        <div>
          <label for="unplanned-sold" class="block font-semibold">Unplanned sold (walk-ins, chats)</label>
          <input id="unplanned-sold" v-model.number="unplannedSold" type="number" inputmode="numeric" min="0" required :class="numberInput" />
        </div>
        <div>
          <label for="wasted" class="block font-semibold">Wasted <span class="font-normal text-ink-muted">(optional)</span></label>
          <input
            id="wasted"
            :value="wasted ?? ''"
            type="number"
            inputmode="numeric"
            min="0"
            :class="numberInput"
            @input="wasted = ($event.target as HTMLInputElement).value === '' ? null : Number(($event.target as HTMLInputElement).value)"
          />
          <p class="mt-1 text-sm text-ink-muted">Leave empty and it is worked out for you.</p>
        </div>

        <p v-if="preview?.ok" class="text-sm">
          Made {{ unitsMade }} = sold {{ info.ordersSold }} + unplanned {{ unplannedSold }} + wasted {{ preview.wasted }}
        </p>
        <p v-if="preview?.ok && preview.warning" role="status" class="rounded-xl bg-warn-panel p-3 text-sm">
          These do not add up: {{ differenceText(preview.warning.difference) }} You can still close the batch.
        </p>
        <p v-if="preview && !preview.ok" role="alert" class="text-sm font-semibold text-danger">{{ refusal.negative_wasted }}</p>

        <p v-if="!info.mode.ok" class="text-sm text-ink-muted">{{ refusal[info.mode.reason] }}</p>
        <UButton
          v-else
          type="submit"
          class="min-h-11"
          :color="info.mode.mode === 'demo_early' ? 'warning' : 'primary'"
          :label="info.mode.mode === 'demo_early' ? 'Demo: close early' : 'Close batch'"
          :loading="busy"
          :disabled="busy || !preview?.ok"
        />
      </form>

      <p v-if="result?.status === 'closed'" role="status" class="mt-3 rounded-xl bg-mint-panel p-3 font-semibold text-sage">
        Batch closed. Planned share on This drop now uses these numbers.
        <template v-if="result.warning"> {{ differenceText(result.warning.difference) }}</template>
      </p>
      <p v-if="error" role="alert" class="mt-3 font-semibold text-danger">{{ error }}</p>
    </template>

    <ConfirmDialog
      v-if="confirmingEarly"
      title="Close this drop early?"
      confirm-label="Yes, close early"
      keep-label="Keep it open"
      :busy="busy"
      @confirm="submit"
      @close="confirmingEarly = false"
    >
      <p>{{ EARLY_CLOSE_WARNING }}</p>
      <p class="mt-2 text-sm text-ink-muted">Demo only: a real batch is closed after its cut-off.</p>
    </ConfirmDialog>
  </div>
</template>

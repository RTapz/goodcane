<script setup lang="ts">
// O5 "Reminders": the queue for the next drop (BR-R3 to BR-R7). Due now can be sent; Coming up
// only early in demo mode. Send gives a prefilled message with a fresh reminder link, shown once,
// and marks the row sent: one chase per customer per drop (BR-R5). The app never sends anything.
import type { Queue, QueueRow } from '~~/server/services/reminders-queue'

definePageMeta({ middleware: 'owner' })
useHead({ title: 'Reminders (owner) | GoodCane Drops' })

const { data, status, refresh } = await useFetch<Queue & { demoMode: boolean }>('/api/owner/reminders', { key: 'owner-reminders' })

const frequencyLabel = { every_drop: 'every drop', every_second_drop: 'every second drop', monthly: 'once a month' } as const

const sendingId = ref<string | null>(null)
const sent = ref<{ firstName: string; text: string; whatsappUrl: string | null } | null>(null)
const error = ref<string | null>(null)
const copied = ref(false)

async function send(row: QueueRow) {
  sendingId.value = row.reminderId
  error.value = null
  copied.value = false
  try {
    const result = await $fetch<{ text: string; whatsappUrl: string | null }>(
      `/api/owner/reminders/${row.reminderId}/send`,
      { method: 'POST' }
    )
    sent.value = { firstName: row.firstName, ...result }
  } catch {
    error.value = "That reminder couldn't be sent: it may already be sent, or the customer has ordered or opted out. The list has been refreshed."
  } finally {
    sendingId.value = null
    await refresh()
  }
}

async function copy() {
  if (!sent.value) return
  try {
    await navigator.clipboard.writeText(sent.value.text)
    copied.value = true
  } catch {
    // Clipboard blocked: the text is on screen to copy by hand.
  }
}
</script>

<template>
  <div>
    <OwnerNav />
    <h1 class="text-2xl">Reminders</h1>

    <StateLoading v-if="status === 'pending' && !data" class="mt-4" />
    <StateError v-else-if="status === 'error'" class="mt-4" message="We couldn't load the reminders." @retry="refresh()" />
    <p v-else-if="!data?.drop" class="mt-4 gc-card p-4">No drop is open, so no reminders are due.</p>

    <template v-else>
      <p class="mt-2 text-ink-muted">
        For the {{ formatDropDate(data.drop.dropAt) }} drop. Due from {{ formatCutOff(data.drop.dueAt) }} until orders close
        {{ formatCutOff(data.drop.cutOffAt) }}. One reminder per customer per drop: once sent, never again for this drop.
      </p>

      <section v-if="sent" class="mt-4 space-y-3 rounded-2xl border-2 border-sage bg-panel-raised p-4" aria-labelledby="sent-heading">
        <h2 id="sent-heading">Reminder for {{ sent.firstName }}</h2>
        <p>Marked as sent. Shown once: the link in it works until orders close.</p>
        <p class="rounded-xl bg-canvas/40 p-3 text-sm break-words">{{ sent.text }}</p>
        <div class="flex flex-wrap gap-2">
          <UButton
            v-if="sent.whatsappUrl"
            :to="sent.whatsappUrl"
            target="_blank"
            rel="noopener noreferrer"
            external
            class="min-h-11"
            label="Open WhatsApp chat"
          />
          <UButton class="min-h-11" color="neutral" variant="outline" :label="copied ? 'Copied' : 'Copy text'" @click="copy" />
        </div>
      </section>
      <p v-if="error" role="alert" class="mt-3 font-semibold text-danger">{{ error }}</p>

      <section class="mt-5" aria-labelledby="due-heading">
        <h2 id="due-heading">Due now</h2>
        <p v-if="!data.dueNow.length" class="mt-2 gc-card p-3 text-ink-muted">Nobody is due a reminder right now.</p>
        <ul v-else class="mt-2 space-y-3">
          <li v-for="row in data.dueNow" :key="row.reminderId" class="gc-card p-3">
            <p class="font-semibold">{{ row.firstName }}</p>
            <p class="text-sm text-ink-muted">{{ row.maskedPhone }}, WhatsApp, {{ frequencyLabel[row.frequency] }}</p>
            <UButton class="mt-2 min-h-11" label="Send" :loading="sendingId === row.reminderId" :disabled="sendingId !== null" @click="send(row)" />
          </li>
        </ul>
      </section>

      <section class="mt-5" aria-labelledby="coming-heading">
        <h2 id="coming-heading">Coming up</h2>
        <p class="mt-1 text-sm text-ink-muted">Due from {{ formatCutOff(data.drop.dueAt) }}.</p>
        <p v-if="!data.comingUp.length" class="mt-2 gc-card p-3 text-ink-muted">Nobody else is waiting for this drop.</p>
        <ul v-else class="mt-2 space-y-3">
          <li v-for="row in data.comingUp" :key="row.reminderId" class="gc-card p-3">
            <p class="font-semibold">{{ row.firstName }}</p>
            <p class="text-sm text-ink-muted">{{ row.maskedPhone }}, WhatsApp, {{ frequencyLabel[row.frequency] }}</p>
            <UButton
              v-if="data.demoMode"
              class="mt-2 min-h-11"
              color="neutral"
              variant="outline"
              label="Send early (demo)"
              :loading="sendingId === row.reminderId"
              :disabled="sendingId !== null"
              @click="send(row)"
            />
            <p v-else class="mt-2 text-sm text-ink-muted">Not due yet.</p>
          </li>
        </ul>
      </section>
    </template>
  </div>
</template>

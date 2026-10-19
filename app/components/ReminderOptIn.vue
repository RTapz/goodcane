<script setup lang="ts">
// Reminder opt-in (BR-R1, BR-R2, BR-R8). Nothing preselected; None is an equal choice.
// "Stop reminders" is its own control and never shares a button with an order action (BR-X2).
// No message is ever sent by the app.
import type { Me } from '~~/server/services/me'

const props = defineProps<{ source: 'c6' | 'c7' | 'c9'; compact?: boolean }>()
const { me, refresh } = useMe()

type Channel = 'whatsapp' | 'sms' | 'none'
type Frequency = 'every_drop' | 'every_second_drop' | 'monthly'

const channel = ref<Channel | null>(null)
const frequency = ref<Frequency | null>(null)
const open = ref(!props.compact)
const saving = ref(false)
const message = ref<string | null>(null)
const failed = ref(false)

const state = computed<Me['reminders']['state'] | null>(() => me.value?.reminders.state ?? null)
// After "Stop reminders", only Manage (C9) offers a fresh opt-in (BR-R8).
const resubscribing = computed(() => state.value === 'stopped' && props.source === 'c9')
const canChoose = computed(() => state.value === 'none_yet' || state.value === 'declined' || resubscribing.value)
const channelOptions = computed(() => [
  { value: 'whatsapp' as const, label: 'WhatsApp' },
  { value: 'sms' as const, label: 'SMS' },
  // None is a first choice only; after choosing it, the control is for turning reminders on.
  ...(state.value === 'none_yet' ? [{ value: 'none' as const, label: 'None' }] : [])
])
const frequencyOptions: { value: Frequency; label: string }[] = [
  { value: 'every_drop', label: 'Every drop' },
  { value: 'every_second_drop', label: 'Every second drop' },
  { value: 'monthly', label: 'Once a month' }
]
const needsFrequency = computed(() => channel.value === 'whatsapp' || channel.value === 'sms')
const complete = computed(() => channel.value === 'none' || (needsFrequency.value && !!frequency.value))

const channelLabel = (c: string | null | undefined) => (c === 'sms' ? 'SMS' : 'WhatsApp')
const frequencyLabel = (f: string | null | undefined) =>
  frequencyOptions.find((o) => o.value === f)?.label.toLowerCase() ?? ''

async function send(path: string, body: Record<string, unknown>, done: string) {
  saving.value = true
  message.value = null
  failed.value = false
  try {
    await $fetch(path, { method: 'POST', body: { ...body, source: props.source } })
    await refresh()
    message.value = done
    channel.value = null
    frequency.value = null
  } catch {
    failed.value = true
    message.value = "We couldn't save that. Try again."
  } finally {
    saving.value = false
  }
}

function save() {
  if (!complete.value) return
  if (channel.value === 'none') {
    send('/api/reminders/optout', { choice: 'none' }, 'Saved: no reminders.')
  } else {
    send('/api/reminders/optin', { channel: channel.value, frequency: frequency.value }, 'Saved: reminders are on.')
  }
}

function stop() {
  send('/api/reminders/optout', { choice: 'stop' }, 'Reminders stopped.')
}
</script>

<template>
  <section v-if="me" class="space-y-3 gc-card p-4" aria-labelledby="reminder-heading">
    <h2 id="reminder-heading" class="text-ink">{{ props.compact ? 'Reminder settings' : 'Reminders' }}</h2>

    <template v-if="state === 'opted_in'">
      <p class="text-ink">
        Reminders on: {{ channelLabel(me.reminders.channel) }}, {{ frequencyLabel(me.reminders.frequency) }}.
        GoodCane sends them by hand.
      </p>
      <UButton
        color="neutral"
        variant="outline"
        class="min-h-11"
        :loading="saving"
        :disabled="saving"
        label="Stop reminders"
        @click="stop"
      />
    </template>

    <p v-else-if="state === 'stopped' && !resubscribing" class="text-ink">
      Reminders are off. You can turn them back on in
      <NuxtLink to="/manage" class="font-semibold text-sage underline">Manage</NuxtLink>.
    </p>

    <template v-else-if="canChoose">
      <p v-if="state === 'declined'" class="text-ink">Reminders are off (you chose None).</p>
      <p v-if="resubscribing" class="text-ink">Reminders are off because you stopped them.</p>

      <UButton
        v-if="!open"
        color="neutral"
        variant="outline"
        class="min-h-11"
        :label="resubscribing ? 'Resubscribe' : state === 'declined' ? 'Turn reminders on' : 'Choose reminders'"
        @click="open = true"
      />

      <form v-else class="space-y-3" @submit.prevent="save">
        <fieldset>
          <legend class="font-semibold text-ink">
            {{ resubscribing ? 'Resubscribe to reminders by' : state === 'declined' ? 'Turn reminders on by' : 'Remind me before the next drop by' }}
          </legend>
          <div class="mt-1 grid gap-2" :class="channelOptions.length === 3 ? 'grid-cols-3' : 'grid-cols-2'">
            <label
              v-for="option in channelOptions"
              :key="option.value"
              class="flex min-h-12 cursor-pointer items-center justify-center rounded-2xl border-2 px-2 font-semibold has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-sage"
              :class="channel === option.value ? 'border-sage bg-sage text-canvas' : 'border-line-strong bg-panel-raised text-ink'"
            >
              <input v-model="channel" type="radio" :name="`channel-${props.source}`" :value="option.value" class="sr-only" />
              {{ option.label }}
            </label>
          </div>
        </fieldset>

        <fieldset v-if="needsFrequency">
          <legend class="font-semibold text-ink">How often should we remind you?</legend>
          <div class="mt-1 grid gap-2">
            <label
              v-for="option in frequencyOptions"
              :key="option.value"
              class="flex min-h-12 cursor-pointer items-center gap-3 rounded-2xl border-2 px-3 has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-sage"
              :class="frequency === option.value ? 'border-sage bg-mint-panel' : 'border-line bg-panel-raised'"
            >
              <input v-model="frequency" type="radio" :name="`frequency-${props.source}`" :value="option.value" class="size-5 accent-sage" />
              <span class="font-semibold text-ink">{{ option.label }}</span>
            </label>
          </div>
        </fieldset>

        <UButton type="submit" class="min-h-11" :disabled="!complete || saving" :loading="saving" label="Save choice" />
      </form>
    </template>

    <p v-if="message" role="status" class="text-sm font-semibold" :class="failed ? 'text-danger' : 'text-sage'">
      {{ message }}
    </p>
  </section>
</template>

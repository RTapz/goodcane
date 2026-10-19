<script setup lang="ts">
// O7 "Customers" (minimal): masked phones only, search by first name, and "Send new link" (BR-L6).
// The new link is shown once, here, so the owner can send it in a prefilled chat. Links issued
// earlier are never shown: only their hashes exist. No delete here: deletion is the customer's (C9).
import type { OwnerCustomerView } from '~~/server/services/owner/customers'

definePageMeta({ middleware: 'owner' })
useHead({ title: 'Customers (owner) | GoodCane Drops' })

const search = ref('')
const query = computed(() => (search.value.trim() ? { q: search.value.trim() } : {}))
const { data, status, refresh } = await useFetch<{ customers: OwnerCustomerView[] }>('/api/owner/customers', {
  key: 'owner-customers',
  query
})

const sendingId = ref<string | null>(null)
const fresh = ref<{ customerId: string; firstName: string | null; privateLink: string; whatsappUrl: string | null } | null>(null)
const error = ref<string | null>(null)
const copied = ref(false)

async function sendNewLink(customer: OwnerCustomerView) {
  sendingId.value = customer.id
  error.value = null
  copied.value = false
  try {
    const result = await $fetch<{ privateLink: string; whatsappUrl: string | null }>(`/api/owner/customers/${customer.id}/link`, {
      method: 'POST'
    })
    fresh.value = { customerId: customer.id, firstName: customer.firstName, ...result }
  } catch {
    error.value = "We couldn't make a new link. The list has been refreshed."
    await refresh()
  } finally {
    sendingId.value = null
  }
}

async function copy() {
  if (!fresh.value) return
  try {
    await navigator.clipboard.writeText(fresh.value.privateLink)
    copied.value = true
  } catch {
    // Clipboard blocked: the link is on screen to copy by hand.
  }
}
</script>

<template>
  <div>
    <OwnerNav />
    <h1 class="text-2xl">Customers</h1>

    <label for="customer-search" class="mt-3 block font-semibold">Search by first name</label>
    <input
      id="customer-search"
      v-model="search"
      type="search"
      maxlength="50"
      autocomplete="off"
      class="mt-1 min-h-11 w-full rounded-xl border border-line-strong bg-panel-raised px-3"
    />

    <section v-if="fresh" class="mt-4 space-y-3 rounded-2xl border-2 border-sage bg-panel-raised p-4" aria-labelledby="fresh-heading">
      <h2 id="fresh-heading">New link for {{ fresh.firstName ?? 'this customer' }}</h2>
      <p>Shown once. Their old link no longer works.</p>
      <input
        :value="fresh.privateLink"
        readonly
        aria-label="New private link"
        class="block min-h-12 w-full rounded-xl border border-line-strong bg-panel-raised px-3 font-mono text-sm"
        @focus="($event.target as HTMLInputElement).select()"
      />
      <div class="flex flex-wrap gap-2">
        <UButton class="min-h-11" :label="copied ? 'Copied' : 'Copy link'" @click="copy" />
        <UButton
          v-if="fresh.whatsappUrl"
          :to="fresh.whatsappUrl"
          target="_blank"
          rel="noopener noreferrer"
          external
          class="min-h-11"
          color="neutral"
          variant="outline"
          label="Open chat"
        />
      </div>
    </section>
    <p v-if="error" role="alert" class="mt-3 font-semibold text-danger">{{ error }}</p>

    <StateLoading v-if="status === 'pending' && !data" class="mt-4" />
    <StateError v-else-if="status === 'error'" class="mt-4" message="We couldn't load the customers." @retry="refresh()" />
    <p v-else-if="!data?.customers.length" class="mt-4 gc-card p-4">No customers match.</p>
    <ul v-else class="mt-4 space-y-3">
      <li v-for="customer in data.customers" :key="customer.id" class="gc-card p-3">
        <p class="font-semibold">{{ customer.firstName ?? 'No name kept' }}</p>
        <p class="text-sm text-ink-muted">{{ customer.maskedPhone ?? 'No phone kept' }}</p>
        <p class="mt-2 text-sm text-ink">Check the last 3 digits against the number that messaged you.</p>
        <UButton
          class="mt-2 min-h-11"
          label="Send new link"
          :loading="sendingId === customer.id"
          :disabled="sendingId !== null"
          @click="sendNewLink(customer)"
        />
      </li>
    </ul>
  </div>
</template>

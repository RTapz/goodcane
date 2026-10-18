<script setup lang="ts">
// Demo owner gate (spec 8). One passcode; a live service would use real owner accounts.
import type { FetchError } from 'ofetch'

useHead({ title: 'Owner sign-in | GoodCane Drops (Demo)' })

const passcode = ref('')
const error = ref('')
const submitting = ref(false)

async function submit() {
  error.value = ''
  if (!passcode.value) {
    error.value = 'Enter the passcode.'
    return
  }
  submitting.value = true
  try {
    await $fetch('/api/owner/login', { method: 'POST', body: { passcode: passcode.value } })
    passcode.value = ''
    await navigateTo('/owner')
  } catch (e) {
    const status = (e as FetchError).statusCode
    error.value =
      status === 429
        ? 'Too many wrong attempts. Wait 15 minutes, then try again.'
        : status === 401
          ? 'That passcode is not right.'
          : "We couldn't check the passcode. Check your connection and try again."
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <div>
    <h1 class="text-2xl font-bold">Owner screens</h1>
    <form class="mt-4 space-y-4 rounded-lg border border-stone-300 bg-white p-4" novalidate @submit.prevent="submit">
      <FormField id="owner-passcode" label="Passcode" :error="error">
        <template #default="{ invalid, describedBy }">
          <input
            id="owner-passcode"
            v-model="passcode"
            type="password"
            autocomplete="current-password"
            class="min-h-11 w-full rounded-md border border-stone-400 px-3"
            :aria-invalid="invalid"
            :aria-describedby="describedBy"
          >
        </template>
      </FormField>
      <UButton type="submit" size="xl" class="min-h-12 w-full justify-center" label="Open the owner screens" :loading="submitting" />
    </form>
    <p class="mt-3 text-sm text-stone-700">Demo gate only. A live service would use real owner accounts.</p>
  </div>
</template>

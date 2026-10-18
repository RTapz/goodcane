<script setup lang="ts">
// C3 Your details. Collects only first name, phone and (delivery only) address (spec 5.8).
import type { FetchError } from 'ofetch'
import type { FieldErrors } from '~~/server/schemas/orders'
import { normalisePhone, PHONE_HINT } from '../../server/domain/identity/phone'
import { orderTotalPesewas } from '../../server/domain/orders/totals'

const { data } = await useNextDrop()
const menu = computed(() => data.value?.menu ?? [])
const areas = computed(() => data.value?.deliveryAreas ?? [])
const { cart, priced, units, totalPesewas, attachToDrop } = useCart(menu)
const { setNotice } = useOrderNotice()

// After a reload, bring back the cart saved in this tab (if it is for the current drop).
onMounted(() => {
  const id = data.value?.drop?.id
  if (id && !cart.value.dropId) attachToDrop(id)
})

// Kept in memory only (no phone number in browser storage), so a round trip to C2 keeps the values.
const form = useState('details-form', () => ({
  firstName: '',
  phone: '',
  fulfilment: 'pickup' as 'pickup' | 'delivery',
  deliveryAddress: '',
  deliveryAreaId: ''
}))
const errors = ref<FieldErrors>({})
const submitError = ref<string | null>(null)
const submitting = ref(false)

const area = computed(() =>
  form.value.fulfilment === 'delivery' ? areas.value.find((a) => a.id === form.value.deliveryAreaId) ?? null : null
)
const total = computed(() =>
  orderTotalPesewas(
    priced.value.map(({ item, quantity }) => ({ quantity, unitPricePesewas: item.pricePesewas })),
    area.value?.feePesewas ?? 0
  )
)

const payload = computed(() => {
  const base = {
    dropId: cart.value.dropId,
    lines: cart.value.lines,
    firstName: form.value.firstName.trim(),
    phone: form.value.phone.trim()
  }
  return form.value.fulfilment === 'delivery'
    ? {
        ...base,
        fulfilment: 'delivery' as const,
        deliveryAddress: form.value.deliveryAddress.trim(),
        deliveryAreaId: form.value.deliveryAreaId
      }
    : { ...base, fulfilment: 'pickup' as const }
})

// One key per distinct submission: a double tap reuses it, a changed order gets a new one.
const idempotencyKey = ref('')
watch(
  () => JSON.stringify(payload.value),
  () => {
    if (import.meta.client) idempotencyKey.value = newIdempotencyKey()
  },
  { immediate: true }
)

function validate(): FieldErrors {
  const found: FieldErrors = {}
  if (!form.value.firstName.trim()) found.firstName = ['Enter your first name']
  const phone = normalisePhone(form.value.phone)
  if (!form.value.phone.trim()) found.phone = ['Enter your phone number']
  else if (!phone.ok) found.phone = [phone.message]
  if (form.value.fulfilment === 'delivery') {
    if (form.value.deliveryAddress.trim().length < 5) found.deliveryAddress = ['Enter the delivery address']
    if (!form.value.deliveryAreaId) found.deliveryAreaId = ['Choose a delivery area']
  }
  return found
}

const reasonMessages: Record<string, string> = {
  drop_closed: 'Orders for this drop have just closed. Your order has not been placed.'
}

async function submit() {
  submitError.value = null
  errors.value = validate()
  if (Object.keys(errors.value).length > 0) {
    await nextTick()
    document.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus()
    return
  }
  submitting.value = true
  try {
    const result = await $fetch<{ orderId: string }>('/api/orders', {
      method: 'POST',
      body: { ...payload.value, idempotencyKey: idempotencyKey.value }
    })
    await navigateTo(`/review/${result.orderId}`)
  } catch (error) {
    const e = error as FetchError<{ data?: { reason?: string; spacesLeft?: number; fieldErrors?: FieldErrors } }>
    const body = e.data?.data
    if (e.statusCode === 400 && body?.fieldErrors) {
      errors.value = body.fieldErrors
    } else if (e.statusCode === 409 && body?.reason === 'not_enough_space') {
      // Never moved silently (BR-F1): back to C2 to choose what to do.
      setNotice(`Only ${plural(body.spacesLeft ?? 0, 'space is', 'spaces are')} left in this drop. Please adjust your order.`)
      await navigateTo('/order')
    } else if (e.statusCode === 409 && body?.reason && reasonMessages[body.reason]) {
      setNotice(reasonMessages[body.reason]!)
      await navigateTo('/order')
    } else {
      idempotencyKey.value = newIdempotencyKey()
      submitError.value = "We couldn't place your order. Check your connection and try again."
    }
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <div class="space-y-4 pb-28">
    <h1 class="text-2xl font-extrabold text-stone-900">Your details</h1>

    <div v-if="units === 0" class="gc-card p-4">
      <p class="text-stone-800">Your order is empty.</p>
      <UButton to="/order" class="mt-3 min-h-11" label="Build your order" />
    </div>

    <template v-else>
      <section class="gc-card p-4" aria-label="Your order">
        <ul class="space-y-1">
          <li v-for="line in priced" :key="line.item.id" class="flex justify-between gap-2 text-stone-900">
            <span class="flex items-center gap-2">
              <FlavourTile :colour="flavourColour(line.item.name)" size="sm" />
              <span>{{ line.quantity }} x {{ line.item.name }} {{ line.item.size }}</span>
            </span>
            <span>{{ formatPesewas(line.quantity * line.item.pricePesewas) }}</span>
          </li>
        </ul>
        <p class="mt-2 border-t border-stone-200 pt-2 text-sm text-stone-700">
          {{ units }} {{ units === 1 ? 'bottle' : 'bottles' }}, {{ formatPesewas(totalPesewas) }}
          <NuxtLink to="/order" class="ml-1 font-semibold text-cane-700 underline">Change</NuxtLink>
        </p>
      </section>

      <form id="details-form" class="space-y-4" novalidate @submit.prevent="submit">
        <FormField id="first-name" label="First name" :error="errors.firstName?.[0]">
          <template #default="{ invalid, describedBy }">
            <input
              id="first-name"
              v-model="form.firstName"
              type="text"
              autocomplete="given-name"
              maxlength="50"
              :aria-invalid="invalid"
              :aria-describedby="describedBy"
              class="block min-h-12 w-full rounded-xl border border-stone-400 bg-white px-3 text-lg text-stone-900 aria-invalid:border-red-700"
            />
          </template>
        </FormField>

        <FormField id="phone" label="Phone number" :hint="PHONE_HINT" :error="errors.phone?.[0]">
          <template #default="{ invalid, describedBy }">
            <input
              id="phone"
              v-model="form.phone"
              type="tel"
              inputmode="tel"
              autocomplete="tel"
              maxlength="30"
              :aria-invalid="invalid"
              :aria-describedby="describedBy"
              class="block min-h-12 w-full rounded-xl border border-stone-400 bg-white px-3 text-lg text-stone-900 aria-invalid:border-red-700"
            />
          </template>
        </FormField>

        <fieldset>
          <legend class="font-semibold text-stone-900">How do you want to get it?</legend>
          <div class="mt-1 grid grid-cols-2 gap-2">
            <label
              v-for="option in [{ value: 'pickup', label: 'Pickup' }, { value: 'delivery', label: 'Delivery' }]"
              :key="option.value"
              class="flex min-h-12 cursor-pointer items-center justify-center rounded-2xl border-2 px-2 font-semibold has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-cane-700"
              :class="form.fulfilment === option.value ? 'border-cane-700 bg-cane-700 text-white' : 'border-stone-400 bg-white text-stone-900'"
            >
              <input v-model="form.fulfilment" type="radio" name="fulfilment" :value="option.value" class="sr-only" />
              {{ option.label }}
            </label>
          </div>
        </fieldset>

        <template v-if="form.fulfilment === 'delivery'">
          <FormField id="address" label="Delivery address" :error="errors.deliveryAddress?.[0]">
            <template #default="{ invalid, describedBy }">
              <textarea
                id="address"
                v-model="form.deliveryAddress"
                rows="2"
                autocomplete="street-address"
                maxlength="200"
                :aria-invalid="invalid"
                :aria-describedby="describedBy"
                class="block w-full rounded-xl border border-stone-400 bg-white px-3 py-2 text-lg text-stone-900 aria-invalid:border-red-700"
              />
            </template>
          </FormField>

          <fieldset :aria-describedby="errors.deliveryAreaId ? 'area-error' : undefined">
            <legend class="font-semibold text-stone-900">Delivery area</legend>
            <div class="mt-1 space-y-2">
              <label
                v-for="option in areas"
                :key="option.id"
                class="flex min-h-12 cursor-pointer items-center justify-between gap-2 rounded-2xl border-2 px-3 has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-cane-700"
                :class="form.deliveryAreaId === option.id ? 'border-cane-700 bg-cane-50' : 'border-stone-300 bg-white'"
              >
                <span class="flex items-center gap-2">
                  <input
                    v-model="form.deliveryAreaId"
                    type="radio"
                    name="area"
                    :value="option.id"
                    :aria-invalid="!!errors.deliveryAreaId"
                    class="size-5 accent-cane-700"
                  />
                  <span class="font-semibold text-stone-900">{{ option.name }}</span>
                </span>
                <span class="text-sm text-stone-700">{{ formatPesewas(option.feePesewas) }} fee</span>
              </label>
            </div>
            <p v-if="errors.deliveryAreaId" id="area-error" class="mt-1 text-sm font-semibold text-red-700">
              {{ errors.deliveryAreaId[0] }}
            </p>
          </fieldset>
        </template>
        <p v-else class="rounded-2xl bg-white p-3 text-sm text-stone-700">
          Pickup at the pickup point, Accra, on drop day.
        </p>

        <p v-if="submitError" role="alert" class="rounded-2xl border border-red-300 bg-white p-3 font-semibold text-stone-900">
          {{ submitError }}
        </p>
      </form>

      <StickyActionBar>
        <div>
          <p class="font-bold text-stone-900">{{ formatPesewas(total) }}</p>
          <p class="text-sm text-stone-700">{{ area ? `Includes ${formatPesewas(area.feePesewas)} delivery fee` : 'No delivery fee' }}</p>
        </div>
        <UButton
          type="submit"
          form="details-form"
          size="xl"
          class="min-h-12 px-6"
          :loading="submitting"
          :disabled="submitting"
          label="Continue"
        />
      </StickyActionBar>
    </template>
  </div>
</template>

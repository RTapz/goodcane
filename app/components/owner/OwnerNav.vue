<script setup lang="ts">
// Owner screens: This drop (O1), Metrics (O6), Orders (O2), Close batch (O3), Reminders (O5), Customers (O7), Log out.
const route = useRoute()
const loggingOut = ref(false)

async function logOut() {
  loggingOut.value = true
  try {
    await $fetch('/api/owner/logout', { method: 'POST' })
  } finally {
    loggingOut.value = false
    await navigateTo('/owner/login')
  }
}

const links = [
  { to: '/owner', label: 'This drop' },
  { to: '/owner/metrics', label: 'Metrics' },
  { to: '/owner/orders', label: 'Orders' },
  { to: '/owner/close', label: 'Close batch' },
  { to: '/owner/reminders', label: 'Reminders' },
  { to: '/owner/customers', label: 'Customers' }
]
</script>

<template>
  <nav aria-label="Owner" class="mb-4 flex flex-wrap items-center gap-1 border-b border-line pb-2">
    <NuxtLink
      v-for="link in links"
      :key="link.to"
      :to="link.to"
      class="inline-flex min-h-11 items-center rounded-full px-3 font-semibold text-sage hover:bg-mint-panel"
      :class="route.path === link.to ? 'bg-mint-panel underline underline-offset-4' : ''"
      :aria-current="route.path === link.to ? 'page' : undefined"
    >
      {{ link.label }}
    </NuxtLink>
    <UButton
      class="ml-auto min-h-11"
      color="neutral"
      variant="ghost"
      label="Log out"
      :loading="loggingOut"
      @click="logOut"
    />
  </nav>
</template>

<script setup lang="ts">
// Taste tiles (spec 6.4). Each shows the bottle of one flavour from that group.
const tastes = [
  { value: 'sweet', label: 'Sweet', flavour: 'Raw cane' },
  { value: 'spicy', label: 'Spicy', flavour: 'Ginger-lemon cane' },
  { value: 'sour', label: 'Sour', flavour: 'Lemon-mint cane' }
] as const
</script>

<template>
  <nav aria-labelledby="taste-heading">
    <h2 id="taste-heading" class="text-base text-ink">What are you in the mood for?</h2>
    <ul class="mt-3 grid grid-cols-3 gap-3">
      <li v-for="taste in tastes" :key="taste.value">
        <NuxtLink
          :to="{ path: '/order', query: { taste: taste.value } }"
          class="gc-card flex min-h-24 flex-col items-center justify-center gap-1.5 px-2 py-3 font-semibold text-sage hover:ring-2 hover:ring-sage focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sage"
        >
          <FlavourBottle :name="taste.flavour" size="sm" />
          {{ taste.label }}
        </NuxtLink>
      </li>
    </ul>
  </nav>
</template>

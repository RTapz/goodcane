<script setup lang="ts">
// Round taste tiles (spec 6.4). Each shows a bottle in the colour of a flavour from that group.
const tastes = [
  { value: 'sweet', label: 'Sweet', colour: flavourColour('Raw cane') },
  { value: 'spicy', label: 'Spicy', colour: flavourColour('Ginger-lemon cane') },
  { value: 'sour', label: 'Sour', colour: flavourColour('Lemon-mint cane') }
] as const
</script>

<template>
  <nav aria-labelledby="taste-heading">
    <h2 id="taste-heading" class="text-base font-bold text-stone-900">What are you in the mood for?</h2>
    <ul class="mt-3 grid grid-cols-3 gap-3">
      <li v-for="taste in tastes" :key="taste.value">
        <NuxtLink
          :to="{ path: '/order', query: { taste: taste.value } }"
          class="gc-card flex min-h-24 flex-col items-center justify-center gap-1.5 px-2 py-3 font-semibold text-cane-800 hover:ring-2 hover:ring-cane-600 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cane-700"
        >
          <FlavourTile :colour="taste.colour" size="md" />
          {{ taste.label }}
        </NuxtLink>
      </li>
    </ul>
  </nav>
</template>

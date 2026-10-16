<script setup lang="ts">
const tastes = [
  { value: 'sweet', label: 'Sweet' },
  { value: 'spicy', label: 'Spicy' },
  { value: 'sour', label: 'Sour' }
] as const
</script>

<template>
  <nav aria-labelledby="taste-heading">
    <h2 id="taste-heading" class="text-base font-bold text-stone-900">What are you in the mood for?</h2>
    <ul class="mt-2 grid grid-cols-3 gap-2">
      <li v-for="taste in tastes" :key="taste.value">
        <NuxtLink
          :to="{ path: '/order', query: { taste: taste.value } }"
          class="flex min-h-12 items-center justify-center rounded-lg border-2 border-cane-700 bg-white px-2 font-semibold text-cane-800 hover:bg-cane-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cane-700"
        >
          {{ taste.label }}
        </NuxtLink>
      </li>
    </ul>
  </nav>
</template>

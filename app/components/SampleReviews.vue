<script setup lang="ts">
// Invented for the demo. Never copy real customer reviews (spec 6.4).
const reviews = [
  { name: 'Sample customer A', text: 'Reserved on Monday, picked up on Tuesday. No chasing anyone on WhatsApp.' },
  { name: 'Sample customer B', text: 'The lemon-mint is my usual now. Reordering took two taps.' },
  { name: 'Sample customer C', text: 'Nice to know my bottles are set aside before the drop.' }
]
</script>

<template>
  <section aria-labelledby="reviews-heading">
    <h2 id="reviews-heading" class="text-base font-bold text-stone-900">What people say</h2>
    <ul class="mt-2 space-y-2">
      <li v-for="review in reviews" :key="review.name" class="rounded-lg bg-white p-3 shadow-sm">
        <UBadge label="Sample review" color="neutral" variant="subtle" size="sm" />
        <p class="mt-1 text-stone-800">"{{ review.text }}"</p>
        <p class="mt-1 text-sm text-stone-600">{{ review.name }}</p>
      </li>
    </ul>
  </section>
</template>

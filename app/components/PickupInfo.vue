<script setup lang="ts">
defineProps<{ start: string; end: string }>()
</script>

<template>
  <section aria-labelledby="pickup-heading" class="gc-card p-3">
    <h2 id="pickup-heading" class="text-base text-ink">Pickup</h2>
    <p class="mt-1 text-ink">{{ PICKUP_LOCATION }}</p>
    <p class="text-ink">Drop days, {{ start }} to {{ end }} </p>
  </section>
</template>

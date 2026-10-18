<script setup lang="ts">
defineProps<{ start: string; end: string }>()
</script>

<template>
  <section aria-labelledby="pickup-heading" class="gc-card p-3">
    <h2 id="pickup-heading" class="text-base font-bold text-stone-900">Pickup</h2>
    <p class="mt-1 text-stone-800">Pickup point, Accra</p>
    <p class="text-stone-800">Drop days, {{ start }} to {{ end }} </p>
  </section>
</template>

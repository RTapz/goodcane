<script setup lang="ts">
// C5 Simulated payment: placeholder until the next slice.
const route = useRoute()
const orderId = computed(() => (typeof route.query.order === 'string' ? route.query.order : null))
</script>

<template>
  <div class="space-y-4">
    <h1 class="text-2xl font-extrabold text-stone-900">Demo payment</h1>
    <p class="rounded-lg bg-cream-200 p-3 text-stone-900">Payment comes in the next slice. No money is ever taken in this demo.</p>
    <UButton
      :to="orderId ? `/review/${orderId}` : '/'"
      color="neutral"
      variant="outline"
      class="min-h-11"
      :label="orderId ? 'Back to review' : 'Back to this drop'"
    />
  </div>
</template>

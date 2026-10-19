<script setup lang="ts">
// C8 "Lost your link?": a prefilled chat to GoodCane (the demo number only), or the text to copy
// when no number is set. It asks for the first name only and never carries a token.
const { data } = useFetch<{ text: string; whatsappUrl: string | null }>('/api/lost-link', { key: 'lost-link', lazy: true })
const copied = ref(false)

async function copy() {
  if (!data.value) return
  try {
    await navigator.clipboard.writeText(data.value.text)
    copied.value = true
  } catch {
    // Clipboard blocked: the text is on screen to copy by hand.
  }
}
</script>

<template>
  <section class="space-y-2 gc-card p-4" aria-labelledby="lost-link-heading">
    <h2 id="lost-link-heading" class="text-ink">Lost your link?</h2>
    <p class="text-ink-muted">Message GoodCane with your first name and they will send you a new one.</p>
    <template v-if="data">
      <UButton
        v-if="data.whatsappUrl"
        :to="data.whatsappUrl"
        target="_blank"
        rel="noopener noreferrer"
        external
        class="min-h-11"
        label="Message GoodCane"
      />
      <template v-else>
        <p class="rounded-xl bg-panel-raised p-3 text-ink">{{ data.text }}</p>
        <UButton class="min-h-11" color="neutral" variant="outline" :label="copied ? 'Copied' : 'Copy message'" @click="copy" />
      </template>
    </template>
  </section>
</template>

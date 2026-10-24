<script setup lang="ts">
// The private link, shown once (BR-L4), with Copy and Send to my WhatsApp.
const props = defineProps<{ privateLink: string; whatsappUrl: string | null }>()

const copied = ref(false)
const input = useTemplateRef<HTMLInputElement>('linkInput')

async function copy() {
  try {
    await navigator.clipboard.writeText(props.privateLink)
    copied.value = true
  } catch {
    // Clipboard blocked: select the text so the customer can copy it by hand.
    input.value?.select()
  }
}
</script>

<template>
  <section class="space-y-3 rounded-2xl border-2 border-sage bg-panel-raised p-4" aria-labelledby="link-heading">
    <h2 id="link-heading" class="text-lg text-ink">Your private link</h2>
    <p class="text-ink">
      This link opens your orders on any phone. It works like a key, so keep it to yourself.
      <strong>It is shown only once.</strong>
    </p>
    <label for="private-link" class="sr-only">Private link</label>
    <input
      id="private-link"
      ref="linkInput"
      :value="props.privateLink"
      readonly
      class="block min-h-12 w-full rounded-xl border border-line-strong bg-panel-raised px-3 font-mono text-sm text-ink"
      @focus="($event.target as HTMLInputElement).select()"
    />
    <div class="grid gap-2">
      <UButton block size="xl" class="min-h-12" :label="copied ? 'Copied' : 'Copy link'" @click="copy" />
      <UButton
        v-if="props.whatsappUrl"
        :to="props.whatsappUrl"
        target="_blank"
        rel="noopener noreferrer"
        external
        block
        size="xl"
        color="neutral"
        variant="outline"
        class="min-h-12"
        label="Send to my WhatsApp"
      />
    </div>
    <p v-if="copied" role="status" class="text-sm font-semibold text-sage">Link copied.</p>
  </section>
</template>

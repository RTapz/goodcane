<script setup lang="ts">
// The private link, shown once (BR-L4), with Copy, Send to my WhatsApp and Add to home screen.
const props = defineProps<{ privateLink: string; whatsappUrl: string | null }>()

const copied = ref(false)
const showInstallHelp = ref(false)
const input = useTemplateRef<HTMLInputElement>('linkInput')
const { canPrompt, installed, install } = useInstallPrompt()

async function copy() {
  try {
    await navigator.clipboard.writeText(props.privateLink)
    copied.value = true
  } catch {
    // Clipboard blocked: select the text so the customer can copy it by hand.
    input.value?.select()
  }
}

async function addToHomeScreen() {
  if (canPrompt.value) {
    await install()
  } else {
    showInstallHelp.value = true
  }
}
</script>

<template>
  <section class="space-y-3 rounded-2xl border-2 border-cane-700 bg-white p-4" aria-labelledby="link-heading">
    <h2 id="link-heading" class="text-lg font-bold text-stone-900">Your private link</h2>
    <p class="text-stone-800">
      This link opens your orders on any phone. It works like a key, so keep it to yourself.
      <strong>It is shown only once.</strong>
    </p>
    <label for="private-link" class="sr-only">Private link</label>
    <input
      id="private-link"
      ref="linkInput"
      :value="props.privateLink"
      readonly
      class="block min-h-12 w-full rounded-xl border border-stone-400 bg-cream-50 px-3 font-mono text-sm text-stone-900"
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
        label="Send to my WhatsApp (demo number)"
      />
      <UButton
        v-if="!installed"
        block
        size="xl"
        color="neutral"
        variant="outline"
        class="min-h-12"
        label="Add to home screen"
        @click="addToHomeScreen"
      />
    </div>
    <p v-if="copied" role="status" class="text-sm font-semibold text-cane-800">Link copied.</p>
    <p v-if="showInstallHelp" role="status" class="rounded-2xl bg-cream-200 p-3 text-sm text-stone-900">
      In your browser menu, choose <strong>Add to Home Screen</strong> (on iPhone: the Share button, then Add to Home Screen).
    </p>
    <p v-if="props.whatsappUrl" class="text-sm text-stone-700">
      Demo: WhatsApp opens a chat with the developer's own number, never GoodCane's or a customer's.
    </p>
  </section>
</template>

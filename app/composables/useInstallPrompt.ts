// "Add to home screen": uses the browser's install prompt where it exists (Chrome on Android),
// otherwise the page shows short instructions (Safari on iPhone has no prompt).

interface InstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

export function useInstallPrompt() {
  const deferred = shallowRef<InstallPromptEvent | null>(null)
  const installed = ref(false)

  const onPrompt = (event: Event) => {
    event.preventDefault()
    deferred.value = event as InstallPromptEvent
  }
  const onInstalled = () => {
    installed.value = true
    deferred.value = null
  }

  onMounted(() => {
    window.addEventListener('beforeinstallprompt', onPrompt)
    window.addEventListener('appinstalled', onInstalled)
    installed.value = window.matchMedia('(display-mode: standalone)').matches
  })
  onBeforeUnmount(() => {
    window.removeEventListener('beforeinstallprompt', onPrompt)
    window.removeEventListener('appinstalled', onInstalled)
  })

  async function install(): Promise<boolean> {
    const event = deferred.value
    if (!event) return false
    await event.prompt()
    const choice = await event.userChoice
    deferred.value = null
    return choice.outcome === 'accepted'
  }

  return { canPrompt: computed(() => !!deferred.value), installed, install }
}

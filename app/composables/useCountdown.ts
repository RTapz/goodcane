import type { MaybeRefOrGetter } from 'vue'

/**
 * Time left until `target`, ticking every second in the browser.
 * Corrects for a wrong phone clock using the server's time from the last fetch.
 */
export function useCountdown(target: MaybeRefOrGetter<string>, serverNow: MaybeRefOrGetter<string>) {
  const clockOffset = ref(0)
  const now = ref(Date.now())
  let timer: ReturnType<typeof setInterval> | undefined

  watch(
    () => toValue(serverNow),
    (value) => {
      clockOffset.value = Date.parse(value) - Date.now()
    },
    { immediate: true }
  )

  onMounted(() => {
    now.value = Date.now()
    timer = setInterval(() => {
      now.value = Date.now()
    }, 1000)
  })
  onBeforeUnmount(() => clearInterval(timer))

  const remainingMs = computed(() => Math.max(0, Date.parse(toValue(target)) - (now.value + clockOffset.value)))
  const parts = computed(() => splitDuration(remainingMs.value))
  const done = computed(() => remainingMs.value === 0)

  return { remainingMs, parts, done }
}

export interface RecognisedCustomer {
  firstName: string
}

/**
 * The customer recognised from a session cookie.
 * Stub: always null until GET /api/me exists (C6/C7 slices).
 */
export function useCustomer() {
  const customer = ref<RecognisedCustomer | null>(null)
  return { customer }
}

import type { Me } from '~~/server/services/me'

/**
 * The returning customer, from this browser's session cookie (GET /api/me).
 * No session means null: nobody is ever recognised by phone (BR-L7).
 * Pages that render it on the server await `ready` first.
 */
export function useMe() {
  const result = useFetch<Me>('/api/me', { key: 'me' })
  const me = computed<Me | null>(() => (result.error.value ? null : (result.data.value ?? null)))
  return {
    me,
    status: result.status,
    refresh: result.refresh,
    ready: Promise.resolve(result).then(() => undefined)
  }
}

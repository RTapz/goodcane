import type { NextDropResponse } from '~~/server/schemas/drops'

/** The drop to order for, its spaces left and the menu. Shared by C1, C2 and C3. */
export function useNextDrop() {
  return useFetch<NextDropResponse>('/api/drops/next', { key: 'next-drop' })
}

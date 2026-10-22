// "How many bottles did you want?" on a completely full drop (BR-F2, C2). Sends the row once per
// drop per browser: the idempotency key is reused across taps and reloads (utils/turned-away-key).
import { turnedAwayKey } from '../utils/turned-away-key'

// Fallback when localStorage is blocked: lives as long as the page.
const memory = new Map<string, string>()

function browserStorage() {
  try {
    return window.localStorage
  } catch {
    return null
  }
}

export function useTurnedAway() {
  /** Resolves when the server recorded it, now or before (a repeated key). Throws on any other answer. */
  async function tellGoodCane(dropId: string, units: number): Promise<void> {
    const idempotencyKey = turnedAwayKey(dropId, { storage: browserStorage(), memory, newId: () => crypto.randomUUID() })
    await $fetch('/api/orders/turned-away', { method: 'POST', body: { dropId, units, idempotencyKey } })
  }
  return { tellGoodCane }
}

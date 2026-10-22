// One idempotency key per drop per browser for "I wanted N" on a full drop (BR-F2, C2). Taps and
// reloads reuse it, so the server writes one row. localStorage can be blocked (private mode, full
// quota): then the key lives in memory for this page, which still stops repeated taps.

export interface KeyStorage {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
}

const PREFIX = 'gc-turned-away:'

export function turnedAwayKey(
  dropId: string,
  ctx: { storage: KeyStorage | null; memory: Map<string, string>; newId: () => string }
): string {
  const name = PREFIX + dropId
  try {
    const stored = ctx.storage?.getItem(name)
    if (stored) return stored
  } catch {
    // Blocked storage: fall through to memory.
  }
  const remembered = ctx.memory.get(name)
  if (remembered) return remembered

  const key = ctx.newId()
  ctx.memory.set(name, key)
  try {
    ctx.storage?.setItem(name, key)
  } catch {
    // Blocked storage: memory keeps it for this page.
  }
  return key
}

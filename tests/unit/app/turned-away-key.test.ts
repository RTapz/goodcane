// One idempotency key per drop per browser for "I wanted N" on a full drop (BR-F2): taps and
// reloads reuse it, so the server writes one row. Storage can be blocked; memory is the fallback.
import { describe, expect, it } from 'vitest'
import { turnedAwayKey, type KeyStorage } from '../../../app/utils/turned-away-key'

function fakeStorage(): KeyStorage & { data: Map<string, string> } {
  const data = new Map<string, string>()
  return { data, getItem: (k) => data.get(k) ?? null, setItem: (k, v) => void data.set(k, v) }
}
const blocked: KeyStorage = {
  getItem: () => {
    throw new Error('blocked')
  },
  setItem: () => {
    throw new Error('blocked')
  }
}
let n = 0
const newId = () => `id-${++n}`

describe('turnedAwayKey', () => {
  it('returns the same key for the same drop, every time, and survives a reload (same storage)', () => {
    const storage = fakeStorage()
    const first = turnedAwayKey('drop-a', { storage, memory: new Map(), newId })
    expect(turnedAwayKey('drop-a', { storage, memory: new Map(), newId })).toBe(first)
  })

  it('gives another drop its own key', () => {
    const storage = fakeStorage()
    expect(turnedAwayKey('drop-a', { storage, memory: new Map(), newId })).not.toBe(
      turnedAwayKey('drop-b', { storage, memory: new Map(), newId })
    )
  })

  it('falls back to memory when storage is blocked, still reusing the key in this page', () => {
    const memory = new Map<string, string>()
    const first = turnedAwayKey('drop-a', { storage: blocked, memory, newId })
    expect(turnedAwayKey('drop-a', { storage: blocked, memory, newId })).toBe(first)
  })

  it('works with no storage at all (server rendering)', () => {
    const memory = new Map<string, string>()
    expect(turnedAwayKey('drop-a', { storage: null, memory, newId })).toBe(turnedAwayKey('drop-a', { storage: null, memory, newId }))
  })
})

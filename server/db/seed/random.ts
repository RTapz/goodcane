// Seeded randomness for the sample data. Same seed, same numbers, every run.
// Only uniform helpers live here: the weighted day choice is pickDay.ts.

export type Rand = () => number

/** mulberry32: a tiny, well-known seeded generator returning numbers in [0, 1). */
export function createRand(seed: number): Rand {
  let state = seed >>> 0
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** Uniform whole number from min to max, both included. */
export function randInt(rand: Rand, min: number, max: number): number {
  return min + Math.floor(rand() * (max - min + 1))
}

/** Uniform number in [min, max). */
export function randBetween(rand: Rand, min: number, max: number): number {
  return min + rand() * (max - min)
}

/** True with the given probability. */
export function chance(rand: Rand, probability: number): boolean {
  return rand() < probability
}

/** One item, each equally likely. */
export function pickOne<T>(rand: Rand, items: readonly T[]): T {
  const item = items[Math.floor(rand() * items.length)]
  if (item === undefined) {
    throw new Error('pickOne needs at least one item')
  }
  return item
}

/** A shuffled copy (Fisher-Yates, every order equally likely). */
export function shuffle<T>(rand: Rand, items: readonly T[]): T[] {
  const copy = [...items]
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1))
    const a = copy[i] as T
    copy[i] = copy[j] as T
    copy[j] = a
  }
  return copy
}

/** A version 4 style UUID drawn from the seeded generator, so ids repeat between runs. */
export function seededUuid(rand: Rand): string {
  const hex = Array.from({ length: 32 }, () => Math.floor(rand() * 16).toString(16))
  hex[12] = '4'
  hex[16] = ((parseInt(hex[16] ?? '0', 16) & 0x3) | 0x8).toString(16)
  const s = hex.join('')
  return `${s.slice(0, 8)}-${s.slice(8, 12)}-${s.slice(12, 16)}-${s.slice(16, 20)}-${s.slice(20)}`
}
